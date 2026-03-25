"""Board state preprocessing: FEN/Board → 18-channel 8×8 tensor.

Channel layout:
  0-5:   White pieces (P, N, B, R, Q, K) — binary
  6-11:  Black pieces (P, N, B, R, Q, K) — binary
  12:    White attack map (count of attackers per square)
  13:    Black attack map (count of attackers per square)
  14:    Side to move (all 1s if White, all 0s if Black)
  15:    Castling rights (encoded as 4 uniform planes blended into one)
  16:    En passant square (single 1 on target square)
  17:    Halfmove clock (uniform value, normalized by /100)

For Black's turn, the board is flipped vertically so the model always
sees the position from the moving side's perspective.
"""

import chess
import numpy as np

NUM_CHANNELS = 18
BOARD_SIZE = 8

# Map piece types to channel indices (within the 0-5 or 6-11 range)
PIECE_CHANNEL = {
    chess.PAWN: 0,
    chess.KNIGHT: 1,
    chess.BISHOP: 2,
    chess.ROOK: 3,
    chess.QUEEN: 4,
    chess.KING: 5,
}


def board_to_tensor(board: chess.Board) -> np.ndarray:
    """Convert a python-chess Board to an 18-channel 8×8 float32 tensor.

    The board is always oriented from the moving side's perspective:
    - If it's White's turn, no transformation.
    - If it's Black's turn, the board is flipped vertically and colors are swapped.

    Args:
        board: A python-chess Board object.

    Returns:
        numpy array of shape (18, 8, 8), dtype float32.
    """
    tensor = np.zeros((NUM_CHANNELS, BOARD_SIZE, BOARD_SIZE), dtype=np.float32)

    # Determine if we need to flip (always show from moving side's view)
    flip = board.turn == chess.BLACK

    # Channels 0-11: Piece positions
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece is None:
            continue

        file = chess.square_file(sq)
        rank = chess.square_rank(sq)

        if flip:
            rank = 7 - rank
            # Swap colors when flipping
            if piece.color == chess.WHITE:
                channel = PIECE_CHANNEL[piece.piece_type] + 6  # becomes "opponent"
            else:
                channel = PIECE_CHANNEL[piece.piece_type]  # becomes "us"
        else:
            if piece.color == chess.WHITE:
                channel = PIECE_CHANNEL[piece.piece_type]
            else:
                channel = PIECE_CHANNEL[piece.piece_type] + 6

        # Tensor indexing: channel, rank (row 0 = rank 0 for White view), file
        tensor[channel, rank, file] = 1.0

    # Channels 12-13: Attack maps
    for sq in chess.SQUARES:
        file = chess.square_file(sq)
        rank = chess.square_rank(sq)
        display_rank = (7 - rank) if flip else rank

        white_attackers = len(board.attackers(chess.WHITE, sq))
        black_attackers = len(board.attackers(chess.BLACK, sq))

        if flip:
            tensor[12, display_rank, file] = float(black_attackers)  # "our" attacks
            tensor[13, display_rank, file] = float(white_attackers)  # "their" attacks
        else:
            tensor[12, display_rank, file] = float(white_attackers)
            tensor[13, display_rank, file] = float(black_attackers)

    # Channel 14: Side to move (always 1s since we flip for Black)
    tensor[14, :, :] = 1.0

    # Channel 15: Castling rights
    # Encode as fractional plane: each right adds 0.25
    castling_value = 0.0
    if flip:
        # From Black's perspective after flip
        if board.has_kingside_castling_rights(chess.BLACK):
            castling_value += 0.25
        if board.has_queenside_castling_rights(chess.BLACK):
            castling_value += 0.25
        if board.has_kingside_castling_rights(chess.WHITE):
            castling_value += 0.125
        if board.has_queenside_castling_rights(chess.WHITE):
            castling_value += 0.125
    else:
        if board.has_kingside_castling_rights(chess.WHITE):
            castling_value += 0.25
        if board.has_queenside_castling_rights(chess.WHITE):
            castling_value += 0.25
        if board.has_kingside_castling_rights(chess.BLACK):
            castling_value += 0.125
        if board.has_queenside_castling_rights(chess.BLACK):
            castling_value += 0.125
    tensor[15, :, :] = castling_value

    # Channel 16: En passant square
    if board.ep_square is not None:
        ep_file = chess.square_file(board.ep_square)
        ep_rank = chess.square_rank(board.ep_square)
        if flip:
            ep_rank = 7 - ep_rank
        tensor[16, ep_rank, ep_file] = 1.0

    # Channel 17: Halfmove clock (normalized)
    tensor[17, :, :] = min(board.halfmove_clock / 100.0, 1.0)

    return tensor


