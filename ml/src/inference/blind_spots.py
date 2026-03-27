"""Blind spot bias system — structured human error modeling.

Instead of relying solely on temperature to produce human-like mistakes,
this module applies position-aware biases that model specific cognitive
blind spots common in human chess players:

1. Tactical blindness — miss forks, pins, skewers, discovered attacks
2. Material greed — overvalue captures, especially winning material
3. Check attraction — overplay checks even when they're not best
4. Piece preference bias — overuse favorite pieces, underuse others
5. King safety neglect — underweight king safety in calculations
6. Long-range blindness — miss long diagonal/file slider moves

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
    long_range_blindness: float = 0.0
    king_attack_neglect: float = 0.0

    @classmethod
    def from_rating(cls, rating: float) -> "BlindSpotConfig":
        """Derive blind spot strengths from player rating.

        Lower-rated players have stronger blind spots.
        Rating 600 -> near max blind spots
        Rating 2400+ -> near zero blind spots
        """
        weakness = max(0.0, min(1.0, (2400 - rating) / 1800))

        return cls(
            tactical_blindness=weakness * 0.8,
            material_greed=weakness * 0.6 + 0.1,
            check_attraction=weakness * 0.5 + 0.05,
            piece_preference=weakness * 0.3,
            king_safety_neglect=weakness * 0.5,
            long_range_blindness=weakness * 0.7,
            king_attack_neglect=weakness * 0.6,
        )


@dataclass
class BlindSpotResult:
    """Result of applying blind spot biases."""

    modified_logits: torch.Tensor
    active_biases: list[str]


def compute_blind_spot_biases(
    logits: torch.Tensor,
    board: chess.Board,
    config: BlindSpotConfig,
    engine_top_moves: list[dict] | None = None,
) -> BlindSpotResult:
    """Apply all blind spot biases to move logits."""
    modified = logits.clone()
    active: list[str] = []

    if config.tactical_blindness > 0.05:
        delta, fired = _apply_tactical_blindness(
            modified, board, config.tactical_blindness, engine_top_moves,
        )
        modified = modified + delta
        if fired:
            active.append("tactical_blindness")

    if config.material_greed > 0.05:
        delta, fired = _apply_material_greed(
            modified, board, config.material_greed,
        )
        modified = modified + delta
        if fired:
            active.append("material_greed")

    if config.check_attraction > 0.05:
        delta, fired = _apply_check_attraction(
            modified, board, config.check_attraction,
        )
        modified = modified + delta
        if fired:
            active.append("check_attraction")

    if config.piece_preference > 0.05:
        delta, fired = _apply_piece_preference(
            modified, board, config.piece_preference,
        )
        modified = modified + delta
        if fired:
            active.append("piece_preference")

    if config.king_safety_neglect > 0.05:
        delta, fired = _apply_king_safety_neglect(
            modified, board, config.king_safety_neglect,
        )
        modified = modified + delta
        if fired:
            active.append("king_safety_neglect")

    if config.long_range_blindness > 0.05:
        delta, fired = _apply_long_range_blindness(
            modified, board, config.long_range_blindness, engine_top_moves,
        )
        modified = modified + delta
        if fired:
            active.append("long_range_blindness")

    if config.king_attack_neglect > 0.05:
        delta, fired = _apply_king_attack_neglect(
            modified, board, config.king_attack_neglect,
        )
        modified = modified + delta
        if fired:
            active.append("king_attack_neglect")

    return BlindSpotResult(modified_logits=modified, active_biases=active)


def _encode_safe(move: chess.Move, board: chess.Board) -> int | None:
    """Encode a move, returning None if encoding fails."""
    try:
        return encode_move(move, board)
    except (ValueError, IndexError):
        return None


# -- Bias implementations --------------------------------------------------


def _apply_tactical_blindness(
    logits: torch.Tensor,
    board: chess.Board,
    strength: float,
    engine_top_moves: list[dict] | None,
) -> tuple[torch.Tensor, bool]:
    """Penalize quiet engine best moves and discovered attacks."""
    delta = torch.zeros_like(logits)
    fired = False

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

            is_quiet = (
                not board.is_capture(move) and not board.gives_check(move)
            )
            if is_quiet and i == 0:
                idx = _encode_safe(move, board)
                if idx is not None:
                    delta[idx] += -strength * 4.0
                    fired = True

    for move in board.legal_moves:
        if _is_discovered_attack(board, move):
            idx = _encode_safe(move, board)
            if idx is not None:
                delta[idx] += -strength * 1.5
                fired = True

    return delta, fired


def _apply_material_greed(
    logits: torch.Tensor,
    board: chess.Board,
    strength: float,
) -> tuple[torch.Tensor, bool]:
    """Boost captures proportional to captured piece value."""
    delta = torch.zeros_like(logits)
    fired = False

    piece_values = {
        chess.PAWN: 1,
        chess.KNIGHT: 3,
        chess.BISHOP: 3,
        chess.ROOK: 5,
        chess.QUEEN: 9,
    }

    for move in board.legal_moves:
        if not board.is_capture(move):
            continue

        captured = board.piece_at(move.to_square)
        if captured:
            value = piece_values.get(captured.piece_type, 0)
            bonus = strength * (1.5 + value * 0.6)

            if not board.is_attacked_by(not board.turn, move.to_square):
                bonus *= 2.0

            idx = _encode_safe(move, board)
            if idx is not None:
                delta[idx] += bonus
                fired = True

        elif board.is_en_passant(move):
            idx = _encode_safe(move, board)
            if idx is not None:
                delta[idx] += strength * 0.5
                fired = True

    return delta, fired


def _apply_check_attraction(
    logits: torch.Tensor,
    board: chess.Board,
    strength: float,
) -> tuple[torch.Tensor, bool]:
    """Boost checks even when they're not the best move."""
    delta = torch.zeros_like(logits)
    fired = False

    for move in board.legal_moves:
        if board.gives_check(move):
            idx = _encode_safe(move, board)
            if idx is not None:
                bonus = strength * 3.0
                if board.is_capture(move):
                    bonus += strength * 1.5
                delta[idx] += bonus
                fired = True

    return delta, fired


