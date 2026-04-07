"""Feature extraction for training examples.

Converts raw game data into structured features ready for the Dataset class.
"""

import chess
import chess.pgn
import numpy as np
from io import StringIO

from src.data.preprocessing import board_to_tensor, classify_game_phase, compute_position_complexity
from src.models.move_encoding import encode_move


def extract_position_features(
    board: chess.Board,
    move: chess.Move,
    move_history: list[chess.Move],
    player_id: int = 0,
    player_rating: int = 1500,
    engine_eval: float | None = None,
    centipawn_loss: float | None = None,
    is_blunder: bool = False,
    player_stats: np.ndarray | None = None,
    time_control: int = 0,
) -> dict:
    """Extract all features for a single position.

    Args:
        board: Current board state (before the move).
        move: The move that was played.
        move_history: List of previous moves in the game.
        player_id: Integer ID for the player.
        player_rating: Player's rating.
        engine_eval: Stockfish evaluation in centipawns (from side-to-move perspective).
        centipawn_loss: Centipawn loss for the played move.
        is_blunder: Whether this move is a blunder.

    Returns:
        Dict with all features needed for training.
    """
    # Board tensor (18, 8, 8)
    board_tensor = board_to_tensor(board)

    # Move history as indices (last N moves, padded with 0)
    # Each move must be encoded with the board state AT THE TIME it was played,
    # because encode_move mirrors squares for Black's perspective.
    from src.config import settings
    history_length = settings.history_length
    history_indices = []

    # Replay the full move history to reconstruct board states per move
    replay_board = chess.Board()
    encoded_all = []
    for hist_move in move_history:
        try:
            if hist_move in replay_board.legal_moves:
                idx = encode_move(hist_move, replay_board)
                encoded_all.append(idx)
                replay_board.push(hist_move)
            else:
                replay_board.push(hist_move)
                encoded_all.append(0)
        except (ValueError, IndexError):
            try:
                replay_board.push(hist_move)
            except Exception:
                pass
            encoded_all.append(0)

    # Take the last history_length encoded indices
    recent = encoded_all[-history_length:]
    history_indices = recent

    # Pad to history_length (prepend zeros for short histories)
    while len(history_indices) < history_length:
        history_indices.insert(0, 0)

    # Encode the played move
    move_index = encode_move(move, board)

    # Game phase
    game_phase = classify_game_phase(board)

    # Normalize values
    eval_normalized = 0.0
    if engine_eval is not None:
        # Clamp to [-10, 10] pawns and normalize to [-1, 1]
        eval_normalized = max(-1000, min(1000, engine_eval)) / 1000.0

    cpl = centipawn_loss if centipawn_loss is not None else 0.0

    # Position complexity features
    complexity = compute_position_complexity(board)

    # Build player_stats vector: use provided stats or construct a minimal one
    from src.config import settings
    if player_stats is not None:
        stats_vector = player_stats
    else:
        stats_vector = np.zeros(settings.num_player_stats, dtype=np.float32)
        stats_vector[0] = player_rating / 3000.0  # rating slot

    return {
        "board_tensor": board_tensor,  # (18, 8, 8)
        "move_history": np.array(history_indices, dtype=np.int64),  # (T,)
        "player_id": player_id,
        "player_stats": stats_vector,  # (num_player_stats,)
        "player_rating": player_rating / 3000.0,  # normalize
        "game_phase": game_phase,
        "time_control": time_control,  # 0=unknown, 1=bullet, 2=blitz, 3=rapid, 4=classical
        "move_number": min(board.fullmove_number / 100.0, 1.0),
        "complexity": np.array([
            complexity["mobility"],
            complexity["piece_tension"],
            complexity["king_exposure"],
            complexity["material_imbalance"],
        ], dtype=np.float32),
        # Labels
        "move_index": move_index,
        "eval_score": eval_normalized,
        "centipawn_loss": min(cpl / 500.0, 1.0),  # normalize, clamp
        "is_blunder": float(is_blunder),
    }


# Map PGN TimeControl header values to our time_control IDs
# 0=unknown, 1=bullet, 2=blitz, 3=rapid, 4=classical
def _parse_time_control_from_pgn(pgn_header: str) -> int:
    """Parse PGN TimeControl header (e.g. '300+0') into our time control ID."""
    if not pgn_header or pgn_header == "-" or pgn_header == "?":
        return 0
    try:
        parts = pgn_header.split("+")
        base_seconds = int(parts[0])
        increment = int(parts[1]) if len(parts) > 1 else 0
        # Estimated game duration: base + 40 * increment
        estimated = base_seconds + 40 * increment
        if estimated < 180:
            return 1  # bullet
        elif estimated < 600:
            return 2  # blitz
        elif estimated < 1800:
            return 3  # rapid
        else:
            return 4  # classical
    except (ValueError, IndexError):
        return 0


def parse_pgn_to_positions(
    pgn_text: str,
    player_id: int = 0,
    player_rating: int = 1500,
    player_stats: np.ndarray | None = None,
    time_control: int | None = None,
) -> list[dict]:
    """Parse a PGN string and extract position features for every move.

    Note: This does NOT include Stockfish annotations. Those should be added
    separately via the annotation pipeline.

    Args:
        pgn_text: PGN string of one game.
        player_id: Integer player ID.
        player_rating: Player rating.
        player_stats: Precomputed player stats vector.
        time_control: Override time control ID. If None, parsed from PGN header.

    Returns:
        List of feature dicts, one per position.
    """
    game = chess.pgn.read_game(StringIO(pgn_text))
    if game is None:
        return []

    # Determine time control from PGN header if not provided
    if time_control is None:
        tc_header = game.headers.get("TimeControl", "")
        time_control = _parse_time_control_from_pgn(tc_header)

    positions = []
    board = game.board()
    move_history = []

    for node in game.mainline():
        move = node.move
        try:
            features = extract_position_features(
                board=board,
                move=move,
                move_history=move_history.copy(),
                player_id=player_id,
                player_rating=player_rating,
                player_stats=player_stats,
                time_control=time_control,
            )
            positions.append(features)
        except ValueError:
            pass  # Skip moves that can't be encoded

        move_history.append(move)
        board.push(move)

    return positions