def compute_position_complexity(board: chess.Board) -> dict[str, float]:
    """Compute position complexity features for a board state.

    Returns a dict with normalized complexity metrics:
    - mobility: ratio of legal moves to typical max (~40)
    - piece_tension: count of attacked pieces / total pieces
    - king_exposure: attackers near king / 8
    - material_imbalance: abs material difference / total material
    - pawn_structure: doubled/isolated pawn penalty
    """
    # Mobility
    num_legal = board.legal_moves.count()
    mobility = min(num_legal / 40.0, 1.0)

    # Piece tension: count pieces that are attacked by the opponent
    us = board.turn
    them = not us
    our_pieces = 0
    attacked_pieces = 0
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece and piece.color == us:
            our_pieces += 1
            if board.is_attacked_by(them, sq):
                attacked_pieces += 1
    piece_tension = attacked_pieces / max(our_pieces, 1)

    # King exposure: number of opponent attackers on squares near our king
    our_king_sq = board.king(us)
    king_exposure = 0.0
    if our_king_sq is not None:
        king_file = chess.square_file(our_king_sq)
        king_rank = chess.square_rank(our_king_sq)
        for df in range(-1, 2):
            for dr in range(-1, 2):
                f, r = king_file + df, king_rank + dr
                if 0 <= f <= 7 and 0 <= r <= 7:
                    sq = chess.square(f, r)
                    king_exposure += len(board.attackers(them, sq))
        king_exposure = min(king_exposure / 16.0, 1.0)

    # Material imbalance
    piece_values = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
                    chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}
    white_mat = sum(piece_values.get(board.piece_at(sq).piece_type, 0)
                    for sq in chess.SQUARES
                    if board.piece_at(sq) and board.piece_at(sq).color == chess.WHITE)
    black_mat = sum(piece_values.get(board.piece_at(sq).piece_type, 0)
                    for sq in chess.SQUARES
                    if board.piece_at(sq) and board.piece_at(sq).color == chess.BLACK)
    total_mat = white_mat + black_mat
    material_imbalance = abs(white_mat - black_mat) / max(total_mat, 1)

    return {
        "mobility": mobility,
        "piece_tension": piece_tension,
        "king_exposure": king_exposure,
        "material_imbalance": material_imbalance,
    }


def fen_to_tensor(fen: str) -> np.ndarray:
    """Convert a FEN string to an 18-channel 8×8 tensor.

    Args:
        fen: FEN string of the position.

    Returns:
        numpy array of shape (18, 8, 8), dtype float32.
    """
    board = chess.Board(fen)
    return board_to_tensor(board)


def classify_game_phase(board: chess.Board) -> int:
    """Classify the current position into a game phase.

    Returns:
        0 = opening, 1 = middlegame, 2 = endgame
    """
    # Count material (excluding kings)
    material = 0
    minor_pieces = 0
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece is None or piece.piece_type == chess.KING:
            continue
        if piece.piece_type == chess.QUEEN:
            material += 9
        elif piece.piece_type == chess.ROOK:
            material += 5
        elif piece.piece_type in (chess.BISHOP, chess.KNIGHT):
            material += 3
            minor_pieces += 1
        elif piece.piece_type == chess.PAWN:
            material += 1

    move_number = board.fullmove_number

    # Opening: early moves with most pieces still on board
    if move_number <= 12 and minor_pieces >= 6:
        return 0
    # Endgame: low material
    elif material <= 14:
        return 2
    # Middlegame: everything else
    else:
        return 1


def classify_move_quality(centipawn_loss: float) -> str:
    """Classify a move based on centipawn loss.

    Args:
        centipawn_loss: The centipawn loss (>= 0).

    Returns:
        One of: "best", "good", "inaccuracy", "mistake", "blunder"
    """
    if centipawn_loss <= 0:
        return "best"
    elif centipawn_loss < 20:
        return "good"
    elif centipawn_loss < 50:
        return "inaccuracy"
    elif centipawn_loss < 100:
        return "mistake"
    else:
        return "blunder"
