"""Full assembled Move Predictor model.

Combines all sub-modules into a single nn.Module:
  BoardEncoder → ResNet tower
  SequenceEncoder → Transformer over move history
  PlayerEmbeddingModule → learned per-player embedding
  SkillAwareFusion → gated multi-modal fusion
  PolicyHead → move probability logits
  ValueHead → position evaluation
  ErrorHead → centipawn loss + blunder probability
"""

import torch
import torch.nn as nn

from src.models.board_encoder import BoardEncoder
from src.models.sequence_encoder import SequenceEncoder
from src.models.player_embedding import PlayerEmbeddingModule
from src.models.fusion import SkillAwareFusion
from src.models.heads import PolicyHead, ValueHead, ErrorHead
from src.config import settings


class MovePredictor(nn.Module):
    """Human-aware chess move prediction model.

    Multi-task model that predicts:
    1. Move probability distribution (policy)
    2. Position evaluation (value)
    3. Expected centipawn loss and blunder probability (error)
    """

    def __init__(self):
        super().__init__()

        # Sub-modules
        self.board_encoder = BoardEncoder()
        self.sequence_encoder = SequenceEncoder()
        self.player_embedding = PlayerEmbeddingModule()
        self.fusion = SkillAwareFusion(
            board_dim=self.board_encoder.output_dim,
            seq_dim=self.sequence_encoder.output_dim,
            player_dim=self.player_embedding.output_dim,
        )

        # Output heads
        self.policy_head = PolicyHead(input_dim=self.fusion.output_dim)
        self.value_head = ValueHead(input_dim=self.fusion.output_dim)
        self.error_head = ErrorHead(input_dim=self.fusion.output_dim)

    def forward(
        self,
        board_tensor: torch.Tensor,
        move_history: torch.Tensor,
        player_id: torch.Tensor,
        player_stats: torch.Tensor,
        game_phase: torch.Tensor | None = None,
        legal_move_mask: torch.Tensor | None = None,
    ) -> dict[str, torch.Tensor]:
        """
        Args:
            board_tensor: (B, 18, 8, 8) board state.
            move_history: (B, T) move index history.
            player_id: (B,) player ID.
            player_stats: (B, num_stats) continuous player features.
            game_phase: (B,) game phase (0/1/2), optional.
            legal_move_mask: (B, vocab_size) boolean mask, optional.

        Returns:
            Dict with keys:
                "policy_logits": (B, vocab_size)
                "policy_probs": (B, vocab_size) — softmax with illegal moves zeroed
                "value": (B, 1) — position evaluation [-1, 1]
                "cpl_pred": (B, 1) — predicted centipawn loss
                "blunder_logit": (B, 1) — blunder probability logit
        """
        # Encode each modality
        board_features = self.board_encoder(board_tensor)
        seq_features = self.sequence_encoder(move_history, game_phase)
        player_features = self.player_embedding(player_id, player_stats)

        # Fuse
        fused = self.fusion(board_features, seq_features, player_features)

        # Output heads
        policy_logits = self.policy_head(fused)
        value = self.value_head(fused)
        cpl_pred, blunder_logit = self.error_head(fused)

        # Mask illegal moves for probability computation
        if legal_move_mask is not None:
            # Pad mask if it's smaller than policy logits (encoding table vs config mismatch)
            if legal_move_mask.shape[-1] < policy_logits.shape[-1]:
                pad_size = policy_logits.shape[-1] - legal_move_mask.shape[-1]
                legal_move_mask = torch.nn.functional.pad(legal_move_mask, (0, pad_size), value=False)
            masked_logits = policy_logits.clone()
            masked_logits[~legal_move_mask] = float("-inf")
            policy_probs = torch.softmax(masked_logits, dim=-1)
        else:
            policy_probs = torch.softmax(policy_logits, dim=-1)

        return {
            "policy_logits": policy_logits,
            "policy_probs": policy_probs,
            "value": value,
            "cpl_pred": cpl_pred,
            "blunder_logit": blunder_logit,
        }

    def count_parameters(self) -> dict[str, int]:
        """Count trainable parameters per sub-module."""
        counts = {}
        for name, module in [
            ("board_encoder", self.board_encoder),
            ("sequence_encoder", self.sequence_encoder),
            ("player_embedding", self.player_embedding),
            ("fusion", self.fusion),
            ("policy_head", self.policy_head),
            ("value_head", self.value_head),
            ("error_head", self.error_head),
        ]:
            counts[name] = sum(p.numel() for p in module.parameters() if p.requires_grad)
        counts["total"] = sum(counts.values())
        return counts

    def freeze_for_phase1(self):
        """Freeze player embeddings for Phase 1 pretraining."""
        self.player_embedding.freeze_embeddings()

    def setup_for_phase2(self):
        """Set up for Phase 2 fine-tuning: freeze early ResNet blocks."""
        self.player_embedding.unfreeze_embeddings()

        # Freeze first 10 residual blocks, keep last 5 trainable
        blocks = list(self.board_encoder.blocks)
        for block in blocks[:10]:
            for param in block.parameters():
                param.requires_grad = False

    def setup_for_phase3(self):
        """Set up for Phase 3 few-shot: freeze everything except player embedding."""
        for param in self.parameters():
            param.requires_grad = False
        self.player_embedding.unfreeze_embeddings()
