"""Full prediction pipeline: board state -> predicted move.

Orchestrates the board encoder, sequence encoder, player embedding,
and skill-aware sampler into a single inference call.

When no trained checkpoint is available, uses the Lichess Opening Explorer
for real human move distributions, falling back to Stockfish-based
prediction with skill-level calibration for positions not in the explorer DB.
"""

import logging
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
from src.data.opening_book import OpeningBook
from src.config import settings

logger = logging.getLogger(__name__)


class PredictionPipeline:
    """End-to-end inference pipeline."""

    def __init__(self):
        self.model: MovePredictor | None = None
        self.device = torch.device("cpu")
        self.has_checkpoint = False
        self.opening_books: dict[str, OpeningBook] = {}  # player_key → book

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
                "No checkpoint loaded — using explorer + Stockfish fallback"
            )

        self.model = self.model.to(self.device)
        self.model.eval()
        logger.info(f"Model running on device: {self.device}")

    def load_model_for_rating(self, rating: float) -> None:
        """Load the best available model checkpoint for a given rating."""
        brackets = [
            (400, 800), (800, 1000), (1000, 1200), (1200, 1400),
            (1400, 1600), (1600, 1800), (1800, 2000), (2000, 2200), (2200, 2500),
        ]

        best_bracket = min(brackets, key=lambda b: abs((b[0] + b[1]) / 2 - rating))
        checkpoint_path = f"data/checkpoints/{best_bracket[0]}_{best_bracket[1]}/phase1_best.pt"

        if Path(checkpoint_path).exists():
            self.load_model(checkpoint_path)
            logger.info(
                "Loaded %d-%d bracket model for rating %s",
                best_bracket[0], best_bracket[1], rating,
            )
        else:
            logger.info(
                "No bracket checkpoint for rating %s, using explorer + fallback", rating
            )

    def set_opening_book(self, player_key: str, book: OpeningBook) -> None:
        """Register an opening book for a player."""
        self.opening_books[player_key] = book
        logger.info(
            "Set opening book for %s: %d games, %d nodes",
            player_key, book.total_games, book.size,
        )

    @torch.no_grad()
    async def predict(
        self,
        fen: str,
        move_history: list[str] | None = None,
        player_id: int = 0,
        player_stats: np.ndarray | None = None,
        player_rating: float = 1500.0,
        style: StyleOverrides | None = None,
        engine_top_moves: list[dict] | None = None,
        player_key: str | None = None,
        time_pressure: float = 0.0,
    ) -> SampledMove:
        """Predict a move for the given position."""
        if self.model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        board = chess.Board(fen)

        # Look up opening book probabilities
        opening_book_probs: dict[str, float] | None = None
        if player_key and player_key in self.opening_books and move_history:
            book = self.opening_books[player_key]
            opening_book_probs = book.get_move_probabilities(move_history) or None

        if self.has_checkpoint:
            return self._predict_with_model(
                board, move_history, player_id, player_stats,
                player_rating, style, engine_top_moves, opening_book_probs,
                time_pressure,
            )
        else:
            return await self._predict_with_data(
                board, player_rating, style, engine_top_moves,
                opening_book_probs, player_key, time_pressure,
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
        opening_book_probs: dict[str, float] | None = None,
        time_pressure: float = 0.0,
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
            opening_book_probs=opening_book_probs,
            time_pressure=time_pressure,
        )

    async def _predict_with_data(
        self,
        board: chess.Board,
        player_rating: float,
        style: StyleOverrides | None,
        engine_top_moves: list[dict] | None,
        opening_book_probs: dict[str, float] | None = None,
        player_key: str | None = None,
        time_pressure: float = 0.0,
    ) -> SampledMove:
        """Predict using real human data when available, falling back to Stockfish.

        Data source priority:
        1. Specific player's Lichess explorer stats (best)
        2. Player's opening book from fetched games
        3. Aggregate human stats at this rating level from Lichess explorer
        4. Stockfish + blind spot biases (for obscure positions)
        """
        from src.data.lichess_explorer import (
            get_explorer_moves,
            get_player_explorer_moves,
            explorer_moves_to_logits,
        )

        # Step 1: Try Lichess Opening Explorer for real human move statistics
        explorer_moves = await get_explorer_moves(board.fen(), player_rating)

        # Step 2: If this is a specific Lichess player, try their personal stats
        player_explorer_moves: list[dict] = []
        if player_key and player_key.startswith("lichess:"):
            username = player_key.split(":", 1)[1]
            color = "white" if board.turn == chess.WHITE else "black"
            player_explorer_moves = await get_player_explorer_moves(
                board.fen(), username, color
            )

        # Step 3: Build logits from the best available data source
        if player_explorer_moves and len(player_explorer_moves) >= 2:
            logits = explorer_moves_to_logits(player_explorer_moves, board)
            source = "player_explorer"
        elif opening_book_probs and len(opening_book_probs) >= 2:
            logits = self._book_probs_to_logits(opening_book_probs, board)
            source = "opening_book"
        elif explorer_moves and len(explorer_moves) >= 2:
            logits = explorer_moves_to_logits(explorer_moves, board)
            source = "rating_explorer"
        else:
            logits = self._build_stockfish_logits(board, engine_top_moves)
            source = "stockfish_fallback"

        logger.debug("Prediction source: %s for FEN: %s", source, board.fen()[:40])

        # Step 4: Estimate error metrics from rating
        estimated_cpl = max(0.0, 3.0 - player_rating * 0.0012)
        estimated_blunder = max(0.02, 0.35 - player_rating * 0.00012)

        if style:
            estimated_cpl *= (0.5 + style.blunder_frequency / 100.0)
            estimated_blunder *= (0.5 + style.blunder_frequency / 100.0)

        # Step 5: For explorer-sourced data, reduce temperature (already human-like).
        # For stockfish fallback, apply full blind spot biases.
        if source in ("player_explorer", "opening_book"):
            # Explorer data is already a realistic distribution — use lighter sampling
            return sample_move(
                policy_logits=logits,
                board=board,
                predicted_cpl=estimated_cpl * 0.6,
                blunder_prob=estimated_blunder * 0.6,
                player_rating=player_rating,
                style=style,
                engine_top_moves=engine_top_moves,
                opening_book_probs=None,  # Already baked in
                apply_blind_spots=False,  # Data is already human-like
                time_pressure=time_pressure,
            )
        else:
            # Stockfish fallback or rating explorer — apply blind spots
            return sample_move(
                policy_logits=logits,
                board=board,
                predicted_cpl=estimated_cpl,
                blunder_prob=estimated_blunder,
                player_rating=player_rating,
                style=style,
                engine_top_moves=engine_top_moves,
                opening_book_probs=opening_book_probs,
                time_pressure=time_pressure,
            )

    def _book_probs_to_logits(
        self,
        book_probs: dict[str, float],
        board: chess.Board,
    ) -> torch.Tensor:
        """Convert opening book probabilities to logits."""
        import math
        logits = torch.full((NUM_MOVES,), float("-inf"))

        for move_uci, prob in book_probs.items():
            try:
                move = chess.Move.from_uci(move_uci)
                if move in board.legal_moves:
                    idx = encode_move(move, board)
                    logits[idx] = math.log(prob + 1e-8) + 5.0
            except (ValueError, IndexError):
                continue

        # Fill remaining legal moves with small logit
        for move in board.legal_moves:
            try:
                idx = encode_move(move, board)
                if logits[idx] == float("-inf"):
                    logits[idx] = -6.0
            except (ValueError, IndexError):
                continue

        return logits

    def _build_stockfish_logits(
        self,
        board: chess.Board,
        engine_top_moves: list[dict] | None,
    ) -> torch.Tensor:
        """Build logits from Stockfish analysis for positions not in explorer DB."""
        logits = torch.full((NUM_MOVES,), float("-inf"))

        has_engine_data = engine_top_moves and len(engine_top_moves) > 0

        if has_engine_data:
            best_cp = engine_top_moves[0].get("cp", 0) or 0

            for i, em in enumerate(engine_top_moves):
                uci = em.get("move")
                if not uci:
                    continue
                try:
                    move = chess.Move.from_uci(uci)
                    idx = encode_move(move, board)
                    cp = em.get("cp", best_cp) or best_cp
                    cp_diff = (cp - best_cp) / 100.0
                    logits[idx] = 5.0 - i * 0.8 + cp_diff * 0.5
                except (ValueError, IndexError):
                    continue

            # Non-engine moves: piece-type-weighted logits
            for move in board.legal_moves:
                try:
                    idx = encode_move(move, board)
                    if logits[idx] != float("-inf"):
                        continue

                    piece = board.piece_at(move.from_square)
                    base_logit = -7.0

                    if piece:
                        pt = piece.piece_type
                        if pt == chess.PAWN:
                            to_file = chess.square_file(move.to_square)
                            base_logit = -2.0 if to_file in (2, 3, 4, 5) else -3.0
                        elif pt == chess.KNIGHT:
                            to_rank = chess.square_rank(move.to_square)
                            to_file = chess.square_file(move.to_square)
                            if 2 <= to_file <= 5 and 2 <= to_rank <= 5:
                                base_logit = -3.0
                            else:
                                base_logit = -4.0
                        elif pt == chess.BISHOP:
                            base_logit = -5.0
                        elif pt == chess.ROOK:
                            base_logit = -7.0
                        elif pt == chess.QUEEN:
                            base_logit = -8.0
                        elif pt == chess.KING:
                            if board.is_castling(move):
                                base_logit = -0.5
                            else:
                                base_logit = -10.0

                    logits[idx] = base_logit + random.gauss(0, 0.15)
                except (ValueError, IndexError):
                    continue
        else:
            # No Stockfish data — equal logits with small noise
            for move in board.legal_moves:
                try:
                    idx = encode_move(move, board)
                    logits[idx] = 0.0 + random.gauss(0, 0.2)
                except (ValueError, IndexError):
                    continue

        return logits

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
