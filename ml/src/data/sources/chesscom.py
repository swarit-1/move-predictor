"""Chess.com API client for fetching player games.

Uses the Chess.com Published Data API to fetch monthly game archives.
Chess.com requires a descriptive User-Agent header on all requests.
"""

import logging
from typing import AsyncIterator

import httpx
import chess.pgn
from io import StringIO

logger = logging.getLogger(__name__)

CHESSCOM_API_BASE = "https://api.chess.com/pub"

# Chess.com requires a descriptive User-Agent header per their API docs.
CHESSCOM_HEADERS = {
    "User-Agent": "MovePredictor/1.0 (chess move prediction research project)",
    "Accept": "application/json",
}

# Map our canonical time control names to Chess.com's time_class values
TIME_CONTROL_MAP = {
    "bullet": "bullet",
    "blitz": "blitz",
    "rapid": "rapid",
    "classical": "daily",  # Chess.com calls correspondence/slow games "daily"
    "daily": "daily",
}

# Map our canonical names to Chess.com stats keys
STATS_KEY_MAP = {
    "bullet": "chess_bullet",
    "blitz": "chess_blitz",
    "rapid": "chess_rapid",
    "classical": "chess_daily",
    "daily": "chess_daily",
}


async def fetch_player_games(
    username: str,
    max_games: int = 500,
    time_class: str | None = None,
) -> AsyncIterator[str]:
    """Fetch games for a player from Chess.com as PGN strings.

    Args:
        username: Chess.com username.
        max_games: Maximum number of games to fetch.
        time_class: Filter by time control ("bullet", "blitz", "rapid", "daily").
                    None means all time controls.

    Yields:
        PGN strings, one per game.
    """
    archives_url = f"{CHESSCOM_API_BASE}/player/{username.lower()}/games/archives"

    async with httpx.AsyncClient(timeout=30.0, headers=CHESSCOM_HEADERS) as client:
        response = await client.get(archives_url)
        if response.status_code == 404:
            logger.warning("Chess.com player not found: %s", username)
            return
        response.raise_for_status()
        archives = response.json().get("archives", [])

    # Resolve time_class alias
    filter_class = TIME_CONTROL_MAP.get(time_class, time_class) if time_class else None

    games_yielded = 0

    async with httpx.AsyncClient(timeout=60.0, headers=CHESSCOM_HEADERS) as client:
        for archive_url in reversed(archives):
            if games_yielded >= max_games:
                break

            try:
                response = await client.get(archive_url)
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPError as e:
                logger.warning("Failed to fetch archive %s: %s", archive_url, e)
                continue

            for game_data in data.get("games", []):
                if games_yielded >= max_games:
                    break

                # Filter by time control if requested
                if filter_class and game_data.get("time_class") != filter_class:
                    continue

                # Skip unrated games
                if not game_data.get("rated", True):
                    continue

                pgn_text = game_data.get("pgn", "")
                if not pgn_text:
                    continue

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
        Dict with player info, or raises on failure.
    """
    url = f"{CHESSCOM_API_BASE}/player/{username.lower()}"

    async with httpx.AsyncClient(timeout=30.0, headers=CHESSCOM_HEADERS) as client:
        response = await client.get(url)
        if response.status_code == 404:
            raise ValueError(f"Chess.com player not found: {username}")
        response.raise_for_status()
        return response.json()


async def fetch_player_stats(username: str) -> dict:
    """Fetch a player's rating stats from Chess.com.

    Returns:
        Dict with ratings per time control. Keys include:
        chess_bullet, chess_blitz, chess_rapid, chess_daily, etc.
        Each contains "last" (with "rating"), "best", "record" sub-dicts.
    """
    url = f"{CHESSCOM_API_BASE}/player/{username.lower()}/stats"

    async with httpx.AsyncClient(timeout=30.0, headers=CHESSCOM_HEADERS) as client:
        response = await client.get(url)
        if response.status_code == 404:
            raise ValueError(f"Chess.com player not found: {username}")
        response.raise_for_status()
        return response.json()


async def fetch_player_rating_by_time_control(
    username: str,
    time_control: str,
) -> float | None:
    """Fetch a specific time-control rating for a Chess.com player.

    Args:
        username: Chess.com username.
        time_control: One of "bullet", "blitz", "rapid", "classical"/"daily".

    Returns:
        The player's current rating for that time control, or None if unavailable.
    """
    stats = await fetch_player_stats(username)
    key = STATS_KEY_MAP.get(time_control)
    if not key or key not in stats:
        return None
    return stats[key].get("last", {}).get("rating")


async def fetch_all_ratings(username: str) -> dict[str, float | None]:
    """Fetch all available ratings for a Chess.com player.

    Returns:
        Dict mapping time control name to rating, e.g.:
        {"bullet": 1200, "blitz": 1350, "rapid": 1500, "daily": 1400}
    """
    stats = await fetch_player_stats(username)
    ratings: dict[str, float | None] = {}

    for canonical, stats_key in STATS_KEY_MAP.items():
        if canonical == "classical":
            continue  # "classical" and "daily" map to the same key; skip duplicate
        if stats_key in stats:
            rating = stats[stats_key].get("last", {}).get("rating")
            ratings[canonical] = rating
        else:
            ratings[canonical] = None

    return ratings