def _apply_piece_preference(
    logits: torch.Tensor,
    board: chess.Board,
    strength: float,
) -> tuple[torch.Tensor, bool]:
    """Bias toward queen moves, away from rook moves."""
    delta = torch.zeros_like(logits)
    fired = False

    piece_bias = {
        chess.QUEEN: 0.3,
        chess.KNIGHT: 0.1,
        chess.BISHOP: 0.0,
        chess.ROOK: -0.15,
        chess.KING: -0.1,
    }

    center_squares = {
        chess.E4, chess.D4, chess.E5, chess.D5,
        chess.C3, chess.D3, chess.E3, chess.F3,
        chess.C6, chess.D6, chess.E6, chess.F6,
    }

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
            if (
                piece.piece_type == chess.KNIGHT
                and move.to_square in center_squares
            ):
                bonus += strength * 0.15
            delta[idx] += bonus
            fired = True

    return delta, fired


def _apply_king_safety_neglect(
    logits: torch.Tensor,
    board: chess.Board,
    strength: float,
) -> tuple[torch.Tensor, bool]:
    """Penalize non-castling when castling is available."""
    delta = torch.zeros_like(logits)
    fired = False

    side = board.turn
    king_sq = board.king(side)
    if king_sq is None:
        return delta, False

    king_in_center = king_sq in (chess.E1, chess.E8)
    can_castle = board.has_castling_rights(side)

    if king_in_center and can_castle:
        for move in board.legal_moves:
            if not board.is_castling(move):
                idx = _encode_safe(move, board)
                if idx is not None:
                    delta[idx] += -strength * 0.8
                    fired = True
            else:
                idx = _encode_safe(move, board)
                if idx is not None:
                    delta[idx] += strength * 0.4
                    fired = True

    prophylactic_squares = {
        chess.WHITE: {chess.H3, chess.A3, chess.G3},
        chess.BLACK: {chess.H6, chess.A6, chess.G6},
    }

    for move in board.legal_moves:
        piece = board.piece_at(move.from_square)
        if piece and piece.piece_type == chess.PAWN:
            targets = prophylactic_squares.get(side, set())
            if move.to_square in targets and not board.is_capture(move):
                idx = _encode_safe(move, board)
                if idx is not None:
                    delta[idx] += -strength * 0.5
                    fired = True

    return delta, fired


