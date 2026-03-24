"""Player Embedding Module: learned per-player representation.

Combines a learned discrete embedding per player with continuous features
(rating, style statistics) to produce a fixed-size player vector.
"""

import torch
import torch.nn as nn

from src.config import settings


class PlayerEmbeddingModule(nn.Module):
    """Player embedding that fuses discrete ID embedding with continuous stats.

    Input:
        player_id: (B,) integer player index
        player_stats: (B, num_stats) continuous features (rating, aggression, etc.)
    Output:
        (B, embed_dim) player feature vector
    """

    def __init__(
        self,
        max_players: int = settings.max_players,
        embed_dim: int = settings.player_embed_dim,
        num_stats: int = settings.num_player_stats,
    ):
        super().__init__()

        self.embed_dim = embed_dim

        # Discrete player embedding
        # Index 0 = unknown/anonymous player
        self.player_embedding = nn.Embedding(max_players + 1, embed_dim, padding_idx=0)

        # Project continuous stats + discrete embedding to final dim
        self.projection = nn.Sequential(
            nn.Linear(embed_dim + num_stats, embed_dim),
            nn.ReLU(inplace=True),
            nn.Linear(embed_dim, embed_dim),
        )

        self.layer_norm = nn.LayerNorm(embed_dim)
        self.output_dim = embed_dim

        self._init_weights()

    def _init_weights(self):
        """Initialize embedding with small random values."""
        nn.init.normal_(self.player_embedding.weight, mean=0.0, std=0.02)
        # Keep padding at zero
        with torch.no_grad():
            self.player_embedding.weight[0].fill_(0)

    def forward(
        self,
        player_id: torch.Tensor,
        player_stats: torch.Tensor,
    ) -> torch.Tensor:
        """
        Args:
            player_id: (B,) integer tensor of player indices.
            player_stats: (B, num_stats) continuous player features.

        Returns:
            Player feature vector of shape (B, embed_dim).
        """
        # Discrete embedding
        emb = self.player_embedding(player_id)  # (B, embed_dim)

        # Concatenate with continuous stats
        combined = torch.cat([emb, player_stats], dim=-1)  # (B, embed_dim + num_stats)

        # Project to final dim
        out = self.projection(combined)  # (B, embed_dim)
        out = self.layer_norm(out)
        return out

    def get_embedding(self, player_id: torch.Tensor) -> torch.Tensor:
        """Get just the discrete embedding (for fine-tuning/analysis)."""
        return self.player_embedding(player_id)

    def freeze_embeddings(self):
        """Freeze the player embedding table (for Phase 1 pretraining)."""
        self.player_embedding.requires_grad_(False)

    def unfreeze_embeddings(self):
        """Unfreeze embeddings (for Phase 2 fine-tuning)."""
        self.player_embedding.requires_grad_(True)
