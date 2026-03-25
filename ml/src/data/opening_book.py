"""Per-player opening book using a trie structure.

Builds a trie from a player's game history to capture their opening
repertoire. During inference, the trie provides probability boosts
for moves that match the player's known openings.

Usage:
    book = OpeningBook()
    book.add_game(["e2e4", "e7e5", "g1f3", "b8c6", ...])
    book.add_game(["e2e4", "c7c5", "g1f3", "d7d6", ...])

    probs = book.get_move_probabilities("e2e4 e7e5")
    # → {"g1f3": 0.8, "f1c4": 0.15, "d2d4": 0.05}
"""

from __future__ import annotations

from dataclasses import dataclass, field


MAX_BOOK_DEPTH = 15  # Only track openings up to move 15


@dataclass
class TrieNode:
    """A node in the opening trie."""

    children: dict[str, TrieNode] = field(default_factory=dict)
    visit_count: int = 0


class OpeningBook:
    """Per-player opening repertoire stored as a trie.

    Each path from root to a node represents a sequence of moves.
    Visit counts at each node track how often the player has
    reached that position via that move sequence.
    """

    def __init__(self) -> None:
        self.root = TrieNode()
        self.total_games = 0

    def add_game(self, moves: list[str], max_depth: int = MAX_BOOK_DEPTH) -> None:
        """Add a game's opening moves to the trie.

        Args:
            moves: List of UCI move strings for the full game.
            max_depth: Maximum number of half-moves to index.
        """
        node = self.root
        node.visit_count += 1
        self.total_games += 1

        for move_uci in moves[:max_depth]:
            if move_uci not in node.children:
                node.children[move_uci] = TrieNode()
            node = node.children[move_uci]
            node.visit_count += 1

    def get_move_probabilities(
        self, move_history: list[str]
    ) -> dict[str, float]:
        """Get the probability distribution over next moves from this position.

        Walks the trie along the given move history, then returns the
        normalized visit counts of the children at that node.

        Args:
            move_history: UCI moves played so far in the current game.

        Returns:
            Dict mapping UCI move strings to probabilities (0-1).
            Empty dict if the position is not in the book.
        """
        node = self.root

        for move_uci in move_history:
            if move_uci not in node.children:
                return {}
            node = node.children[move_uci]

        if not node.children:
            return {}

        total = sum(child.visit_count for child in node.children.values())
        if total == 0:
            return {}

        return {
            move: child.visit_count / total
            for move, child in node.children.items()
        }

    def get_book_move(
        self, move_history: list[str], min_games: int = 3
    ) -> str | None:
        """Get the most common next move if it has enough support.

        Args:
            move_history: UCI moves played so far.
            min_games: Minimum number of games that must have played
                       through this position for the book to apply.

        Returns:
            UCI string of the most common continuation, or None.
        """
        node = self.root

        for move_uci in move_history:
            if move_uci not in node.children:
                return None
            node = node.children[move_uci]

        if node.visit_count < min_games or not node.children:
            return None

        best_move = max(node.children, key=lambda m: node.children[m].visit_count)
        return best_move

    def is_in_book(self, move_history: list[str]) -> bool:
        """Check if the current position is still within the book."""
        node = self.root
        for move_uci in move_history:
            if move_uci not in node.children:
                return False
            node = node.children[move_uci]
        return True

    @property
    def size(self) -> int:
        """Total number of nodes in the trie."""
        def _count(node: TrieNode) -> int:
            return 1 + sum(_count(c) for c in node.children.values())
        return _count(self.root)

    def to_dict(self) -> dict:
        """Serialize the trie to a JSON-compatible dict."""
        def _serialize(node: TrieNode) -> dict:
            result: dict = {"n": node.visit_count}
            if node.children:
                result["c"] = {
                    move: _serialize(child)
                    for move, child in node.children.items()
                }
            return result
        return {"total_games": self.total_games, "trie": _serialize(self.root)}

    @classmethod
    def from_dict(cls, data: dict) -> OpeningBook:
        """Deserialize from a JSON-compatible dict."""
        book = cls()
        book.total_games = data.get("total_games", 0)

        def _deserialize(d: dict) -> TrieNode:
            node = TrieNode(visit_count=d.get("n", 0))
            for move, child_data in d.get("c", {}).items():
                node.children[move] = _deserialize(child_data)
            return node

        book.root = _deserialize(data.get("trie", {"n": 0}))
        return book
