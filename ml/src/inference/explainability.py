"""Explainability layer: explain why the model predicts a move.

Compares the model's prediction against the engine's best move and
generates human-readable explanations for the deviation.
"""

import chess
from dataclasses import dataclass

from src.inference.sampler import SampledMove


@dataclass
class MoveExplanation:
    """Explanation for why the model predicted a specific move."""

    model_move: str
    engine_best_move: str
    is_deviation: bool
    deviation_reason: str
    model_confidence: float
    engine_rank_of_model_move: int | None
    centipawn_cost: float | None  # cost of choosing model move over engine move
    factors: list[str]


def explain_prediction(
    sampled: SampledMove,
    engine_best_move: str,
    engine_top_moves: list[dict],
    player_rating: float = 1500.0,
    game_phase: int = 1,
) -> MoveExplanation:
    """Generate an explanation for the model's move prediction.

    Args:
        sampled: The model's sampled move.
        engine_best_move: UCI string of Stockfish's best move.
        engine_top_moves: Stockfish's top-N moves with evaluations.
        player_rating: The simulated player's rating.
        game_phase: Current game phase (0=opening, 1=middlegame, 2=endgame).

    Returns:
        MoveExplanation with details about the prediction.
    """
    model_uci = sampled.move_uci
    is_deviation = model_uci != engine_best_move

    # Find engine rank of the model's move
    engine_rank = None
    cp_cost = None
    best_cp = None

    for entry in engine_top_moves:
        if best_cp is None:
            best_cp = entry.get("cp")
        if entry["move"] == model_uci:
            engine_rank = entry["rank"]
            if best_cp is not None and entry.get("cp") is not None:
                cp_cost = best_cp - entry["cp"]
            break

    # Build explanation factors
    factors = []

    if not is_deviation:
        factors.append("Model agrees with engine's best move")
    else:
        # Explain the deviation
        if sampled.blunder_probability > 0.3:
            factors.append(
                f"High blunder probability ({sampled.blunder_probability:.0%}) — "
                "model predicts this player is likely to make an error here"
            )

        if player_rating < 1200:
            factors.append(
                f"Low player rating ({player_rating:.0f}) — "
                "model predicts simpler/more natural-looking moves"
            )

        if sampled.predicted_cpl > 30:
            factors.append(
                f"Predicted centipawn loss of {sampled.predicted_cpl:.0f} — "
                "model expects a suboptimal move from this player"
            )

        if engine_rank is not None:
            if engine_rank <= 3:
                factors.append(
                    f"Model's move is engine's #{engine_rank} choice — "
                    "a reasonable alternative, not the absolute best"
                )
            elif engine_rank <= 5:
                factors.append(
                    f"Model's move is engine's #{engine_rank} choice — "
                    "a plausible human preference over the computer's top pick"
                )
            else:
                factors.append(
                    f"Model's move is not in engine's top 5 — "
                    "this reflects a human blind spot or stylistic preference"
                )

        if cp_cost is not None and cp_cost > 0:
            factors.append(
                f"Choosing this move costs ~{cp_cost} centipawns vs the engine best"
            )

        phase_names = {0: "opening", 1: "middlegame", 2: "endgame"}
        phase_name = phase_names.get(game_phase, "middlegame")

        if game_phase == 0:
            factors.append(
                f"In the {phase_name}, humans often follow familiar patterns "
                "rather than calculating the objectively best move"
            )
        elif game_phase == 2:
            factors.append(
                f"In the {phase_name}, technique matters — "
                "the model accounts for common endgame errors at this level"
            )

    # Build summary reason
    if not is_deviation:
        reason = "The model predicts the same move as the engine."
    elif factors:
        reason = factors[0]
    else:
        reason = "The model predicts a different move based on learned human patterns."

    return MoveExplanation(
        model_move=model_uci,
        engine_best_move=engine_best_move,
        is_deviation=is_deviation,
        deviation_reason=reason,
        model_confidence=sampled.probability,
        engine_rank_of_model_move=engine_rank,
        centipawn_cost=cp_cost,
        factors=factors,
    )
