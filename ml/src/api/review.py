"""Game review endpoint — analyzes every move in a game with Stockfish.

Returns per-move classifications (best, excellent, good, inaccuracy, mistake,
blunder) and per-player accuracy scores, mirroring Chess.com's game review.
"""

import asyncio
import logging
from concurrent.futures import Future

import chess
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Classification thresholds (centipawn loss) ───────────────────
# Matches Chess.com's system:
#   Best    = 0 cp loss (matches engine's top move)
#   Excellent = ≤10 cp loss
#   Good    = ≤25 cp loss
#   Inaccuracy = ≤50 cp loss
#   Mistake = ≤100 cp loss
#   Blunder = >100 cp loss
CPL_THRESHOLDS = [
    (0, "best"),
    (10, "excellent"),
    (25, "good"),
    (50, "inaccuracy"),
    (100, "mistake"),
]


def classify_move(cpl: float) -> str:
    """Classify a move by its centipawn loss."""
    for threshold, label in CPL_THRESHOLDS:
        if cpl <= threshold:
            return label
    return "blunder"


class ReviewRequest(BaseModel):
    moves: list[str]  # UCI move strings for the full game
    depth: int = 18


class MoveAnnotation(BaseModel):
    ply: int  # half-move index (0-based)
    move_uci: str
    move_san: str
    classification: str  # best | excellent | good | inaccuracy | mistake | blunder
    cpl: float  # centipawn loss
    eval_before: int | None  # cp before move (White's perspective)
    eval_after: int | None  # cp after move (White's perspective)
    mate_before: int | None
    mate_after: int | None
    best_move_uci: str  # engine's best move
    best_move_san: str
    is_book: bool  # True for first ~8 moves (skip classification)
    top_moves: list[dict]  # engine's top 3 moves for this position


class PlayerAccuracy(BaseModel):
    accuracy: float  # 0-100 scale
    total_moves: int
    best: int
    excellent: int
    good: int
    inaccuracy: int
    mistake: int
    blunder: int
    avg_cpl: float


class ReviewResponse(BaseModel):
    annotations: list[MoveAnnotation]
    white: PlayerAccuracy
    black: PlayerAccuracy


def _compute_accuracy(cpls: list[float]) -> float:
    """Convert a list of centipawn losses into a 0-100 accuracy score.

    Uses Chess.com's harmonic/windowed formula: each move gets a score
    based on win-probability preservation, then averaged.

    Formula per move: score = 103.1668 * exp(-0.04354 * cpl) - 3.1668
    Clamped to [0, 100]. Average of all scores = accuracy.
    """
    import math
    if not cpls:
        return 100.0
    scores = []
    for cpl in cpls:
        s = 103.1668 * math.exp(-0.04354 * max(0, cpl)) - 3.1668
        scores.append(max(0.0, min(100.0, s)))
    return round(sum(scores) / len(scores), 1)


def _mate_to_cp(mate: int | None) -> int | None:
    """Convert a mate score to a large centipawn value for CPL calculation."""
    if mate is None:
        return None
    # Mate in N → ±10000 (capped)
    return 10000 if mate > 0 else -10000


