#!/bin/bash
set -e

RATING_MIN=${1:-1400}
RATING_MAX=${2:-1600}
MONTH=${3:-2024-01}
MAX_GAMES=${4:-50000}

echo "=== Training model for ${RATING_MIN}-${RATING_MAX} rated players ==="

# Step 1: Download and filter games
echo "Step 1: Downloading games..."
python3 scripts/download_lichess_data.py \
  --month "$MONTH" \
  --rating-min "$RATING_MIN" \
  --rating-max "$RATING_MAX" \
  --max-games "$MAX_GAMES"

# Step 2: Preprocess into HDF5
echo "Step 2: Preprocessing..."
python3 scripts/preprocess_corpus.py \
  "data/raw/lichess_${MONTH}_${RATING_MIN}-${RATING_MAX}.pgn" \
  --output "data/processed/train_${RATING_MIN}_${RATING_MAX}.h5" \
  --val-split 0.05

# Step 3: Train
echo "Step 3: Training Phase 1..."
python3 scripts/train.py \
  --phase 1 \
  --data "data/processed/train_${RATING_MIN}_${RATING_MAX}.h5" \
  --val-data "data/processed/val_${RATING_MIN}_${RATING_MAX}.h5" \
  --epochs 10 \
  --batch-size 512 \
  --checkpoint-dir "data/checkpoints/${RATING_MIN}_${RATING_MAX}"

echo "=== Training complete ==="
echo "Checkpoint saved to data/checkpoints/${RATING_MIN}_${RATING_MAX}/"
