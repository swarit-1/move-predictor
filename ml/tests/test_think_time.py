"""Tests for think-time and game-end modeling (PLAN.md §1.3/§1.4)."""

import random

import chess

from src.inference.think_time import sample_think_time_ms, suggest_game_end

MIDGAME_FEN = "r1bq1rk1/pp2ppbp/2np1np1/8/2BNP3/2N1BP2/PPPQ2PP/R3K2R w KQ - 4 9"


def rng():
    return random.Random(7)


def test_book_moves_are_fast():
    board = chess.Board()
    move = chess.Move.from_uci("e2e4")
    for _ in range(20):
        t = sample_think_time_ms(board, move, from_book=True, rng=rng())
        assert 200 <= t <= 1500


def test_forced_moves_snap():
    # King in check with very few replies
    board = chess.Board("rnbqkbnr/ppppp1pp/8/5p1Q/8/4P3/PPPP1PPP/RNB1KBNR b KQkq - 1 2")
    legal = list(board.legal_moves)
    assert len(legal) <= 3
    t = sample_think_time_ms(board, legal[0], rng=rng())
    assert t <= 700


def test_recaptures_snap():
    board = chess.Board()
    for uci in ["e2e4", "d7d5", "e4d5"]:
        board.push_uci(uci)
    recapture = chess.Move.from_uci("d8d5")
    assert board.is_capture(recapture)
    t = sample_think_time_ms(board, recapture, rng=rng())
    assert t <= 700


def test_middlegame_slower_than_opening():
    opening_board = chess.Board()
    mid_board = chess.Board(MIDGAME_FEN)
    r = random.Random(11)
    opening = sum(
        sample_think_time_ms(opening_board, chess.Move.from_uci("e2e4"), rng=r)
        for _ in range(30)
    )
    mid_move = next(iter(mid_board.legal_moves))
    middlegame = sum(
        sample_think_time_ms(mid_board, mid_move, time_control_initial=300, rng=r)
        for _ in range(30)
    )
    assert middlegame > opening


def test_time_pressure_compresses():
    board = chess.Board(MIDGAME_FEN)
    move = next(iter(board.legal_moves))
    r = random.Random(3)
    panicked = [
        sample_think_time_ms(
            board, move, time_control_initial=300, time_remaining=8, rng=r
        )
        for _ in range(20)
    ]
    assert max(panicked) <= 450
    # And never more than 15% of the remaining clock.
    assert max(panicked) <= 8 * 0.15 * 1000


def test_bounds_always_hold():
    board = chess.Board(MIDGAME_FEN)
    move = next(iter(board.legal_moves))
    r = random.Random(5)
    for tc in (None, 60, 300, 1800):
        for rem in (None, 5, 100, 1800):
            if tc is None and rem is not None:
                continue
            t = sample_think_time_ms(
                board, move, time_control_initial=tc, time_remaining=rem, rng=r
            )
            assert 150 <= t <= 30_000


def test_resign_only_when_deeply_lost_and_developed():
    board = chess.Board(MIDGAME_FEN)  # ply 16 — too early
    assert (
        suggest_game_end(board, eval_cp_mover=-1200, player_rating=2000, rng=rng())
        is None
    )

    late = chess.Board("8/8/4k3/8/8/2q5/1q6/4K3 w - - 0 60")
    assert late.ply() >= 30
    # Over many samples a 2000 eventually resigns a -1500 position...
    r = random.Random(1)
    decisions = [
        suggest_game_end(late, eval_cp_mover=-1500, player_rating=2000, rng=r)
        for _ in range(200)
    ]
    assert "resign" in decisions
    # ...but never resigns a winning or mildly worse position.
    assert all(
        suggest_game_end(late, eval_cp_mover=cp, player_rating=2000, rng=r) != "resign"
        for cp in (300, 0, -300, -599)
    )


def test_low_rated_players_rarely_resign():
    late = chess.Board("8/8/4k3/8/8/2q5/1q6/4K3 w - - 0 60")
    r = random.Random(2)
    n = 300
    beginner = sum(
        1
        for _ in range(n)
        if suggest_game_end(late, eval_cp_mover=-900, player_rating=800, rng=r)
        == "resign"
    )
    expert = sum(
        1
        for _ in range(n)
        if suggest_game_end(late, eval_cp_mover=-900, player_rating=2200, rng=r)
        == "resign"
    )
    assert beginner < expert


def test_draw_offer_only_in_dead_equal_late_endings():
    ending = chess.Board("8/5k2/8/8/8/3K4/8/8 w - - 0 60")
    r = random.Random(4)
    decisions = {
        suggest_game_end(ending, eval_cp_mover=0, player_rating=1600, rng=r)
        for _ in range(300)
    }
    assert decisions <= {None, "offer_draw"}
    # Never offers a draw when clearly better.
    assert all(
        suggest_game_end(ending, eval_cp_mover=250, player_rating=1600, rng=r)
        != "offer_draw"
        for _ in range(100)
    )
