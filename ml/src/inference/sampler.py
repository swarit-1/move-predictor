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

    With blind spot biases and nucleus (top-p) sampling handling error
    modeling, temperature only controls variance among candidate moves.
    Ceiling is 1.0 — top-p prevents tail sampling, blind spots create
    structured errors.

    Args:
        predicted_cpl: Model's predicted centipawn loss.
        blunder_prob: Model's predicted blunder probability.
        player_rating: Player's rating.
        style: Optional style overrides.
        time_pressure: 0.0 (no pressure) to 1.0 (extreme time pressure).

    Returns:
        Temperature value (0.25 to 1.5, ceiling depends on rating).
    """
    if style is None:
        style = StyleOverrides()

    # Base temperature from rating — wider separation so low-rated players
    # deviate significantly more than high-rated ones.
    # Rating 800 → ~0.94, Rating 1500 → ~0.62, Rating 2400 → ~0.21
    rating_temp = max(0.20, 1.3 - (player_rating / 2200.0))

    # Error adjustment — contributes meaningfully to temperature
    error_temp = 0.3 * predicted_cpl + 0.2 * blunder_prob

    # Style adjustments
    risk_factor = style.risk_taking / 100.0
    blunder_factor = style.blunder_frequency / 100.0

    temperature = rating_temp + error_temp * 0.4
    temperature *= (0.7 + 0.6 * risk_factor)
    temperature *= (0.85 + 0.3 * blunder_factor)

    # Time pressure increases temperature (more errors under time trouble)
    if time_pressure > 0:
        temperature *= (1.0 + 0.5 * time_pressure)

    # Rating-dependent ceiling: low-rated players can reach higher temperatures
    ceiling = 1.5 if player_rating < 1200 else 1.2 if player_rating < 1800 else 1.0
    return max(0.25, min(ceiling, temperature))


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


def _compute_top_p(player_rating: float) -> float:
    """Compute nucleus sampling threshold based on player rating.

    Higher-rated players consider fewer candidate moves (tighter top-p).
    Lower-rated players consider more candidates (wider top-p) but
    still never pick from the garbage tail.

    Rating 400  -> top_p = 0.97 (considers ~15-20 moves)
    Rating 1000 -> top_p = 0.95 (considers ~10-15 moves)
    Rating 1500 -> top_p = 0.92 (considers ~7-10 moves)
    Rating 2000 -> top_p = 0.88 (considers ~5-7 moves)
    Rating 2500 -> top_p = 0.82 (considers ~3-5 moves)
    """
    # Tighter nucleus for higher-rated players:
    # Rating 400  -> top_p = 0.95 (considers ~12-15 moves)
    # Rating 1000 -> top_p = 0.90 (considers ~8-10 moves)
    # Rating 1500 -> top_p = 0.85 (considers ~5-7 moves)
    # Rating 2000 -> top_p = 0.80 (considers ~3-5 moves)
    # Rating 2500 -> top_p = 0.72 (considers ~2-4 moves)
    top_p = 0.95 - (player_rating - 400) * (0.23 / 2100)
    return max(0.70, min(0.96, top_p))


def _apply_nucleus_sampling(
    probs: torch.Tensor,
    top_p: float,
) -> torch.Tensor:
    """Apply nucleus (top-p) sampling to a probability distribution.

    Keeps only the smallest set of moves whose cumulative probability
    exceeds top_p, then renormalizes. All other moves get zero probability.

    This eliminates random blunders from the tail of the distribution
    while preserving blind-spot-boosted human-like mistakes that have
    high enough probability to be in the nucleus.

    Args:
        probs: (vocab_size,) probability distribution after softmax.
        top_p: Cumulative probability threshold (0.80 to 0.98).

    Returns:
        Filtered and renormalized probability distribution.
    """
    sorted_probs, sorted_indices = torch.sort(probs, descending=True)
    cumulative_probs = torch.cumsum(sorted_probs, dim=0)

    # Keep moves up to and including the one that pushes past top_p
    cutoff_mask = cumulative_probs <= top_p
    cutoff_mask = torch.cat([
        torch.tensor([True], device=probs.device),
        cutoff_mask[:-1],
    ])

    sorted_probs[~cutoff_mask] = 0.0

    # Reconstruct original ordering
    filtered_probs = torch.zeros_like(probs)
    filtered_probs.scatter_(0, sorted_indices, sorted_probs)

    # Renormalize
    total = filtered_probs.sum()
    if total > 0:
        filtered_probs = filtered_probs / total

    return filtered_probs


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
        blind_spot_config = BlindSpotConfig.from_rating(player_rating, time_pressure)
        bs_result = compute_blind_spot_biases(
            logits, board, blind_spot_config, engine_top_moves,
        )
        logits = bs_result.modified_logits

    # Mask illegal moves
    logits[~legal_mask] = float("-inf")

    # Compute temperature
    temperature = compute_temperature(predicted_cpl, blunder_prob, player_rating, style, time_pressure)

    # Apply temperature
    scaled_logits = logits / temperature
    probs = F.softmax(scaled_logits, dim=-1)

    # Nucleus (top-p) sampling: only consider moves within the top-p
    # probability mass. This eliminates random garbage moves from the
    # tail while keeping structured human errors from blind spots.
    top_p = _compute_top_p(player_rating)
    probs = _apply_nucleus_sampling(probs, top_p)

    # Rating-dependent probability floor: higher-rated players never play
    # moves that are correct less than a certain fraction of the time.
    if player_rating >= 2200:
        min_prob = 0.03   # 3% — only top ~5-8 moves survive
    elif player_rating >= 1600:
        min_prob = 0.015  # 1.5%
    elif player_rating >= 1200:
        min_prob = 0.008  # 0.8%
    else:
        min_prob = 0.003  # 0.3% — allow more variety for beginners

    probs[probs < min_prob] = 0.0
    prob_sum = probs.sum()
    if prob_sum > 0:
        probs = probs / prob_sum

    # Deterministic play for strong players: if the best move has a dominant
    # probability after all filtering, play it directly (argmax).
    # This prevents 2400+ players from "randomly" deviating from clear best moves.
    top1_prob = probs.max().item()
    if player_rating >= 2200 and top1_prob >= 0.60:
        move_idx = probs.argmax().item()
    elif player_rating >= 1800 and top1_prob >= 0.75:
        move_idx = probs.argmax().item()
    else:
        # Sample from the filtered distribution
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
