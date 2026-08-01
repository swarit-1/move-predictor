"""Tests for the progressive clone-matching feature:

- personal-explorer prior blending on the trained-model path
- personalize status registry used by the clone-status endpoint
"""

import chess
import torch

from src.api.personalize import _set_status, get_personalize_status
from src.inference.pipeline import PredictionPipeline
from src.models.move_encoding import NUM_MOVES, encode_move


def _uniform_logits() -> torch.Tensor:
    return torch.zeros(NUM_MOVES)


def test_personal_prior_boosts_habitual_move():
    """A move the player has repeatedly chosen here must gain probability."""
    board = chess.Board()
    habitual = chess.Move.from_uci("e2e4")
    idx = encode_move(habitual, board)

    personal_moves = [
        {"uci": "e2e4", "san": "e4", "total": 9},
        {"uci": "d2d4", "san": "d4", "total": 1},
    ]
    boosted = PredictionPipeline._apply_personal_prior(
        _uniform_logits(), board, personal_moves
    )

    assert boosted[idx] > 0.0
    d4_idx = encode_move(chess.Move.from_uci("d2d4"), board)
    # The 90% move gets a bigger boost than the 10% move
    assert boosted[idx] > boosted[d4_idx] > 0.0
    # Unrelated moves untouched
    a3_idx = encode_move(chess.Move.from_uci("a2a3"), board)
    assert boosted[a3_idx] == 0.0


def test_personal_prior_confidence_scales_with_sample_size():
    """One stray game must influence the clone less than ten games."""
    board = chess.Board()
    idx = encode_move(chess.Move.from_uci("e2e4"), board)

    one_game = PredictionPipeline._apply_personal_prior(
        _uniform_logits(), board, [{"uci": "e2e4", "total": 1}]
    )
    ten_games = PredictionPipeline._apply_personal_prior(
        _uniform_logits(), board, [{"uci": "e2e4", "total": 10}]
    )
    assert 0.0 < one_game[idx] < ten_games[idx]


def test_personal_prior_ignores_illegal_and_empty():
    board = chess.Board()
    # e2e5 is not a legal move from the start position
    boosted = PredictionPipeline._apply_personal_prior(
        _uniform_logits(), board, [{"uci": "e2e5", "total": 5}]
    )
    assert torch.equal(boosted, _uniform_logits())

    unchanged = PredictionPipeline._apply_personal_prior(
        _uniform_logits(), board, [{"uci": "e2e4", "total": 0}]
    )
    assert torch.equal(unchanged, _uniform_logits())


def test_personalize_status_registry():
    key = "lichess:test-status-registry"
    assert get_personalize_status(key)["status"] == "none"

    _set_status(key, "running")
    assert get_personalize_status(key)["status"] == "running"

    _set_status(key, "failed", error="boom")
    status = get_personalize_status(key)
    assert status["status"] == "failed"
    assert status["error"] == "boom"

    # Keys are case-insensitive
    _set_status(key.upper(), "ready")
    assert get_personalize_status(key)["status"] == "ready"
