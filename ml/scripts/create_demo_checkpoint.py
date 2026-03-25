#!/usr/bin/env python3
"""Create a demo checkpoint with randomly initialized model weights.

This is useful for testing the inference pipeline without running a full
training cycle. The checkpoint uses the default model architecture.
"""

import sys
from pathlib import Path

# Ensure the project root is on sys.path so `src.*` imports work
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

import torch
from src.models.move_predictor import MovePredictor


def main():
    output_dir = project_root / "data" / "checkpoints"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "demo_checkpoint.pt"

    print("Initializing MovePredictor with default settings...")
    model = MovePredictor()

    param_counts = model.count_parameters()
    print(f"Model has {param_counts['total']:,} trainable parameters")

    checkpoint = {
        "model_state_dict": model.state_dict(),
    }

    torch.save(checkpoint, output_path)
    print(f"Saved demo checkpoint to {output_path}")
    print(
        "Note: This checkpoint contains randomly initialized weights and is "
        "intended for testing the inference pipeline only."
    )


if __name__ == "__main__":
    main()
