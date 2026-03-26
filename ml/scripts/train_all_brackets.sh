#!/bin/bash
# Train models for each rating bracket.
# Each bracket gets its own checkpoint so the pipeline can load the
# right one based on the target rating.
#
# Usage:
#   bash scripts/train_all_brackets.sh [month] [max_games]
#   bash scripts/train_all_brackets.sh 2024-01 30000

set -e

MONTH=${1:-2024-01}
MAX_GAMES=${2:-30000}

for bracket in "400 800" "800 1000" "1000 1200" "1200 1400" "1400 1600" "1600 1800" "1800 2000" "2000 2200" "2200 2500"; do
  read -r MIN MAX <<< "$bracket"
  echo ""
  echo "========================================"
  echo "  Training $MIN-$MAX bracket"
  echo "========================================"
  bash scripts/train_rating_bracket.sh "$MIN" "$MAX" "$MONTH" "$MAX_GAMES"
done

echo ""
echo "All brackets trained!"
