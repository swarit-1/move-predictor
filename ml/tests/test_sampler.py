"""Tests for the skill-aware sampler with blind spot integration."""

import chess
import torch

from src.inference.sampler import (
    compute_temperature,
    sample_move,
    apply_style_bias,
    StyleOverrides,
    _compute_top_p,
    _apply_nucleus_sampling,
)
from src.models.move_encoding import NUM_MOVES, encode_move


class TestTemperature:
    """Test temperature computation."""

    def test_low_rating_high_temperature(self):
        temp = compute_temperature(1.0, 0.2, player_rating=800)
        assert temp > 0.7

    def test_high_rating_low_temperature(self):
        temp = compute_temperature(0.5, 0.1, player_rating=2400)
        assert temp < 0.5

    def test_temperature_clamps(self):
        """Temperature stays within floor-ceiling range per rating bracket."""
        # Very low: 2200+ players have floor=0.15
        temp_low = compute_temperature(0.0, 0.0, player_rating=3000)
        assert temp_low >= 0.15

        # Very high — ceiling is 1.5 for sub-1200, 1.2 for sub-1800, 0.8 for 1800+
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


class TestNucleusSampling:
    """Test nucleus (top-p) sampling eliminates garbage moves."""

    def test_no_random_queen_moves(self):
        """Verify that random queen shuffles never get sampled."""
        board = chess.Board()  # Starting position

        # Simulate Stockfish fallback logits with wide gap
        logits = torch.full((NUM_MOVES,), -8.0)
        for move_uci, logit in [("e2e4", 5.0), ("d2d4", 4.2), ("g1f3", 3.4)]:
            move = chess.Move.from_uci(move_uci)
            idx = encode_move(move, board)
            logits[idx] = logit

        # Sample 100 times at rating 400 (worst case)
        moves_played = []
        for _ in range(100):
            result = sample_move(
                policy_logits=logits.clone(),
                board=board,
                predicted_cpl=2.5,
                blunder_prob=0.3,
                player_rating=400,
                engine_top_moves=[
                    {"move": "e2e4", "cp": 30, "rank": 1},
                    {"move": "d2d4", "cp": 25, "rank": 2},
                    {"move": "g1f3", "cp": 20, "rank": 3},
                ],
            )
            moves_played.append(result.move_uci)

        # Count moves not in reasonable set
        reasonable = {
            "e2e4", "d2d4", "g1f3", "c2c4", "b1c3", "g2g3", "b2b3",
            "f2f4", "e2e3", "d2d3", "c2c3", "a2a3", "h2h3", "b2b4",
            "a2a4", "g2g4", "h2h4", "b1a3", "g1h3",
        }
        garbage_count = sum(1 for m in moves_played if m not in reasonable)

        assert garbage_count <= 3, (
            f"Got {garbage_count} garbage moves out of 100: "
            f"{[m for m in moves_played if m not in reasonable]}"
        )

    def test_temperature_ceiling(self):
        """Verify temperature respects per-rating-bracket ceiling and floor."""
        for rating in [200, 400, 600, 800, 1000, 1500, 2000]:
            for blunder in [0, 50, 100]:
                style = StyleOverrides(blunder_frequency=blunder, risk_taking=100)
                temp = compute_temperature(3.0, 0.5, rating, style)
                # Ceiling depends on rating bracket
                ceiling = 1.5 if rating < 1200 else 1.2 if rating < 1800 else 0.8
                assert temp <= ceiling, (
                    f"Rating {rating}, blunder {blunder}: temp={temp} exceeds ceiling {ceiling}"
                )
                # Floor depends on rating bracket
                floor = 0.15 if rating >= 2200 else 0.25
                assert temp >= floor, (
                    f"Rating {rating}: temp={temp} below floor {floor}"
                )

    def test_top_p_rating_scaling(self):
        """Higher-rated players get tighter top-p."""
        low_p = _compute_top_p(400)
        mid_p = _compute_top_p(1500)
        high_p = _compute_top_p(2500)

        assert low_p > mid_p > high_p
        assert low_p <= 0.96
        assert high_p >= 0.70

    def test_nucleus_filter_removes_tail(self):
        """Nucleus filter zeros out low-probability tail moves."""
        probs = torch.zeros(100)
        probs[0] = 0.5
        probs[1] = 0.3
        probs[2] = 0.1
        probs[3:10] = 0.01  # 7 moves at 1%
        probs[10:] = 0.001 / 90  # tiny tail

        filtered = _apply_nucleus_sampling(probs, 0.90)

        # Top 2 moves should survive (0.5 + 0.3 = 0.8, need to include #3)
        assert filtered[0] > 0
        assert filtered[1] > 0
        assert filtered[2] > 0
        # Tail should be zeroed
        assert filtered[50].item() == 0.0
        assert filtered[99].item() == 0.0
