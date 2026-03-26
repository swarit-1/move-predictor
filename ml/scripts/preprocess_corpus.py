"""Preprocess PGN files into HDF5 training data.

Reads PGN files from data/raw/, extracts features for every position,
and optionally annotates with Stockfish analysis.

Usage:
    python scripts/preprocess_corpus.py data/raw/player.pgn --output data/processed/train.h5
    python scripts/preprocess_corpus.py data/raw/ --output data/processed/train.h5 --stockfish
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import chess.pgn
from src.data.sources.pgn_loader import parse_pgn_file, game_to_moves, game_metadata
from src.data.feature_extraction import extract_position_features
from src.data.dataset import save_to_hdf5
from src.models.move_encoding import encode_move


def preprocess_file(
    filepath: str,
    use_stockfish: bool = False,
    stockfish_depth: int = 12,
    max_games: int | None = None,
) -> list[list[dict]]:
    """Preprocess a single PGN file into per-game position lists.

    Returns a list of games, where each game is a list of feature dicts.
    Grouping by game prevents data leakage when splitting train/val.
    """
    game_positions: list[list[dict]] = []
    games_processed = 0
    total_positions = 0

    print(f"Processing {filepath}...")

    for game in parse_pgn_file(filepath):
        if max_games and games_processed >= max_games:
            break

        metadata = game_metadata(game)
        moves = game_to_moves(game)
        board = game.board()
        move_history: list = []
        positions: list[dict] = []

        for move in moves:
            try:
                features = extract_position_features(
                    board=board,
                    move=move,
                    move_history=move_history.copy(),
                    player_rating=metadata.get("white_elo") or 1500
                    if board.turn == chess.WHITE
                    else metadata.get("black_elo") or 1500,
                )
                positions.append(features)
            except (ValueError, IndexError):
                pass

            move_history.append(move)
            board.push(move)

        if positions:
            game_positions.append(positions)
            total_positions += len(positions)

        games_processed += 1
        if games_processed % 100 == 0:
            print(f"  Processed {games_processed} games, {total_positions} positions")

    print(f"  Total: {games_processed} games, {total_positions} positions from {filepath}")
    return game_positions


def main():
    parser = argparse.ArgumentParser(description="Preprocess PGN files into HDF5")
    parser.add_argument("input", help="PGN file or directory of PGN files")
    parser.add_argument("--output", default="data/processed/train.h5", help="Output HDF5 path")
    parser.add_argument("--stockfish", action="store_true", help="Add Stockfish annotations")
    parser.add_argument("--max-games", type=int, default=None, help="Max games per file")
    parser.add_argument("--val-split", type=float, default=0.05, help="Validation split ratio")

    args = parser.parse_args()

    input_path = Path(args.input)
    all_games: list[list[dict]] = []

    if input_path.is_file():
        all_games = preprocess_file(
            str(input_path),
            use_stockfish=args.stockfish,
            max_games=args.max_games,
        )
    elif input_path.is_dir():
        for pgn_file in sorted(input_path.glob("*.pgn")):
            games = preprocess_file(
                str(pgn_file),
                use_stockfish=args.stockfish,
                max_games=args.max_games,
            )
            all_games.extend(games)
    else:
        print(f"Error: {input_path} is not a file or directory")
        sys.exit(1)

    if not all_games:
        print("No positions extracted!")
        sys.exit(1)

    # Split by GAME (not by position) to prevent data leakage
    import random
    random.shuffle(all_games)
    val_count = int(len(all_games) * args.val_split)
    val_games = all_games[:val_count]
    train_games = all_games[val_count:]

    # Flatten games into position lists
    train_data = [pos for game in train_games for pos in game]
    val_data = [pos for game in val_games for pos in game]

    # Shuffle positions within each split
    random.shuffle(train_data)
    random.shuffle(val_data)

    total = len(train_data) + len(val_data)
    print(f"\nSplit: {len(train_games)} train games, {len(val_games)} val games")
    print(f"       {len(train_data)} train positions, {len(val_data)} val positions")

    # Save
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    save_to_hdf5(train_data, str(output_path))
    print(f"Saved {len(train_data)} training positions to {output_path}")

    val_path = str(output_path).replace("train", "val")
    if val_data:
        save_to_hdf5(val_data, val_path)
        print(f"Saved {len(val_data)} validation positions to {val_path}")


if __name__ == "__main__":
    main()
