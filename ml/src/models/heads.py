"""Multi-task output heads: Policy, Value, and Error.

Policy Head:  Predicts move probability distribution over 1858-move vocabulary.
Value Head:   Predicts position evaluation [-1, 1] (from moving side's perspective).
Error Head:   Predicts centipawn loss and blunder probability.
"""

import torch
import torch.nn as nn

from src.config import settings


class PolicyHead(nn.Module):
    """Predict probability distribution over legal moves.

    Input:  (B, fusion_dim)
    Output: (B, move_vocab_size) — raw logits (apply mask + softmax externally)
    """

    def __init__(
        self,
        input_dim: int = settings.fusion_dim,
        vocab_size: int = settings.move_vocab_size,
    ):
        super().__init__()
        self.fc = nn.Linear(input_dim, vocab_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.fc(x)  # (B, vocab_size)


class ValueHead(nn.Module):
    """Predict position evaluation.

    Input:  (B, fusion_dim)
    Output: (B, 1) — evaluation in [-1, 1]
    """

    def __init__(
        self,
        input_dim: int = settings.fusion_dim,
        hidden_dim: int = 256,
    ):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(inplace=True),
            nn.Linear(hidden_dim, 1),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)  # (B, 1)


class ErrorHead(nn.Module):
    """Predict centipawn loss and blunder probability.

    Input:  (B, fusion_dim)
    Output: (B, 2) — [centipawn_loss_pred, blunder_logit]
        - centipawn_loss_pred: predicted CPL (ReLU'd at inference, always >= 0)
        - blunder_logit: raw logit for blunder probability (sigmoid externally)
    """

    def __init__(
        self,
        input_dim: int = settings.fusion_dim,
        hidden_dim: int = 256,
    ):
        super().__init__()
        self.shared = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(inplace=True),
        )
        self.cpl_head = nn.Linear(hidden_dim, 1)
        self.blunder_head = nn.Linear(hidden_dim, 1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Returns:
            cpl_pred: (B, 1) predicted centipawn loss
            blunder_logit: (B, 1) blunder probability logit
        """
        shared = self.shared(x)
        cpl = self.cpl_head(shared)  # (B, 1)
        blunder = self.blunder_head(shared)  # (B, 1)
        return cpl, blunder
