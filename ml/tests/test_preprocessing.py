"""Tests for board representation and preprocessing."""

import chess
import numpy as np
import pytest
from src.data.preprocessing import (
    board_to_tensor, fen_to_tensor, classify_game_phase, classify_move_quality,
    NUM_CHANNELS, BOARD_SIZE,
)


def test_tensor_shape(starting_board):
    """Board tensor should be (18, 8, 8)."""
    tensor = board_to_tensor(starting_board)
    assert tensor.shape == (NUM_CHANNELS, BOARD_SIZE, BOARD_SIZE)
    assert tensor.dtype == np.float32


def test_starting_position_pieces(starting_board):
    """Verify piece placement in starting position tensor."""
    tensor = board_to_tensor(starting_board)

    # Channel 0 = White pawns: should have 8 pawns on rank 1
    assert tensor[0, 1, :].sum() == 8.0  # rank 1 (0-indexed), all files

    # Channel 6 = Black pawns: should have 8 pawns on rank 6
    assert tensor[6, 6, :].sum() == 8.0

    # Channel 5 = White king: e1 = file 4, rank 0
    assert tensor[5, 0, 4] == 1.0

    # Channel 11 = Black king: e8 = file 4, rank 7
    assert tensor[11, 7, 4] == 1.0


def test_side_to_move_white(starting_board):
    """Channel 14 should be all 1s for White's turn."""
    tensor = board_to_tensor(starting_board)
    assert tensor[14].sum() == 64.0


def test_side_to_move_black():
    """After e4, it's Black's turn — but tensor flips, so channel 14 is still all 1s."""
    board = chess.Board()
    board.push(chess.Move.from_uci("e2e4"))
    tensor = board_to_tensor(board)
    # After flipping for Black's perspective, channel 14 is all 1s
    assert tensor[14].sum() == 64.0


def test_castling_rights(starting_board):
    """Channel 15 should encode castling rights."""
    tensor = board_to_tensor(starting_board)
    # All 4 castling rights present: 0.25 + 0.25 + 0.125 + 0.125 = 0.75
    assert tensor[15, 0, 0] == pytest.approx(0.75, abs=0.01)


def test_en_passant():
    """Channel 16 should mark the en passant square after e4."""
    board = chess.Board()
    board.push(chess.Move.from_uci("e2e4"))
    tensor = board_to_tensor(board)
    # e3 is the EP square (from White's perspective), but we flip for Black
    # After flip: e3 (rank 2) becomes rank 5
    assert tensor[16].sum() == 1.0  # exactly one square marked


def test_halfmove_clock():
    """Channel 17 should reflect halfmove clock."""
    board = chess.Board()
    tensor = board_to_tensor(board)
    assert tensor[17, 0, 0] == 0.0  # clock starts at 0

    # After Nf3 (non-pawn, non-capture), clock = 1
    board.push(chess.Move.from_uci("g1f3"))
    board.push(chess.Move.from_uci("g8f6"))
    tensor = board_to_tensor(board)
    assert tensor[17, 0, 0] == pytest.approx(2.0 / 100.0, abs=0.01)


def test_fen_to_tensor():
    """fen_to_tensor should produce same result as board_to_tensor."""
    fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
    tensor1 = fen_to_tensor(fen)
    tensor2 = board_to_tensor(chess.Board(fen))
    np.testing.assert_array_equal(tensor1, tensor2)


def test_classify_game_phase():
    """Test game phase classification."""
    # Starting position = opening
    assert classify_game_phase(chess.Board()) == 0

    # King + pawn endgame
    board = chess.Board("8/5k2/8/8/3K4/8/4P3/8 w - - 0 1")
    assert classify_game_phase(board) == 2


def test_classify_move_quality():
    assert classify_move_quality(0) == "best"
    assert classify_move_quality(10) == "good"
    assert classify_move_quality(30) == "inaccuracy"
    assert classify_move_quality(75) == "mistake"
    assert classify_move_quality(150) == "blunder"
