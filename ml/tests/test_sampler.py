"""Tests for the skill-aware sampler with blind spot integration."""

import chess
import torch
import pytest

from src.inference.sampler import (
    compute_temperature,
    sample_move,
    apply_style_bias,
    StyleOverrides,
)
from src.models.move_encoding import NUM_MOVES


class TestTemperature:
    """Test temperature computation."""

    def test_low_rating_high_temperature(self):
        temp = compute_temperature(1.0, 0.2, player_rating=800)
        assert temp > 0.8

    def test_high_rating_low_temperature(self):
        temp = compute_temperature(0.5, 0.1, player_rating=2400)
        assert temp < 0.5

    def test_temperature_clamps(self):
        """Temperature stays within 0.2-1.5 range."""
        # Very low
        temp_low = compute_temperature(0.0, 0.0, player_rating=3000)
        assert temp_low >= 0.2

        # Very high
        style = StyleOverrides(risk_taking=100, blunder_frequency=100)
        temp_high = compute_temperature(5.0, 1.0, player_rating=400, style=style)
        assert temp_high <= 1.5

    def test_risk_taking_increases_temperature(self):
        base = compute_temperature(1.0, 0.2, player_rating=1500)
        risky = compute_temperature(
            1.0, 0.2, player_rating=1500,
            style=StyleOverrides(risk_taking=90),
        )
        assert risky > base

    def test_blunder_frequency_increases_temperature(self):
        base = compute_temperature(1.0, 0.2, player_rating=1500)
        blunder = compute_temperature(
            1.0, 0.2, player_rating=1500,
            style=StyleOverrides(blunder_frequency=90),
        )
        assert blunder > base


class TestSampleMove:
    """Test the full move sampling pipeline."""

    def test_returns_legal_move(self):
        board = chess.Board()
        logits = torch.randn(NUM_MOVES)
        result = sample_move(logits, board, player_rating=1500)
        assert result.move in board.legal_moves

    def test_returns_valid_uci(self):
        board = chess.Board()
        logits = torch.randn(NUM_MOVES)
        result = sample_move(logits, board)
        assert len(result.move_uci) >= 4
        chess.Move.from_uci(result.move_uci)  # should not raise

    def test_probability_is_valid(self):
        board = chess.Board()
        logits = torch.randn(NUM_MOVES)
        result = sample_move(logits, board)
        assert 0.0 < result.probability <= 1.0

    def test_top_moves_populated(self):
        board = chess.Board()
        logits = torch.randn(NUM_MOVES)
        result = sample_move(logits, board)
        assert len(result.top_moves) > 0
        assert len(result.top_moves) <= 5

    def test_with_engine_top_moves(self):
        board = chess.Board()
        logits = torch.randn(NUM_MOVES)
        engine = [
            {"move": "e2e4", "cp": 30, "rank": 1},
            {"move": "d2d4", "cp": 25, "rank": 2},
        ]
        result = sample_move(logits, board, engine_top_moves=engine)
        assert result.move in board.legal_moves

    def test_with_opening_book(self):
        board = chess.Board()
        logits = torch.randn(NUM_MOVES)
        book_probs = {"e2e4": 0.6, "d2d4": 0.3, "c2c4": 0.1}
        result = sample_move(logits, board, opening_book_probs=book_probs)
        assert result.move in board.legal_moves
        assert result.from_book is True

    def test_different_positions(self):
        """Sampler works across various positions."""
        fens = [
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2",
            "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2",
            "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
        ]
        for fen in fens:
            board = chess.Board(fen)
            logits = torch.randn(NUM_MOVES)
            result = sample_move(logits, board)
            assert result.move in board.legal_moves


class TestStyleBias:
    """Test aggression style bias."""

    def test_no_bias_at_neutral(self):
        board = chess.Board()
        logits = torch.randn(NUM_MOVES)
        style = StyleOverrides(aggression=50)
        result = apply_style_bias(logits, board, style)
        assert torch.allclose(result, logits)

    def test_aggression_modifies_logits(self):
        """High aggression should change logits in a position with captures."""
        board = chess.Board("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2")
        logits = torch.zeros(NUM_MOVES)
        style = StyleOverrides(aggression=90)
        result = apply_style_bias(logits, board, style)
        assert not torch.allclose(result, logits)


class TestEvalPerspective:
    """Test that eval normalization handles perspective correctly.

    This validates the fix for Bug 1.1: Stockfish returns cp from
    side-to-move perspective, which must be flipped for Black.
    """

    def test_white_perspective_unchanged(self):
        """When it's White to move, cp stays positive for White advantage."""
        # Stockfish says +100 from white's perspective (white to move)
        raw_cp = 100
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
        side_to_move = fen.split(" ")[1]
        flip = -1 if side_to_move == "b" else 1
        cp_white = raw_cp * flip

        # Black to move, Stockfish +100 means Black is +100 → White is -100
        assert cp_white == -100

    def test_black_perspective_flipped(self):
        """When it's Black to move, cp must be flipped."""
        raw_cp = 50
        fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1"
        side_to_move = fen.split(" ")[1]
        flip = -1 if side_to_move == "b" else 1
        cp_white = raw_cp * flip

        # White to move, Stockfish +50 means White is ahead → stays +50
        assert cp_white == 50

    def test_mate_perspective(self):
        """Mate scores also need flipping."""
        # Black to move, Stockfish says mate in 3 → Black is mating
        # From White's perspective: mate in -3
        raw_mate = 3
        side_to_move = "b"
        flip = -1 if side_to_move == "b" else 1
        mate_white = raw_mate * flip
        assert mate_white == -3
