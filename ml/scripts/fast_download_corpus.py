"""Fast multi-bracket Lichess corpus downloader.

Streams a monthly Lichess dump (curl | zstd -d) and filters games with
plain text/regex matching instead of python-chess parsing, which makes the
scan ~100x faster. One pass over the stream fills every requested rating
bracket at once.

Filters per game:
  - Both players' Elo inside the bracket
  - Rated Blitz games only
  - At least 10 full moves
  - Movetext contains [%eval ...] annotations (Lichess server analysis),
    so preprocessing can derive eval / centipawn-loss / blunder labels
    without running Stockfish locally.

Usage:
    python3 scripts/fast_download_corpus.py --month 2025-06 \
        --brackets 1000-1200 1400-1600 1800-2000 --max-games 8000
"""

import argparse
import re
import signal
import subprocess
import sys
import time
from pathlib import Path

RE_WHITE_ELO = re.compile(rb'\[WhiteElo "(\d+)"\]')
RE_BLACK_ELO = re.compile(rb'\[BlackElo "(\d+)"\]')
RE_MOVE_10 = re.compile(rb" 10\.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--month", required=True, help="Month to stream, e.g. 2025-06")
    parser.add_argument(
        "--brackets",
        nargs="+",
        default=["1000-1200", "1400-1600", "1800-2000"],
        help="Rating brackets as MIN-MAX",
    )
    parser.add_argument("--max-games", type=int, default=8000, help="Games per bracket")
    parser.add_argument("--output-dir", default="data/raw")
    parser.add_argument(
        "--require-eval",
        action="store_true",
        default=True,
        help="Keep only games with [%%eval] annotations (default on)",
    )
    parser.add_argument("--no-require-eval", dest="require_eval", action="store_false")
    args = parser.parse_args()

    brackets = []
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for spec in args.brackets:
        lo, hi = (int(x) for x in spec.split("-"))
        path = out_dir / f"lichess_{args.month}_{lo}-{hi}.pgn"
        brackets.append({
            "lo": lo, "hi": hi,
            "file": open(path, "wb"),
            "path": path,
            "saved": 0,
        })

    url = (
        f"https://database.lichess.org/standard/"
        f"lichess_db_standard_rated_{args.month}.pgn.zst"
    )
    print(f"Streaming {url}")
    print(f"Brackets: {args.brackets}, {args.max_games} games each, "
          f"require_eval={args.require_eval}", flush=True)

    proc = subprocess.Popen(
        f"curl -s '{url}' | zstd -d -c",
        shell=True,
        stdout=subprocess.PIPE,
        bufsize=1024 * 1024,
        preexec_fn=lambda: signal.signal(signal.SIGPIPE, signal.SIG_DFL),
    )

    scanned = 0
    t0 = time.time()
    game_lines: list[bytes] = []

    def flush_game():
        nonlocal scanned
        if not game_lines:
            return
        scanned += 1
        if scanned % 100_000 == 0:
            counts = ", ".join(f"{b['lo']}-{b['hi']}: {b['saved']}" for b in brackets)
            print(f"  scanned {scanned:,} games in {time.time()-t0:.0f}s | {counts}",
                  flush=True)
        block = b"".join(game_lines)
        # Cheap pre-filters on the whole block
        if b"Blitz" not in block:
            return
        if args.require_eval and b"%eval" not in block:
            return
        mw = RE_WHITE_ELO.search(block)
        mb = RE_BLACK_ELO.search(block)
        if not mw or not mb:
            return
        w, b_ = int(mw.group(1)), int(mb.group(1))
        for br in brackets:
            if br["saved"] >= args.max_games:
                continue
            if br["lo"] <= w <= br["hi"] and br["lo"] <= b_ <= br["hi"]:
                if not RE_MOVE_10.search(block):
                    return  # too short for any bracket
                br["file"].write(block + b"\n")
                br["saved"] += 1
                return

    try:
        for line in proc.stdout:
            if line.startswith(b"[Event "):
                flush_game()
                game_lines = [line]
                if all(b["saved"] >= args.max_games for b in brackets):
                    break
            else:
                game_lines.append(line)
        else:
            flush_game()
    finally:
        proc.kill()
        for br in brackets:
            br["file"].close()

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.0f}s. Scanned {scanned:,} games.")
    for br in brackets:
        size_mb = br["path"].stat().st_size / 1e6
        print(f"  {br['lo']}-{br['hi']}: {br['saved']} games -> {br['path']} "
              f"({size_mb:.0f} MB)")
    if any(br["saved"] < args.max_games for br in brackets):
        print("WARNING: some brackets did not reach max-games "
              "(stream ended or was interrupted)")
        sys.exit(2)


if __name__ == "__main__":
    main()
