"""Tests for Chess.com → Lichess rating-pool translation."""

from src.data.rating_translation import chesscom_to_lichess, to_internal_rating


def test_chesscom_blitz_translates_upward_at_club_level():
    # A club-level Chess.com blitz rating maps a few hundred points higher
    assert 1700 < chesscom_to_lichess(1500, "blitz") < 1900
    assert 1200 < chesscom_to_lichess(800, "blitz") < 1400


def test_translation_converges_at_the_top():
    assert abs(chesscom_to_lichess(2700, "blitz") - 2700) < 50


def test_translation_is_monotonic():
    for tc in ("blitz", "rapid", "bullet"):
        prev = None
        for rating in range(300, 3000, 100):
            cur = chesscom_to_lichess(rating, tc)
            if prev is not None:
                assert cur >= prev, f"{tc} non-monotonic at {rating}"
            prev = cur


def test_unknown_time_class_falls_back_to_blitz():
    assert chesscom_to_lichess(1500, "daily") == chesscom_to_lichess(1500, "blitz")
    assert chesscom_to_lichess(1500, None) == chesscom_to_lichess(1500, "blitz")


def test_to_internal_rating_pools():
    # Lichess / unknown pools are identity
    assert to_internal_rating(1500, "lichess") == 1500
    assert to_internal_rating(1500, None) == 1500
    assert to_internal_rating(1500, "rating") == 1500
    # Chess.com translates
    assert to_internal_rating(1500, "chesscom", "blitz") > 1600