@router.post("/review")
async def review_game(request: ReviewRequest) -> ReviewResponse:
    """Analyze every position in a game and classify each move.

    Runs Stockfish at the given depth on every position (before each move),
    then computes centipawn loss = eval_before_best - eval_after_move,
    classifying each move.
    """
    from src.engine.stockfish_pool import stockfish_pool

    if not request.moves:
        raise HTTPException(status_code=400, detail="No moves provided")

    # Validate all moves
    board = chess.Board()
    positions: list[str] = [board.fen()]  # position BEFORE each move
    san_moves: list[str] = []

    for uci_str in request.moves:
        try:
            move = chess.Move.from_uci(uci_str)
            if move not in board.legal_moves:
                raise HTTPException(
                    status_code=400,
                    detail=f"Illegal move {uci_str} at ply {len(san_moves)}",
                )
            san_moves.append(board.san(move))
            board.push(move)
            positions.append(board.fen())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid UCI move: {uci_str}")

    # Also analyze the final position (needed for eval_after of last move)
    # positions has len(moves) + 1 entries: positions[i] is BEFORE move i

    # Submit all positions to Stockfish in parallel
    loop = asyncio.get_event_loop()
    futures: list[Future] = []
    for fen in positions:
        futures.append(
            loop.run_in_executor(
                None,
                lambda f=fen: stockfish_pool.analyze_sync(
                    f, depth=request.depth, num_lines=3
                ),
            )
        )

    results = await asyncio.gather(*futures, return_exceptions=True)

    # Build annotations
    annotations: list[MoveAnnotation] = []
    white_cpls: list[float] = []
    black_cpls: list[float] = []
    white_counts = {"best": 0, "excellent": 0, "good": 0, "inaccuracy": 0, "mistake": 0, "blunder": 0}
    black_counts = {"best": 0, "excellent": 0, "good": 0, "inaccuracy": 0, "mistake": 0, "blunder": 0}

    for ply in range(len(request.moves)):
        before = results[ply]
        after = results[ply + 1]

        if isinstance(before, Exception) or isinstance(after, Exception):
            # Stockfish failed for this position — skip
            annotations.append(MoveAnnotation(
                ply=ply, move_uci=request.moves[ply], move_san=san_moves[ply],
                classification="good", cpl=0, eval_before=None, eval_after=None,
                mate_before=None, mate_after=None,
                best_move_uci=request.moves[ply], best_move_san=san_moves[ply],
                is_book=ply < 16, top_moves=[],
            ))
            continue

        # Evals from side-to-move perspective → convert to White's perspective
        is_white_move = ply % 2 == 0
        flip = 1 if is_white_move else -1

        eval_before_cp = before.eval_cp
        eval_before_mate = before.eval_mate
        eval_after_cp = after.eval_cp
        eval_after_mate = after.eval_mate

        # Convert to White's perspective
        wb_cp = (eval_before_cp * flip) if eval_before_cp is not None else _mate_to_cp(eval_before_mate)
        wa_cp = (eval_after_cp * (-flip)) if eval_after_cp is not None else _mate_to_cp(
            -eval_after_mate if eval_after_mate is not None else None
        )
        # After the move, it's the OTHER side's turn, so we flip the after-eval
        # to White's perspective: after.eval_cp is from the new side-to-move's perspective

        mate_before_w = (eval_before_mate * flip) if eval_before_mate is not None else None
        mate_after_w = (eval_after_mate * (-flip)) if eval_after_mate is not None else None

        # CPL calculation (from mover's perspective)
        # Best move eval (from before analysis, already from mover's perspective)
        best_eval_mover = eval_before_cp if eval_before_cp is not None else (
            10000 if (eval_before_mate is not None and eval_before_mate > 0) else
            -10000 if eval_before_mate is not None else 0
        )
        # Actual move result (from after analysis, need to negate since it's opponent's perspective now)
        actual_eval_mover = (-eval_after_cp) if eval_after_cp is not None else (
            10000 if (eval_after_mate is not None and eval_after_mate < 0) else
            -10000 if (eval_after_mate is not None and eval_after_mate > 0) else 0
        )

        cpl = max(0, best_eval_mover - actual_eval_mover)

        # Mark first 16 half-moves as "book" (8 full moves) — no classification
        is_book = ply < 16

        if is_book:
            classification = "book"
        else:
            classification = classify_move(cpl)

        best_uci = before.best_move
        # Convert best_move to SAN
        try:
            temp_board = chess.Board(positions[ply])
            best_san = temp_board.san(chess.Move.from_uci(best_uci))
        except Exception:
            best_san = best_uci

        # Track stats (skip book moves)
        if not is_book:
            if is_white_move:
                white_cpls.append(cpl)
                white_counts[classification] += 1
            else:
                black_cpls.append(cpl)
                black_counts[classification] += 1

        annotations.append(MoveAnnotation(
            ply=ply,
            move_uci=request.moves[ply],
            move_san=san_moves[ply],
            classification=classification,
            cpl=round(cpl, 1),
            eval_before=wb_cp,
            eval_after=wa_cp if wa_cp is not None else wb_cp,
            mate_before=mate_before_w,
            mate_after=mate_after_w,
            best_move_uci=best_uci,
            best_move_san=best_san,
            is_book=is_book,
            top_moves=before.top_moves[:3],
        ))

    white_acc = PlayerAccuracy(
        accuracy=_compute_accuracy(white_cpls),
        total_moves=len(white_cpls),
        best=white_counts["best"],
        excellent=white_counts["excellent"],
        good=white_counts["good"],
        inaccuracy=white_counts["inaccuracy"],
        mistake=white_counts["mistake"],
        blunder=white_counts["blunder"],
        avg_cpl=round(sum(white_cpls) / max(len(white_cpls), 1), 1),
    )

    black_acc = PlayerAccuracy(
        accuracy=_compute_accuracy(black_cpls),
        total_moves=len(black_cpls),
        best=black_counts["best"],
        excellent=black_counts["excellent"],
        good=black_counts["good"],
        inaccuracy=black_counts["inaccuracy"],
        mistake=black_counts["mistake"],
        blunder=black_counts["blunder"],
        avg_cpl=round(sum(black_cpls) / max(len(black_cpls), 1), 1),
    )

    return ReviewResponse(
        annotations=annotations,
        white=white_acc,
        black=black_acc,
    )
