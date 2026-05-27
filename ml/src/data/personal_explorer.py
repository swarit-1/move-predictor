"""Personal opening explorer keyed by exact position.

PRD §5.3: the Lichess Opening Explorer's `/player` endpoint exposes
per-player move frequencies at any FEN. Chess.com has no equivalent, so
for Chess.com opponents we have to build the same structure ourselves
from the fetched PGNs.

Unlike `OpeningBook` (a move-history trie), this index is keyed by the
*position* via the EPD (FEN without halfmove/fullmove counters). That
makes it transposition-safe: a Najdorf reached via two different move
orders is one index entry, not two.

Memory cost: ~50–200k positions for a player with 200 games, each a
short string + a small dict. JSON-serializable for the Redis profile
cache (PRD §6.1).
"""

from __future__ import annotations

from collections import defaultdict
from io import StringIO

import chess
import chess.pgn


def _position_key(board: chess.Board) -> str:
    """Canonical position fingerprint: EPD without halfmove/fullmove.

    `board.epd()` already excludes the two move counters and includes
    castling rights + en-passant square — exactly the right shape for a
    transposition-stable lookup key.
    """
    return board.epd()


class PersonalExplorer:
    """Per-player position → moves-played histogram."""

    def __init__(self) -> None:
        # epd → uci → count
        self._positions: dict[str, dict[str, int]] = defaultdict(dict)
        self.total_games = 0
        self.total_positions = 0

    def add_game(self, pgn_text: str, player_name: str) -> None:
        """Index every position the player played from in this PGN."""
        game = chess.pgn.read_game(StringIO(pgn_text))
        if game is None:
            return
        is_white = game.headers.get("White", "").lower() == player_name.lower()
        is_black = game.headers.get("Black", "").lower() == player_name.lower()
        if not (is_white or is_black):
            return

        board = game.board()
        self.total_games += 1
        for move in game.mainline_moves():
            is_player_move = (board.turn == chess.WHITE) == is_white
            if is_player_move:
                key = _position_key(board)
                uci = move.uci()
                self._positions[key][uci] = (
                    self._positions[key].get(uci, 0) + 1
                )
                self.total_positions += 1
            board.push(move)

    def get_moves(self, fen: str) -> list[dict]:
        """Return move statistics for the given position, sorted by frequency.

        Output shape matches `lichess_explorer.get_player_explorer_moves`
        so the prediction pipeline can drop this in alongside the Lichess
        equivalent without branching.
        """
        try:
            board = chess.Board(fen)
        except ValueError:
            return []
        key = _position_key(board)
        histogram = self._positions.get(key)
        if not histogram:
            return []
        return sorted(
            [{"uci": uci, "san": uci, "total": count} for uci, count in histogram.items()],
            key=lambda m: m["total"],
            reverse=True,
        )

    @property
    def size(self) -> int:
        """Number of distinct positions indexed."""
        return len(self._positions)

    # ── Serialization for the Redis profile cache (PRD §6.1) ────────

    def to_dict(self) -> dict:
        return {
            "total_games": self.total_games,
            "total_positions": self.total_positions,
            "positions": dict(self._positions),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "PersonalExplorer":
        inst = cls()
        inst.total_games = int(data.get("total_games", 0))
        inst.total_positions = int(data.get("total_positions", 0))
        raw = data.get("positions", {})
        # Re-coerce to a defaultdict-shaped plain dict.
        inst._positions = {
            epd: {uci: int(c) for uci, c in moves.items()}
            for epd, moves in raw.items()
        }
        return inst
