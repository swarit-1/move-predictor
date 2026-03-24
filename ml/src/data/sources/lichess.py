"""Lichess API client for fetching player games.

Uses the Lichess API v2 to export games for a given username.
Rate limits: 30 req/s with OAuth, 20 without.
"""

import logging
from typing import AsyncIterator

import httpx
import chess.pgn
from io import StringIO

from src.config import settings

logger = logging.getLogger(__name__)

LICHESS_API_BASE = "https://lichess.org/api"


async def fetch_player_games(
    username: str,
    max_games: int = 500,
    rated_only: bool = True,
    perf_type: str | None = None,
) -> AsyncIterator[str]:
    """Fetch games for a player from Lichess as PGN strings.

    Args:
        username: Lichess username.
        max_games: Maximum number of games to fetch.
        rated_only: Only fetch rated games.
        perf_type: Filter by game type (e.g., "blitz", "rapid", "classical").

    Yields:
        PGN strings, one per game.
    """
    params = {
        "max": max_games,
        "rated": str(rated_only).lower(),
        "pgnInJson": "false",
        "clocks": "true",
        "evals": "false",
        "opening": "true",
    }
    if perf_type:
        params["perfType"] = perf_type

    headers = {
        "Accept": "application/x-chess-pgn",
    }
    if settings.lichess_api_token:
        headers["Authorization"] = f"Bearer {settings.lichess_api_token}"

    url = f"{LICHESS_API_BASE}/games/user/{username}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("GET", url, params=params, headers=headers) as response:
            response.raise_for_status()

            current_pgn = []
            async for line in response.aiter_lines():
                if line.strip() == "" and current_pgn:
                    # Empty line after moves = end of game
                    pgn_text = "\n".join(current_pgn)
                    if _is_complete_pgn(pgn_text):
                        yield pgn_text
                        current_pgn = []
                else:
                    current_pgn.append(line)

            # Don't forget the last game
            if current_pgn:
                pgn_text = "\n".join(current_pgn)
                if _is_complete_pgn(pgn_text):
                    yield pgn_text


async def fetch_player_profile(username: str) -> dict:
    """Fetch a player's profile from Lichess.

    Returns:
        Dict with player info (username, ratings, counts, etc.).
    """
    url = f"{LICHESS_API_BASE}/user/{username}"
    headers = {}
    if settings.lichess_api_token:
        headers["Authorization"] = f"Bearer {settings.lichess_api_token}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.json()


def _is_complete_pgn(pgn_text: str) -> bool:
    """Check if a PGN string contains a complete game."""
    try:
        game = chess.pgn.read_game(StringIO(pgn_text))
        return game is not None and len(list(game.mainline_moves())) > 0
    except Exception:
        return False
