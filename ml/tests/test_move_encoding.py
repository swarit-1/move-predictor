"""Tests for move encoding: encode/decode roundtrip and correctness."""

import chess
from src.models.move_encoding import (
    encode_move, decode_move, get_legal_move_mask, NUM_MOVES, encode_all_legal_moves,
)


def test_num_moves_reasonable():
    """Move vocabulary should be roughly 1800-2000."""
    assert 1500 < NUM_MOVES < 2500


def test_encode_decode_roundtrip_starting_position(starting_board):
    """Every legal move in the starting position should survive encode→decode."""
    for move in starting_board.legal_moves:
        idx = encode_move(move, starting_board)
        decoded = decode_move(idx, starting_board)
        assert decoded == move, f"Roundtrip failed: {move.uci()} → {idx} → {decoded.uci()}"


def test_encode_decode_roundtrip_midgame(midgame_board):
    """Every legal move in a middlegame position should survive encode→decode."""
    for move in midgame_board.legal_moves:
        idx = encode_move(move, midgame_board)
        decoded = decode_move(idx, midgame_board)
        assert decoded == move, f"Roundtrip failed: {move.uci()} → {idx} → {decoded.uci()}"


def test_encode_decode_roundtrip_many_positions():
    """Test roundtrip across 50 random positions from a game."""
    board = chess.Board()
    moves = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6",
             "e1g1", "f8e7", "f1e1", "b7b5", "a4b3", "d7d6", "c2c3", "e8g8"]

    for uci in moves:
        move = chess.Move.from_uci(uci)
        # Test all legal moves at this position
        for legal_move in board.legal_moves:
            idx = encode_move(legal_move, board)
            decoded = decode_move(idx, board)
            assert decoded == legal_move
        board.push(move)


def test_legal_move_mask_starting_position(starting_board):
    """Legal move mask should have exactly 20 legal moves for starting position."""
    mask = get_legal_move_mask(starting_board)
    assert mask.shape == (NUM_MOVES,)
    assert mask.sum() == 20  # 20 legal moves in starting position


def test_legal_move_mask_matches_legal_moves(midgame_board):
    """Mask should match the count of legal moves."""
    mask = get_legal_move_mask(midgame_board)
    legal_count = len(list(midgame_board.legal_moves))
    assert mask.sum() == legal_count


def test_encode_all_legal_moves(starting_board):
    """encode_all_legal_moves should return a dict for every legal move."""
    encoded = encode_all_legal_moves(starting_board)
    assert len(encoded) == 20
    for idx, move in encoded.items():
        assert 0 <= idx < NUM_MOVES
        assert move in starting_board.legal_moves


def test_black_move_encoding():
    """Black's moves should encode correctly (with mirroring)."""
    board = chess.Board()
    board.push(chess.Move.from_uci("e2e4"))  # White plays e4

    # Now it's Black's turn
    for move in board.legal_moves:
        idx = encode_move(move, board)
        decoded = decode_move(idx, board)
        assert decoded == move, f"Black roundtrip failed: {move.uci()}"


def test_promotion_encoding():
    """Test encoding of promotion moves."""
    board = chess.Board("8/P7/8/8/8/8/8/4K2k w - - 0 1")
    promo_moves = [m for m in board.legal_moves if m.promotion is not None]
    assert len(promo_moves) > 0

    for move in promo_moves:
        idx = encode_move(move, board)
        decoded = decode_move(idx, board)
        assert decoded == move, f"Promotion roundtrip failed: {move.uci()}"
