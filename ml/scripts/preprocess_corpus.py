"""Preprocess PGN files into HDF5 training data.

Reads PGN files from data/raw/, extracts features for every position, and
derives eval / centipawn-loss / blunder labels from embedded Lichess
`[%eval]` annotations when present (games downloaded with
`fast_download_corpus.py` always have them). Positions from games without
annotations still train the policy head; their error labels stay 0.

Games are processed in parallel worker processes and streamed into the
output HDF5 files, so memory stays flat regardless of corpus size.

Usage:
    python3 scripts/preprocess_corpus.py data/raw/games.pgn --output data/processed/train.h5
    python3 scripts/preprocess_corpus.py data/raw/ --output data/processed/train.h5 --workers 8
"""

import argparse
import random
import sys
from io import StringIO
from multiprocessing import Pool
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import chess
import chess.pgn
import h5py
import numpy as np

from src.config import settings
from src.data.preprocessing import board_to_tensor, classify_game_phase
from src.data.feature_extraction import _parse_time_control_from_pgn
from src.models.move_encoding import encode_move

FIELDS = {
    "board_tensor": ("float32", (18, 8, 8)),
    "move_history": ("int64", (settings.history_length,)),
    "player_id": ("int64", ()),
    "player_stats": ("float32", (settings.num_player_stats,)),
    "game_phase": ("int64", ()),
    "time_control": ("int64", ()),
    "move_index": ("int64", ()),
    "eval_score": ("float32", ()),
    "centipawn_loss": ("float32", ()),
    "is_blunder": ("float32", ()),
}

# Blunder threshold in centipawns, matching src/engine/analysis.py
BLUNDER_CPL = 100.0
# Conventional evaluation of the starting position (white POV, centipawns)
STARTPOS_EVAL = 17.0


def process_game_text(pgn_text: str) -> dict[str, np.ndarray] | None:
    """Convert one PGN game into stacked per-position feature arrays.

    History indices are built incrementally (single pass) instead of
    replaying the full game per position.
    """
    game = chess.pgn.read_game(StringIO(pgn_text))
    if game is None:
        return None

    headers = game.headers
    try:
        white_elo = int(headers.get("WhiteElo", "1500"))
    except ValueError:
        white_elo = 1500
    try:
        black_elo = int(headers.get("BlackElo", "1500"))
    except ValueError:
        black_elo = 1500
    time_control = _parse_time_control_from_pgn(headers.get("TimeControl", ""))

    T = settings.history_length
    board = game.board()
    encoded_hist: list[int] = []
    prev_eval_white: float | None = STARTPOS_EVAL if board == chess.Board() else None

    rows: dict[str, list] = {name: [] for name in FIELDS}

    for node in game.mainline():
        move = node.move
        mover_white = board.turn == chess.WHITE
        rating = white_elo if mover_white else black_elo

        try:
            move_idx = encode_move(move, board)
        except (ValueError, IndexError):
            board.push(move)
            encoded_hist.append(0)
            prev_eval_white = None
            continue

        # Eval after the move, white POV, clamped to +/-1000 cp
        score = node.eval()
        if score is not None:
            eval_after_white = float(score.white().score(mate_score=1000))
            eval_after_white = max(-1000.0, min(1000.0, eval_after_white))
        else:
            board.push(move)
            if board.is_checkmate():
                eval_after_white = 1000.0 if mover_white else -1000.0
            else:
                eval_after_white = prev_eval_white  # carry forward (no analysis)
            board.pop()

        # Labels from consecutive evals (mover's POV)
        if prev_eval_white is not None and eval_after_white is not None:
            sign = 1.0 if mover_white else -1.0
            eval_before_pov = sign * prev_eval_white
            eval_after_pov = sign * eval_after_white
            cpl = max(0.0, eval_before_pov - eval_after_pov)
            eval_score = max(-1.0, min(1.0, eval_before_pov / 1000.0))
            is_blunder = float(cpl >= BLUNDER_CPL)
        else:
            cpl, eval_score, is_blunder = 0.0, 0.0, 0.0

        hist = np.zeros(T, dtype=np.int64)
        recent = encoded_hist[-T:]
        if recent:
            hist[T - len(recent):] = recent

        stats = np.zeros(settings.num_player_stats, dtype=np.float32)
        stats[0] = rating / 3000.0

        rows["board_tensor"].append(board_to_tensor(board))
        rows["move_history"].append(hist)
        rows["player_id"].append(0)
        rows["player_stats"].append(stats)
        rows["game_phase"].append(classify_game_phase(board))
        rows["time_control"].append(time_control)
        rows["move_index"].append(move_idx)
        rows["eval_score"].append(eval_score)
        rows["centipawn_loss"].append(min(cpl / 500.0, 1.0))
        rows["is_blunder"].append(is_blunder)

        encoded_hist.append(move_idx)
        board.push(move)
        prev_eval_white = eval_after_white

    if not rows["move_index"]:
        return None

    out: dict[str, np.ndarray] = {}
    for name, (dtype, shape) in FIELDS.items():
        if shape:
            out[name] = np.stack(rows[name]).astype(dtype)
        else:
            out[name] = np.array(rows[name], dtype=dtype)
    return out


