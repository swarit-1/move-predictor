"""PRD §5.9 — Coach mode: aggregate blunder patterns across a user's
game history and surface recurring weaknesses.

Example output: "In queenless middlegames, you tend to blunder by
hanging pieces on undefended squares (7 occurrences across your games)."

Runs a lightweight Stockfish pass over every supplied game. The
frontend sends the user's saved-game PGNs; this endpoint crunches them
and returns structured coaching insights.
"""

from __future__ import annotations

import asyncio
import logging
import math
from collections import Counter, defaultdict
from io import StringIO

import chess
import chess.pgn
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger(__name__)


class CoachRequest(BaseModel):
    pgns: list[str]
    player_name: str
    max_games: int = 50
    stockfish_depth: int = 8


class BlunderPattern(BaseModel):
    position_category: str
    blunder_type: str
    occurrences: int
    example_fen: str | None = None
    example_move: str | None = None
    description: str


class CoachInsight(BaseModel):
    total_games_analyzed: int
    total_moves_analyzed: int
    total_blunders: int
    avg_cpl: float
    weakest_phase: str
    strongest_phase: str
    top_patterns: list[BlunderPattern]
    phase_accuracy: dict[str, float]


class CoachResponse(BaseModel):
    insights: CoachInsight


@router.post("/coach")
async def coach_analysis(request: CoachRequest) -> CoachResponse:
    """Aggregate blunder patterns across a user's game history."""
    from src.engine.stockfish_pool import stockfish_pool

    if not request.pgns:
        raise HTTPException(status_code=400, detail="No games provided")

    pgns = request.pgns[: request.max_games]
    player = request.player_name.lower()

    total_moves = 0
    total_blunders = 0
    total_cpl = 0.0
    cpl_count = 0
    phase_cpls: dict[str, list[float]] = defaultdict(list)
    pattern_counter: Counter[tuple[str, str]] = Counter()
    pattern_examples: dict[tuple[str, str], tuple[str, str]] = {}

    loop = asyncio.get_event_loop()

    for pgn_text in pgns:
        game = chess.pgn.read_game(StringIO(pgn_text))
        if game is None:
            continue
        is_white = game.headers.get("White", "").lower() == player
        board = game.board()

        for node in game.mainline():
            move = node.move
            is_player = (board.turn == chess.WHITE) == is_white

            if is_player:
                total_moves += 1
                fen_before = board.fen()

                try:
                    analysis = await loop.run_in_executor(
                        None,
                        lambda f=fen_before: stockfish_pool.analyze_sync(
                            f, depth=request.stockfish_depth, num_lines=1
                        ),
                    )
                    eval_before = analysis.eval_cp
                except Exception:
                    eval_before = None
                    analysis = None

                board.push(move)

                try:
                    analysis_after = await loop.run_in_executor(
                        None,
                        lambda f=board.fen(): stockfish_pool.analyze_sync(
                            f, depth=request.stockfish_depth, num_lines=1
                        ),
                    )
                    eval_after = (
                        -analysis_after.eval_cp
                        if analysis_after.eval_cp is not None
                        else None
                    )
                except Exception:
                    eval_after = None

                if eval_before is not None and eval_after is not None:
                    cpl = max(0, eval_before - eval_after)
                    total_cpl += cpl
                    cpl_count += 1

                    phase = _classify_phase(board)
                    phase_cpls[phase].append(cpl)

                    if cpl > 100:
                        total_blunders += 1
                        board.pop()
                        cat = _position_category(board, is_white)
                        btype = _blunder_type(board, move, analysis)
                        board.push(move)

                        key = (cat, btype)
                        pattern_counter[key] += 1
                        if key not in pattern_examples:
                            board.pop()
                            pattern_examples[key] = (board.fen(), move.uci())
                            board.push(move)
            else:
                board.push(move)

    phase_accuracy: dict[str, float] = {}
    for phase, cpls in phase_cpls.items():
        if cpls:
            scores = [
                max(0, min(100, 103.17 * math.exp(-0.04354 * c) - 3.17))
                for c in cpls
            ]
            phase_accuracy[phase] = round(sum(scores) / len(scores), 1)

    weakest = min(phase_accuracy, key=lambda k: phase_accuracy[k]) if phase_accuracy else "unknown"
    strongest = max(phase_accuracy, key=lambda k: phase_accuracy[k]) if phase_accuracy else "unknown"

    top_patterns: list[BlunderPattern] = []
    for (cat, btype), count in pattern_counter.most_common(8):
        ex = pattern_examples.get((cat, btype))
        top_patterns.append(BlunderPattern(
            position_category=cat,
            blunder_type=btype,
            occurrences=count,
            example_fen=ex[0] if ex else None,
            example_move=ex[1] if ex else None,
            description=_describe_pattern(cat, btype, count),
        ))

    return CoachResponse(
        insights=CoachInsight(
            total_games_analyzed=len(pgns),
            total_moves_analyzed=total_moves,
            total_blunders=total_blunders,
            avg_cpl=round(total_cpl / max(cpl_count, 1), 1),
            weakest_phase=weakest,
            strongest_phase=strongest,
            top_patterns=top_patterns,
            phase_accuracy=phase_accuracy,
        )
    )


