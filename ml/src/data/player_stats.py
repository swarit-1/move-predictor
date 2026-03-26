"""Compute aggregate player statistics from their games.

These stats feed into the player embedding as continuous features.
"""

import numpy as np
import chess
import chess.pgn
from io import StringIO
from dataclasses import dataclass


@dataclass
class PlayerStats:
    """Aggregated statistics for a player across their games."""

    rating: float = 1500.0
    num_games: int = 0
    avg_centipawn_loss: float = 50.0
    blunder_rate: float = 0.05
    aggression_index: float = 0.5  # ratio of attacking vs quiet moves
    tactical_tendency: float = 0.5  # ratio of tactical (captures/checks) moves
    opening_diversity: float = 0.5  # entropy of opening choices
    endgame_accuracy: float = 0.5
    avg_move_time: float = 0.0  # if clock data available
    time_pressure_tendency: float = 0.0  # how often they get in time trouble
    consistency: float = 0.5  # low variance in performance
    win_rate: float = 0.5
    draw_rate: float = 0.1
    avg_game_length: float = 40.0
    # Opening preferences (encoded as ratios)
    e4_ratio: float = 0.0
    d4_ratio: float = 0.0
    other_opening_ratio: float = 0.0
    # Positional metrics
    piece_activity: float = 0.5
    king_safety_preference: float = 0.5
    pawn_structure_care: float = 0.5
    exchange_tendency: float = 0.5
    # Endgame
    endgame_conversion: float = 0.5
    opposite_color_bishop_skill: float = 0.5
    rook_endgame_skill: float = 0.5
    pawn_endgame_skill: float = 0.5

    def to_vector(self) -> np.ndarray:
        """Convert to a numpy vector for model input.

        Returns 25 normalized float values.
        """
        return np.array([
            self.rating / 3000.0,
            min(self.num_games / 1000.0, 1.0),
            min(self.avg_centipawn_loss / 200.0, 1.0),
            self.blunder_rate,
            self.aggression_index,
            self.tactical_tendency,
            self.opening_diversity,
            self.endgame_accuracy,
            min(self.avg_move_time / 120.0, 1.0),
            self.time_pressure_tendency,
            self.consistency,
            self.win_rate,
            self.draw_rate,
            min(self.avg_game_length / 100.0, 1.0),
            self.e4_ratio,
            self.d4_ratio,
            self.other_opening_ratio,
            self.piece_activity,
            self.king_safety_preference,
            self.pawn_structure_care,
            self.exchange_tendency,
            self.endgame_conversion,
            self.opposite_color_bishop_skill,
            self.rook_endgame_skill,
            self.pawn_endgame_skill,
        ], dtype=np.float32)


