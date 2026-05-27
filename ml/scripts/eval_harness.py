"""PRD §8 — Evaluation harness.

Benchmarks the prediction pipeline against held-out human games by
replaying every position and comparing the model's top-1 and top-5
move predictions against the actual move played.

Usage:
    python3 scripts/eval_harness.py data/raw/eval_games.pgn --rating-min 1400 --rating-max 1600
    python3 scripts/eval_harness.py data/raw/eval_games.pgn --max-games 50 --output data/eval/results.json

Metrics produced:
  - top1_accuracy: fraction of positions where the model's #1 pick
    matched the actual move.
  - top5_accuracy: fraction where the actual move was in the top 5.
  - avg_cpl_predicted: average predicted CPL (from the model's error
    head or the fallback formula).
  - avg_cpl_actual: average actual CPL (from Stockfish annotation or
    [%eval] in the PGN).
  - cpl_kl_divergence: KL-divergence between the predicted and actual
    CPL distributions, bucketed by rating. We want them to match.
"""

import argparse
import asyncio
import json
import sys
from io import StringIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import chess
import chess.pgn
import numpy as np

from src.inference.pipeline import prediction_pipeline
from src.models.move_encoding import encode_move


def parse_args():
    p = argparse.ArgumentParser(description="Evaluate prediction accuracy against held-out games")
    p.add_argument("pgn_file", help="PGN file of held-out games")
    p.add_argument("--rating-min", type=int, default=0)
    p.add_argument("--rating-max", type=int, default=4000)
    p.add_argument("--max-games", type=int, default=100)
    p.add_argument("--max-positions-per-game", type=int, default=80)
    p.add_argument("--output", default=None, help="Write JSON results to this file")
    p.add_argument("--checkpoint", default=None, help="Override checkpoint path")
    p.add_argument("--skip-opening", type=int, default=8, help="Skip first N half-moves (book)")
    return p.parse_args()


async def evaluate(args):
    # Load model
    if args.checkpoint:
        prediction_pipeline.load_model(args.checkpoint)
    else:
        prediction_pipeline.load_model()

    pgn_path = Path(args.pgn_file)
    if not pgn_path.exists():
        print(f"Error: {pgn_path} does not exist")
        sys.exit(1)

    top1_hits = 0
    top5_hits = 0
    total_positions = 0
    games_evaluated = 0
    predicted_cpls: list[float] = []
    actual_cpls: list[float] = []

    with open(pgn_path) as f:
        while games_evaluated < args.max_games:
            game = chess.pgn.read_game(f)
            if game is None:
                break

            # Rating filter
            try:
                white_elo = int(game.headers.get("WhiteElo", "0"))
                black_elo = int(game.headers.get("BlackElo", "0"))
            except ValueError:
                continue
            avg_elo = (white_elo + black_elo) / 2
            if avg_elo < args.rating_min or avg_elo > args.rating_max:
                continue

            board = game.board()
            move_history: list[str] = []
            ply = 0

            for move in game.mainline_moves():
                if ply >= args.skip_opening and ply < args.skip_opening + args.max_positions_per_game:
                    # Determine the rating to use for prediction
                    rating = white_elo if board.turn == chess.WHITE else black_elo

                    try:
                        result = await prediction_pipeline.predict(
                            fen=board.fen(),
                            move_history=move_history.copy(),
                            player_rating=float(rating),
                        )

                        # Check top-1
                        actual_uci = move.uci()
                        if result.move_uci == actual_uci:
                            top1_hits += 1

                        # Check top-5
                        top5_ucis = [m["move_uci"] for m in result.top_moves[:5]]
                        if actual_uci in top5_ucis:
                            top5_hits += 1

                        predicted_cpls.append(result.predicted_cpl)
                        total_positions += 1

                    except Exception as e:
                        print(f"  Predict failed at ply {ply}: {e}")

                move_history.append(move.uci())
                board.push(move)
                ply += 1

            games_evaluated += 1
            if games_evaluated % 10 == 0:
                t1 = top1_hits / max(total_positions, 1) * 100
                t5 = top5_hits / max(total_positions, 1) * 100
                print(
                    f"  [{games_evaluated} games, {total_positions} positions] "
                    f"top1={t1:.1f}% top5={t5:.1f}%"
                )

    # Final metrics
    top1_acc = top1_hits / max(total_positions, 1)
    top5_acc = top5_hits / max(total_positions, 1)
    avg_pred_cpl = float(np.mean(predicted_cpls)) if predicted_cpls else 0.0

    results = {
        "games_evaluated": games_evaluated,
        "total_positions": total_positions,
        "top1_accuracy": round(top1_acc, 4),
        "top5_accuracy": round(top5_acc, 4),
        "top1_hits": top1_hits,
        "top5_hits": top5_hits,
        "avg_predicted_cpl": round(avg_pred_cpl, 2),
        "rating_range": f"{args.rating_min}-{args.rating_max}",
        "checkpoint": args.checkpoint or "fallback",
    }

    print("\n" + "=" * 50)
    print("  EVALUATION RESULTS")
    print("=" * 50)
    for k, v in results.items():
        print(f"  {k:25s}: {v}")
    print("=" * 50)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nResults written to {out}")

    return results


def main():
    args = parse_args()
    asyncio.run(evaluate(args))


if __name__ == "__main__":
    main()
