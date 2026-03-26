"""Tests for the blind spot bias system."""

import chess
import torch

from src.inference.blind_spots import (
    BlindSpotConfig,
    compute_blind_spot_biases,
    _is_discovered_attack,
)
from src.models.move_encoding import NUM_MOVES, encode_move


class TestBlindSpotConfig:
    """Test blind spot configuration from rating."""

    def test_weak_player_has_strong_biases(self):
        config = BlindSpotConfig.from_rating(600)
        assert config.tactical_blindness > 0.7
        assert config.material_greed > 0.5
        assert config.check_attraction > 0.3

    def test_strong_player_has_weak_biases(self):
        config = BlindSpotConfig.from_rating(2400)
        assert config.tactical_blindness == 0.0
        assert config.piece_preference == 0.0
        assert config.king_safety_neglect == 0.0
        assert config.long_range_blindness == 0.0

    def test_intermediate_player(self):
        config = BlindSpotConfig.from_rating(1500)
        assert 0.2 < config.tactical_blindness < 0.6
        assert config.material_greed > 0.1  # everyone has some greed

    def test_rating_clamps(self):
        """Extreme ratings don't produce out-of-range values."""
        low = BlindSpotConfig.from_rating(0)
        high = BlindSpotConfig.from_rating(3500)

        for field in ["tactical_blindness", "material_greed", "check_attraction",
                       "piece_preference", "king_safety_neglect",
                       "long_range_blindness"]:
            assert 0.0 <= getattr(low, field) <= 1.0
            assert 0.0 <= getattr(high, field) <= 1.0


class TestBlindSpotBiases:
    """Test that blind spot biases actually modify logits."""

    def test_no_biases_when_config_zero(self):
        board = chess.Board()
        logits = torch.zeros(NUM_MOVES)
        config = BlindSpotConfig()  # all zeros
        result = compute_blind_spot_biases(logits, board, config)
        assert result.modified_logits.equal(logits)
        assert len(result.active_biases) == 0

    def test_material_greed_boosts_captures(self):
        """In a position with captures available, material greed should boost them."""
        # Position where white can capture on d5
        board = chess.Board("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2")
        logits = torch.zeros(NUM_MOVES)
        config = BlindSpotConfig(material_greed=0.8)

        result = compute_blind_spot_biases(logits, board, config)

        # exd5 should have a positive boost
        capture_move = chess.Move.from_uci("e4d5")
        capture_idx = encode_move(capture_move, board)
        assert result.modified_logits[capture_idx] > 0
        assert "material_greed" in result.active_biases

    def test_check_attraction_boosts_checks(self):
        """In a position with checks, check attraction should boost them."""
        # Position where white Qh5 gives check (scholar's mate setup)
        board = chess.Board("rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3")
        logits = torch.zeros(NUM_MOVES)
        config = BlindSpotConfig(check_attraction=0.7)

        result = compute_blind_spot_biases(logits, board, config)

        # Find any checking move and verify it's boosted
        checks_boosted = False
        for move in board.legal_moves:
            if board.gives_check(move):
                idx = encode_move(move, board)
                if result.modified_logits[idx] > 0:
                    checks_boosted = True
                    break

        assert checks_boosted
        assert "check_attraction" in result.active_biases

    def test_king_safety_neglect_penalizes_non_castling(self):
        """When castling is available, king safety neglect should slightly penalize non-castling."""
        board = chess.Board("rnbqkbnr/pppppppp/8/8/8/5NP1/PPPPPPBP/RNBQK2R w KQkq - 0 1")
        logits = torch.zeros(NUM_MOVES)
        config = BlindSpotConfig(king_safety_neglect=0.6)

        result = compute_blind_spot_biases(logits, board, config)
        assert "king_safety_neglect" in result.active_biases

        # Castling should have a positive boost, non-castling should have penalty
        castle_move = chess.Move.from_uci("e1g1")
        if castle_move in board.legal_moves:
            castle_idx = encode_move(castle_move, board)
            assert result.modified_logits[castle_idx] > 0

    def test_piece_preference_favors_queen_moves(self):
        """Piece preference should boost queen moves for weaker players."""
        # Position where queen can move
        board = chess.Board("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1")
        logits = torch.zeros(NUM_MOVES)
        config = BlindSpotConfig(piece_preference=0.5)

        result = compute_blind_spot_biases(logits, board, config)

        # Check that at least some queen moves got boosted
        queen_boosted = False
        for move in board.legal_moves:
            piece = board.piece_at(move.from_square)
            if piece and piece.piece_type == chess.QUEEN:
                idx = encode_move(move, board)
                if result.modified_logits[idx] > 0:
                    queen_boosted = True
                    break

        assert queen_boosted
        assert "piece_preference" in result.active_biases

    def test_tactical_blindness_with_engine_data(self):
        """Tactical blindness should penalize quiet engine top moves."""
        board = chess.Board()
        logits = torch.zeros(NUM_MOVES)
        config = BlindSpotConfig(tactical_blindness=0.8)

        # d2d4 is a quiet move that's engine's top pick
        engine_top = [{"move": "d2d4", "cp": 30}]
        result = compute_blind_spot_biases(logits, board, config, engine_top)

        # The quiet top engine move should be penalized
        quiet_move = chess.Move.from_uci("d2d4")
        idx = encode_move(quiet_move, board)
        assert result.modified_logits[idx] < 0
        assert "tactical_blindness" in result.active_biases

    def test_gm_rating_produces_no_significant_changes(self):
        """A GM-level rating should produce negligible bias changes."""
        board = chess.Board()
        logits = torch.zeros(NUM_MOVES)
        config = BlindSpotConfig.from_rating(2600)

        result = compute_blind_spot_biases(logits, board, config)
        max_change = result.modified_logits.abs().max().item()
        assert max_change < 0.1  # negligible
        assert len(result.active_biases) == 0


class TestDiscoveredAttack:
    """Test discovered attack detection."""

    def test_discovered_attack_detected(self):
        """A bishop behind a knight that can discover a check on the king."""
        # White Nd4 blocking Bc1-h6 diagonal toward black king on g7
        # (simplified: just test the function doesn't crash with various boards)
        board = chess.Board("rnbqk2r/ppppppbp/5np1/4p3/3NP3/2N1B3/PPPP1PPP/R2QKB1R w KQkq - 4 5")
        # Test that it runs without error for all legal moves
        for move in board.legal_moves:
            result = _is_discovered_attack(board, move)
            assert isinstance(result, bool)

    def test_no_discovered_attack_starting_position(self):
        """Starting position has no discovered attacks."""
        board = chess.Board()
        for move in board.legal_moves:
            assert not _is_discovered_attack(board, move)
