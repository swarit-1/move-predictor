"""Full prediction pipeline: board state -> predicted move.

Orchestrates the board encoder, sequence encoder, player embedding,
and skill-aware sampler into a single inference call.

When no trained checkpoint is available, falls back to Stockfish-based
prediction with skill-level calibration.
"""

import logging
import math
import random
from pathlib import Path

import chess
import torch
import numpy as np

from src.models.move_predictor import MovePredictor
from src.models.move_encoding import (
    get_legal_move_mask,
    encode_move,
    NUM_MOVES,
)
from src.data.preprocessing import board_to_tensor
from src.inference.sampler import sample_move, SampledMove, StyleOverrides
from src.config import settings

logger = logging.getLogger(__name__)


class PredictionPipeline:
    """End-to-end inference pipeline."""

    def __init__(self):
        self.model: MovePredictor | None = None
        self.device = torch.device("cpu")
        self.has_checkpoint = False

    def load_model(self, checkpoint_path: str | None = None):
        """Load model from checkpoint or initialize fresh."""
        # Device selection with Apple Silicon MPS support
        if torch.cuda.is_available():
            device = "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"
        self.device = torch.device(device)

        self.model = MovePredictor()

        if checkpoint_path and Path(checkpoint_path).exists():
            checkpoint = torch.load(checkpoint_path, map_location=self.device)
            self.model.load_state_dict(checkpoint["model_state_dict"])
            self.has_checkpoint = True
            logger.info(f"Loaded model from {checkpoint_path}")
        else:
            self.has_checkpoint = False
            logger.info(
                "No checkpoint loaded — using Stockfish-based fallback for predictions"
            )

        self.model = self.model.to(self.device)
        self.model.eval()
        logger.info(f"Model running on device: {self.device}")

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
        """Predict a move for the given position."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        board = chess.Board(fen)

        if self.has_checkpoint:
            return self._predict_with_model(
                board, move_history, player_id, player_stats,
                player_rating, style, engine_top_moves,
            )
        else:
            return self._predict_with_stockfish_fallback(
                board, player_rating, style, engine_top_moves,
            )

    def _predict_with_model(
        self,
        board: chess.Board,
        move_history: list[str] | None,
        player_id: int,
        player_stats: np.ndarray | None,
        player_rating: float,
        style: StyleOverrides | None,
        engine_top_moves: list[dict] | None,
    ) -> SampledMove:
        """Run the neural network model for prediction."""
        board_tensor = torch.from_numpy(board_to_tensor(board)).unsqueeze(0).to(self.device)

        history_indices = self._encode_history(move_history, board)
        history_tensor = torch.from_numpy(history_indices).unsqueeze(0).to(self.device)

        player_id_tensor = torch.tensor([player_id], dtype=torch.long, device=self.device)

        if player_stats is None:
            player_stats = np.zeros(settings.num_player_stats, dtype=np.float32)
        stats_tensor = torch.from_numpy(player_stats).unsqueeze(0).to(self.device)

        from src.data.preprocessing import classify_game_phase
        phase = classify_game_phase(board)
        phase_tensor = torch.tensor([phase], dtype=torch.long, device=self.device)

        legal_mask = torch.from_numpy(get_legal_move_mask(board)).unsqueeze(0).to(self.device)

        outputs = self.model(
            board_tensor=board_tensor,
            move_history=history_tensor,
            player_id=player_id_tensor,
            player_stats=stats_tensor,
            game_phase=phase_tensor,
            legal_move_mask=legal_mask,
        )

        policy_logits = outputs["policy_logits"][0]
        cpl_pred = max(0, outputs["cpl_pred"][0].item())
        blunder_prob = torch.sigmoid(outputs["blunder_logit"][0]).item()

        return sample_move(
            policy_logits=policy_logits,
            board=board,
            predicted_cpl=cpl_pred,
            blunder_prob=blunder_prob,
            player_rating=player_rating,
            style=style,
            engine_top_moves=engine_top_moves,
        )

    def _predict_with_stockfish_fallback(
        self,
        board: chess.Board,
        player_rating: float,
        style: StyleOverrides | None,
        engine_top_moves: list[dict] | None,
    ) -> SampledMove:
        """Use Stockfish analysis to build a realistic policy distribution.

        Creates logits from Stockfish's top moves, weighted by centipawn
        evaluation, then feeds through the existing skill-aware sampler
        so the rating/style controls still work.
        """
        # Build logits from engine top moves if available
        logits = torch.full((NUM_MOVES,), float("-inf"))

        has_engine_data = engine_top_moves and len(engine_top_moves) > 0

        if has_engine_data:
            # Use Stockfish evaluation to build a strong-player distribution.
            # Top engine moves get high logits proportional to their eval.
            best_cp = engine_top_moves[0].get("cp", 0) or 0

            for i, em in enumerate(engine_top_moves):
                uci = em.get("move")
                if not uci:
                    continue
                try:
                    move = chess.Move.from_uci(uci)
                    idx = encode_move(move, board)
                    # Rank-based logit: top move gets highest, decays
                    cp = em.get("cp", best_cp) or best_cp
                    cp_diff = (cp - best_cp) / 100.0  # negative for worse moves
                    # Strong base logit that decays with rank and eval loss
                    logits[idx] = 5.0 - i * 0.8 + cp_diff * 0.5
                except (ValueError, IndexError):
                    continue

            # Give all other legal moves a small base logit so they're not
            # completely impossible (humans don't always play top engine moves)
            for move in board.legal_moves:
                try:
                    idx = encode_move(move, board)
                    if logits[idx] == float("-inf"):
                        # Small logit — these moves are legal but not engine-favored
                        logits[idx] = -1.0 + random.gauss(0, 0.3)
                except (ValueError, IndexError):
                    continue
        else:
            # No Stockfish data — give all legal moves equal logits
            # (sampler temperature will still create rating-appropriate play)
            for move in board.legal_moves:
                try:
                    idx = encode_move(move, board)
                    # Add small random noise so moves aren't identical
                    logits[idx] = 0.0 + random.gauss(0, 0.2)
                except (ValueError, IndexError):
                    continue

        # Estimate CPL and blunder probability from rating.
        # The sampler's compute_temperature expects small CPL values (model scale, ~0-5),
        # not real centipawn values. Keep these on the same scale the model would output.
        estimated_cpl = max(0.0, 3.0 - player_rating * 0.0012)  # ~1.8 at 1000, ~0.6 at 2000
        estimated_blunder = max(0.02, 0.35 - player_rating * 0.00012)  # ~23% at 1000, ~11% at 2000

        if style:
            estimated_cpl *= (0.5 + style.blunder_frequency / 100.0)
            estimated_blunder *= (0.5 + style.blunder_frequency / 100.0)

        return sample_move(
            policy_logits=logits,
            board=board,
            predicted_cpl=estimated_cpl,
            blunder_prob=estimated_blunder,
            player_rating=player_rating,
            style=style,
            engine_top_moves=engine_top_moves,
        )

    def _encode_history(
        self,
        move_history: list[str] | None,
        current_board: chess.Board,
    ) -> np.ndarray:
        """Encode UCI move history into move indices."""
        T = settings.history_length
        indices = np.zeros(T, dtype=np.int64)

        if not move_history:
            return indices

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

        recent = encoded[-T:]
        start = T - len(recent)
        indices[start:] = recent

        return indices


# Global singleton
prediction_pipeline = PredictionPipeline()
