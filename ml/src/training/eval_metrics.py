"""Evaluation metrics for model performance.

Computes accuracy, KL divergence, and other metrics for the move predictor.
"""

import torch
import numpy as np
from sklearn.metrics import roc_auc_score


class MetricsTracker:
    """Accumulates predictions and computes metrics over an epoch."""

    def __init__(self):
        self.reset()

    def reset(self):
        self._policy_correct_top1 = 0
        self._policy_correct_top5 = 0
        self._total = 0
        self._cpl_errors = []
        self._blunder_preds = []
        self._blunder_targets = []
        self._value_errors = []

    def update(
        self,
        policy_logits: torch.Tensor,
        move_targets: torch.Tensor,
        cpl_pred: torch.Tensor,
        cpl_targets: torch.Tensor,
        blunder_logit: torch.Tensor,
        blunder_targets: torch.Tensor,
        value_pred: torch.Tensor,
        value_targets: torch.Tensor,
    ):
        """Update metrics with a batch of predictions."""
        B = move_targets.shape[0]
        self._total += B

        # Top-1 accuracy
        top1_preds = policy_logits.argmax(dim=-1)
        self._policy_correct_top1 += (top1_preds == move_targets).sum().item()

        # Top-5 accuracy
        top5_preds = policy_logits.topk(5, dim=-1).indices
        target_expanded = move_targets.unsqueeze(-1).expand_as(top5_preds)
        self._policy_correct_top5 += (top5_preds == target_expanded).any(dim=-1).sum().item()

        # CPL prediction error
        cpl_error = (cpl_pred.squeeze(-1) - cpl_targets).abs()
        self._cpl_errors.extend(cpl_error.detach().cpu().numpy().tolist())

        # Blunder predictions
        blunder_prob = torch.sigmoid(blunder_logit.squeeze(-1))
        self._blunder_preds.extend(blunder_prob.detach().cpu().numpy().tolist())
        self._blunder_targets.extend(blunder_targets.detach().cpu().numpy().tolist())

        # Value prediction error
        value_error = (value_pred.squeeze(-1) - value_targets).abs()
        self._value_errors.extend(value_error.detach().cpu().numpy().tolist())

    def compute(self) -> dict[str, float]:
        """Compute all metrics.

        Returns:
            Dict with metric names and values.
        """
        metrics = {}

        if self._total > 0:
            metrics["top1_accuracy"] = self._policy_correct_top1 / self._total
            metrics["top5_accuracy"] = self._policy_correct_top5 / self._total

        if self._cpl_errors:
            metrics["cpl_mae"] = float(np.mean(self._cpl_errors))

        if self._value_errors:
            metrics["value_mae"] = float(np.mean(self._value_errors))

        if self._blunder_preds and len(set(self._blunder_targets)) > 1:
            try:
                metrics["blunder_auc"] = roc_auc_score(
                    self._blunder_targets, self._blunder_preds
                )
            except ValueError:
                metrics["blunder_auc"] = 0.0

        # Behavioral metrics: how "human-like" is the predicted distribution
        if self._blunder_preds and self._blunder_targets:
            preds = np.array(self._blunder_preds)
            targets = np.array(self._blunder_targets)

            # Blunder calibration: predicted blunder rate should match actual rate
            pred_rate = float(np.mean(preds > 0.5))
            actual_rate = float(np.mean(targets))
            metrics["blunder_calibration"] = 1.0 - abs(pred_rate - actual_rate)

            # CPL distribution similarity: how close the predicted CPL distribution
            # is to the actual one (measured by correlation)
            if self._cpl_errors and len(self._cpl_errors) > 10:
                cpl_arr = np.array(self._cpl_errors)
                # Percentile match: compare predicted vs actual CPL at key percentiles
                metrics["cpl_p50"] = float(np.percentile(cpl_arr, 50))
                metrics["cpl_p90"] = float(np.percentile(cpl_arr, 90))

        return metrics
