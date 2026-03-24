"""Tests for model forward pass and shapes."""

import torch
import pytest
from src.models.move_predictor import MovePredictor
from src.models.board_encoder import BoardEncoder
from src.models.sequence_encoder import SequenceEncoder
from src.models.player_embedding import PlayerEmbeddingModule
from src.models.fusion import SkillAwareFusion
from src.models.heads import PolicyHead, ValueHead, ErrorHead
from src.config import settings


@pytest.fixture
def batch_size():
    return 4


@pytest.fixture
def board_input(batch_size):
    return torch.randn(batch_size, settings.board_channels, 8, 8)


@pytest.fixture
def seq_input(batch_size):
    return torch.randint(0, settings.move_vocab_size, (batch_size, settings.history_length))


@pytest.fixture
def player_id(batch_size):
    return torch.randint(0, 100, (batch_size,))


@pytest.fixture
def player_stats(batch_size):
    return torch.randn(batch_size, settings.num_player_stats)


def test_board_encoder_shape(board_input):
    encoder = BoardEncoder()
    out = encoder(board_input)
    assert out.shape == (board_input.shape[0], settings.resnet_channels)


def test_sequence_encoder_shape(seq_input):
    encoder = SequenceEncoder()
    out = encoder(seq_input)
    assert out.shape == (seq_input.shape[0], settings.d_model)


def test_sequence_encoder_with_phase(seq_input, batch_size):
    encoder = SequenceEncoder()
    phase = torch.randint(0, 3, (batch_size,))
    out = encoder(seq_input, game_phase=phase)
    assert out.shape == (batch_size, settings.d_model)


def test_player_embedding_shape(player_id, player_stats):
    module = PlayerEmbeddingModule()
    out = module(player_id, player_stats)
    assert out.shape == (player_id.shape[0], settings.player_embed_dim)


def test_fusion_shape():
    B = 4
    fusion = SkillAwareFusion()
    board_feat = torch.randn(B, settings.resnet_channels)
    seq_feat = torch.randn(B, settings.d_model)
    player_feat = torch.randn(B, settings.player_embed_dim)
    out = fusion(board_feat, seq_feat, player_feat)
    assert out.shape == (B, settings.fusion_dim)


def test_policy_head_shape():
    head = PolicyHead()
    x = torch.randn(4, settings.fusion_dim)
    out = head(x)
    assert out.shape == (4, settings.move_vocab_size)


def test_value_head_shape():
    head = ValueHead()
    x = torch.randn(4, settings.fusion_dim)
    out = head(x)
    assert out.shape == (4, 1)
    assert out.min() >= -1.0 and out.max() <= 1.0


def test_error_head_shape():
    head = ErrorHead()
    x = torch.randn(4, settings.fusion_dim)
    cpl, blunder = head(x)
    assert cpl.shape == (4, 1)
    assert blunder.shape == (4, 1)


def test_full_model_forward(board_input, seq_input, player_id, player_stats, batch_size):
    model = MovePredictor()
    phase = torch.randint(0, 3, (batch_size,))
    mask = torch.ones(batch_size, settings.move_vocab_size, dtype=torch.bool)

    outputs = model(
        board_tensor=board_input,
        move_history=seq_input,
        player_id=player_id,
        player_stats=player_stats,
        game_phase=phase,
        legal_move_mask=mask,
    )

    assert "policy_logits" in outputs
    assert "policy_probs" in outputs
    assert "value" in outputs
    assert "cpl_pred" in outputs
    assert "blunder_logit" in outputs

    assert outputs["policy_logits"].shape == (batch_size, settings.move_vocab_size)
    assert outputs["policy_probs"].shape == (batch_size, settings.move_vocab_size)
    assert outputs["value"].shape == (batch_size, 1)
    assert outputs["cpl_pred"].shape == (batch_size, 1)
    assert outputs["blunder_logit"].shape == (batch_size, 1)

    # Probabilities should sum to ~1
    prob_sums = outputs["policy_probs"].sum(dim=-1)
    assert torch.allclose(prob_sums, torch.ones(batch_size), atol=1e-5)


def test_model_parameter_count():
    model = MovePredictor()
    counts = model.count_parameters()
    assert counts["total"] > 0
    assert counts["board_encoder"] > 0
    assert counts["sequence_encoder"] > 0
    print(f"Model parameters: {counts}")


def test_phase_freezing():
    model = MovePredictor()

    # Phase 1: player embeddings frozen
    model.freeze_for_phase1()
    assert not model.player_embedding.player_embedding.weight.requires_grad

    # Phase 2: embeddings unfrozen, early blocks frozen
    model.setup_for_phase2()
    assert model.player_embedding.player_embedding.weight.requires_grad

    # Phase 3: everything frozen except player embedding
    model.setup_for_phase3()
    assert model.player_embedding.player_embedding.weight.requires_grad
    assert not model.board_encoder.input_conv[0].weight.requires_grad
