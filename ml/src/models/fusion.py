"""Skill-Aware Fusion Layer.

Combines board features, sequence features, and player embeddings using
a gating mechanism where the player embedding modulates the fused
representation. This lets different player types weight board vs sequence
information differently.
"""

import torch
import torch.nn as nn

from src.config import settings


class SkillAwareFusion(nn.Module):
    """Fuse multi-modal inputs with player-conditioned gating.

    Input:
        board_features:    (B, board_dim)
        sequence_features: (B, seq_dim)
        player_features:   (B, player_dim)
    Output:
        (B, fusion_dim) fused feature vector
    """

    def __init__(
        self,
        board_dim: int = settings.resnet_channels,
        seq_dim: int = settings.d_model,
        player_dim: int = settings.player_embed_dim,
        fusion_dim: int = settings.fusion_dim,
    ):
        super().__init__()

        input_dim = board_dim + seq_dim + player_dim

        # Two-layer fusion MLP
        self.fusion_mlp = nn.Sequential(
            nn.Linear(input_dim, fusion_dim),
            nn.LayerNorm(fusion_dim),
            nn.ReLU(inplace=True),
            nn.Linear(fusion_dim, fusion_dim),
            nn.LayerNorm(fusion_dim),
            nn.ReLU(inplace=True),
        )

        # Player-conditioned gate: player features → gating weights
        self.gate = nn.Sequential(
            nn.Linear(player_dim, fusion_dim),
            nn.Sigmoid(),
        )

        self.output_dim = fusion_dim

    def forward(
        self,
        board_features: torch.Tensor,
        sequence_features: torch.Tensor,
        player_features: torch.Tensor,
    ) -> torch.Tensor:
        """
        Args:
            board_features: (B, board_dim) from BoardEncoder.
            sequence_features: (B, seq_dim) from SequenceEncoder.
            player_features: (B, player_dim) from PlayerEmbeddingModule.

        Returns:
            Fused features of shape (B, fusion_dim).
        """
        # Concatenate all inputs
        combined = torch.cat(
            [board_features, sequence_features, player_features],
            dim=-1,
        )  # (B, board_dim + seq_dim + player_dim)

        # Pass through fusion MLP
        fused = self.fusion_mlp(combined)  # (B, fusion_dim)

        # Apply player-conditioned gating
        gate_weights = self.gate(player_features)  # (B, fusion_dim)
        fused = fused * gate_weights  # element-wise gating

        return fused
