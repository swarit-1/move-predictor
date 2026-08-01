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
    """User-adjustable style parameters.

    PRD §5.2 / §4.1: expanded from 3 dimensions to 10. Every field is on a
    0–100 scale where 50 is "play exactly like the measured player" and
    deviations from 50 push the simulation more or less in the named
    direction. New fields default to 50 so older callers (and the predict
    API contract that only sent three fields) remain compatible.
    """

    # ── Original (unchanged semantics) ─────────────────────────────
    aggression: float = 50.0  # Higher = prefer captures and checks
    risk_taking: float = 50.0  # Higher = wider sampling distribution
    blunder_frequency: float = 50.0  # Higher = inflated CPL/blunder estimate

    # ── PRD §4.1 expansion ─────────────────────────────────────────
    king_attack: float = 50.0
    """Boost moves that increase pressure on the enemy king zone."""

    positional: float = 50.0
    """50 = neutral, <50 = more tactical/forcing, >50 = more positional/quiet."""

    trade_preference: float = 50.0
    """Higher = more willing to initiate captures (not just recaptures)."""

    opening_loyalty: float = 50.0
    """Higher = stronger pull toward the player's opening-book moves."""

    repertoire_width: float = 50.0
    """Higher = sample more broadly within the book; lower = stick to top line."""

    endgame_strength: float = 50.0
    """Lower = sloppier in the endgame, higher = more accurate."""

    defensive_tenacity: float = 50.0
    """Higher = plays sharper / less likely to drift when in worse positions."""


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
    game_phase: int | None = None,
    position_eval_cp: float | None = None,
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

    # Base temperature from rating — piecewise for wider separation.
    # Rating 800 → ~1.10, Rating 1200 → ~0.82, Rating 1500 → ~0.60,
    # Rating 1800 → ~0.40, Rating 2200 → ~0.22, Rating 2500 → ~0.15
    if player_rating >= 2200:
        rating_temp = max(0.15, 0.45 - (player_rating - 2200) / 3000.0)
    elif player_rating >= 1600:
        rating_temp = 0.45 + (2200 - player_rating) / 2000.0  # 0.45→0.75
    elif player_rating >= 1000:
        rating_temp = 0.75 + (1600 - player_rating) / 2000.0  # 0.75→1.05
    else:
        rating_temp = 1.05 + (1000 - player_rating) / 1500.0  # 1.05→1.72

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

    # PRD §5.2: endgame_strength modulates temperature only in the endgame
    # (game_phase == 2). Lower endgame_strength → looser play → higher
    # temperature. Centered at 50.
    if style is not None and game_phase == 2:
        endgame_factor = (100.0 - style.endgame_strength) / 50.0  # 2.0..0.0
        temperature *= (0.75 + 0.5 * endgame_factor)

    # PRD §5.2: defensive_tenacity sharpens play when the position is
    # already worse than -100 cp from the player's perspective. The eval
    # at this point should be normalized to the player's POV by the
    # caller; we accept it in centipawns. Higher tenacity → lower temp
    # → more focused sampling → fewer drifty positional losses.
    if (
        style is not None
        and position_eval_cp is not None
        and position_eval_cp <= -100
    ):
        tenacity = (style.defensive_tenacity - 50.0) / 100.0  # -0.5..+0.5
        temperature *= max(0.5, 1.0 - tenacity * 0.6)

    # Rating-dependent ceiling and floor
    ceiling = 1.5 if player_rating < 1200 else 1.2 if player_rating < 1800 else 0.8
    floor = 0.15 if player_rating >= 2200 else 0.25
    return max(floor, min(ceiling, temperature))


