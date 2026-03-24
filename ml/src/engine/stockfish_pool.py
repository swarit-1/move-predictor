"""Process pool of Stockfish instances for parallel position analysis.

Maintains a pool of Stockfish processes that can be used concurrently
from async FastAPI handlers. Each instance runs in its own process
to avoid GIL contention.
"""

import logging
from concurrent.futures import ProcessPoolExecutor, Future
from dataclasses import dataclass
from functools import partial

from stockfish import Stockfish

from src.config import settings

logger = logging.getLogger(__name__)


@dataclass
class AnalysisResult:
    """Result of analyzing a single position."""

    best_move: str  # UCI notation
    eval_cp: int | None  # centipawns from side-to-move perspective
    eval_mate: int | None  # mate in N (positive = winning)
    top_moves: list[dict]  # [{move, cp, mate, rank}]
    depth: int


def _analyze_position(
    fen: str,
    depth: int,
    num_lines: int,
    stockfish_path: str,
    threads: int,
) -> AnalysisResult:
    """Analyze a position in a worker process.

    This function runs in a separate process — it creates its own Stockfish
    instance to avoid sharing state.
    """
    sf = Stockfish(
        path=stockfish_path,
        depth=depth,
        parameters={"Threads": threads, "Hash": 128},
    )

    sf.set_fen_position(fen)

    # Get top-N lines
    top_moves = []
    try:
        sf.set_depth(depth)
        evaluation = sf.get_top_moves(num_lines)

        for i, move_info in enumerate(evaluation):
            entry = {
                "move": move_info["Move"],
                "rank": i + 1,
                "cp": move_info.get("Centipawn"),
                "mate": move_info.get("Mate"),
            }
            top_moves.append(entry)
    except Exception as e:
        logger.warning(f"Error getting top moves for {fen}: {e}")

    # Best move and evaluation
    best_move = top_moves[0]["move"] if top_moves else sf.get_best_move()
    eval_cp = top_moves[0].get("cp") if top_moves else None
    eval_mate = top_moves[0].get("mate") if top_moves else None

    del sf  # explicitly clean up the Stockfish process
    return AnalysisResult(
        best_move=best_move,
        eval_cp=eval_cp,
        eval_mate=eval_mate,
        top_moves=top_moves,
        depth=depth,
    )


class StockfishPool:
    """Pool of Stockfish worker processes for concurrent analysis."""

    def __init__(self):
        self._executor: ProcessPoolExecutor | None = None

    def start(self):
        """Initialize the process pool."""
        pool_size = settings.stockfish_pool_size
        self._executor = ProcessPoolExecutor(max_workers=pool_size)
        logger.info(f"Stockfish pool started with {pool_size} workers")

    def shutdown(self):
        """Shut down the process pool."""
        if self._executor:
            self._executor.shutdown(wait=True)
            self._executor = None
            logger.info("Stockfish pool shut down")

    def analyze(
        self,
        fen: str,
        depth: int | None = None,
        num_lines: int = 5,
    ) -> Future[AnalysisResult]:
        """Submit a position for analysis.

        Args:
            fen: FEN string of the position.
            depth: Analysis depth (defaults to config).
            num_lines: Number of top lines to return.

        Returns:
            A Future that resolves to an AnalysisResult.
        """
        if self._executor is None:
            raise RuntimeError("Stockfish pool not started. Call start() first.")

        if depth is None:
            depth = settings.stockfish_depth

        return self._executor.submit(
            _analyze_position,
            fen=fen,
            depth=depth,
            num_lines=num_lines,
            stockfish_path=settings.stockfish_path,
            threads=settings.stockfish_threads,
        )

    def analyze_sync(
        self,
        fen: str,
        depth: int | None = None,
        num_lines: int = 5,
    ) -> AnalysisResult:
        """Analyze a position synchronously (blocks until complete)."""
        future = self.analyze(fen, depth, num_lines)
        return future.result()


# Global singleton
stockfish_pool = StockfishPool()
