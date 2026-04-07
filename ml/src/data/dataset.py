"""PyTorch Dataset for chess position training data.

Supports two data sources:
1. HDF5 files (for large-scale preprocessed data)
2. In-memory lists of feature dicts (for small-scale / testing)
"""

import h5py
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from pathlib import Path

from src.config import settings


class ChessPositionDataset(Dataset):
    """Dataset of chess positions with labels for multi-task training.

    Each example contains:
        - board_tensor: (18, 8, 8) float32
        - move_history: (T,) int64
        - player_id: int64
        - player_stats: (num_stats,) float32
        - game_phase: int64
        - move_index: int64 (label: which move was played)
        - eval_score: float32 (label: position eval)
        - centipawn_loss: float32 (label: CPL of played move)
        - is_blunder: float32 (label: blunder indicator)
    """

    def __init__(self, data: list[dict] | None = None, hdf5_path: str | None = None):
        """
        Args:
            data: List of feature dicts from feature_extraction.
            hdf5_path: Path to preprocessed HDF5 file (mutually exclusive with data).
        """
        if data is not None and hdf5_path is not None:
            raise ValueError("Provide either data or hdf5_path, not both")

        self._data = data
        self._hdf5_path = hdf5_path
        self._hdf5_file = None

        if hdf5_path:
            # Open in read mode, keep handle for __getitem__
            self._hdf5_file = h5py.File(hdf5_path, "r")
            self._length = self._hdf5_file["board_tensor"].shape[0]
        elif data:
            self._length = len(data)
        else:
            self._length = 0

    def __len__(self) -> int:
        return self._length

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        if self._data is not None:
            return self._get_from_memory(idx)
        elif self._hdf5_file is not None:
            return self._get_from_hdf5(idx)
        else:
            raise RuntimeError("Dataset is empty")

    def _get_from_memory(self, idx: int) -> dict[str, torch.Tensor]:
        item = self._data[idx]

        # Build player_stats tensor (default zeros if not present)
        player_stats = item.get("player_stats", np.zeros(settings.num_player_stats, dtype=np.float32))
        if isinstance(player_stats, (list, tuple)):
            player_stats = np.array(player_stats, dtype=np.float32)

        # Pad player_stats to expected size
        if len(player_stats) < settings.num_player_stats:
            padded = np.zeros(settings.num_player_stats, dtype=np.float32)
            padded[:len(player_stats)] = player_stats
            player_stats = padded

        return {
            "board_tensor": torch.from_numpy(item["board_tensor"]),
            "move_history": torch.from_numpy(item["move_history"]),
            "player_id": torch.tensor(item.get("player_id", 0), dtype=torch.long),
            "player_stats": torch.from_numpy(player_stats),
            "game_phase": torch.tensor(item.get("game_phase", 1), dtype=torch.long),
            "time_control": torch.tensor(item.get("time_control", 0), dtype=torch.long),
            # Labels
            "move_index": torch.tensor(item["move_index"], dtype=torch.long),
            "eval_score": torch.tensor(item.get("eval_score", 0.0), dtype=torch.float32),
            "centipawn_loss": torch.tensor(item.get("centipawn_loss", 0.0), dtype=torch.float32),
            "is_blunder": torch.tensor(item.get("is_blunder", 0.0), dtype=torch.float32),
        }

    def _get_from_hdf5(self, idx: int) -> dict[str, torch.Tensor]:
        f = self._hdf5_file
        result = {
            "board_tensor": torch.from_numpy(f["board_tensor"][idx]),
            "move_history": torch.from_numpy(f["move_history"][idx]),
            "player_id": torch.tensor(f["player_id"][idx], dtype=torch.long),
            "player_stats": torch.from_numpy(f["player_stats"][idx]),
            "game_phase": torch.tensor(f["game_phase"][idx], dtype=torch.long),
            "move_index": torch.tensor(f["move_index"][idx], dtype=torch.long),
            "eval_score": torch.tensor(f["eval_score"][idx], dtype=torch.float32),
            "centipawn_loss": torch.tensor(f["centipawn_loss"][idx], dtype=torch.float32),
            "is_blunder": torch.tensor(f["is_blunder"][idx], dtype=torch.float32),
        }
        # time_control may not exist in older HDF5 files
        if "time_control" in f:
            result["time_control"] = torch.tensor(f["time_control"][idx], dtype=torch.long)
        else:
            result["time_control"] = torch.tensor(0, dtype=torch.long)
        return result

    def __del__(self):
        if self._hdf5_file is not None:
            self._hdf5_file.close()