def apply_style_bias(
    logits: torch.Tensor,
    board: chess.Board,
    style: StyleOverrides | None = None,
) -> torch.Tensor:
    """Apply style-based biases to move logits.

    PRD §5.2: dispatches to per-dimension bias functions for each of the
    expanded style fields. Each bias is centered at 50 (neutral, no
    change) and operates as an additive logit delta per affected move.

    Args:
        logits: (vocab_size,) raw policy logits.
        board: Current board state.
        style: Style overrides.

    Returns:
        Modified logits.
    """
    if style is None:
        return logits

    # Short-circuit: if every field is exactly neutral, no work to do.
    if (
        style.aggression == 50.0
        and style.king_attack == 50.0
        and style.positional == 50.0
        and style.trade_preference == 50.0
    ):
        return logits

    from src.models.move_encoding import encode_move

    modified = logits.clone()

    aggression_boost = (style.aggression - 50.0) / 100.0       # -0.5 to +0.5
    king_attack_boost = (style.king_attack - 50.0) / 100.0     # -0.5 to +0.5
    # positional > 50 favours quiet; < 50 favours tactical.
    positional_boost = (style.positional - 50.0) / 100.0       # -0.5 to +0.5
    trade_boost = (style.trade_preference - 50.0) / 100.0      # -0.5 to +0.5

    # Pre-compute the enemy king zone once for king-attack scoring.
    king_zone = _enemy_king_zone(board)
    own_color = board.turn

    # Track whether the previous move was a capture, so we can score
    # `trade_preference` correctly (initiating capture vs recapture).
    last_capture_sq = (
        board.peek().to_square
        if board.move_stack and board.is_capture(board.peek())
        else None
    )

    for move in board.legal_moves:
        try:
            idx = encode_move(move, board)
        except ValueError:
            continue

        bonus = 0.0
        is_capture = board.is_capture(move)
        is_check = board.gives_check(move)

        # — Aggression: classic capture/check boost
        if is_capture:
            bonus += aggression_boost * 1.5
        if is_check:
            bonus += aggression_boost * 1.0

        # — Positional vs tactical: positive value rewards quiet moves,
        #   negative value rewards forcing moves.
        is_quiet = not is_capture and not is_check
        if is_quiet:
            bonus += positional_boost * 0.8
        else:
            bonus -= positional_boost * 0.6

        # — Trade preference: only initiating captures (not recaptures).
        if is_capture and move.to_square != last_capture_sq:
            bonus += trade_boost * 1.2

        # — King-attack: moves that point at the enemy king zone, or
        #   moves by pieces that already attack it.
        if king_zone is not None:
            if move.to_square in king_zone:
                bonus += king_attack_boost * 1.0
            else:
                # Reward bringing additional attackers toward the zone.
                if _move_increases_king_pressure(board, move, king_zone, own_color):
                    bonus += king_attack_boost * 0.6

        if bonus != 0.0:
            modified[idx] += bonus

    return modified


def _enemy_king_zone(board: chess.Board) -> set[int] | None:
    """Return the 9 squares around the enemy king (king + 8 neighbours)."""
    opp = not board.turn
    king_sq = board.king(opp)
    if king_sq is None:
        return None
    zone = {king_sq}
    kr = chess.square_rank(king_sq)
    kf = chess.square_file(king_sq)
    for dr in (-1, 0, 1):
        for df in (-1, 0, 1):
            r, f = kr + dr, kf + df
            if 0 <= r < 8 and 0 <= f < 8:
                zone.add(chess.square(f, r))
    return zone


