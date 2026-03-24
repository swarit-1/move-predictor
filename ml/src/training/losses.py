"""Multi-task loss functions for the move predictor.

Combined loss = λ_policy * CE(policy) + λ_value * MSE(value) + λ_cpl * MSE(cpl) + λ_blunder * BCE(blunder)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class MultiTaskLoss(nn.Module):
    """Combined loss for policy, value, and error prediction.

    Supports learnable loss weights (uncertainty-based) or fixed weights.
    """

    def __init__(
        self,
        policy_weight: float = 1.0,
        value_weight: float = 0.5,
        cpl_weight: float = 0.5,
        blunder_weight: float = 0.5,
        learnable_weights: bool = False,
    ):
        super().__init__()

        if learnable_weights:
            # Log-variance parameters for uncertainty-based weighting
            # (Kendall et al., "Multi-Task Learning Using Uncertainty")
            self.log_var_policy = nn.Parameter(torch.zeros(1))
            self.log_var_value = nn.Parameter(torch.zeros(1))
            self.log_var_cpl = nn.Parameter(torch.zeros(1))
            self.log_var_blunder = nn.Parameter(torch.zeros(1))
        else:
            self.register_buffer("w_policy", torch.tensor(policy_weight))
            self.register_buffer("w_value", torch.tensor(value_weight))
            self.register_buffer("w_cpl", torch.tensor(cpl_weight))
            self.register_buffer("w_blunder", torch.tensor(blunder_weight))

        self.learnable_weights = learnable_weights

    def forward(
        self,
        policy_logits: torch.Tensor,
        move_targets: torch.Tensor,
        value_pred: torch.Tensor,
        value_targets: torch.Tensor,
        cpl_pred: torch.Tensor,
        cpl_targets: torch.Tensor,
        blunder_logit: torch.Tensor,
        blunder_targets: torch.Tensor,
    ) -> dict[str, torch.Tensor]:
        """Compute multi-task loss.

        Args:
            policy_logits: (B, vocab_size) raw logits.
            move_targets: (B,) integer move indices.
            value_pred: (B, 1) predicted eval.
            value_targets: (B,) target eval.
            cpl_pred: (B, 1) predicted centipawn loss.
            cpl_targets: (B,) target centipawn loss.
            blunder_logit: (B, 1) blunder logit.
            blunder_targets: (B,) blunder indicator (0 or 1).

        Returns:
            Dict with "total", "policy", "value", "cpl", "blunder" losses.
        """
        # Policy: cross-entropy over move vocabulary
        loss_policy = F.cross_entropy(policy_logits, move_targets)

        # Value: MSE between predicted and target evaluation
        loss_value = F.mse_loss(value_pred.squeeze(-1), value_targets)

        # CPL: MSE between predicted and actual centipawn loss
        loss_cpl = F.mse_loss(cpl_pred.squeeze(-1), cpl_targets)

        # Blunder: binary cross-entropy
        loss_blunder = F.binary_cross_entropy_with_logits(
            blunder_logit.squeeze(-1), blunder_targets
        )

        if self.learnable_weights:
            # Uncertainty-based weighting
            total = (
                torch.exp(-self.log_var_policy) * loss_policy + self.log_var_policy
                + torch.exp(-self.log_var_value) * loss_value + self.log_var_value
                + torch.exp(-self.log_var_cpl) * loss_cpl + self.log_var_cpl
                + torch.exp(-self.log_var_blunder) * loss_blunder + self.log_var_blunder
            )
        else:
            total = (
                self.w_policy * loss_policy
                + self.w_value * loss_value
                + self.w_cpl * loss_cpl
                + self.w_blunder * loss_blunder
            )

        return {
            "total": total,
            "policy": loss_policy,
            "value": loss_value,
            "cpl": loss_cpl,
            "blunder": loss_blunder,
        }
