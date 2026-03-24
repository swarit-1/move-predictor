"""Shared test fixtures."""

import chess
import pytest
import numpy as np


@pytest.fixture
def starting_board():
    return chess.Board()


@pytest.fixture
def midgame_board():
    """A typical middlegame position (Italian Game)."""
    board = chess.Board()
    moves = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "d2d3", "f8e7",
             "e1g1", "e8g8", "c2c3", "d7d6"]
    for uci in moves:
        board.push(chess.Move.from_uci(uci))
    return board


@pytest.fixture
def endgame_board():
    """A simple king + pawn endgame."""
    return chess.Board("8/5k2/8/8/3K4/8/4P3/8 w - - 0 1")
