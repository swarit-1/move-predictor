"""Full prediction pipeline: board state -> predicted move.

Orchestrates the board encoder, sequence encoder, player embedding,
and skill-aware sampler into a single inference call.

When no trained checkpoint is available, uses the Lichess Opening Explorer
for real human move distributions, falling back to Stockfish-based
prediction with skill-level calibration for positions not in the explorer DB.
"""

import asyncio
import logging
import random
from pathlib import Path

import chess
import torch
import numpy as np

from src.models.move_predictor import MovePredictor
from src.models.move_encoding import (
    get_legal_move_mask,
    encode_move,
    NUM_MOVES,
)
from src.data.preprocessing import board_to_tensor
from src.inference.sampler import sample_move, SampledMove, StyleOverrides
from src.data.opening_book import OpeningBook
from src.config import settings

logger = logging.getLogger(__name__)


class PredictionPipeline:
    """End-to-end inference pipeline."""

    # Map canonical time control name → model ID
    TIME_CONTROL_IDS = {
        "bullet": 1,
        "blitz": 2,
        "rapid": 3,
        "classical": 4,
    }

    def __init__(self):
        self.model: MovePredictor | None = None
        self.device = torch.device("cpu")
        self.has_checkpoint = False
        # Which training phase produced the loaded checkpoint. Phase 1
        # models were trained with rating-only stats vectors, so richer
        # stats must be masked at inference to match (see _predict_with_model).
        self.checkpoint_phase: int = 0
        self.opening_books: dict[str, OpeningBook] = {}  # player_key → book
        self.player_stats: dict[str, np.ndarray] = {}   # player_key → stats vector
        self.player_time_controls: dict[str, int] = {}  # player_key → TC ID
        # player_key → platform-facing rating (stats vector slot 0 holds the
        # internal Lichess-scale rating; this keeps the display honest for
        # Chess.com players after a cache rehydrate).
        self.player_display_ratings: dict[str, float] = {}
        # PRD §5.3: position-keyed personal explorer per player. Replaces
        # the Lichess /player explorer call for Chess.com opponents and
        # serves as a fast local fallback for Lichess opponents.
        from src.data.personal_explorer import PersonalExplorer  # noqa: F401
        self.personal_explorers: dict[str, PersonalExplorer] = {}
        # PRD §5.5: per-player fine-tuned embedding rows. Hot-swapped
        # into the model's embedding table at inference time.
        self._personalizations: dict[str, tuple[np.ndarray, int]] = {}
        # PRD §6.1: serialize checkpoint swaps so concurrent profile builds
        # for different rating brackets can't race-load the model singleton
        # mid-inference for another request.
        self._model_load_lock = asyncio.Lock()
        self._loaded_checkpoint_path: str | None = None
        self._pinned_checkpoint = False

    def load_model(self, checkpoint_path: str | None = None, pin: bool = False):
        """Load model from checkpoint or initialize fresh.

        With ``pin=True`` the loaded checkpoint stays active even when
        later predictions ask for a different rating bracket (used by the
        eval harness to benchmark one specific checkpoint).
        """
        # Device selection with Apple Silicon MPS support
        if torch.cuda.is_available():
            device = "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"
        self.device = torch.device(device)

        self.model = MovePredictor()

        if checkpoint_path and Path(checkpoint_path).exists():
            checkpoint = torch.load(checkpoint_path, map_location=self.device)
            self.model.load_state_dict(checkpoint["model_state_dict"])
            self.has_checkpoint = True
            self.checkpoint_phase = int(checkpoint.get("phase", 1))
            metrics = checkpoint.get("metrics", {})
            logger.info(
                "Loaded model from %s (phase=%d, val_top1=%.3f)",
                checkpoint_path, self.checkpoint_phase,
                metrics.get("top1_accuracy", float("nan")),
            )
        else:
            self.has_checkpoint = False
            self.checkpoint_phase = 0
            logger.info(
                "No checkpoint loaded — using explorer + Stockfish fallback"
            )

        self.model = self.model.to(self.device)
        self.model.eval()
        if checkpoint_path and self.has_checkpoint:
            self._loaded_checkpoint_path = checkpoint_path
        self._pinned_checkpoint = pin and self.has_checkpoint
        logger.info(f"Model running on device: {self.device}")

    def load_model_for_rating(self, rating: float) -> None:
        """Load the best available model checkpoint for a given rating.

        Idempotent: if the same bracket is already loaded, this is a no-op.
        Callers that may run concurrently with inference should prefer
        `load_model_for_rating_async` to acquire the model-load mutex.
        """
        if getattr(self, "_pinned_checkpoint", False):
            return
        checkpoint_path = self._bracket_checkpoint_path(rating)
        if checkpoint_path is None:
            logger.debug(
                "No bracket checkpoint for rating %s, using explorer + fallback", rating
            )
            return
        if checkpoint_path == self._loaded_checkpoint_path:
            return
        self.load_model(checkpoint_path)
        self._loaded_checkpoint_path = checkpoint_path

    async def load_model_for_rating_async(self, rating: float) -> None:
        """Lock-protected variant. Use from async paths that can race
        with in-flight predict() calls (e.g. build_player_profile)."""
        async with self._model_load_lock:
            self.load_model_for_rating(rating)

    @staticmethod
    def _bracket_checkpoint_path(rating: float) -> str | None:
        """Return the nearest existing bracket checkpoint for this rating.

        Falls back across brackets: if the exact bracket for the rating was
        never trained, the closest trained one still serves (its rating-
        conditioned stats input carries the requested rating). Returns None
        only when no bracket checkpoint exists at all.
        """
        brackets = [
            (400, 800), (800, 1000), (1000, 1200), (1200, 1400),
            (1400, 1600), (1600, 1800), (1800, 2000), (2000, 2200), (2200, 2500),
        ]
        candidates = [
            (abs((lo + hi) / 2 - rating), f"data/checkpoints/{lo}_{hi}/phase1_best.pt")
            for lo, hi in brackets
            if Path(f"data/checkpoints/{lo}_{hi}/phase1_best.pt").exists()
        ]
        if not candidates:
            return None
        return min(candidates)[1]

    def set_opening_book(self, player_key: str, book: OpeningBook) -> None:
        """Register an opening book for a player."""
        self.opening_books[player_key] = book
        logger.info(
            "Set opening book for %s: %d games, %d nodes",
            player_key, book.total_games, book.size,
        )

    def set_player_stats(self, player_key: str, stats: np.ndarray) -> None:
        """Store a player's computed stats vector for use in future predictions."""
        self.player_stats[player_key] = stats
        logger.info("Stored player stats for %s (%d features)", player_key, len(stats))

    def set_player_time_control(self, player_key: str, time_control: str | None) -> None:
        """Store the time control used for this player's profile."""
        tc_id = self.TIME_CONTROL_IDS.get(time_control, 0) if time_control else 0
        self.player_time_controls[player_key] = tc_id
        logger.info("Stored time control for %s: %s (id=%d)", player_key, time_control, tc_id)

    def set_personal_explorer(self, player_key: str, explorer) -> None:
        """Register a per-player position-keyed move index (PRD §5.3)."""
        self.personal_explorers[player_key] = explorer
        logger.info(
            "Stored personal explorer for %s: %d positions",
            player_key, explorer.size,
        )

    def set_personalization(
        self, player_key: str, embedding: np.ndarray, player_id: int
    ) -> None:
        """Cache a Phase 3 personalized embedding row in-process (PRD §5.5).

        At predict time, the row is spliced into the model's embedding
        table just before the forward pass; the same player_id is
        passed to the model. Older personalizations are overwritten.
        """
        self._personalizations[player_key.lower()] = (embedding.copy(), int(player_id))
        logger.info(
            "Cached personalization for %s (player_id=%d, dim=%d)",
            player_key, player_id, embedding.shape[0],
        )

    def get_personalization(
        self, player_key: str | None
    ) -> tuple[np.ndarray, int] | None:
        """Return (embedding_row, player_id) if a personalization is loaded."""
        if not player_key:
            return None
        return self._personalizations.get(player_key.lower())

    @torch.no_grad()
    async def predict(
        self,
        fen: str,
        move_history: list[str] | None = None,
        player_id: int = 0,
        player_stats: np.ndarray | None = None,
        player_rating: float = 1500.0,
        style: StyleOverrides | None = None,
        engine_top_moves: list[dict] | None = None,
        player_key: str | None = None,
        time_pressure: float = 0.0,
    ) -> SampledMove:
        """Predict a move for the given position."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        # Make sure the best bracket checkpoint for this rating is loaded.
        # Idempotent and lock-protected; a no-op when the bracket is already
        # active or no checkpoints exist on disk.
        await self.load_model_for_rating_async(player_rating)

        board = chess.Board(fen)

        # PRD §6.1: cold-cache rehydrate. The frontend persists `player_key`
        # across refreshes; if the ML process restarted (or this request hit
        # a worker that never built the profile) we lazily pull the profile
        # back from Redis so the user doesn't see "player not found".
        if (
            player_key
            and player_key not in self.player_stats
            and player_key not in self.opening_books
        ):
            from src.db import cache as profile_cache
            await profile_cache.hydrate_profile_into_pipeline(player_key, self)

        # PRD §5.5: also rehydrate any saved personalization row.
        if player_key and player_key not in self._personalizations:
            from src.api.personalize import load_personalization
            personalized = await load_personalization(player_key)
            if personalized is not None:
                emb, pid = personalized
                self.set_personalization(player_key, emb, pid)

        # Retrieve stored player stats if not explicitly provided
        if player_stats is None and player_key and player_key in self.player_stats:
            player_stats = self.player_stats[player_key]
            logger.debug("Using stored stats for %s", player_key)

        # Derive style from player stats when no explicit overrides are set.
        # This makes the prediction reflect the player's actual playing style
        # (aggression, blunder frequency, consistency) learned from their games.
        if style is None and player_stats is not None:
            style = _stats_to_style(player_stats)
            logger.debug("Derived style from player stats: %s", style)

        # Look up opening book probabilities
        opening_book_probs: dict[str, float] | None = None
        if player_key and player_key in self.opening_books and move_history:
            book = self.opening_books[player_key]
            opening_book_probs = book.get_move_probabilities(move_history) or None

        if self.has_checkpoint:
            # Position-keyed personal history: what has THIS player played
            # here before? Blended into the model logits as a prior so the
            # clone reproduces their actual choices in familiar positions
            # (transposition-safe, covers middlegames — not just the book).
            personal_moves: list[dict] = []
            if player_key and player_key in self.personal_explorers:
                personal_moves = self.personal_explorers[player_key].get_moves(
                    board.fen()
                )
            return self._predict_with_model(
                board, move_history, player_id, player_stats,
                player_rating, style, engine_top_moves, opening_book_probs,
                time_pressure, player_key, personal_moves,
            )
        else:
            return await self._predict_with_data(
                board, player_rating, style, engine_top_moves,
                opening_book_probs, player_key, time_pressure, player_stats,
            )

    def _predict_with_model(
        self,
        board: chess.Board,
        move_history: list[str] | None,
        player_id: int,
        player_stats: np.ndarray | None,
        player_rating: float,
        style: StyleOverrides | None,
        engine_top_moves: list[dict] | None,
        opening_book_probs: dict[str, float] | None = None,
        time_pressure: float = 0.0,
        player_key: str | None = None,
        personal_moves: list[dict] | None = None,
    ) -> SampledMove:
        """Run the neural network model for prediction."""
        board_tensor = torch.from_numpy(board_to_tensor(board)).unsqueeze(0).to(self.device)

        history_indices = self._encode_history(move_history, board)
        history_tensor = torch.from_numpy(history_indices).unsqueeze(0).to(self.device)

        # PRD §5.5: hot-swap the personalized embedding row in if Phase 3
        # has produced one for this player. We override player_id to the
        # personalization's stored slot.
        personalization = self.get_personalization(player_key)
        if personalization is not None:
            emb_row, personalized_id = personalization
            with torch.no_grad():
                weight = self.model.player_embedding.player_embedding.weight
                if personalized_id < weight.shape[0]:
                    weight[personalized_id].copy_(
                        torch.from_numpy(emb_row).to(weight.device)
                    )
                    player_id = personalized_id

        player_id_tensor = torch.tensor([player_id], dtype=torch.long, device=self.device)

        if player_stats is None:
            player_stats = np.zeros(settings.num_player_stats, dtype=np.float32)
            player_stats[0] = player_rating / 3000.0
        elif self.checkpoint_phase == 1 and personalization is None:
            # Phase 1 checkpoints were trained with rating-only stats
            # vectors; feeding the full 33-dim profile would push the
            # model off its training manifold. Style still applies via
            # the sampler. Phase 3 personalizations fine-tune against
            # the full vector, so they keep it.
            masked = np.zeros(settings.num_player_stats, dtype=np.float32)
            masked[0] = player_stats[0] if player_stats[0] > 0 else player_rating / 3000.0
            player_stats = masked
        stats_tensor = torch.from_numpy(player_stats).unsqueeze(0).to(self.device)

        from src.data.preprocessing import classify_game_phase
        phase = classify_game_phase(board)
        phase_tensor = torch.tensor([phase], dtype=torch.long, device=self.device)

        # Time control: retrieve stored TC for this player
        tc_id = 0
        if player_key and player_key in self.player_time_controls:
            tc_id = self.player_time_controls[player_key]
        tc_tensor = torch.tensor([tc_id], dtype=torch.long, device=self.device)

        legal_mask = torch.from_numpy(get_legal_move_mask(board)).unsqueeze(0).to(self.device)

        outputs = self.model(
            board_tensor=board_tensor,
            move_history=history_tensor,
            player_id=player_id_tensor,
            player_stats=stats_tensor,
            game_phase=phase_tensor,
            legal_move_mask=legal_mask,
            time_control=tc_tensor,
        )

        policy_logits = outputs["policy_logits"][0]
        cpl_pred = max(0, outputs["cpl_pred"][0].item())
        blunder_prob = torch.sigmoid(outputs["blunder_logit"][0]).item()

        if personal_moves:
            policy_logits = self._apply_personal_prior(
                policy_logits, board, personal_moves
            )

        return sample_move(
            policy_logits=policy_logits,
            board=board,
            predicted_cpl=cpl_pred,
            blunder_prob=blunder_prob,
            player_rating=player_rating,
            style=style,
            engine_top_moves=engine_top_moves,
            opening_book_probs=opening_book_probs,
            # The trained policy already encodes bracket-typical human
            # error, so blind-spot biases run attenuated here (full
            # strength would double-count mistakes).
            blind_spot_scale=settings.model_path_blind_spot_scale,
            time_pressure=time_pressure,
            game_phase=phase,
        )

    @staticmethod
    def _apply_personal_prior(
        logits: torch.Tensor,
        board: chess.Board,
        personal_moves: list[dict],
    ) -> torch.Tensor:
        """Boost moves the cloned player has actually played in this position.

        The boost scales with how often they chose each move here and how
        many total games touched the position: one stray game nudges the
        distribution, a position they've faced ten times dominates it.
        Boost per move = personal_prior_boost * share^0.7 * confidence,
        where confidence = min(1, total_games_here / 6).
        """
        total = sum(int(m.get("total", 0)) for m in personal_moves)
        if total <= 0:
            return logits
        confidence = min(1.0, total / 6.0)
        boosted = logits.clone()
        for m in personal_moves:
            uci = m.get("uci")
            count = int(m.get("total", 0))
            if not uci or count <= 0:
                continue
            try:
                move = chess.Move.from_uci(uci)
                if move not in board.legal_moves:
                    continue
                idx = encode_move(move, board)
            except (ValueError, IndexError):
                continue
            share = count / total
            boosted[idx] += (
                settings.personal_prior_boost * (share ** 0.7) * confidence
            )
        return boosted

    async def _predict_with_data(
        self,
        board: chess.Board,
        player_rating: float,
        style: StyleOverrides | None,
        engine_top_moves: list[dict] | None,
        opening_book_probs: dict[str, float] | None = None,
        player_key: str | None = None,
        time_pressure: float = 0.0,
        player_stats: np.ndarray | None = None,
    ) -> SampledMove:
        """Predict using real human data when available, falling back to Stockfish.

        Data source priority:
        1. Specific player's Lichess explorer stats (best)
        2. Player's opening book from fetched games
        3. Aggregate human stats at this rating level from Lichess explorer
        4. Stockfish + blind spot biases (for obscure positions)
        """
        from src.data.lichess_explorer import (
            get_explorer_moves,
            get_player_explorer_moves,
            explorer_moves_to_logits,
        )

        # Step 1: Try Lichess Opening Explorer for real human move statistics
        explorer_moves = await get_explorer_moves(board.fen(), player_rating)

        # Step 2a: PRD §5.3 — try the local position-keyed personal
        # explorer. This is the Chess.com path AND a fast Lichess
        # fallback when the upstream /player endpoint is slow or 429s.
        personal_moves: list[dict] = []
        if player_key and player_key in self.personal_explorers:
            personal_moves = self.personal_explorers[player_key].get_moves(board.fen())

        # Step 2b: For Lichess players, also try the upstream Player
        # Explorer (it covers ALL of their games, not just the 200 we
        # fetched), but only if the local personal explorer didn't already
        # have strong coverage at this position.
        player_explorer_moves: list[dict] = []
        if (
            player_key
            and player_key.startswith("lichess:")
            and not _local_personal_is_strong(personal_moves)
        ):
            username = player_key.split(":", 1)[1]
            color = "white" if board.turn == chess.WHITE else "black"
            player_explorer_moves = await get_player_explorer_moves(
                board.fen(), username, color
            )

        # Step 3: Build logits from the best available data source.
        # Require minimum game count for explorer data to be reliable.
        def _has_sufficient_data(moves: list[dict], min_games: int = 20) -> bool:
            if not moves or len(moves) < 2:
                return False
            total = sum(m.get("total", 0) for m in moves)
            return total >= min_games

        if _has_sufficient_data(personal_moves, min_games=3):
            logits = explorer_moves_to_logits(personal_moves, board)
            source = "personal_explorer"
        elif _has_sufficient_data(player_explorer_moves, min_games=5):
            logits = explorer_moves_to_logits(player_explorer_moves, board)
            source = "player_explorer"
        elif opening_book_probs and len(opening_book_probs) >= 2:
            logits = self._book_probs_to_logits(opening_book_probs, board)
            source = "opening_book"
        elif _has_sufficient_data(explorer_moves, min_games=20):
            logits = explorer_moves_to_logits(explorer_moves, board)
            source = "rating_explorer"
        else:
            # Belt-and-suspenders: if the caller didn't provide engine moves,
            # call Stockfish ourselves so we never fall through to pure heuristics.
            if not engine_top_moves or len(engine_top_moves) == 0:
                engine_top_moves = await self._get_stockfish_moves(board.fen())
            logits = self._build_stockfish_logits(board, engine_top_moves)
            source = "stockfish_fallback"

        logger.info(
            "PIPELINE | source=%s | rating=%.0f | fen=%s",
            source, player_rating, board.fen()[:50],
        )

        # Step 4: Estimate error metrics.
        # Use player's actual computed CPL/blunder_rate when available (from build_player_profile),
        # falling back to rating-based formula for unknown players.
        # Stats vector indices: [2] = avg_centipawn_loss / 200.0, [3] = blunder_rate
        if (
            player_stats is not None
            and float(player_stats[2]) != 50.0 / 200.0  # not the default
        ):
            estimated_cpl = float(player_stats[2]) * 200.0  # denormalize
            estimated_blunder = float(player_stats[3])
            logger.debug(
                "Using player stats CPL=%.1f blunder=%.3f", estimated_cpl, estimated_blunder
            )
        else:
            estimated_cpl = max(0.0, 3.0 - player_rating * 0.0012)
            estimated_blunder = max(0.02, 0.35 - player_rating * 0.00012)

        if style:
            estimated_cpl *= (0.5 + style.blunder_frequency / 100.0)
            estimated_blunder *= (0.5 + style.blunder_frequency / 100.0)

        # Step 5: For explorer-sourced data, reduce temperature (already human-like).
        # For stockfish fallback, apply full blind spot biases.
        from src.data.preprocessing import classify_game_phase
        phase = classify_game_phase(board)

        if source in ("personal_explorer", "player_explorer", "opening_book"):
            # Explorer data is already a realistic distribution — use lighter sampling
            return sample_move(
                policy_logits=logits,
                board=board,
                predicted_cpl=estimated_cpl * 0.6,
                blunder_prob=estimated_blunder * 0.6,
                player_rating=player_rating,
                style=style,
                engine_top_moves=engine_top_moves,
                opening_book_probs=None,  # Already baked in
                apply_blind_spots=False,  # Data is already human-like
                time_pressure=time_pressure,
                game_phase=phase,
            )
        else:
            # Stockfish fallback or rating explorer — apply blind spots
            return sample_move(
                policy_logits=logits,
                board=board,
                predicted_cpl=estimated_cpl,
                blunder_prob=estimated_blunder,
                player_rating=player_rating,
                style=style,
                engine_top_moves=engine_top_moves,
                opening_book_probs=opening_book_probs,
                time_pressure=time_pressure,
                game_phase=phase,
            )

    async def _get_stockfish_moves(self, fen: str) -> list[dict]:
        """Call Stockfish internally when the caller didn't provide engine moves.

        Returns a list of top-move dicts compatible with engine_top_moves format,
        or an empty list if Stockfish is unavailable.
        """
        import asyncio
        try:
            from src.engine.stockfish_pool import stockfish_pool
            if stockfish_pool._executor is None:
                logger.warning("PIPELINE | Stockfish pool not started, no engine data")
                return []
            loop = asyncio.get_event_loop()
            analysis = await loop.run_in_executor(
                None, lambda: stockfish_pool.analyze_sync(fen, num_lines=5)
            )
            logger.info(
                "PIPELINE | internal_stockfish | best=%s | num_moves=%d",
                analysis.best_move, len(analysis.top_moves),
            )
            return analysis.top_moves
        except Exception as e:
            logger.warning("PIPELINE | internal Stockfish call failed: %s", e)
            return []

    def _book_probs_to_logits(
        self,
        book_probs: dict[str, float],
        board: chess.Board,
    ) -> torch.Tensor:
        """Convert opening book probabilities to logits."""
        import math
        logits = torch.full((NUM_MOVES,), float("-inf"))

        for move_uci, prob in book_probs.items():
            try:
                move = chess.Move.from_uci(move_uci)
                if move in board.legal_moves:
                    idx = encode_move(move, board)
                    logits[idx] = math.log(prob + 1e-8) + 5.0
            except (ValueError, IndexError):
                continue

        # Fill remaining legal moves with small logit
        for move in board.legal_moves:
            try:
                idx = encode_move(move, board)
                if logits[idx] == float("-inf"):
                    logits[idx] = -6.0
            except (ValueError, IndexError):
                continue

        return logits

    def _build_stockfish_logits(
        self,
        board: chess.Board,
        engine_top_moves: list[dict] | None,
    ) -> torch.Tensor:
        """Build logits from Stockfish analysis for positions not in explorer DB."""
        logits = torch.full((NUM_MOVES,), float("-inf"))

        has_engine_data = engine_top_moves and len(engine_top_moves) > 0

        logger.info(
            "BUILD_LOGITS | has_engine=%s | num_moves=%d | fen=%s",
            has_engine_data,
            len(engine_top_moves) if engine_top_moves else 0,
            board.fen()[:50],
        )

        if has_engine_data:
            best_cp = engine_top_moves[0].get("cp", 0) or 0

            for i, em in enumerate(engine_top_moves):
                uci = em.get("move")
                if not uci:
                    continue
                try:
                    move = chess.Move.from_uci(uci)
                    idx = encode_move(move, board)
                    cp = em.get("cp", best_cp) or best_cp
                    cp_diff = (cp - best_cp) / 100.0
                    # Wider spread: #1 gets 7.0, #5 gets ~2.0
                    logits[idx] = 7.0 - i * 1.2 + cp_diff * 0.8
                except (ValueError, IndexError):
                    continue

            # Non-engine moves: MUCH lower base logits to create a clear gap.
            # Gap between engine move #5 (~2.0) and best non-engine (-3.0) is 5+ points.
            # At temperature 0.5 that's softmax(10) vs softmax(-6) — effectively zero
            # for non-engine moves at high ratings.
            for move in board.legal_moves:
                try:
                    idx = encode_move(move, board)
                    if logits[idx] != float("-inf"):
                        continue

                    piece = board.piece_at(move.from_square)
                    base_logit = -8.0

                    if piece:
                        pt = piece.piece_type
                        if pt == chess.PAWN:
                            to_file = chess.square_file(move.to_square)
                            central = to_file in (2, 3, 4, 5)
                            base_logit = -3.0 if central else -4.5
                        elif pt == chess.KNIGHT:
                            to_rank = chess.square_rank(move.to_square)
                            to_file = chess.square_file(move.to_square)
                            central = 2 <= to_file <= 5 and 2 <= to_rank <= 5
                            base_logit = -4.0 if central else -5.5
                        elif pt == chess.BISHOP:
                            base_logit = -5.5
                        elif pt == chess.ROOK:
                            base_logit = -7.0
                        elif pt == chess.QUEEN:
                            base_logit = -9.0
                        elif pt == chess.KING:
                            if board.is_castling(move):
                                base_logit = -0.5  # Castling is often good
                            else:
                                base_logit = -12.0

                    # Small bonus for captures among non-engine moves
                    if board.is_capture(move):
                        base_logit += 1.5

                    logits[idx] = base_logit + random.gauss(0, 0.1)
                except (ValueError, IndexError):
                    continue
        else:
            # No Stockfish data — use strong chess heuristics.
            # This is the last resort and should still produce sensible play.
            for move in board.legal_moves:
                try:
                    idx = encode_move(move, board)
                    score = 0.0
                    piece = board.piece_at(move.from_square)
                    if not piece:
                        logits[idx] = -8.0
                        continue

                    pt = piece.piece_type
                    to_file = chess.square_file(move.to_square)
                    to_rank = chess.square_rank(move.to_square)
                    move_num = board.fullmove_number

                    # === Captures: always attractive (MVV-LVA) ===
                    if board.is_capture(move):
                        victim = board.piece_at(move.to_square)
                        attacker_val = {1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 100}
                        victim_val = {1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 100}
                        if victim:
                            gain = victim_val.get(victim.piece_type, 0) - attacker_val.get(pt, 0)
                            if gain > 0:
                                score += 3.0 + gain * 0.5  # Winning capture
                            elif gain == 0:
                                score += 1.5  # Equal trade
                            else:
                                score += -1.0  # Losing capture
                        elif board.is_en_passant(move):
                            score += 1.5

                    # === Check / checkmate ===
                    board.push(move)
                    is_check = board.is_check()
                    is_checkmate = board.is_checkmate()
                    board.pop()
                    if is_checkmate:
                        score += 20.0  # Always play checkmate
                    elif is_check:
                        score += 1.5

                    # === Castling: almost always good ===
                    if board.is_castling(move):
                        score += 3.5

                    # === Centralization ===
                    center_dist = abs(to_file - 3.5) + abs(to_rank - 3.5)
                    score += max(0, (4.0 - center_dist)) * 0.15

                    # === Piece development (opening) ===
                    if move_num <= 12:
                        from_rank_own = chess.square_rank(move.from_square)
                        if board.turn == chess.BLACK:
                            from_rank_own = 7 - from_rank_own
                            to_rank_adj = 7 - to_rank
                        else:
                            to_rank_adj = to_rank
                        # Develop minor pieces off back rank
                        if pt in (chess.KNIGHT, chess.BISHOP):
                            if from_rank_own <= 1 and to_rank_adj >= 2:
                                score += 1.5
                        # Don't move queen early
                        if pt == chess.QUEEN and move_num < 6:
                            score -= 2.5
                        # Don't move king (non-castling) in opening
                        if pt == chess.KING and not board.is_castling(move):
                            score -= 3.0

                    # === Pawn structure ===
                    if pt == chess.PAWN:
                        if to_file in (3, 4) and to_rank in (3, 4):
                            score += 0.8  # Center pawns to center
                        if to_file in (0, 7) and move_num < 15:
                            score -= 0.5  # Don't push edge pawns early

                    # === Hanging piece avoidance ===
                    if board.is_attacked_by(not board.turn, move.from_square):
                        if pt in (chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT):
                            score += 0.5  # Bonus for moving attacked piece

                    # === Don't hang the moved piece ===
                    if board.is_attacked_by(not board.turn, move.to_square):
                        if not board.is_attacked_by(board.turn, move.to_square):
                            piece_val = {1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 100}
                            penalty = piece_val.get(pt, 0) * 0.5
                            score -= penalty

                    # === Penalize aimless king moves ===
                    if pt == chess.KING and not board.is_castling(move):
                        score -= 1.5

                    # === Penalize random queen moves mid/late ===
                    if pt == chess.QUEEN and move_num >= 6:
                        # Only penalize non-captures, non-checks
                        if not board.is_capture(move) and not is_check:
                            score -= 0.5

                    logits[idx] = score + random.gauss(0, 0.1)
                except (ValueError, IndexError):
                    continue

        return logits

    def _encode_history(
        self,
        move_history: list[str] | None,
        current_board: chess.Board,
    ) -> np.ndarray:
        """Encode UCI move history into move indices."""
        T = settings.history_length
        indices = np.zeros(T, dtype=np.int64)

        if not move_history:
            return indices

        replay_board = chess.Board()
        encoded = []

        for uci_str in move_history:
            try:
                move = chess.Move.from_uci(uci_str)
                if move in replay_board.legal_moves:
                    idx = encode_move(move, replay_board)
                    encoded.append(idx)
                    replay_board.push(move)
            except (ValueError, IndexError):
                continue

        recent = encoded[-T:]
        start = T - len(recent)
        indices[start:] = recent

        return indices


def _local_personal_is_strong(moves: list[dict]) -> bool:
    """Decide whether the local personal explorer has enough coverage at
    this position to skip the upstream Lichess /player call (PRD §5.3).
    Threshold: at least 5 total games across at least 2 distinct moves."""
    if not moves or len(moves) < 2:
        return False
    return sum(m.get("total", 0) for m in moves) >= 5


def _stats_to_style(stats: np.ndarray) -> StyleOverrides:
    """Derive all 10 StyleOverrides dimensions from the 33-dim stats vector.

    This is the auto-derivation path: when the frontend doesn't send
    explicit slider overrides, the pipeline calls this to produce a
    StyleOverrides that makes the clone play like the measured player.
    Every field maps to one or more entries in the stats vector; the
    mapping mirrors `_derive_baseline_style` in `ml/src/api/players.py`.

    Stats vector layout (player_stats.py PlayerStats.to_vector()):
      [3]  blunder_rate         [4]  aggression_index
      [5]  tactical_tendency    [6]  opening_diversity
      [10] consistency          [20] exchange_tendency
      [25] sacrifice_rate       [26] eval_volatility
      [27] king_attack_intensity [28] quiet_move_ratio
      [29] opening_cpl/200      [30] middlegame_cpl/200
      [31] endgame_cpl/200      [32] capture_initiation_rate
    """

    def c(v: float) -> float:
        return max(0.0, min(100.0, v))

    aggression = float(stats[4]) * 100.0
    blunder_frequency = float(stats[3]) * 100.0

    # Risk-taking: blend eval volatility + low consistency.
    eval_vol = float(stats[26]) if len(stats) > 26 else 0.0
    consistency = float(stats[10])
    risk_taking = eval_vol * 60.0 + (1.0 - consistency) * 40.0

    # King attack
    king_attack = (float(stats[27]) * 100.0) if len(stats) > 27 else 50.0

    # Positional: quiet_move_ratio ~0.6 is average → maps to 50.
    quiet = float(stats[28]) if len(stats) > 28 else 0.6
    positional = (quiet - 0.6) * 200.0 + 50.0

    # Trade preference
    cap_init = float(stats[32]) if len(stats) > 32 else 0.5
    trade_preference = cap_init * 100.0

    # Opening loyalty (inverse diversity)
    diversity = float(stats[6])
    opening_loyalty = (1.0 - diversity) * 100.0

    # Repertoire width (same underlying stat, opposite direction)
    repertoire_width = diversity * 100.0

    # Endgame strength: invert endgame CPL. [31] is cpl/200.
    endgame_cpl_norm = float(stats[31]) if len(stats) > 31 else 0.25
    endgame_strength = 100.0 - endgame_cpl_norm * 200.0

    # Defensive tenacity proxy
    defensive_tenacity = 80.0 - eval_vol * 60.0

    return StyleOverrides(
        aggression=c(aggression),
        risk_taking=c(risk_taking),
        blunder_frequency=c(blunder_frequency),
        king_attack=c(king_attack),
        positional=c(positional),
        trade_preference=c(trade_preference),
        opening_loyalty=c(opening_loyalty),
        repertoire_width=c(repertoire_width),
        endgame_strength=c(endgame_strength),
        defensive_tenacity=c(defensive_tenacity),
    )


# Global singleton
prediction_pipeline = PredictionPipeline()
