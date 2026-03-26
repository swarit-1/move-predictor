"""Lichess Opening Explorer client.

Queries the Lichess Opening Explorer API to get real human move
statistics for any position, filtered by rating bracket.

API docs: https://lichess.org/api#tag/Opening-Explorer
Endpoint: https://explorer.lichess.ovh/lichess

The `ratings` parameter accepts: 0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500
Each value represents a bucket from that rating up to the next bracket.
"""

import logging
import math

import chess
import httpx
import torch

from src.models.move_encoding import encode_move, NUM_MOVES

logger = logging.getLogger(__name__)

EXPLORER_BASE = "https://explorer.lichess.ovh"

RATING_BUCKETS = [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]


def _rating_to_bucket(rating: float) -> str:
    """Map a target rating to the appropriate Lichess explorer bucket(s).

    Returns a comma-separated string of rating bucket values.
    For a 1500-rated target, returns "1400,1600" to get a blend.
    For a 400-rated target, returns "0" (the lowest bracket: 0-999).
    """
    if rating < 1000:
        return "0"
    if rating >= 2500:
        return "2500"

    lower = max(b for b in RATING_BUCKETS if b <= rating)
    upper = min(b for b in RATING_BUCKETS if b >= rating)

    if lower == upper:
        return str(lower)
    return f"{lower},{upper}"


async def get_explorer_moves(
    fen: str,
    rating: float,
    speeds: str = "blitz,rapid,classical",
    timeout: float = 5.0,
) -> list[dict]:
    """Query the Lichess Opening Explorer for move statistics at a rating level.

    Args:
        fen: FEN string of the current position.
        rating: Target player rating.
        speeds: Comma-separated time controls to include.
        timeout: Request timeout in seconds.

    Returns:
        List of move dicts sorted by total games descending. Empty on failure.
    """
    bucket = _rating_to_bucket(rating)

    params = {
        "variant": "standard",
        "speeds": speeds,
        "ratings": bucket,
        "fen": fen,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{EXPLORER_BASE}/lichess", params=params)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, httpx.TimeoutException, Exception) as e:
        logger.warning("Lichess explorer query failed: %s", e)
        return []

    moves = []
    for m in data.get("moves", []):
        total = m.get("white", 0) + m.get("draws", 0) + m.get("black", 0)
        if total > 0:
            moves.append({
                "uci": m["uci"],
                "san": m.get("san", m["uci"]),
                "total": total,
                "white": m.get("white", 0),
                "draws": m.get("draws", 0),
                "black": m.get("black", 0),
            })

    moves.sort(key=lambda x: x["total"], reverse=True)
    return moves


def explorer_moves_to_logits(
    moves: list[dict],
    board: chess.Board,
    vocab_size: int = NUM_MOVES,
) -> torch.Tensor:
    """Convert Lichess explorer move statistics into a logit distribution.

    Replaces the Stockfish-based logit construction with REAL human data.

    Args:
        moves: Move stats from get_explorer_moves().
        board: Current chess.Board.
        vocab_size: Size of the move vocabulary (1858).

    Returns:
        Tensor of shape (vocab_size,) with logits based on real human frequencies.
    """
    logits = torch.full((vocab_size,), float("-inf"))

    if not moves:
        return logits

    total_all = sum(m["total"] for m in moves)

    for m in moves:
        uci = m["uci"]
        count = m["total"]

        try:
            move = chess.Move.from_uci(uci)
            if move not in board.legal_moves:
                continue
            idx = encode_move(move, board)

            prob = count / total_all
            # log(prob) + offset: most popular move gets a strong positive logit
            logits[idx] = math.log(prob + 1e-8) + 5.0

        except (ValueError, IndexError):
            continue

    # Legal moves not in explorer data get a very small logit
    for move in board.legal_moves:
        try:
            idx = encode_move(move, board)
            if logits[idx] == float("-inf"):
                logits[idx] = -6.0
        except (ValueError, IndexError):
            continue

    return logits


async def get_player_explorer_moves(
    fen: str,
    username: str,
    color: str = "white",
    timeout: float = 8.0,
) -> list[dict]:
    """Query the Lichess Opening Explorer for a specific player's move stats.

    Uses the /player endpoint for individual player statistics.

    Args:
        fen: FEN string.
        username: Lichess username.
        color: "white" or "black".
        timeout: Request timeout.

    Returns:
        List of move dicts with that player's personal statistics.
    """
    params = {
        "player": username,
        "color": color,
        "fen": fen,
        "recentGames": 0,
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{EXPLORER_BASE}/player", params=params)
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        logger.warning("Lichess player explorer query failed for %s: %s", username, e)
        return []

    moves = []
    for m in data.get("moves", []):
        total = m.get("white", 0) + m.get("draws", 0) + m.get("black", 0)
        if total > 0:
            moves.append({
                "uci": m["uci"],
                "san": m.get("san", m["uci"]),
                "total": total,
            })

    moves.sort(key=lambda x: x["total"], reverse=True)
    return moves
