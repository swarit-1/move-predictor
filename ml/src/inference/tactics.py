"""Cheap tactical sanity checks shared by the sampler and audit tooling.

PLAN.md §1.2 blunder realism: human blunders are *tactical* (missed
forks, back-rank, overloaded defenders) — humans almost never move a
piece one square onto a strictly cheaper attacker for free. Models early
in training do exactly that. `free_hang_net` quantifies the give-away so
the sampler can penalize it at rating scale.
"""

from __future__ import annotations

import chess

PIECE_VAL = {
    chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
    chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 99,
}


def free_hang_net(board: chess.Board, move: chess.Move) -> int:
    """Material outcome (mover's perspective) if the opponent punishes
    `move` with the cheapest profitable capture of the moved piece.

    Returns 0 when the move is safe / not a give-away. Negative values
    mean "the mover just donated material": -3 ≈ a minor piece, -8 ≈ the
    queen for a pawn. Conservative one-ply exchange logic — no deep SEE —
    so false positives are rare (a defended piece attacked by a cheaper
    piece still counts, because the attacker profits regardless).
    Mate-delivering moves are never flagged.
    """
    mover = board.piece_at(move.from_square)
    if mover is None or mover.piece_type == chess.KING:
        return 0
    victim_value = PIECE_VAL[mover.piece_type]
    if victim_value <= 1:
        return 0  # pawns can't hang to anything cheaper

    captured_value = 0
    if board.is_capture(move):
        cap = board.piece_at(move.to_square)
        captured_value = PIECE_VAL[cap.piece_type] if cap else 1  # en passant

    board.push(move)
    try:
        if board.is_checkmate():
            return 0
        to_sq = move.to_square
        cheaper = [
            sq for sq in board.attackers(board.turn, to_sq)
            if PIECE_VAL[board.piece_at(sq).piece_type] < victim_value
        ]
        if not cheaper:
            return 0
        cheapest_val = min(PIECE_VAL[board.piece_at(sq).piece_type] for sq in cheaper)
        defended = bool(board.attackers(not board.turn, to_sq))
        net = -victim_value + (cheapest_val if defended else 0) + captured_value
        return min(net, 0)
    finally:
        board.pop()
