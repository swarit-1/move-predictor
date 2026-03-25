"""Blind spot bias system — structured human error modeling.

Instead of relying solely on temperature to produce human-like mistakes,
this module applies position-aware biases that model specific cognitive
blind spots common in human chess players:

1. Tactical blindness — miss forks, pins, skewers, discovered attacks
2. Material greed — overvalue captures, especially winning material
3. Check attraction — overplay checks even when they're not best
4. Piece preference bias — overuse favorite pieces, underuse others
5. King safety neglect — underweight king safety in calculations

Each bias operates on the logit distribution *before* temperature scaling,
nudging the model toward realistic human errors rather than random ones.

The strength of each bias is modulated by player rating: lower-rated
players exhibit stronger blind spots.
"""

import chess
import torch
from dataclasses import dataclass

from src.models.move_encoding import encode_move


@dataclass
class BlindSpotConfig:
    """Configuration for blind spot strengths (0-1 scale).

    Higher values = stronger blind spot (more human-like errors).
    Values are auto-computed from rating but can be overridden.
    """

    tactical_blindness: float = 0.0
    material_greed: float = 0.0
    check_attraction: float = 0.0
    piece_preference: float = 0.0
    king_safety_neglect: float = 0.0

    @classmethod
    def from_rating(cls, rating: float) -> "BlindSpotConfig":
        """Derive blind spot strengths from player rating.

        Lower-rated players have stronger blind spots.
        Rating 600 → near max blind spots
        Rating 2400+ → near zero blind spots
        """
        # Normalize rating to 0-1 (0 = strong, 1 = weak)
        weakness = max(0.0, min(1.0, (2400 - rating) / 1800))

        return cls(
            tactical_blindness=weakness * 0.8,
            material_greed=weakness * 0.6 + 0.1,  # everyone has some greed
            check_attraction=weakness * 0.5 + 0.05,
            piece_preference=weakness * 0.3,
            king_safety_neglect=weakness * 0.5,
        )


@dataclass
class BlindSpotResult:
    """Result of applying blind spot biases."""

    modified_logits: torch.Tensor
    active_biases: list[str]  # which biases actually fired


def compute_blind_spot_biases(
    logits: torch.Tensor,
    board: chess.Board,
    config: BlindSpotConfig,
    engine_top_moves: list[dict] | None = None,
) -> BlindSpotResult:
    """Apply all blind spot biases to move logits.

    Args:
        logits: (vocab_size,) raw policy logits.
        board: Current chess position.
        config: Blind spot configuration.
        engine_top_moves: Stockfish top moves for tactical awareness.

    Returns:
        BlindSpotResult with modified logits and active bias names.
    """
    modified = logits.clone()
    active: list[str] = []

    # 1. Tactical blindness — penalize tactically strong moves the human might miss
    if config.tactical_blindness > 0.05:
        delta, fired = _apply_tactical_blindness(modified, board, config.tactical_blindness, engine_top_moves)
        modified = modified + delta
        if fired:
            active.append("tactical_blindness")

    # 2. Material greed — boost captures disproportionately
    if config.material_greed > 0.05:
        delta, fired = _apply_material_greed(modified, board, config.material_greed)
        modified = modified + delta
        if fired:
            active.append("material_greed")

    # 3. Check attraction — boost checks even when they're not best
    if config.check_attraction > 0.05:
        delta, fired = _apply_check_attraction(modified, board, config.check_attraction)
        modified = modified + delta
        if fired:
            active.append("check_attraction")

    # 4. Piece preference — boost moves with frequently used pieces
    if config.piece_preference > 0.05:
        delta, fired = _apply_piece_preference(modified, board, config.piece_preference)
        modified = modified + delta
        if fired:
            active.append("piece_preference")

    # 5. King safety neglect — penalize defensive king moves
    if config.king_safety_neglect > 0.05:
        delta, fired = _apply_king_safety_neglect(modified, board, config.king_safety_neglect)
        modified = modified + delta
        if fired:
            active.append("king_safety_neglect")

    return BlindSpotResult(modified_logits=modified, active_biases=active)


def _encode_safe(move: chess.Move, board: chess.Board) -> int | None:
    """Encode a move, returning None if encoding fails."""
    try:
        return encode_move(move, board)
    except (ValueError, IndexError):
        return None


