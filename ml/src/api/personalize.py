"""Per-player Phase 3 fine-tuning endpoint.

PRD §5.5 / §6.3: after the bracket checkpoints have been trained
(§5.4), this endpoint adapts the bracket model to a specific player by
running a short Phase 3 pass that freezes everything except the player-
embedding table and trains only that table on the player's own games.
The resulting per-player embedding row is cached in Redis and hot-swapped
in at inference time.

Gates:
  - 412 if no bracket checkpoint exists for the player's rating (§5.4
    has not been run yet on the deploy host).
  - 404 if the profile isn't built yet (the caller must POST
    /ml/player/build-profile first).
  - 503 if Phase 3 training fails for any reason — surfaced rather than
    silently noop'd so the UI can show the error.

Output: a Redis blob at `personalize:{player_key}` holding the trained
embedding row + metadata. The prediction pipeline reads this on every
predict and splices the row into the model's embedding table before
forwarding to the policy head.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from io import StringIO

import chess
import chess.pgn
import numpy as np
import torch
import torch.nn.functional as F
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.config import settings
from src.data.preprocessing import board_to_tensor, classify_game_phase
from src.db import cache as profile_cache
from src.inference.pipeline import prediction_pipeline
from src.models.move_encoding import encode_move

logger = logging.getLogger(__name__)
router = APIRouter()

PERSONALIZE_KEY_PREFIX = "personalize:"
PERSONALIZE_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days

# Hard caps on the Phase 3 pass. Defaults sized so a CPU-only host can
# finish in ~30 s; a host with a GPU is dominated by I/O instead.
DEFAULT_STEPS = 200
DEFAULT_BATCH_SIZE = 32
DEFAULT_LR = 1e-3
MAX_POSITIONS_PER_PLAYER = 6000


class PersonalizeRequest(BaseModel):
    source: str  # "lichess" | "chesscom"
    username: str
    steps: int = DEFAULT_STEPS
    batch_size: int = DEFAULT_BATCH_SIZE
    learning_rate: float = DEFAULT_LR


class PersonalizeResponse(BaseModel):
    player_key: str
    status: str
    steps_run: int
    final_loss: float
    positions_used: int
    bracket_checkpoint: str


# ──────────────────────────────────────────────────────────────────────


@router.post("/player/{player_key:path}/personalize")
async def personalize_player(
    player_key: str, request: PersonalizeRequest
) -> PersonalizeResponse:
    """Run Phase 3 fine-tuning to specialize the model to one player."""
    key = player_key.lower()

    # Gate 1: profile must exist (in memory or Redis).
    if key not in prediction_pipeline.player_stats:
        hydrated = await profile_cache.hydrate_profile_into_pipeline(
            key, prediction_pipeline
        )
        if not hydrated:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No profile for {key}. Call /ml/player/build-profile "
                    "before personalizing."
                ),
            )

    stats_vec = prediction_pipeline.player_stats[key]
    rating = float(stats_vec[0]) * 3000.0

    # Gate 2: a bracket checkpoint must be on disk. Without it, Phase 3
    # has no base model to fine-tune.
    checkpoint_path = prediction_pipeline._bracket_checkpoint_path(rating)
    if checkpoint_path is None:
        raise HTTPException(
            status_code=412,
            detail=(
                "No bracket checkpoint available for this player's rating. "
                "Run the §5.4 training pipeline (scripts/train_all_brackets.sh) "
                "to produce data/checkpoints/<low>_<high>/phase1_best.pt before "
                "calling personalize."
            ),
        )

    # Step 1: re-fetch PGNs. The build_profile path discards them after
    # computing stats; rather than persist large blobs we just stream
    # them again. Lichess is rate-limited but cached client-side; for a
    # repeat fetch this is fast.
    pgn_texts: list[str] = []
    try:
        if request.source == "lichess":
            from src.data.sources.lichess import fetch_player_games
            async for pgn in fetch_player_games(request.username, max_games=300):
                pgn_texts.append(pgn)
        elif request.source == "chesscom":
            from src.data.sources.chesscom import fetch_player_games
            async for pgn in fetch_player_games(request.username, max_games=300):
                pgn_texts.append(pgn)
        else:
            raise HTTPException(
                status_code=400, detail=f"Unknown source: {request.source}"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Failed to re-fetch PGNs: {e}"
        ) from e

    if not pgn_texts:
        raise HTTPException(status_code=404, detail="No games found to train on")

    # Step 2: build training tensors.
    boards, target_indices, phases = _build_training_tensors(
        pgn_texts, request.username, MAX_POSITIONS_PER_PLAYER
    )
    if len(boards) < 50:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Only {len(boards)} positions available. Phase 3 fine-tune "
                "needs at least 50; play more games before personalizing."
            ),
        )

    # Step 3: load the bracket checkpoint into a fresh trainable model.
    await prediction_pipeline.load_model_for_rating_async(rating)
    model = prediction_pipeline.model
    if model is None:
        raise HTTPException(status_code=503, detail="Model failed to load")
    model.setup_for_phase3()

    # Phase 3 assigns one fresh embedding row per player. Use a stable
    # hash of `player_key` so repeated calls hit the same row.
    player_id = (hash(key) % max(settings.max_players, 1)) + 1
    player_id_tensor = torch.tensor([player_id], dtype=torch.long)

    # Step 4: run the training loop. Embedding-only Phase 3 is trivial.
    trainable_params = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(trainable_params, lr=request.learning_rate)

    final_loss = 0.0
    steps_run = 0
    stats_tensor_full = torch.from_numpy(stats_vec).unsqueeze(0)

    # Move to the same device as the loaded model.
    device = prediction_pipeline.device
    player_id_tensor = player_id_tensor.to(device)
    stats_tensor_full = stats_tensor_full.to(device)

    # Mini-batches sampled at random with replacement; cheap and avoids
    # building a full DataLoader for a 200-step pass.
    rng = np.random.default_rng()
    n = len(boards)

    for step in range(request.steps):
        idx = rng.integers(0, n, size=request.batch_size)
        batch_boards = torch.from_numpy(np.stack([boards[i] for i in idx])).to(device)
        batch_targets = torch.from_numpy(
            np.asarray([target_indices[i] for i in idx], dtype=np.int64)
        ).to(device)
        batch_phases = torch.from_numpy(
            np.asarray([phases[i] for i in idx], dtype=np.int64)
        ).to(device)

        # Repeat the player ID + stats across the batch.
        b = request.batch_size
        batch_pids = player_id_tensor.expand(b)
        batch_stats = stats_tensor_full.expand(b, -1)
        empty_history = torch.zeros(
            (b, settings.history_length), dtype=torch.long, device=device
        )

        outputs = model(
            board_tensor=batch_boards,
            move_history=empty_history,
            player_id=batch_pids,
            player_stats=batch_stats,
            game_phase=batch_phases,
        )

        loss = F.cross_entropy(outputs["policy_logits"], batch_targets)

        optimizer.zero_grad()
        loss.backward()
        # Phase 3 only updates the embedding, no need to clip.
        optimizer.step()

        final_loss = float(loss.item())
        steps_run = step + 1

    # Step 5: extract the trained embedding row and cache it.
    with torch.no_grad():
        embedding_row = (
            model.player_embedding.player_embedding.weight[player_id]
            .detach()
            .cpu()
            .numpy()
            .astype(np.float32)
        )

    await _save_personalization(
        key,
        embedding=embedding_row,
        player_id=player_id,
        bracket_checkpoint=checkpoint_path,
        positions_used=len(boards),
        final_loss=final_loss,
    )

    # Make it immediately available without another cache round-trip.
    prediction_pipeline.set_personalization(key, embedding_row, player_id)

    return PersonalizeResponse(
        player_key=key,
        status="ok",
        steps_run=steps_run,
        final_loss=round(final_loss, 4),
        positions_used=len(boards),
        bracket_checkpoint=checkpoint_path,
    )


# ──────────────────────────────────────────────────────────────────────


def _build_training_tensors(
    pgn_texts: list[str], player_name: str, max_positions: int
) -> tuple[list[np.ndarray], list[int], list[int]]:
    """Walk PGNs and emit (board_tensor, target_move_index, game_phase).

    Mirrors the preprocessing that the offline `preprocess_corpus.py`
    pipeline runs, but in-memory and limited to one player's moves.
    """
    boards: list[np.ndarray] = []
    targets: list[int] = []
    phases: list[int] = []

    for pgn_text in pgn_texts:
        if len(boards) >= max_positions:
            break
        game = chess.pgn.read_game(StringIO(pgn_text))
        if game is None:
            continue
        headers = game.headers
        is_white = headers.get("White", "").lower() == player_name.lower()
        is_black = headers.get("Black", "").lower() == player_name.lower()
        if not (is_white or is_black):
            continue

        board = game.board()
        for move in game.mainline_moves():
            is_player_move = (board.turn == chess.WHITE) == is_white
            if is_player_move:
                try:
                    target_idx = encode_move(move, board)
                    tensor = board_to_tensor(board)
                    boards.append(tensor)
                    targets.append(target_idx)
                    phases.append(classify_game_phase(board))
                except (ValueError, IndexError):
                    pass
                if len(boards) >= max_positions:
                    break
            board.push(move)

    return boards, targets, phases


async def _save_personalization(
    player_key: str,
    *,
    embedding: np.ndarray,
    player_id: int,
    bracket_checkpoint: str,
    positions_used: int,
    final_loss: float,
) -> None:
    """Persist the personalized embedding row to Redis (TTL 30 days)."""
    client = await profile_cache._get_client()
    if client is None:
        logger.warning("Redis unavailable — personalization not persisted")
        return
    payload = {
        "embedding_b64": base64.b64encode(embedding.tobytes()).decode("ascii"),
        "embedding_dim": int(embedding.shape[0]),
        "player_id": int(player_id),
        "bracket_checkpoint": bracket_checkpoint,
        "positions_used": int(positions_used),
        "final_loss": float(final_loss),
    }
    try:
        await client.setex(
            f"{PERSONALIZE_KEY_PREFIX}{player_key}",
            PERSONALIZE_TTL_SECONDS,
            json.dumps(payload).encode("utf-8"),
        )
        logger.info(
            "Saved personalization for %s: %d positions, loss=%.4f",
            player_key, positions_used, final_loss,
        )
    except Exception as e:
        logger.warning("Failed to persist personalization for %s: %s", player_key, e)


async def load_personalization(player_key: str) -> tuple[np.ndarray, int] | None:
    """Read a saved personalized embedding from Redis. Returns
    (embedding_row, player_id) on hit, None otherwise."""
    client = await profile_cache._get_client()
    if client is None:
        return None
    try:
        raw = await client.get(f"{PERSONALIZE_KEY_PREFIX}{player_key.lower()}")
    except Exception:
        return None
    if raw is None:
        return None
    try:
        data = json.loads(raw)
        emb = np.frombuffer(
            base64.b64decode(data["embedding_b64"]), dtype=np.float32
        ).copy()
        pid = int(data["player_id"])
        return emb, pid
    except Exception:
        return None
