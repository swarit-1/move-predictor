"""Fetch games from Lichess for a player and store them locally."""

import asyncio
import argparse
import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.data.sources.lichess import fetch_player_games


async def main(username: str, max_games: int, output_dir: str):
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    output_file = output_path / f"{username}_lichess.pgn"
    count = 0

    print(f"Fetching up to {max_games} games for {username} from Lichess...")

    with open(output_file, "w") as f:
        async for pgn in fetch_player_games(username, max_games=max_games):
            f.write(pgn)
            f.write("\n\n")
            count += 1
            if count % 50 == 0:
                print(f"  Fetched {count} games...")

    print(f"Done. Saved {count} games to {output_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch Lichess games for a player")
    parser.add_argument("username", help="Lichess username")
    parser.add_argument("--max-games", type=int, default=500, help="Max games to fetch")
    parser.add_argument("--output-dir", default="data/raw", help="Output directory")

    args = parser.parse_args()
    asyncio.run(main(args.username, args.max_games, args.output_dir))
