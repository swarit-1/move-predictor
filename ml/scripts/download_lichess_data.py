"""Download and filter Lichess game data by rating bracket.

Lichess publishes monthly database dumps at https://database.lichess.org/
Files are .pgn.zst (Zstandard compressed PGN).

Usage:
    python3 scripts/download_lichess_data.py --month 2024-01 --rating-min 1400 --rating-max 1600 --max-games 50000
    python3 scripts/download_lichess_data.py --month 2024-01 --rating-min 800 --rating-max 1000 --max-games 50000

Requirements:
    - curl and zstd must be installed (apt install zstd / brew install zstd)
"""

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import chess.pgn


def main():
    parser = argparse.ArgumentParser(
        description="Download and filter Lichess games by rating bracket"
    )
    parser.add_argument("--month", required=True, help="Month to download, e.g. 2024-01")
    parser.add_argument("--rating-min", type=int, default=1400)
    parser.add_argument("--rating-max", type=int, default=1600)
    parser.add_argument("--max-games", type=int, default=50000)
    parser.add_argument("--output-dir", default="data/raw")
    parser.add_argument(
        "--game-type",
        default="blitz",
        choices=["bullet", "blitz", "rapid", "classical"],
    )
    args = parser.parse_args()

    url = (
        f"https://database.lichess.org/standard/"
        f"lichess_db_standard_rated_{args.month}.pgn.zst"
    )
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = (
        output_dir / f"lichess_{args.month}_{args.rating_min}-{args.rating_max}.pgn"
    )

    print(f"Downloading and filtering {url}")
    print(f"Rating range: {args.rating_min}-{args.rating_max}")
    print(f"Game type: {args.game_type}")
    print(f"Max games: {args.max_games}")

    # Stream download + decompress + filter in one pipeline
    cmd = f"curl -s '{url}' | zstd -d"

    proc = subprocess.Popen(
        cmd, shell=True, stdout=subprocess.PIPE, text=True, bufsize=1
    )

    games_saved = 0
    games_scanned = 0

    with open(output_file, "w") as out:
        while games_saved < args.max_games:
            game = chess.pgn.read_game(proc.stdout)
            if game is None:
                break

            games_scanned += 1
            if games_scanned % 10000 == 0:
                print(f"  Scanned {games_scanned} games, saved {games_saved}...")

            headers = game.headers

            # Filter by rating — both players must be in range
            try:
                white_elo = int(headers.get("WhiteElo", "0"))
                black_elo = int(headers.get("BlackElo", "0"))
            except ValueError:
                continue

            if not (
                args.rating_min <= white_elo <= args.rating_max
                and args.rating_min <= black_elo <= args.rating_max
            ):
                continue

            # Filter by game type
            event = headers.get("Event", "").lower()
            if args.game_type not in event:
                continue

            # Skip very short games (likely abandons)
            moves = list(game.mainline_moves())
            if len(moves) < 10:
                continue

            # Write the game
            print(game, file=out, end="\n\n")
            games_saved += 1

            if games_saved % 1000 == 0:
                print(f"  Saved {games_saved} games...")

    proc.terminate()
    print(f"Done. Scanned {games_scanned}, saved {games_saved} games to {output_file}")


if __name__ == "__main__":
    main()