def _move_increases_king_pressure(
    board: chess.Board,
    move: chess.Move,
    king_zone: set[int],
    own_color: chess.Color,
) -> bool:
    """Cheap heuristic: did this piece end up attacking ≥1 king-zone square
    that wasn't attacked by it from the from-square?"""
    piece = board.piece_at(move.from_square)
    if piece is None or piece.color != own_color:
        return False
    # Simulate without a full push() by checking destination attacks.
    board.push(move)
    try:
        # The moved piece's color is `own_color`; it just moved, so the
        # side to move has flipped. Find squares the piece now attacks.
        attacked = board.attacks(move.to_square)
        return any(sq in king_zone for sq in attacked)
    finally:
        board.pop()


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
    blind_spot_scale: float = 1.0,
    time_pressure: float = 0.0,
    game_phase: int | None = None,
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
    # Check opening book — if the position is in the book, boost book moves.
    # PRD §5.2: `opening_loyalty` scales the magnitude of the book prior.
    # `repertoire_width` controls how strongly the boost concentrates on
    # the single most-played move vs spreading across the player's full
    # repertoire at this position.
    from_book = False
    if opening_book_probs:
        from src.models.move_encoding import encode_move as _enc

        loyalty = (style.opening_loyalty / 50.0) if style is not None else 1.0
        width = (style.repertoire_width / 50.0) if style is not None else 1.0
        # Loyalty scales the base boost (~3 by default). Width sharpens
        # (low) or flattens (high) the distribution we boost over.
        base_boost = 3.0 * loyalty
        # `width` close to 0 → very sharp (concentrate on top move).
        #             close to 1 → measured player's natural distribution.
        #             > 1        → flatten toward uniform across book moves.
        sharpening = max(0.2, 2.0 - width)

        for move_uci, book_prob in opening_book_probs.items():
            try:
                move = chess.Move.from_uci(move_uci)
                if move in board.legal_moves:
                    idx = _enc(move, board)
                    sharpened = book_prob ** sharpening
                    policy_logits[idx] += base_boost * sharpened
                    from_book = True
            except (ValueError, IndexError):
                continue

    # Get legal move mask
    legal_mask = torch.from_numpy(get_legal_move_mask(board)).to(policy_logits.device)

    # Apply style bias (aggression)
    logits = apply_style_bias(policy_logits, board, style)

    # Apply blind spot biases — structured human error modeling.
    # `blind_spot_scale` < 1.0 attenuates the biases (used on the trained-
    # model path, where the policy already encodes human error patterns).
    if apply_blind_spots and blind_spot_scale > 0.0:
        blind_spot_config = BlindSpotConfig.from_rating(player_rating, time_pressure)
        pre_bias = logits.clone()
        bs_result = compute_blind_spot_biases(
            logits, board, blind_spot_config, engine_top_moves,
        )
        if blind_spot_scale != 1.0:
            logits = pre_bias + (bs_result.modified_logits - pre_bias) * blind_spot_scale
        else:
            logits = bs_result.modified_logits

    # Mask illegal moves
    logits[~legal_mask] = float("-inf")

    # Compute temperature
    # Derive position eval (from the moving side's POV) from the engine
    # top-move list if available so defensive_tenacity has signal.
    position_eval_cp: float | None = None
    if engine_top_moves:
        cp = engine_top_moves[0].get("cp")
        if cp is not None:
            position_eval_cp = float(cp)
    temperature = compute_temperature(
        predicted_cpl,
        blunder_prob,
        player_rating,
        style,
        time_pressure,
        game_phase=game_phase,
        position_eval_cp=position_eval_cp,
    )

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
        min_prob = 0.04   # 4% — only top ~4-6 moves survive
    elif player_rating >= 1800:
        min_prob = 0.025  # 2.5%
    elif player_rating >= 1400:
        min_prob = 0.015  # 1.5%
    elif player_rating >= 1000:
        min_prob = 0.008  # 0.8%
    else:
        min_prob = 0.004  # 0.4% — allow more variety for beginners

    probs[probs < min_prob] = 0.0
    prob_sum = probs.sum()
    if prob_sum > 0:
        probs = probs / prob_sum

    # Deterministic play for strong players: if the best move has a dominant
    # probability after all filtering, play it directly (argmax).
    # This prevents 2400+ players from "randomly" deviating from clear best moves.
    top1_prob = probs.max().item()
    if player_rating >= 2200 and top1_prob >= 0.55:
        move_idx = probs.argmax().item()
    elif player_rating >= 1800 and top1_prob >= 0.70:
        move_idx = probs.argmax().item()
    else:
        # Sample from the filtered distribution
        move_idx = torch.multinomial(probs, num_samples=1).item()

    # Decode the move
    selected_move = decode_move(move_idx, board)

    # Get top-5 moves for display (skip zero-probability tail entries —
    # they are outside the nucleus and would render as junk 0% rows)
    top5_values, top5_indices = probs.topk(5)
    top_moves = []
    for prob_val, idx in zip(top5_values.tolist(), top5_indices.tolist()):
        if prob_val <= 0.0:
            continue
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
