"""Skill-aware move sampling.

Instead of taking argmax (which would give engine-like play), we sample
from the predicted move distribution with temperature modulated by:
- Predicted error level (higher error → higher temperature → more human-like mistakes)
- Player skill (lower-rated players get higher temperature)
- Style overrides (user-adjustable sliders for aggression, risk, blunder frequency)

This is the core mechanism that makes the system predict human-like moves
rather than optimal engine moves.
"""

import torch
import torch.nn.functional as F
import numpy as np
import chess
from dataclasses import dataclass

from src.models.move_encoding import decode_move, get_legal_move_mask, NUM_MOVES


@dataclass
class StyleOverrides:
    """User-adjustable style parameters (0-100 scale)."""

    aggression: float = 50.0  # Higher = prefer attacking moves
    risk_taking: float = 50.0  # Higher = more variance in move selection
    blunder_frequency: float = 50.0  # Higher = more likely to make mistakes


@dataclass
class SampledMove:
    """Result of sampling a move from the model."""

    move: chess.Move
    move_uci: str
    probability: float
    temperature: float
    top_moves: list[dict]  # [{move_uci, probability, engine_rank}]
    predicted_cpl: float
    blunder_probability: float


def compute_temperature(
    predicted_cpl: float,
    blunder_prob: float,
    player_rating: float = 1500.0,
    style: StyleOverrides | None = None,
) -> float:
    """Compute sampling temperature based on predicted error and player skill.

    Lower temperature = more deterministic (engine-like)
    Higher temperature = more random (human-like, error-prone)

    Args:
        predicted_cpl: Model's predicted centipawn loss.
        blunder_prob: Model's predicted blunder probability.
        player_rating: Player's rating.
        style: Optional style overrides.

    Returns:
        Temperature value (typically 0.3 to 2.0).
    """
    if style is None:
        style = StyleOverrides()

    # Base temperature from rating (higher rating = lower temperature)
    # Maps ~600-2800 rating to ~1.5-0.3 temperature
    rating_temp = max(0.3, 1.8 - (player_rating / 2000.0))

    # Adjust based on predicted error tendency
    error_temp = 0.5 * predicted_cpl + 0.3 * blunder_prob

    # Style adjustments
    risk_factor = style.risk_taking / 100.0  # 0 to 1
    blunder_factor = style.blunder_frequency / 100.0  # 0 to 1

    temperature = rating_temp + error_temp * 0.5
    temperature *= (0.5 + risk_factor)  # risk slider scales temperature
    temperature *= (0.7 + 0.6 * blunder_factor)  # blunder slider

    # Clamp to reasonable range
    return max(0.1, min(3.0, temperature))


def apply_style_bias(
    logits: torch.Tensor,
    board: chess.Board,
    style: StyleOverrides | None = None,
) -> torch.Tensor:
    """Apply style-based biases to move logits.

    Modifies the logit distribution to favor certain types of moves
    based on the style overrides.

    Args:
        logits: (vocab_size,) raw policy logits.
        board: Current board state.
        style: Style overrides.

    Returns:
        Modified logits.
    """
    if style is None or style.aggression == 50.0:
        return logits

    modified = logits.clone()

    # Aggression bias: boost captures and checks
    aggression_boost = (style.aggression - 50.0) / 100.0  # -0.5 to +0.5

    for move in board.legal_moves:
        from src.models.move_encoding import encode_move
        try:
            idx = encode_move(move, board)
        except ValueError:
            continue

        bonus = 0.0
        if board.is_capture(move):
            bonus += aggression_boost * 1.5
        if board.gives_check(move):
            bonus += aggression_boost * 1.0

        modified[idx] += bonus

    return modified


def sample_move(
    policy_logits: torch.Tensor,
    board: chess.Board,
    predicted_cpl: float = 0.0,
    blunder_prob: float = 0.0,
    player_rating: float = 1500.0,
    style: StyleOverrides | None = None,
    engine_top_moves: list[dict] | None = None,
) -> SampledMove:
    """Sample a move using skill-aware temperature scaling.

    This is NOT argmax. We sample from the distribution to produce
    realistic human play, including occasional mistakes.

    Args:
        policy_logits: (vocab_size,) tensor of raw logits from the model.
        board: Current board position.
        predicted_cpl: Model's predicted centipawn loss.
        blunder_prob: Model's predicted blunder probability.
        player_rating: Player rating.
        style: Optional style overrides.
        engine_top_moves: Optional Stockfish top moves for comparison.

    Returns:
        SampledMove with the selected move and metadata.
    """
    # Get legal move mask
    legal_mask = torch.from_numpy(get_legal_move_mask(board)).to(policy_logits.device)

    # Apply style bias
    logits = apply_style_bias(policy_logits, board, style)

    # Mask illegal moves
    logits[~legal_mask] = float("-inf")

    # Compute temperature
    temperature = compute_temperature(predicted_cpl, blunder_prob, player_rating, style)

    # Apply temperature and sample
    scaled_logits = logits / temperature
    probs = F.softmax(scaled_logits, dim=-1)

    # Sample from the distribution
    move_idx = torch.multinomial(probs, num_samples=1).item()

    # Decode the move
    selected_move = decode_move(move_idx, board)

    # Get top-5 moves for display
    top5_values, top5_indices = probs.topk(5)
    top_moves = []
    for prob_val, idx in zip(top5_values.tolist(), top5_indices.tolist()):
        try:
            m = decode_move(idx, board)
            entry = {
                "move_uci": m.uci(),
                "probability": prob_val,
            }
            # Add engine rank if available
            if engine_top_moves:
                for rank, em in enumerate(engine_top_moves):
                    if em.get("move") == m.uci():
                        entry["engine_rank"] = rank + 1
                        entry["engine_cp"] = em.get("cp")
                        break
            top_moves.append(entry)
        except (ValueError, IndexError):
            continue

    return SampledMove(
        move=selected_move,
        move_uci=selected_move.uci(),
        probability=probs[move_idx].item(),
        temperature=temperature,
        top_moves=top_moves,
        predicted_cpl=predicted_cpl,
        blunder_probability=blunder_prob,
    )