# ── Bias implementations ────────────────────────────────────────────


def _apply_tactical_blindness(
    logits: torch.Tensor,
    board: chess.Board,
    strength: float,
    engine_top_moves: list[dict] | None,
) -> tuple[torch.Tensor, bool]:
    """Penalize moves that require deep tactical calculation.

    Humans often miss:
    - Moves that involve sacrifices followed by forcing sequences
    - Quiet moves that set up tactical threats
    - Discovered attacks and pins

    We detect "tactical" moves as those that:
    (a) Are in the engine's top-3 but involve non-obvious patterns
    (b) Involve moving a piece that's currently pinned/pinning
    (c) Are quiet moves ranked highly by engine (quiet = non-capture, non-check)
    """
    delta = torch.zeros_like(logits)
    fired = False

    # Penalize engine top moves that are "quiet" (non-capture, non-check)
    # These are the hardest for humans to find
    if engine_top_moves:
        for i, em in enumerate(engine_top_moves[:3]):
            uci = em.get("move")
            if not uci:
                continue
            try:
                move = chess.Move.from_uci(uci)
            except ValueError:
                continue
            if move not in board.legal_moves:
                continue

            is_quiet = not board.is_capture(move) and not board.gives_check(move)
            if is_quiet and i == 0:
                # Top engine move is quiet — this is hard for humans
                idx = _encode_safe(move, board)
                if idx is not None:
                    penalty = -strength * 1.5
                    delta[idx] += penalty
                    fired = True

    # Detect and penalize discovered attacks (moving a piece that reveals an attack)
    for move in board.legal_moves:
        if _is_discovered_attack(board, move):
            idx = _encode_safe(move, board)
            if idx is not None:
                # Humans often miss discovered attacks — slight penalty
                delta[idx] += -strength * 0.8
                fired = True

    return delta, fired


def _apply_material_greed(
    logits: torch.Tensor,
    board: chess.Board,
    strength: float,
) -> tuple[torch.Tensor, bool]:
    """Boost captures, especially winning material.

    Humans are attracted to capturing pieces even when a quiet move
    is objectively better. This bias makes captures "shinier".
    """
    delta = torch.zeros_like(logits)
    fired = False

    piece_values = {
        chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
        chess.ROOK: 5, chess.QUEEN: 9,
    }

    for move in board.legal_moves:
        if board.is_capture(move):
            captured = board.piece_at(move.to_square)
            if captured:
                value = piece_values.get(captured.piece_type, 0)
                # Boost proportional to captured piece value
                bonus = strength * (0.3 + value * 0.15)

                # Extra bonus for "free" captures (undefended pieces)
                if not board.is_attacked_by(not board.turn, move.to_square):
                    bonus *= 1.5

                idx = _encode_safe(move, board)
                if idx is not None:
                    delta[idx] += bonus
                    fired = True

            # En passant
            elif board.is_en_passant(move):
                idx = _encode_safe(move, board)
                if idx is not None:
                    delta[idx] += strength * 0.3
                    fired = True

    return delta, fired


def _apply_check_attraction(
    logits: torch.Tensor,
    board: chess.Board,
    strength: float,
) -> tuple[torch.Tensor, bool]:
    """Boost checks even when they're not the best move.

    "Patzer sees a check, patzer gives a check." Lower-rated players
    are magnetically attracted to checks because they feel forcing.
    """
    delta = torch.zeros_like(logits)
    fired = False

    for move in board.legal_moves:
        if board.gives_check(move):
            idx = _encode_safe(move, board)
            if idx is not None:
                bonus = strength * 0.8

                # Extra bonus if the check also captures
                if board.is_capture(move):
                    bonus += strength * 0.4

                delta[idx] += bonus
                fired = True

    return delta, fired