def create_dataloaders(
    train_data: list[dict] | str,
    val_data: list[dict] | str,
    batch_size: int = settings.batch_size,
    num_workers: int = 4,
) -> tuple[DataLoader, DataLoader]:
    """Create train and validation DataLoaders.

    Args:
        train_data: Either list of feature dicts or path to HDF5 file.
        val_data: Either list of feature dicts or path to HDF5 file.
        batch_size: Batch size.
        num_workers: Number of worker processes.

    Returns:
        Tuple of (train_loader, val_loader).
    """
    if isinstance(train_data, str):
        train_ds = ChessPositionDataset(hdf5_path=train_data)
        val_ds = ChessPositionDataset(hdf5_path=val_data)
    else:
        train_ds = ChessPositionDataset(data=train_data)
        val_ds = ChessPositionDataset(data=val_data)

    train_loader = DataLoader(
        train_ds,
        batch_size=batch_size,
        shuffle=True,
        num_workers=num_workers,
        pin_memory=True,
        drop_last=True,
    )

    val_loader = DataLoader(
        val_ds,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True,
    )

    return train_loader, val_loader


def save_to_hdf5(data: list[dict], filepath: str):
    """Save a list of feature dicts to an HDF5 file for fast loading.

    Args:
        data: List of feature dicts from feature extraction.
        filepath: Output HDF5 file path.
    """
    n = len(data)
    if n == 0:
        return

    Path(filepath).parent.mkdir(parents=True, exist_ok=True)

    with h5py.File(filepath, "w") as f:
        # Pre-allocate datasets
        f.create_dataset("board_tensor", shape=(n, 18, 8, 8), dtype="float32")
        f.create_dataset("move_history", shape=(n, settings.history_length), dtype="int64")
        f.create_dataset("player_id", shape=(n,), dtype="int64")
        f.create_dataset("player_stats", shape=(n, settings.num_player_stats), dtype="float32")
        f.create_dataset("game_phase", shape=(n,), dtype="int64")
        f.create_dataset("time_control", shape=(n,), dtype="int64")
        f.create_dataset("move_index", shape=(n,), dtype="int64")
        f.create_dataset("eval_score", shape=(n,), dtype="float32")
        f.create_dataset("centipawn_loss", shape=(n,), dtype="float32")
        f.create_dataset("is_blunder", shape=(n,), dtype="float32")

        for i, item in enumerate(data):
            f["board_tensor"][i] = item["board_tensor"]
            f["move_history"][i] = item["move_history"]
            f["player_id"][i] = item.get("player_id", 0)

            stats = item.get("player_stats", np.zeros(settings.num_player_stats))
            if len(stats) < settings.num_player_stats:
                padded = np.zeros(settings.num_player_stats, dtype=np.float32)
                padded[:len(stats)] = stats
                stats = padded
            f["player_stats"][i] = stats

            f["game_phase"][i] = item.get("game_phase", 1)
            f["time_control"][i] = item.get("time_control", 0)
            f["move_index"][i] = item["move_index"]
            f["eval_score"][i] = item.get("eval_score", 0.0)
            f["centipawn_loss"][i] = item.get("centipawn_loss", 0.0)
            f["is_blunder"][i] = item.get("is_blunder", 0.0)
