#!/bin/bash
# Top-level driver for PRD §5.4 — download the Lichess training corpus
# and bracket-filter it for all nine rating buckets.
#
# This is step 1 of the full training pipeline:
#   1. scripts/download_corpus.sh        — fetch + filter raw PGNs
#   2. scripts/preprocess_corpus.py      — turn PGNs into HDF5 tensors
#   3. scripts/train_all_brackets.sh     — train Phase 1 per bracket
#   4. scripts/smoke_test_humanization.py — verify each checkpoint
#
# Usage:
#   bash scripts/download_corpus.sh [month] [max_games_per_bracket]
#
# Defaults:
#   month                 = 2024-01
#   max_games_per_bracket = 30000
#
# Wall-clock estimate: 6–24 hours per month per bracket on broadband.
# Disk estimate: ~600 MB of filtered PGN per bracket per month.
#
# Prereqs:
#   - curl, zstd installed (apt install zstd / brew install zstd)
#   - Python deps installed (pip install -e ".[dev]" from ml/)
#   - LICHESS_API_TOKEN exported (optional; raises Lichess rate limit
#     from 20 → 30 req/s)
#
# What this script does NOT do:
#   - Training (run train_all_brackets.sh after this)
#   - Smoke test (run smoke_test_humanization.py after training)
#   - Stockfish annotation (pass --stockfish to preprocess if desired;
#     adds ~10× wall-clock but yields per-position eval/CPL labels)

set -euo pipefail

MONTH=${1:-2024-01}
MAX_GAMES=${2:-30000}

cd "$(dirname "$0")/.."

mkdir -p data/raw data/processed data/checkpoints

echo ""
echo "========================================================"
echo "  PRD §5.4 — Download corpus"
echo "  Month:           $MONTH"
echo "  Max games each:  $MAX_GAMES"
echo "  Output dir:      data/raw/"
echo "========================================================"

# Same nine brackets the prediction pipeline picks from at runtime.
# Keep in sync with PredictionPipeline._bracket_checkpoint_path().
BRACKETS=(
  "400 800"
  "800 1000"
  "1000 1200"
  "1200 1400"
  "1400 1600"
  "1600 1800"
  "1800 2000"
  "2000 2200"
  "2200 2500"
)

for bracket in "${BRACKETS[@]}"; do
  read -r MIN MAX <<< "$bracket"
  out="data/raw/lichess_${MONTH}_${MIN}-${MAX}.pgn"
  if [ -f "$out" ]; then
    echo ""
    echo "Bracket $MIN-$MAX: $out already exists — skipping."
    continue
  fi
  echo ""
  echo "--- Bracket $MIN-$MAX ---"
  python3 scripts/download_lichess_data.py \
    --month "$MONTH" \
    --rating-min "$MIN" \
    --rating-max "$MAX" \
    --max-games "$MAX_GAMES" \
    --output-dir data/raw
done

echo ""
echo "========================================================"
echo "  Download complete. Next steps:"
echo "  1. bash scripts/train_all_brackets.sh $MONTH $MAX_GAMES"
echo "  2. for c in data/checkpoints/*/phase1_best.pt; do"
echo "       python3 scripts/smoke_test_humanization.py --checkpoint \"\$c\""
echo "     done"
echo "========================================================"