def compute_stats_from_pgns(pgn_texts: list[str], player_name: str) -> PlayerStats:
    """Compute player statistics from a collection of PGN games.

    Args:
        pgn_texts: List of PGN strings.
        player_name: The player's name (to determine which side they played).

    Returns:
        PlayerStats with computed values.
    """
    stats = PlayerStats()
    stats.num_games = len(pgn_texts)

    if not pgn_texts:
        return stats

    total_moves = 0
    total_captures = 0
    total_checks = 0
    total_exchanges = 0  # recaptures on the same square
    total_castles = 0
    total_king_moves = 0  # non-castling king moves (risky)
    total_center_moves = 0  # moves to central squares (piece activity proxy)
    total_pawn_moves = 0
    total_pawn_structure_moves = 0  # non-capture pawn pushes (structure-building)
    game_lengths: list[int] = []
    game_capture_rates: list[float] = []  # per-game capture rates for consistency
    results = {"win": 0, "loss": 0, "draw": 0}
    openings: list[str] = []
    endgame_results: list[bool] = []  # True = won/drew from endgame, False = lost

    CENTER_SQUARES = {chess.E4, chess.D4, chess.E5, chess.D5,
                      chess.C3, chess.D3, chess.E3, chess.F3,
                      chess.C6, chess.D6, chess.E6, chess.F6}

    for pgn_text in pgn_texts:
        game = chess.pgn.read_game(StringIO(pgn_text))
        if game is None:
            continue

        headers = game.headers
        is_white = headers.get("White", "").lower() == player_name.lower()
        result = headers.get("Result", "*")

        # Track result
        if result == "1-0":
            results["win" if is_white else "loss"] += 1
        elif result == "0-1":
            results["loss" if is_white else "win"] += 1
        elif result == "1/2-1/2":
            results["draw"] += 1

        # Track rating
        rating_key = "WhiteElo" if is_white else "BlackElo"
        try:
            stats.rating = float(headers.get(rating_key, stats.rating))
        except (ValueError, TypeError):
            pass

        # Analyze moves
        board = game.board()
        move_count = 0
        game_captures = 0
        first_move = None
        last_capture_square: int | None = None
        reached_endgame = False
        endgame_started_winning = False

        for node in game.mainline():
            move = node.move
            is_player_move = (board.turn == chess.WHITE) == is_white

            # Detect endgame: <= 12 non-pawn, non-king pieces total
            if not reached_endgame:
                piece_count = sum(
                    1 for sq in chess.SQUARES
                    if board.piece_at(sq) is not None
                    and board.piece_type_at(sq) not in (chess.PAWN, chess.KING)
                )
                if piece_count <= 6:
                    reached_endgame = True
                    # Heuristic: was the player ahead in material?
                    player_color = chess.WHITE if is_white else chess.BLACK
                    my_material = sum(
                        _piece_value(board.piece_type_at(sq))
                        for sq in chess.SQUARES
                        if board.piece_at(sq) is not None
                        and board.color_at(sq) == player_color
                    )
                    opp_material = sum(
                        _piece_value(board.piece_type_at(sq))
                        for sq in chess.SQUARES
                        if board.piece_at(sq) is not None
                        and board.color_at(sq) != player_color
                    )
                    endgame_started_winning = my_material >= opp_material

            if is_player_move:
                move_count += 1
                total_moves += 1

                if first_move is None:
                    first_move = move.uci()

                is_capture = board.is_capture(move)
                if is_capture:
                    total_captures += 1
                    game_captures += 1
                    # Exchange detection: recapture on the same square
                    if last_capture_square == move.to_square:
                        total_exchanges += 1

                if board.gives_check(move):
                    total_checks += 1

                piece = board.piece_at(move.from_square)
                if piece:
                    pt = piece.piece_type
                    if pt == chess.KING:
                        if board.is_castling(move):
                            total_castles += 1
                        else:
                            total_king_moves += 1
                    elif pt == chess.PAWN:
                        total_pawn_moves += 1
                        if not is_capture:
                            total_pawn_structure_moves += 1

                # Piece activity: moves to central/extended-center squares
                if move.to_square in CENTER_SQUARES:
                    total_center_moves += 1

            # Track last capture square for exchange detection
            if board.is_capture(move):
                last_capture_square = move.to_square
            else:
                last_capture_square = None

            board.push(move)

        game_lengths.append(board.fullmove_number)

        # Per-game capture rate for consistency calculation
        if move_count > 0:
            game_capture_rates.append(game_captures / move_count)

        # Endgame result tracking
        if reached_endgame:
            if result == "1-0":
                endgame_results.append(is_white)
            elif result == "0-1":
                endgame_results.append(not is_white)
            elif result == "1/2-1/2":
                # Draw from a winning endgame = not great conversion
                endgame_results.append(not endgame_started_winning)

        # Track opening
        if first_move:
            openings.append(first_move)

    total_games = max(stats.num_games, 1)

    # Compute derived stats
    stats.win_rate = results["win"] / total_games
    stats.draw_rate = results["draw"] / total_games
    stats.avg_game_length = float(np.mean(game_lengths)) if game_lengths else 40.0

    if total_moves > 0:
        stats.tactical_tendency = (total_captures + total_checks) / total_moves
        stats.aggression_index = min(stats.tactical_tendency * 2, 1.0)

        # Exchange tendency: how often the player recaptures (exchanges pieces)
        stats.exchange_tendency = min(total_exchanges / total_moves * 10, 1.0)

        # Piece activity: proportion of moves going to center/extended-center
        stats.piece_activity = min(total_center_moves / total_moves * 3, 1.0)

        # King safety: high castling rate + few early king moves = safety-conscious
        castle_rate = total_castles / total_games
        king_move_rate = total_king_moves / total_moves
        stats.king_safety_preference = min(castle_rate + (1.0 - king_move_rate * 10), 1.0)
        stats.king_safety_preference = max(stats.king_safety_preference, 0.0)

        # Pawn structure care: ratio of non-capture pawn pushes
        if total_pawn_moves > 0:
            stats.pawn_structure_care = total_pawn_structure_moves / total_pawn_moves
        else:
            stats.pawn_structure_care = 0.5

    # Consistency: low variance in per-game capture rates
    if len(game_capture_rates) >= 3:
        variance = float(np.var(game_capture_rates))
        # Lower variance = higher consistency; scale so typical variance maps to ~0.5
        stats.consistency = max(0.0, min(1.0, 1.0 - variance * 20))
    elif len(game_capture_rates) > 0:
        stats.consistency = 0.5  # Not enough data

    # Endgame stats
    if endgame_results:
        stats.endgame_conversion = sum(endgame_results) / len(endgame_results)
        stats.endgame_accuracy = stats.endgame_conversion  # Proxy — same data

    # Opening preferences
    if openings:
        e4_count = sum(1 for m in openings if m == "e2e4")
        d4_count = sum(1 for m in openings if m == "d2d4")
        total = len(openings)
        stats.e4_ratio = e4_count / total
        stats.d4_ratio = d4_count / total
        stats.other_opening_ratio = 1.0 - stats.e4_ratio - stats.d4_ratio

        # Opening diversity = unique openings / total games
        unique_openings = len(set(openings))
        stats.opening_diversity = min(unique_openings / total, 1.0)

    return stats


def _piece_value(piece_type: int | None) -> int:
    """Simple material value for endgame detection."""
    if piece_type is None:
        return 0
    return {
        chess.PAWN: 1,
        chess.KNIGHT: 3,
        chess.BISHOP: 3,
        chess.ROOK: 5,
        chess.QUEEN: 9,
        chess.KING: 0,
    }.get(piece_type, 0)
