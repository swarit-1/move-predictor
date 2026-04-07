"""Training loop with multi-task loss, checkpointing, and TensorBoard logging.

Supports all three training phases:
  Phase 1: Pretrain on large corpus (no player identity)
  Phase 2: Fine-tune with player embeddings
  Phase 3: Few-shot player adaptation
"""

import logging
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torch.cuda.amp import GradScaler, autocast
from torch.utils.tensorboard import SummaryWriter

from src.models.move_predictor import MovePredictor
from src.training.losses import MultiTaskLoss
from src.training.eval_metrics import MetricsTracker
from src.config import settings

logger = logging.getLogger(__name__)


class Trainer:
    """Training loop for the MovePredictor model."""

    def __init__(
        self,
        model: MovePredictor,
        train_loader: DataLoader,
        val_loader: DataLoader,
        lr: float = settings.learning_rate,
        weight_decay: float = 1e-4,
        num_epochs: int = settings.num_epochs,
        checkpoint_dir: str = settings.checkpoint_dir,
        log_dir: str = settings.log_dir,
        device: str | None = None,
        phase: int = 1,
    ):
        self.model = model
        self.train_loader = train_loader
        self.val_loader = val_loader
        self.num_epochs = num_epochs
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

        # Device
        if device is None:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)
        self.model = self.model.to(self.device)

        # Phase-specific setup
        self.phase = phase
        if phase == 1:
            model.freeze_for_phase1()
        elif phase == 2:
            model.setup_for_phase2()
        elif phase == 3:
            model.setup_for_phase3()

        # Optimizer (only for trainable parameters)
        trainable_params = [p for p in model.parameters() if p.requires_grad]
        self.optimizer = torch.optim.AdamW(
            trainable_params,
            lr=lr,
            weight_decay=weight_decay,
        )

        # Learning rate scheduler
        total_steps = len(train_loader) * num_epochs
        self.scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            self.optimizer,
            T_max=total_steps,
        )

        # Loss
        policy_weight = 2.0 if phase >= 2 else 1.0
        self.criterion = MultiTaskLoss(policy_weight=policy_weight).to(self.device)

        # Mixed precision
        self.use_amp = self.device.type == "cuda"
        self.scaler = GradScaler(enabled=self.use_amp)

        # Logging
        self.writer = SummaryWriter(log_dir=log_dir)
        self.global_step = 0
        self.best_val_accuracy = 0.0

    def train(self):
        """Run the full training loop."""
        logger.info(
            f"Starting Phase {self.phase} training: {self.num_epochs} epochs, "
            f"device={self.device}, amp={self.use_amp}"
        )
        logger.info(f"Trainable parameters: {sum(p.numel() for p in self.model.parameters() if p.requires_grad):,}")

        for epoch in range(self.num_epochs):
            train_losses = self._train_epoch(epoch)
            val_metrics = self._validate(epoch)

            # Log epoch summary
            logger.info(
                f"Epoch {epoch+1}/{self.num_epochs} — "
                f"train_loss={train_losses['total']:.4f} "
                f"val_top1={val_metrics.get('top1_accuracy', 0):.4f} "
                f"val_top5={val_metrics.get('top5_accuracy', 0):.4f}"
            )

            # Save checkpoint
            self._save_checkpoint(epoch, val_metrics)

        self.writer.close()
        logger.info("Training complete.")

    def _train_epoch(self, epoch: int) -> dict[str, float]:
        """Train for one epoch."""
        self.model.train()
        epoch_losses = {"total": 0, "policy": 0, "value": 0, "cpl": 0, "blunder": 0}
        num_batches = 0

        for batch in self.train_loader:
            batch = {k: v.to(self.device) for k, v in batch.items()}

            self.optimizer.zero_grad()

            with autocast(device_type=self.device.type, enabled=self.use_amp):
                outputs = self.model(
                    board_tensor=batch["board_tensor"],
                    move_history=batch["move_history"],
                    player_id=batch["player_id"],
                    player_stats=batch["player_stats"],
                    game_phase=batch["game_phase"],
                    time_control=batch.get("time_control"),
                )

                losses = self.criterion(
                    policy_logits=outputs["policy_logits"],
                    move_targets=batch["move_index"],
                    value_pred=outputs["value"],
                    value_targets=batch["eval_score"],
                    cpl_pred=outputs["cpl_pred"],
                    cpl_targets=batch["centipawn_loss"],
                    blunder_logit=outputs["blunder_logit"],
                    blunder_targets=batch["is_blunder"],
                )

            self.scaler.scale(losses["total"]).backward()
            self.scaler.unscale_(self.optimizer)
            nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
            self.scaler.step(self.optimizer)
            self.scaler.update()
            self.scheduler.step()

            # Accumulate losses
            for key in epoch_losses:
                epoch_losses[key] += losses[key].item()
            num_batches += 1

            # Log to TensorBoard
            if self.global_step % 100 == 0:
                for key, val in losses.items():
                    self.writer.add_scalar(f"train/{key}_loss", val.item(), self.global_step)
                self.writer.add_scalar(
                    "train/lr", self.scheduler.get_last_lr()[0], self.global_step
                )

            self.global_step += 1

        return {k: v / max(num_batches, 1) for k, v in epoch_losses.items()}

    @torch.no_grad()
    def _validate(self, epoch: int) -> dict[str, float]:
        """Run validation and compute metrics."""
        self.model.eval()
        tracker = MetricsTracker()

        for batch in self.val_loader:
            batch = {k: v.to(self.device) for k, v in batch.items()}

            with autocast(device_type=self.device.type, enabled=self.use_amp):
                outputs = self.model(
                    board_tensor=batch["board_tensor"],
                    move_history=batch["move_history"],
                    player_id=batch["player_id"],
                    player_stats=batch["player_stats"],
                    game_phase=batch["game_phase"],
                    time_control=batch.get("time_control"),
                )

            tracker.update(
                policy_logits=outputs["policy_logits"],
                move_targets=batch["move_index"],
                cpl_pred=outputs["cpl_pred"],
                cpl_targets=batch["centipawn_loss"],
                blunder_logit=outputs["blunder_logit"],
                blunder_targets=batch["is_blunder"],
                value_pred=outputs["value"],
                value_targets=batch["eval_score"],
            )

        metrics = tracker.compute()

        # Log to TensorBoard
        for key, val in metrics.items():
            self.writer.add_scalar(f"val/{key}", val, epoch)

        return metrics

    def _save_checkpoint(self, epoch: int, metrics: dict[str, float]):
        """Save model checkpoint."""
        top1 = metrics.get("top1_accuracy", 0)

        # Save latest
        path = self.checkpoint_dir / f"phase{self.phase}_latest.pt"
        torch.save({
            "epoch": epoch,
            "model_state_dict": self.model.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "metrics": metrics,
            "phase": self.phase,
        }, path)

        # Save best
        if top1 > self.best_val_accuracy:
            self.best_val_accuracy = top1
            best_path = self.checkpoint_dir / f"phase{self.phase}_best.pt"
            torch.save({
                "epoch": epoch,
                "model_state_dict": self.model.state_dict(),
                "metrics": metrics,
                "phase": self.phase,
            }, best_path)
            logger.info(f"New best model: top1={top1:.4f}")