def _classify_phase(board: chess.Board) -> str:
    pieces = sum(
        1 for sq in chess.SQUARES
        if board.piece_at(sq) is not None
        and board.piece_type_at(sq) not in (chess.PAWN, chess.KING)
    )
    if board.fullmove_number <= 12:
        return "opening"
    if pieces <= 6:
        return "endgame"
    return "middlegame"


def _position_category(board: chess.Board, is_white: bool) -> str:
    pieces = sum(
        1 for sq in chess.SQUARES
        if board.piece_at(sq) is not None
        and board.piece_type_at(sq) not in (chess.PAWN, chess.KING)
    )
    has_queens = any(
        board.piece_type_at(sq) == chess.QUEEN
        for sq in chess.SQUARES
        if board.piece_at(sq) is not None
    )
    if board.fullmove_number <= 12:
        return "opening_white" if is_white else "opening_black"
    if pieces <= 6:
        rooks = sum(
            1 for sq in chess.SQUARES
            if board.piece_at(sq) and board.piece_type_at(sq) == chess.ROOK
        )
        if pieces == 0:
            return "pawn_endgame"
        if rooks >= 2:
            return "rook_endgame"
        return "minor_piece_endgame"
    return "middlegame_with_queens" if has_queens else "middlegame_queenless"


def _blunder_type(board: chess.Board, move: chess.Move, analysis) -> str:
    best_uci = analysis.best_move if analysis else None
    if analysis and analysis.eval_mate is not None and analysis.eval_mate > 0:
        return "missed_mate"
    if best_uci:
        try:
            best_move = chess.Move.from_uci(best_uci)
            if board.is_capture(best_move) or board.gives_check(best_move):
                return "missed_tactic"
        except ValueError:
            pass
    piece = board.piece_at(move.from_square)
    if piece and not board.is_capture(move):
        if board.is_attacked_by(not board.turn, move.to_square):
            if not board.is_attacked_by(board.turn, move.to_square):
                return "hung_piece"
    if board.has_castling_rights(board.turn) and not board.is_castling(move):
        for castle_move in board.legal_moves:
            if board.is_castling(castle_move):
                return "king_safety_neglect"
    return "general"


def _describe_pattern(cat: str, btype: str, count: int) -> str:
    cat_names = {
        "opening_white": "openings as White",
        "opening_black": "openings as Black",
        "middlegame_with_queens": "middlegames with queens",
        "middlegame_queenless": "queenless middlegames",
        "rook_endgame": "rook endgames",
        "pawn_endgame": "pawn endgames",
        "minor_piece_endgame": "minor piece endgames",
    }
    type_names = {
        "missed_tactic": "missing tactical shots",
        "hung_piece": "hanging pieces on undefended squares",
        "king_safety_neglect": "ignoring king safety when castling was available",
        "missed_mate": "missing forced checkmates",
        "general": "general inaccuracies",
    }
    return (
        f"In {cat_names.get(cat, cat)}, you tend to blunder by "
        f"{type_names.get(btype, btype)} ({count} times across your games)."
    )
