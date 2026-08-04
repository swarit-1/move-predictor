"""Regression tests for the free-hang filter (PLAN.md §1.2).

The founding case: a 1600-rated clone played Qd6?? next to a pawn
(reported with screenshot 2026-08-04) — donating the queen to exd6.
Self-play audits measured ~4% of all moves being such give-aways before
the filter; the sampler must now price them at (near) zero for club
players while leaving real human blunder classes intact.
"""

import chess
import torch

from src.inference.sampler import sample_move
from src.inference.tactics import free_hang_net
from src.models.move_encoding import NUM_MOVES

# The screenshot position: Black queen on c5, White pawn on e5.
# Qd6?? loses the queen to exd6 for nothing.
SCREENSHOT_FEN = "2r2rk1/pp3ppp/8/2qpPb2/4n3/5B1P/PB3PP1/2RQ1RK1 b - - 1 18"


def test_free_hang_net_flags_queen_to_pawn():
    board = chess.Board(SCREENSHOT_FEN)
    assert free_hang_net(board, chess.Move.from_uci("c5d6")) <= -8


def test_free_hang_net_ignores_safe_moves():
    board = chess.Board(SCREENSHOT_FEN)
    # Qb6 keeps the queen safe (no cheaper attacker profits)
    assert free_hang_net(board, chess.Move.from_uci("c5b6")) == 0


def test_free_hang_net_allows_profitable_captures():
    # Queen takes a defended rook: loses Q(9) for R(5)+recapture — that is
    # a genuine human blunder class (miscounted exchange), NOT a free hang
    # of the one-square-gift kind... but net is -4+5 = ... verify the
    # helper's contract on a clean case: queen takes UNdefended rook = fine.
    board = chess.Board("4k3/8/8/3r4/8/3Q4/8/4K3 w - - 0 1")
    assert free_hang_net(board, chess.Move.from_uci("d3d5")) == 0


def test_mate_delivery_never_flagged():
    # Back-rank mate with the queen landing next to a defender-free zone
    board = chess.Board("6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1")
    mate = chess.Move.from_uci("d1d8")
    board.push(mate)
    is_mate = board.is_checkmate()
    board.pop()
    if is_mate:
        assert free_hang_net(board, mate) == 0


def test_clone_never_plays_the_screenshot_hang_at_1600():
    """100 samples with uniform logits: the filter alone must prevent Qd6."""
    board = chess.Board(SCREENSHOT_FEN)
    seen = set()
    for _ in range(100):
        result = sample_move(
            policy_logits=torch.zeros(NUM_MOVES),
            board=board,
            player_rating=1600.0,
            predicted_cpl=0.3,
            blunder_prob=0.15,
        )
        seen.add(result.move_uci)
    assert "c5d6" not in seen, "clone still hangs the queen to exd6"


def test_beginners_can_still_blunder_pieces():
    """At 500, the penalty is soft — hanging moves survive in the
    distribution (beginners really do this). We only require that the
    filter doesn't eliminate them entirely across many samples."""
    board = chess.Board(SCREENSHOT_FEN)
    hang_count = 0
    for _ in range(300):
        result = sample_move(
            policy_logits=torch.zeros(NUM_MOVES),
            board=board,
            player_rating=500.0,
            predicted_cpl=1.5,
            blunder_prob=0.3,
        )
        if free_hang_net(chess.Board(SCREENSHOT_FEN), result.move) < 0:
            hang_count += 1
    assert hang_count > 0, "beginners should still hang pieces sometimes"
