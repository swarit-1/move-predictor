"""Smoke test: verify move quality differs by rating.

Run with: cd ml && python -m scripts.smoke_test_humanization
"""

import asyncio
import chess
from src.inference.pipeline import PredictionPipeline
from src.inference.sampler import StyleOverrides


async def test_rating_differentiation():
    pipeline = PredictionPipeline()
    pipeline.load_model()  # No checkpoint — uses fallback

    # Test position: Italian Game after 1.e4 e5 2.Nf3 Nc6 3.Bc4
    fen = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"
    move_history = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"]

    print("=" * 60)
    print("Humanization Smoke Test")
    print("Position: Italian Game (1.e4 e5 2.Nf3 Nc6 3.Bc4)")
    print("Running 100 predictions per rating level...")
    print("=" * 60)

    all_passed = True

    for rating in [800, 1200, 1600, 2000, 2400]:
        moves: dict[str, int] = {}
        for _ in range(100):
            result = await pipeline.predict(
                fen=fen,
                move_history=move_history,
                player_rating=float(rating),
            )
            uci = result.move_uci
            moves[uci] = moves.get(uci, 0) + 1

        # Sort by frequency
        sorted_moves = sorted(moves.items(), key=lambda x: -x[1])
        top_move_pct = sorted_moves[0][1]
        unique_moves = len(moves)

        print(f"\nRating {rating}:")
        print(f"  Top move: {sorted_moves[0][0]} ({top_move_pct}%)")
        print(f"  Unique moves: {unique_moves}")
        print(f"  Distribution: {sorted_moves[:5]}")

        # Checks
        passed = True
        if rating >= 2200:
            if top_move_pct < 40:
                print(f"  FAIL: top move only {top_move_pct}%, expected >=40%")
                passed = False
            if unique_moves > 10:
                print(f"  FAIL: {unique_moves} unique moves, expected <=10")
                passed = False
        elif rating <= 1000:
            if unique_moves < 4:
                print(f"  FAIL: only {unique_moves} unique moves, expected >=4")
                passed = False
        if passed:
            print("  PASS")
        else:
            all_passed = False

    print("\n" + "=" * 60)
    if all_passed:
        print("All rating differentiation checks passed!")
    else:
        print("Some checks FAILED — review output above.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_rating_differentiation())
