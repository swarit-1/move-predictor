"""Full prediction pipeline: board state → predicted move.

Orchestrates the board encoder, sequence encoder, player embedding,
and skill-aware sampler into a single inference call.
"""

import logging
from pathlib import Path

import chess
import torch
import numpy as np

from src.models.move_predictor import MovePredictor
from src.models.move_encoding import get_legal_move_mask
from src.data.preprocessing import board_to_tensor
from src.inference.sampler import sample_move, SampledMove, StyleOverrides
from src.config import settings

logger = logging.getLogger(__name__)


class PredictionPipeline:
    """End-to-end inference pipeline."""

    def __init__(self):
        self.model: MovePredictor | None = None
        self.device = torch.device("cpu")

    def load_model(self, checkpoint_path: str | None = None):
        """Load model from checkpoint or initialize fresh.

        Args:
            checkpoint_path: Path to .pt checkpoint file. If None, initializes
                           a fresh model (useful for testing).
        """
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = MovePredictor()

        if checkpoint_path and Path(checkpoint_path).exists():
            checkpoint = torch.load(checkpoint_path, map_location=self.device)
            self.model.load_state_dict(checkpoint["model_state_dict"])
            logger.info(f"Loaded model from {checkpoint_path}")
        else:
            logger.info("Initialized fresh model (no checkpoint loaded)")

        self.model = self.model.to(self.device)
        self.model.eval()

    @torch.no_grad()
    def predict(
        self,
        fen: str,
        move_history: list[str] | None = None,
        player_id: int = 0,
        player_stats: np.ndarray | None = None,
        player_rating: float = 1500.0,
        style: StyleOverrides | None = None,
        engine_top_moves: list[dict] | None = None,
    ) -> SampledMove:
        """Predict a move for the given position.

        Args:
            fen: FEN string of current position.
            move_history: List of previous moves as UCI strings.
            player_id: Integer player ID.
            player_stats: Player statistics vector.
            player_rating: Player rating.
            style: Style overrides.
            engine_top_moves: Stockfish top moves for comparison.

        Returns:
            SampledMove with the predicted move and metadata.
        """
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        board = chess.Board(fen)

        # Prepare board tensor
        board_tensor = torch.from_numpy(board_to_tensor(board)).unsqueeze(0).to(self.device)

        # Prepare move history
        history_indices = self._encode_history(move_history, board)
        history_tensor = torch.from_numpy(history_indices).unsqueeze(0).to(self.device)

        # Prepare player inputs
        player_id_tensor = torch.tensor([player_id], dtype=torch.long, device=self.device)

        if player_stats is None:
            player_stats = np.zeros(settings.num_player_stats, dtype=np.float32)
        stats_tensor = torch.from_numpy(player_stats).unsqueeze(0).to(self.device)

        # Prepare game phase
        from src.data.preprocessing import classify_game_phase
        phase = classify_game_phase(board)
        phase_tensor = torch.tensor([phase], dtype=torch.long, device=self.device)

        # Legal move mask
        legal_mask = torch.from_numpy(get_legal_move_mask(board)).unsqueeze(0).to(self.device)

        # Forward pass
        outputs = self.model(
            board_tensor=board_tensor,
            move_history=history_tensor,
            player_id=player_id_tensor,
            player_stats=stats_tensor,
            game_phase=phase_tensor,
            legal_move_mask=legal_mask,
        )

        # Extract predictions
        policy_logits = outputs["policy_logits"][0]  # (vocab_size,)
        cpl_pred = max(0, outputs["cpl_pred"][0].item())
        blunder_prob = torch.sigmoid(outputs["blunder_logit"][0]).item()

        # Sample move with skill-aware temperature
        result = sample_move(
            policy_logits=policy_logits,
            board=board,
            predicted_cpl=cpl_pred,
            blunder_prob=blunder_prob,
            player_rating=player_rating,
            style=style,
            engine_top_moves=engine_top_moves,
        )

        return result

    def _encode_history(
        self,
        move_history: list[str] | None,
        current_board: chess.Board,
    ) -> np.ndarray:
        """Encode UCI move history into move indices."""
        from src.models.move_encoding import encode_move

        T = settings.history_length
        indices = np.zeros(T, dtype=np.int64)

        if not move_history:
            return indices

        # Replay moves to get board states for encoding
        replay_board = chess.Board()
        encoded = []

        for uci_str in move_history:
            try:
                move = chess.Move.from_uci(uci_str)
                if move in replay_board.legal_moves:
                    idx = encode_move(move, replay_board)
                    encoded.append(idx)
                    replay_board.push(move)
            except (ValueError, IndexError):
                continue

        # Take last T moves
        recent = encoded[-T:]
        # Right-align in the array (padding at the beginning)
        start = T - len(recent)
        indices[start:] = recent

        return indices


# Global singleton
prediction_pipeline = PredictionPipeline()