def _apply_long_range_blindness(
    logits: torch.Tensor,
    board: chess.Board,
    strength: float,
    engine_top_moves: list[dict] | None,
) -> tuple[torch.Tensor, bool]:
    """Penalize engine moves that involve long-range slider activity.

    Lower-rated players consistently miss long diagonal bishop snipes,
    rook lifts along open files, and distant queen maneuvers.
    """
    delta = torch.zeros_like(logits)
    fired = False

    if not engine_top_moves:
        return delta, fired

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

        piece = board.piece_at(move.from_square)
        if not piece:
            continue

        if piece.piece_type not in (chess.BISHOP, chess.ROOK, chess.QUEEN):
            continue

        from_file = chess.square_file(move.from_square)
        from_rank = chess.square_rank(move.from_square)
        to_file = chess.square_file(move.to_square)
        to_rank = chess.square_rank(move.to_square)
        distance = max(abs(from_file - to_file), abs(from_rank - to_rank))

        if distance >= 4:
            idx = _encode_safe(move, board)
            if idx is not None:
                penalty = -strength * (0.5 + distance * 0.3)
                delta[idx] += penalty
                fired = True

    return delta, fired


def _apply_king_attack_neglect(
    logits: torch.Tensor,
    board: chess.Board,
    strength: float,
) -> tuple[torch.Tensor, bool]:
    """Penalize moves that retreat from the enemy king when we have pressure.

    Even low-rated players understand that when the enemy king is exposed,
    you should keep attacking. Moving a piece to the other side of the
    board (like Bb5 when the king is under fire) is unrealistic.
    """
    opp_king = board.king(not board.turn)
    if opp_king is None:
        return torch.zeros_like(logits), False

    king_file = chess.square_file(opp_king)
    king_rank = chess.square_rank(opp_king)

    # Build king zone (squares around the enemy king)
    king_zone = set()
    for df in (-1, 0, 1):
        for dr in (-1, 0, 1):
            f, r = king_file + df, king_rank + dr
            if 0 <= f <= 7 and 0 <= r <= 7:
                king_zone.add(chess.square(f, r))

    # Count our attackers on the king zone
    our_attacks = 0
    for sq in king_zone:
        our_attacks += len(board.attackers(board.turn, sq))

    # Only fire if we have significant pressure (3+ attacks on king zone)
    if our_attacks < 3:
        return torch.zeros_like(logits), False

    delta = torch.zeros_like(logits)
    fired = False

    for move in board.legal_moves:
        piece = board.piece_at(move.from_square)
        if not piece or piece.piece_type == chess.PAWN:
            continue

        # Chebyshev distance to enemy king
        from_dist = max(
            abs(chess.square_file(move.from_square) - king_file),
            abs(chess.square_rank(move.from_square) - king_rank),
        )
        to_dist = max(
            abs(chess.square_file(move.to_square) - king_file),
            abs(chess.square_rank(move.to_square) - king_rank),
        )

        if to_dist > from_dist + 1:  # Moving significantly away
            idx = _encode_safe(move, board)
            if idx is not None:
                delta[idx] -= strength * 2.0
                fired = True

    return delta, fired


# -- Utility functions ------------------------------------------------------


def _is_discovered_attack(board: chess.Board, move: chess.Move) -> bool:
    """Check if a move creates a discovered attack on the opponent's king."""
    from_sq = move.from_square
    side = board.turn

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

        ray_mask = chess.ray(slider_sq, opp_king)
        if not ray_mask:
            continue

        if not (chess.BB_SQUARES[from_sq] & ray_mask):
            continue

        between_mask = chess.between(slider_sq, opp_king)
        blockers = (
            board.occupied & between_mask & ~chess.BB_SQUARES[from_sq]
        )
        if not blockers:
            return True

    return False
