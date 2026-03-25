"""Game Sequence Encoder: Transformer over move history.

Encodes the last T moves (as move vocabulary indices) into a fixed-size
feature vector using a Transformer encoder with learned positional embeddings.
"""

import torch
import torch.nn as nn
import math

from src.config import settings


class SequenceEncoder(nn.Module):
    """Transformer-based move sequence encoder.

    Input:  (B, T) — integer move indices from the 1858-move vocabulary
    Output: (B, d_model) — sequence feature vector
    """

    def __init__(
        self,
        vocab_size: int = settings.move_vocab_size,
        d_model: int = settings.d_model,
        nhead: int = settings.transformer_heads,
        num_layers: int = settings.transformer_layers,
        max_seq_len: int = settings.history_length,
        dim_feedforward: int = 512,
        dropout: float = 0.1,
        num_phases: int = 3,
    ):
        super().__init__()

        self.d_model = d_model

        # Move embedding: vocabulary index → d_model vector
        # Index 0 is reserved as padding
        self.move_embedding = nn.Embedding(vocab_size + 1, d_model, padding_idx=0)

        # Learned positional embedding for sequence positions
        self.pos_embedding = nn.Embedding(max_seq_len, d_model)

        # Game phase embedding (opening=0, middlegame=1, endgame=2)
        self.phase_embedding = nn.Embedding(num_phases, d_model)

        # Transformer encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            batch_first=True,
            norm_first=True,  # Pre-LN for more stable training
        )
        self.transformer = nn.TransformerEncoder(
            encoder_layer,
            num_layers=num_layers,
        )

        self.layer_norm = nn.LayerNorm(d_model)
        self.output_dim = d_model

    def forward(
        self,
        move_indices: torch.Tensor,
        game_phase: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """
        Args:
            move_indices: (B, T) integer tensor of move indices.
            game_phase: (B,) integer tensor of game phase (0/1/2), optional.

        Returns:
            Feature vector of shape (B, d_model).
        """
        B, T = move_indices.shape

        # Create padding mask (True = ignore)
        padding_mask = move_indices == 0  # (B, T)

        # Embed moves
        x = self.move_embedding(move_indices)  # (B, T, d_model)

        # Add positional embeddings
        positions = torch.arange(T, device=move_indices.device)
        x = x + self.pos_embedding(positions).unsqueeze(0)  # broadcast over batch

        # Add game phase embedding if provided
        if game_phase is not None:
            phase_emb = self.phase_embedding(game_phase)  # (B, d_model)
            x = x + phase_emb.unsqueeze(1)  # broadcast over sequence

        # Scale by sqrt(d_model) for stability
        x = x * math.sqrt(self.d_model)

        # Transformer encoding
        x = self.transformer(x, src_key_padding_mask=padding_mask)  # (B, T, d_model)

        # Mean pool over non-padded positions
        mask_expanded = (~padding_mask).unsqueeze(-1).float()  # (B, T, 1)
        pooled = (x * mask_expanded).sum(dim=1)  # (B, d_model)
        counts = mask_expanded.sum(dim=1).clamp(min=1)  # (B, 1)
        pooled = pooled / counts

        pooled = self.layer_norm(pooled)
        return pooled
