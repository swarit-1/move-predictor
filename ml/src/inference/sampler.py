"""Skill-aware move sampling with blind spot biases.

Move selection combines two systems:

1. **Temperature scaling** — modulates randomness based on player rating
   and predicted error tendency. Reduced range (0.2–1.5) compared to
   pre-blind-spot era, since structured biases now handle most error modeling.

2. **Blind spot biases** — position-aware logit adjustments that model
   specific human cognitive errors (tactical blindness, material greed,
   check attraction, piece preference, king safety neglect). These produce
   *realistic* mistakes rather than random ones.

The two systems are complementary: blind spots determine *which* mistakes
are likely, while temperature controls *how often* the player deviates
from their strongest move.
"""

import torch
import torch.nn.functional as F
import chess
from dataclasses import dataclass

from src.models.move_encoding import decode_move, get_legal_move_mask
from src.inference.blind_spots import (
    BlindSpotConfig,
    compute_blind_spot_biases,
)


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
    from_book: bool = False  # True if this move came from the opening book


def compute_temperature(
    predicted_cpl: float,
    blunder_prob: float,
    player_rating: float = 1500.0,
    style: StyleOverrides | None = None,
    time_pressure: float = 0.0,
) -> float:
    """Compute sampling temperature based on predicted error and player skill.

    Lower temperature = more deterministic (engine-like)
    Higher temperature = more random (human-like, error-prone)

    With blind spot biases handling structured errors, temperature now has
    a tighter range (0.2–1.5) and primarily controls move-selection variance
    rather than being the sole source of human-like mistakes.

    Args:
        predicted_cpl: Model's predicted centipawn loss.
        blunder_prob: Model's predicted blunder probability.
        player_rating: Player's rating.
        style: Optional style overrides.
        time_pressure: 0.0 (no pressure) to 1.0 (extreme time pressure).

    Returns:
        Temperature value (typically 0.2 to 1.5).
    """
    if style is None:
        style = StyleOverrides()

    # Base temperature from rating — reduced range since blind spots
    # now handle the heavy lifting for error modeling
    # Maps ~600-2800 rating to ~1.2-0.2 temperature
    rating_temp = max(0.2, 1.4 - (player_rating / 2200.0))

    # Lighter error adjustment (blind spots cover most of this now)
    error_temp = 0.3 * predicted_cpl + 0.2 * blunder_prob

    # Style adjustments
    risk_factor = style.risk_taking / 100.0  # 0 to 1
    blunder_factor = style.blunder_frequency / 100.0  # 0 to 1

    temperature = rating_temp + error_temp * 0.3
    temperature *= (0.6 + 0.8 * risk_factor)  # risk slider scales temperature
    temperature *= (0.8 + 0.4 * blunder_factor)  # blunder slider (reduced impact)

    # Time pressure increases temperature (more errors under time trouble)
    if time_pressure > 0:
        temperature *= (1.0 + 0.5 * time_pressure)

    # Tighter clamp — blind spots do the error work, temperature just adds variance
    return max(0.2, min(1.5, temperature))


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
    opening_book_probs: dict[str, float] | None = None,
    apply_blind_spots: bool = True,
    time_pressure: float = 0.0,
) -> SampledMove:
    """Sample a move using blind spot biases + temperature scaling.

    Pipeline:
    0. Check opening book (if available and position is in book)
    1. Apply style bias (aggression)
    2. Apply blind spot biases (tactical blindness, material greed, etc.)
    3. Mask illegal moves
    4. Apply temperature scaling
    5. Sample from distribution

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
    # Check opening book — if the position is in the book, boost book moves
    from_book = False
    if opening_book_probs:
        # Blend book probabilities into logits as strong priors
        from src.models.move_encoding import encode_move as _enc
        for move_uci, book_prob in opening_book_probs.items():
            try:
                move = chess.Move.from_uci(move_uci)
                if move in board.legal_moves:
                    idx = _enc(move, board)
                    # Strong logit boost proportional to book frequency
                    policy_logits[idx] += 3.0 * book_prob
                    from_book = True
            except (ValueError, IndexError):
                continue

    # Get legal move mask
    legal_mask = torch.from_numpy(get_legal_move_mask(board)).to(policy_logits.device)

    # Apply style bias (aggression)
    logits = apply_style_bias(policy_logits, board, style)

    # Apply blind spot biases — structured human error modeling
    if apply_blind_spots:
        blind_spot_config = BlindSpotConfig.from_rating(player_rating)
        bs_result = compute_blind_spot_biases(
            logits, board, blind_spot_config, engine_top_moves,
        )
        logits = bs_result.modified_logits

    # Mask illegal moves
    logits[~legal_mask] = float("-inf")

    # Compute temperature
    temperature = compute_temperature(predicted_cpl, blunder_prob, player_rating, style, time_pressure)

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
        from_book=from_book,
    )
