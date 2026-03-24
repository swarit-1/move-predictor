"""Training entry point.

Usage:
    python scripts/train.py --phase 1 --data data/processed/train.h5
    python scripts/train.py --phase 2 --data data/processed/train.h5 --checkpoint data/checkpoints/phase1_best.pt
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import torch

from src.models.move_predictor import MovePredictor
from src.data.dataset import create_dataloaders
from src.training.trainer import Trainer


def main():
    parser = argparse.ArgumentParser(description="Train the move predictor model")
    parser.add_argument("--phase", type=int, default=1, choices=[1, 2, 3])
    parser.add_argument("--data", default="data/processed/train.h5", help="Training data")
    parser.add_argument("--val-data", default="data/processed/val.h5", help="Validation data")
    parser.add_argument("--checkpoint", default=None, help="Checkpoint to resume from")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=1024)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--device", default=None, help="Device (cuda/cpu/mps)")
    parser.add_argument("--checkpoint-dir", default="data/checkpoints")
    parser.add_argument("--log-dir", default="runs")

    args = parser.parse_args()

    # Initialize model
    model = MovePredictor()
    print(f"Model parameters: {model.count_parameters()}")

    # Load checkpoint if provided
    if args.checkpoint:
        checkpoint = torch.load(args.checkpoint, map_location="cpu")
        model.load_state_dict(checkpoint["model_state_dict"])
        print(f"Loaded checkpoint from {args.checkpoint}")

    # Adjust learning rate for different phases
    lr = args.lr
    if args.phase >= 2:
        lr = min(lr, 1e-4)

    # Create data loaders
    train_loader, val_loader = create_dataloaders(
        train_data=args.data,
        val_data=args.val_data,
        batch_size=args.batch_size,
    )

    # Train
    trainer = Trainer(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        lr=lr,
        num_epochs=args.epochs,
        checkpoint_dir=args.checkpoint_dir,
        log_dir=args.log_dir,
        device=args.device,
        phase=args.phase,
    )

    trainer.train()


if __name__ == "__main__":
    main()