def _apply_piece_preference(
    logits: torch.Tensor,
    board: chess.Board,
    strength: float,
) -> tuple[torch.Tensor, bool]:
    """Apply piece-type preference biases.

    Humans tend to:
    - Overuse queens (they're powerful and obvious)
    - Underuse rooks (harder to activate)
    - Move knights toward the center
    - Keep bishops on long diagonals
    """
    delta = torch.zeros_like(logits)
    fired = False

    # Piece-type move bonus/penalty
    piece_bias = {
        chess.QUEEN: 0.3,   # Humans love moving their queen
        chess.KNIGHT: 0.1,  # Knights are fun
        chess.BISHOP: 0.0,  # Neutral
        chess.ROOK: -0.15,  # Rooks are underused by weaker players
        chess.KING: -0.1,   # Avoid moving king unless necessary
    }

    center_squares = {chess.E4, chess.D4, chess.E5, chess.D5,
                      chess.C3, chess.D3, chess.E3, chess.F3,
                      chess.C6, chess.D6, chess.E6, chess.F6}

    for move in board.legal_moves:
        piece = board.piece_at(move.from_square)
        if not piece:
            continue

        bias = piece_bias.get(piece.piece_type, 0.0)
        if bias == 0.0:
            continue

        idx = _encode_safe(move, board)
        if idx is not None:
            bonus = strength * bias

            # Extra bonus for knight moves toward center
            if piece.piece_type == chess.KNIGHT and move.to_square in center_squares:
                bonus += strength * 0.15

            delta[idx] += bonus
            fired = True

    return delta, fired


def _apply_king_safety_neglect(
    logits: torch.Tensor,
    board: chess.Board,
    strength: float,
) -> tuple[torch.Tensor, bool]:
    """Penalize defensive/prophylactic moves.

    Weaker players often neglect king safety:
    - Ignore prophylactic pawn moves (h3, a3 to prevent pins/back rank)
    - Don't prioritize castling when the king is in the center
    - Miss defensive moves that prevent threats
    """
    delta = torch.zeros_like(logits)
    fired = False

    side = board.turn
    king_sq = board.king(side)
    if king_sq is None:
        return delta, False

    # If king is still in center and castling is available, penalize non-castling moves
    # (weaker players often delay castling)
    king_in_center = king_sq in (chess.E1, chess.E8)
    can_castle = board.has_castling_rights(side)

    if king_in_center and can_castle:
        for move in board.legal_moves:
            if not board.is_castling(move):
                idx = _encode_safe(move, board)
                if idx is not None:
                    # Small penalty for non-castling when castling is available
                    delta[idx] += -strength * 0.2
                    fired = True
            else:
                # Small bonus for castling (but weaker players still delay it)
                idx = _encode_safe(move, board)
                if idx is not None:
                    delta[idx] += strength * 0.1
                    fired = True

    # Penalize prophylactic pawn moves (h3, a3 type moves)
    prophylactic_squares = {
        chess.WHITE: {chess.H3, chess.A3, chess.G3},
        chess.BLACK: {chess.H6, chess.A6, chess.G6},
    }

    for move in board.legal_moves:
        piece = board.piece_at(move.from_square)
        if piece and piece.piece_type == chess.PAWN:
            if move.to_square in prophylactic_squares.get(side, set()):
                # Only penalize if the pawn move is purely defensive
                if not board.is_capture(move):
                    idx = _encode_safe(move, board)
                    if idx is not None:
                        delta[idx] += -strength * 0.3
                        fired = True

    return delta, fired


# ── Utility functions ───────────────────────────────────────────────


def _is_discovered_attack(board: chess.Board, move: chess.Move) -> bool:
    """Check if a move creates a discovered attack.

    A discovered attack occurs when moving a piece reveals an attack
    by another piece behind it on the opponent's king.
    """
    from_sq = move.from_square
    side = board.turn

    # Get all sliding pieces of our side (bishops, rooks, queens)
    sliders = (
        board.pieces(chess.BISHOP, side)
        | board.pieces(chess.ROOK, side)
        | board.pieces(chess.QUEEN, side)
    )

    opp_king = board.king(not side)
    if opp_king is None:
        return False

    for slider_sq in sliders:
        if slider_sq == from_sq:
            continue

        # Check if from_sq lies on the ray between slider and opponent's king
        ray_mask = chess.ray(slider_sq, opp_king)
        if not ray_mask:
            continue

        if not (chess.BB_SQUARES[from_sq] & ray_mask):
            continue

        # The piece at from_sq is on the ray — check if it's the only blocker
        between_mask = chess.between(slider_sq, opp_king)
        blockers = board.occupied & between_mask & ~chess.BB_SQUARES[from_sq]
        if not blockers:
            return True

    return False
