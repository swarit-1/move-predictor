"""Move encoding: maps chess moves to/from a fixed 1968-index vocabulary.

Encoding scheme (following Leela Chess Zero / Maia):
- Each move is encoded as (from_square, move_type) where move_type is one of 73 categories:
  - 56 queen-like moves: 7 distances × 8 directions (N, NE, E, SE, S, SW, W, NW)
  - 8 knight moves: the 8 possible knight offsets
  - 9 underpromotions: 3 directions (left-capture, straight, right-capture) × 3 pieces (N, B, R)
- Queen promotions use the queen-like move encoding (they're just regular moves that happen to promote).
- Total theoretical: 64 × 73 = 4672, but many are unreachable (off-board). We build the pruned set.

The board is always oriented from White's perspective. For Black moves, the from/to squares
are mirrored (rank-flipped) before encoding, so the model always sees the board from the
moving side's perspective.
"""

import chess
import numpy as np


# Direction offsets as (file_delta, rank_delta)
QUEEN_DIRECTIONS = [
    (0, 1),   # N
    (1, 1),   # NE
    (1, 0),   # E
    (1, -1),  # SE
    (0, -1),  # S
    (-1, -1), # SW
    (-1, 0),  # W
    (-1, 1),  # NW
]

KNIGHT_OFFSETS = [
    (1, 2), (2, 1), (2, -1), (1, -2),
    (-1, -2), (-2, -1), (-2, 1), (-1, 2),
]

# Underpromotion directions: (file_delta, rank_delta) for the promoting pawn
UNDERPROMO_DIRECTIONS = [
    (-1, 1),  # capture left
    (0, 1),   # straight
    (1, 1),   # capture right
]

# Underpromotion piece types (queen promotion is handled by queen-like moves)
UNDERPROMO_PIECES = [chess.KNIGHT, chess.BISHOP, chess.ROOK]


def _build_move_tables():
    """Build the mapping tables between (from_sq, move_type) and move index.

    Returns:
        encode_table: dict mapping (from_sq, to_sq, promotion) -> index
        decode_table: list of (from_sq, to_sq, promotion) indexed by move index
    """
    encode_table = {}
    decode_table = []
    idx = 0

    for from_sq in range(64):
        from_file = chess.square_file(from_sq)
        from_rank = chess.square_rank(from_sq)

        # Queen-like moves (includes queen promotions)
        for direction_idx, (df, dr) in enumerate(QUEEN_DIRECTIONS):
            for distance in range(1, 8):
                to_file = from_file + df * distance
                to_rank = from_rank + dr * distance

                if not (0 <= to_file <= 7 and 0 <= to_rank <= 7):
                    break

                to_sq = chess.square(to_file, to_rank)

                # Check if this is a promotion (pawn reaching rank 7 from rank 6)
                promotion = None
                if from_rank == 6 and to_rank == 7:
                    promotion = chess.QUEEN

                encode_table[(from_sq, to_sq, promotion)] = idx
                decode_table.append((from_sq, to_sq, promotion))
                idx += 1

        # Knight moves
        for kf, kr in KNIGHT_OFFSETS:
            to_file = from_file + kf
            to_rank = from_rank + kr

            if not (0 <= to_file <= 7 and 0 <= to_rank <= 7):
                continue

            to_sq = chess.square(to_file, to_rank)
            encode_table[(from_sq, to_sq, None)] = idx
            decode_table.append((from_sq, to_sq, None))
            idx += 1

        # Underpromotions (only from rank 6 to rank 7)
        if from_rank == 6:
            for dir_idx, (df, dr) in enumerate(UNDERPROMO_DIRECTIONS):
                to_file = from_file + df
                to_rank = from_rank + dr  # always 7

                if not (0 <= to_file <= 7 and 0 <= to_rank <= 7):
                    continue

                to_sq = chess.square(to_file, to_rank)

                for piece in UNDERPROMO_PIECES:
                    encode_table[(from_sq, to_sq, piece)] = idx
                    decode_table.append((from_sq, to_sq, piece))
                    idx += 1

    return encode_table, decode_table


# Build tables at import time
_ENCODE_TABLE, _DECODE_TABLE = _build_move_tables()
NUM_MOVES = len(_DECODE_TABLE)


def _mirror_square(sq: int) -> int:
    """Flip a square vertically (mirror ranks for Black's perspective)."""
    return chess.square(chess.square_file(sq), 7 - chess.square_rank(sq))


def _mirror_promotion(promotion: int | None) -> int | None:
    """Promotion piece doesn't change on mirror, but we need to handle
    the fact that Black promotes on rank 0 (which becomes rank 7 after mirror)."""
    return promotion


def encode_move(move: chess.Move, board: chess.Board) -> int:
    """Encode a chess move into a move index.

    For Black moves, squares are mirrored so the model always sees
    the board from the moving side's perspective.

    Args:
        move: The chess move to encode.
        board: The board state (needed to determine side to move).

    Returns:
        Integer index in [0, NUM_MOVES).

    Raises:
        ValueError: If the move cannot be encoded.
    """
    from_sq = move.from_square
    to_sq = move.to_square
    promotion = move.promotion

    # Mirror for Black
    if board.turn == chess.BLACK:
        from_sq = _mirror_square(from_sq)
        to_sq = _mirror_square(to_sq)

    key = (from_sq, to_sq, promotion)
    if key not in _ENCODE_TABLE:
        # Try without promotion (for non-promotion moves encoded with None)
        key_no_promo = (from_sq, to_sq, None)
        if key_no_promo in _ENCODE_TABLE:
            return _ENCODE_TABLE[key_no_promo]
        raise ValueError(
            f"Cannot encode move {move.uci()} (from={from_sq}, to={to_sq}, "
            f"promo={promotion}) from board:\n{board.fen()}"
        )
    return _ENCODE_TABLE[key]


def decode_move(index: int, board: chess.Board) -> chess.Move:
    """Decode a move index back into a chess.Move.

    Args:
        index: The move index in [0, NUM_MOVES).
        board: The current board state (needed to unmirror for Black).

    Returns:
        A chess.Move object.
    """
    from_sq, to_sq, promotion = _DECODE_TABLE[index]

    # Unmirror for Black
    if board.turn == chess.BLACK:
        from_sq = _mirror_square(from_sq)
        to_sq = _mirror_square(to_sq)

    return chess.Move(from_sq, to_sq, promotion=promotion)


def get_legal_move_mask(board: chess.Board) -> np.ndarray:
    """Get a boolean mask over the move vocabulary for legal moves.

    Args:
        board: Current board position.

    Returns:
        Boolean numpy array of shape (NUM_MOVES,) where True = legal.
    """
    mask = np.zeros(NUM_MOVES, dtype=np.bool_)
    for move in board.legal_moves:
        try:
            idx = encode_move(move, board)
            mask[idx] = True
        except ValueError:
            # Skip moves that can't be encoded (shouldn't happen for legal moves)
            continue
    return mask


def encode_all_legal_moves(board: chess.Board) -> dict[int, chess.Move]:
    """Encode all legal moves in the current position.

    Returns:
        Dict mapping move index -> chess.Move for all legal moves.
    """
    moves = {}
    for move in board.legal_moves:
        try:
            idx = encode_move(move, board)
            moves[idx] = move
        except ValueError:
            continue
    return moves
