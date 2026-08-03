"""Human think-time and game-end behavior modeling (PLAN.md §1.3 / §1.4).

Humans don't move on a metronome: book moves snap out, recaptures are
instant, sharp middlegames cause tanks, and time trouble compresses
everything. The ML service models this per move and ships it in the
predict response so every client renders the same believable rhythm.

Also: humans resign lost positions and agree draws in dead-equal endings.
`suggest_game_end` returns rating-aware resign/draw signals.
"""

from __future__ import annotations

import math
import random

import chess

from src.data.preprocessing import classify_game_phase, compute_position_complexity


def sample_think_time_ms(
    board: chess.Board,
    move: chess.Move,
    *,
    player_rating: float = 1500.0,
    time_control_initial: float | None = None,
    time_remaining: float | None = None,
    from_book: bool = False,
    predicted_cpl: float = 0.0,
    rng: random.Random | None = None,
) -> int:
    """Sample a believable think time in milliseconds for the chosen move."""
    rng = rng or random.Random()
    phase = classify_game_phase(board)
    ply = board.ply()

    # Base thinking budget: fraction of the initial clock, or a rapid-ish
    # default when there is no clock.
    initial = time_control_initial if time_control_initial else 600.0
    base = initial * 0.012 * 1000.0  # ~1.2% of the clock per move, in ms

    # ── Snap-move classes ────────────────────────────────────────────
    legal_count = board.legal_moves.count()
    is_recapture = False
    if board.move_stack:
        last = board.peek()
        if board.is_capture(move) and move.to_square == last.to_square:
            is_recapture = True

    if legal_count <= 2 or is_recapture:
        # Forced move / automatic recapture: instant.
        return int(rng.uniform(200, 700))
    if from_book or (phase == 0 and ply < 16):
        # Opening theory: known moves come fast.
        return int(rng.uniform(300, 1400))

    # ── Position-driven scaling ──────────────────────────────────────
    cx = compute_position_complexity(board)
    # mobility/tension/king exposure are ~[0,1]; sharp positions tank.
    sharpness = (
        0.5 * float(cx.get("piece_tension", 0.0))
        + 0.3 * float(cx.get("king_exposure", 0.0))
        + 0.2 * float(cx.get("mobility", 0.0))
    )
    factor = 0.6 + 1.8 * sharpness

    # Uncertain players (high predicted error) hesitate more.
    factor *= 1.0 + min(predicted_cpl, 1.0) * 0.4

    # Endgames speed up a little; conversions are technique, not search.
    if phase == 2:
        factor *= 0.75

    # Higher-rated players allocate more deliberately mid-game.
    factor *= 0.75 + player_rating / 4000.0

    think = base * factor

    # Occasional genuine tank on sharp middlegame positions (lognormal tail).
    if phase == 1 and sharpness > 0.45 and rng.random() < 0.12:
        think *= math.exp(rng.uniform(0.5, 1.3))

    # Jitter ±35%
    think *= rng.uniform(0.65, 1.35)

    # ── Time pressure compression ────────────────────────────────────
    if time_control_initial and time_remaining is not None:
        ratio = max(0.0, time_remaining / time_control_initial)
        if time_remaining < 10:
            think = min(think, rng.uniform(150, 450))
        elif time_remaining < 30:
            think = min(think, rng.uniform(400, 1100))
        elif ratio < 0.25:
            think *= 0.45
        elif ratio < 0.5:
            think *= 0.7
        # Never spend more than 15% of the remaining clock on one move.
        think = min(think, time_remaining * 0.15 * 1000.0)

    return int(max(200, min(think, 30_000)))


def suggest_game_end(
    board: chess.Board,
    *,
    eval_cp_mover: float | None,
    player_rating: float = 1500.0,
    rng: random.Random | None = None,
) -> str | None:
    """Return "resign", "offer_draw", or None for the side to move.

    Resignation: deep, sustained-looking losses get resigned with a
    probability that rises with rating (a 900 plays on hoping for a swindle;
    a 2100 doesn't insult you by shuffling in K vs K+Q). We only see the
    current eval, so the "sustained" part is approximated by requiring a
    decisive margin and a developed game.
    """
    rng = rng or random.Random()
    if eval_cp_mover is None:
        return None
    ply = board.ply()

    # ── Resignation ──────────────────────────────────────────────────
    if eval_cp_mover < -600 and ply >= 30:
        rating_willingness = min(0.85, max(0.03, (player_rating - 700) / 2000.0))
        hopelessness = min(1.0, (-eval_cp_mover - 600) / 800.0)
        # Per-move probability; over several hopeless moves this converges
        # to "eventually resigns" without ever being abrupt.
        p = 0.35 * rating_willingness * hopelessness
        # Low material for the winning side = mate is near; bump it.
        if -eval_cp_mover > 900:
            p *= 1.5
        if rng.random() < min(p, 0.6):
            return "resign"

    # ── Draw offers ──────────────────────────────────────────────────
    piece_count = chess.popcount(board.occupied)
    if (
        abs(eval_cp_mover) < 20
        and ply >= 80
        and piece_count <= 8
        and rng.random() < 0.08
    ):
        return "offer_draw"

    return None
