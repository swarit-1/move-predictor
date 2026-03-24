"""Chess.com API client for fetching player games.

Uses the Chess.com Published Data API to fetch monthly game archives.
"""

import logging
from typing import AsyncIterator

import httpx
import chess.pgn
from io import StringIO

logger = logging.getLogger(__name__)

CHESSCOM_API_BASE = "https://api.chess.com/pub"


async def fetch_player_games(
    username: str,
    max_games: int = 500,
) -> AsyncIterator[str]:
    """Fetch games for a player from Chess.com as PGN strings.

    Args:
        username: Chess.com username.
        max_games: Maximum number of games to fetch.

    Yields:
        PGN strings, one per game.
    """
    # First, get the list of available monthly archives
    archives_url = f"{CHESSCOM_API_BASE}/player/{username}/games/archives"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(archives_url)
        response.raise_for_status()
        archives = response.json().get("archives", [])

    # Fetch most recent archives first
    games_yielded = 0

    async with httpx.AsyncClient(timeout=60.0) as client:
        for archive_url in reversed(archives):
            if games_yielded >= max_games:
                break

            try:
                response = await client.get(archive_url)
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPError as e:
                logger.warning(f"Failed to fetch archive {archive_url}: {e}")
                continue

            for game_data in data.get("games", []):
                if games_yielded >= max_games:
                    break

                pgn_text = game_data.get("pgn", "")
                if not pgn_text:
                    continue

                # Validate the PGN
                try:
                    game = chess.pgn.read_game(StringIO(pgn_text))
                    if game and len(list(game.mainline_moves())) > 0:
                        yield pgn_text
                        games_yielded += 1
                except Exception:
                    continue


async def fetch_player_profile(username: str) -> dict:
    """Fetch a player's profile from Chess.com.

    Returns:
        Dict with player info.
    """
    url = f"{CHESSCOM_API_BASE}/player/{username}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()


async def fetch_player_stats(username: str) -> dict:
    """Fetch a player's rating stats from Chess.com.

    Returns:
        Dict with ratings per time control.
    """
    url = f"{CHESSCOM_API_BASE}/player/{username}/stats"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()