def iter_game_blocks(filepath: str):
    """Yield raw PGN text per game without parsing."""
    lines: list[str] = []
    with open(filepath, errors="replace") as f:
        for line in f:
            if line.startswith("[Event ") and lines:
                yield "".join(lines)
                lines = [line]
            else:
                lines.append(line)
    if lines:
        yield "".join(lines)


class ShardWriter:
    """Streams position batches into a resizable HDF5 file."""

    def __init__(self, path: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.file = h5py.File(path, "w")
        self.count = 0
        self.games = 0
        for name, (dtype, shape) in FIELDS.items():
            # Small chunks: training does random single-row reads, and
            # HDF5 always reads whole chunks — big chunks amplify I/O ~300x.
            self.file.create_dataset(
                name,
                shape=(0, *shape),
                maxshape=(None, *shape),
                dtype=dtype,
                chunks=(4, *shape),
            )

    def append(self, arrays: dict[str, np.ndarray]):
        n = arrays["move_index"].shape[0]
        for name in FIELDS:
            ds = self.file[name]
            ds.resize(self.count + n, axis=0)
            ds[self.count:self.count + n] = arrays[name]
        self.count += n
        self.games += 1

    def close(self):
        self.file.close()


def main():
    parser = argparse.ArgumentParser(description="Preprocess PGN files into HDF5")
    parser.add_argument("input", help="PGN file or directory of PGN files")
    parser.add_argument("--output", default="data/processed/train.h5", help="Output HDF5 path")
    parser.add_argument("--max-games", type=int, default=None, help="Max games per file")
    parser.add_argument("--val-split", type=float, default=0.05, help="Validation split ratio")
    parser.add_argument("--workers", type=int, default=8, help="Parallel worker processes")
    parser.add_argument("--seed", type=int, default=7, help="Split RNG seed")
    args = parser.parse_args()

    input_path = Path(args.input)
    if input_path.is_file():
        pgn_files = [input_path]
    elif input_path.is_dir():
        pgn_files = sorted(input_path.glob("*.pgn"))
    else:
        print(f"Error: {input_path} is not a file or directory")
        sys.exit(1)

    def blocks():
        for pgn_file in pgn_files:
            print(f"Processing {pgn_file}...")
            for i, block in enumerate(iter_game_blocks(str(pgn_file))):
                if args.max_games and i >= args.max_games:
                    break
                yield block

    rng = random.Random(args.seed)
    train_writer = ShardWriter(args.output)
    val_writer = ShardWriter(str(args.output).replace("train", "val"))

    with Pool(processes=args.workers) as pool:
        for arrays in pool.imap_unordered(process_game_text, blocks(), chunksize=16):
            if arrays is None:
                continue
            # Split by GAME (not position) to prevent leakage
            writer = val_writer if rng.random() < args.val_split else train_writer
            writer.append(arrays)
            done = train_writer.games + val_writer.games
            if done % 1000 == 0:
                print(
                    f"  {done} games, {train_writer.count + val_writer.count} positions",
                    flush=True,
                )

    print(f"\nSplit: {train_writer.games} train games, {val_writer.games} val games")
    print(f"Saved {train_writer.count} training positions to {train_writer.path}")
    print(f"Saved {val_writer.count} validation positions to {val_writer.path}")
    train_writer.close()
    val_writer.close()


if __name__ == "__main__":
    main()
