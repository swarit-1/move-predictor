"""High-level position analysis using Stockfish.

Provides functions to compute centipawn loss, move quality,
and other analysis metrics for training data annotation.
"""

import chess

from src.engine.stockfish_pool import StockfishPool, AnalysisResult


def compute_centipawn_loss(
    pool: StockfishPool,
    board: chess.Board,
    played_move: chess.Move,
    depth: int = 18,
) -> tuple[float, AnalysisResult]:
    """Compute the centipawn loss for a played move.

    Centipawn loss = eval(best_move) - eval(played_move), from the
    side-to-move's perspective. Always >= 0 (best move has loss 0).

    Args:
        pool: Stockfish process pool.
        board: Position before the move.
        played_move: The move that was played.
        depth: Analysis depth.

    Returns:
        Tuple of (centipawn_loss, analysis_result).
    """
    fen = board.fen()
    analysis = pool.analyze_sync(fen, depth=depth, num_lines=5)

    # Find the played move in the top moves
    played_uci = played_move.uci()
    best_cp = analysis.eval_cp

    if best_cp is None:
        # Mate evaluation — compute loss differently
        return 0.0, analysis

    played_cp = None
    for move_info in analysis.top_moves:
        if move_info["move"] == played_uci:
            played_cp = move_info.get("cp")
            break

    if played_cp is None:
        # Played move wasn't in the top-N — analyze the resulting position
        board_after = board.copy()
        board_after.push(played_move)
        after_analysis = pool.analyze_sync(board_after.fen(), depth=depth, num_lines=1)

        if after_analysis.eval_cp is not None:
            # Negate because perspective flips after a move
            played_cp = -after_analysis.eval_cp
        else:
            played_cp = best_cp  # fallback: assume no loss

    # Centipawn loss is always non-negative
    cpl = max(0, best_cp - played_cp)
    return float(cpl), analysis


def annotate_game(
    pool: StockfishPool,
    game_moves: list[chess.Move],
    starting_fen: str = chess.STARTING_FEN,
    depth: int = 18,
) -> list[dict]:
    """Annotate every move in a game with Stockfish analysis.

    Args:
        pool: Stockfish process pool.
        game_moves: List of moves in the game.
        starting_fen: Starting position FEN.
        depth: Analysis depth.

    Returns:
        List of annotation dicts, one per move:
        {
            "fen": str,
            "move": str (UCI),
            "best_move": str (UCI),
            "eval_cp": int | None,
            "centipawn_loss": float,
            "is_blunder": bool,
            "top_moves": list[dict],
            "move_quality": str,
        }
    """
    from src.data.preprocessing import classify_move_quality

    board = chess.Board(starting_fen)
    annotations = []

    for move in game_moves:
        cpl, analysis = compute_centipawn_loss(pool, board, move, depth=depth)

        annotations.append({
            "fen": board.fen(),
            "move": move.uci(),
            "best_move": analysis.best_move,
            "eval_cp": analysis.eval_cp,
            "centipawn_loss": cpl,
            "is_blunder": cpl >= 100,
            "top_moves": analysis.top_moves,
            "move_quality": classify_move_quality(cpl),
        })

        board.push(move)

    return annotations
