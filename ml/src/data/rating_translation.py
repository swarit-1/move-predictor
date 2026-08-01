"""Chess.com ↔ Lichess rating-pool translation.

The two sites' rating pools are calibrated differently: at club level a
Chess.com blitz rating runs several hundred points below the Lichess
blitz rating of the same player, with the gap narrowing toward the top.
Everything inside the model — bracket checkpoints, the rating slot of
the stats vector, temperature / nucleus / blind-spot schedules — is
denominated in **Lichess** ratings (that's what the training corpus
was), so Chess.com ratings must be translated on the way in.

Anchor tables below are approximations distilled from public
cross-site comparison surveys (e.g. ChessGoals rating-comparison data).
They are deliberately coarse — piecewise-linear through a handful of
anchors, clamped at the ends — and easy to retune in one place.
"""

from __future__ import annotations

import numpy as np

# (chesscom_rating, lichess_equivalent) anchor points per time class.
_ANCHORS: dict[str, list[tuple[float, float]]] = {
    "blitz": [
        (400, 1000), (800, 1280), (1200, 1560), (1500, 1780),
        (1800, 1990), (2100, 2210), (2400, 2440), (2700, 2700),
    ],
    "rapid": [
        (400, 950), (800, 1220), (1200, 1500), (1500, 1720),
        (1800, 1950), (2100, 2180), (2400, 2420), (2700, 2700),
    ],
    "bullet": [
        (400, 800), (800, 1100), (1200, 1420), (1500, 1660),
        (1800, 1910), (2100, 2160), (2400, 2420), (2700, 2700),
    ],
}
_DEFAULT_TIME_CLASS = "blitz"

RATING_POOLS = ("lichess", "chesscom")


def chesscom_to_lichess(rating: float, time_class: str | None = None) -> float:
    """Translate a Chess.com rating to its approximate Lichess equivalent."""
    anchors = _ANCHORS.get(time_class or _DEFAULT_TIME_CLASS)
    if anchors is None:
        anchors = _ANCHORS[_DEFAULT_TIME_CLASS]
    xs = [a[0] for a in anchors]
    ys = [a[1] for a in anchors]
    return float(np.interp(rating, xs, ys))


def to_internal_rating(
    rating: float,
    rating_pool: str | None,
    time_class: str | None = None,
) -> float:
    """Normalize a user-facing rating to the internal (Lichess) scale.

    `rating_pool` of None or "lichess" is the identity; "chesscom"
    translates. Unknown pools pass through unchanged rather than guess.
    """
    if rating_pool == "chesscom":
        return chesscom_to_lichess(rating, time_class)
    return float(rating)
