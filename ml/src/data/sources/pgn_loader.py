"""PGN file parser for loading games from uploaded or local PGN files."""

import chess.pgn
from io import StringIO
from pathlib import Path
from typing import Iterator


def parse_pgn_file(filepath: str | Path) -> Iterator[chess.pgn.Game]:
    """Parse a PGN file and yield individual games.

    Args:
        filepath: Path to the PGN file.

    Yields:
        chess.pgn.Game objects.
    """
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        while True:
            game = chess.pgn.read_game(f)
            if game is None:
                break
            # Skip games with no moves
            if len(list(game.mainline_moves())) == 0:
                continue
            yield game


def parse_pgn_string(pgn_text: str) -> Iterator[chess.pgn.Game]:
    """Parse a PGN string that may contain multiple games.

    Args:
        pgn_text: String containing one or more PGN games.

    Yields:
        chess.pgn.Game objects.
    """
    reader = StringIO(pgn_text)
    while True:
        game = chess.pgn.read_game(reader)
        if game is None:
            break
        if len(list(game.mainline_moves())) == 0:
            continue
        yield game


def game_to_moves(game: chess.pgn.Game) -> list[chess.Move]:
    """Extract the list of moves from a game.

    Args:
        game: A parsed chess game.

    Returns:
        List of chess.Move objects.
    """
    return list(game.mainline_moves())


def game_metadata(game: chess.pgn.Game) -> dict:
    """Extract metadata from a game's headers.

    Returns:
        Dict with standardized game metadata.
    """
    headers = game.headers
    return {
        "white": headers.get("White", "Unknown"),
        "black": headers.get("Black", "Unknown"),
        "white_elo": _safe_int(headers.get("WhiteElo")),
        "black_elo": _safe_int(headers.get("BlackElo")),
        "result": headers.get("Result", "*"),
        "date": headers.get("Date", ""),
        "event": headers.get("Event", ""),
        "site": headers.get("Site", ""),
        "time_control": headers.get("TimeControl", ""),
        "eco": headers.get("ECO", ""),
        "opening": headers.get("Opening", ""),
    }


def _safe_int(value: str | None) -> int | None:
    """Safely parse an integer, returning None on failure."""
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None
