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
        self.player_stats: dict[str, np.ndarray] = {}   # player_key → stats vector

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

    def set_player_stats(self, player_key: str, stats: np.ndarray) -> None:
        """Store a player's computed stats vector for use in future predictions."""
        self.player_stats[player_key] = stats
        logger.info("Stored player stats for %s (%d features)", player_key, len(stats))

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

        # Retrieve stored player stats if not explicitly provided
        if player_stats is None and player_key and player_key in self.player_stats:
            player_stats = self.player_stats[player_key]
            logger.debug("Using stored stats for %s", player_key)

        # Derive style from player stats when no explicit overrides are set.
        # This makes the prediction reflect the player's actual playing style
        # (aggression, blunder frequency, consistency) learned from their games.
        if style is None and player_stats is not None:
            style = _stats_to_style(player_stats)
            logger.debug("Derived style from player stats: %s", style)

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
                opening_book_probs, player_key, time_pressure, player_stats,
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
        player_stats: np.ndarray | None = None,
    ) -> SampledMove:
        """Predict using real human data when available, falling back to Stockfish.

        Data source priority:
        1. Specific player's Lichess explorer stats (best)
        2. Player's opening book from fetched games
        3. Aggregate human stats at this rating level from Lichess explorer
        4. Stockfish + blind spot biases (for obscure positions)
        """
        import asyncio
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

        # Step 3: Build logits from the best available data source.
        # Require minimum game count for explorer data to be reliable.
        def _has_sufficient_data(moves: list[dict], min_games: int = 20) -> bool:
            if not moves or len(moves) < 2:
                return False
            total = sum(m.get("total", 0) for m in moves)
            return total >= min_games

        if _has_sufficient_data(player_explorer_moves, min_games=5):
            logits = explorer_moves_to_logits(player_explorer_moves, board)
            source = "player_explorer"
        elif opening_book_probs and len(opening_book_probs) >= 2:
            logits = self._book_probs_to_logits(opening_book_probs, board)
            source = "opening_book"
        elif _has_sufficient_data(explorer_moves, min_games=20):
            logits = explorer_moves_to_logits(explorer_moves, board)
            source = "rating_explorer"
        else:
            # Belt-and-suspenders: if the caller didn't provide engine moves,
            # call Stockfish ourselves so we never fall through to pure heuristics.
            if not engine_top_moves or len(engine_top_moves) == 0:
                engine_top_moves = await self._get_stockfish_moves(board.fen())
            logits = self._build_stockfish_logits(board, engine_top_moves)
            source = "stockfish_fallback"

        logger.info(
            "PIPELINE | source=%s | rating=%.0f | fen=%s",
            source, player_rating, board.fen()[:50],
        )

        # Step 4: Estimate error metrics.
        # Use player's actual computed CPL/blunder_rate when available (from build_player_profile),
        # falling back to rating-based formula for unknown players.
        # Stats vector indices: [2] = avg_centipawn_loss / 200.0, [3] = blunder_rate
        if (
            player_stats is not None
            and float(player_stats[2]) != 50.0 / 200.0  # not the default
        ):
            estimated_cpl = float(player_stats[2]) * 200.0  # denormalize
            estimated_blunder = float(player_stats[3])
            logger.debug(
                "Using player stats CPL=%.1f blunder=%.3f", estimated_cpl, estimated_blunder
            )
        else:
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

    async def _get_stockfish_moves(self, fen: str) -> list[dict]:
        """Call Stockfish internally when the caller didn't provide engine moves.

        Returns a list of top-move dicts compatible with engine_top_moves format,
        or an empty list if Stockfish is unavailable.
        """
        import asyncio
        try:
            from src.engine.stockfish_pool import stockfish_pool
            if stockfish_pool._executor is None:
                logger.warning("PIPELINE | Stockfish pool not started, no engine data")
                return []
            loop = asyncio.get_event_loop()
            analysis = await loop.run_in_executor(
                None, lambda: stockfish_pool.analyze_sync(fen, num_lines=5)
            )
            logger.info(
                "PIPELINE | internal_stockfish | best=%s | num_moves=%d",
                analysis.best_move, len(analysis.top_moves),
            )
            return analysis.top_moves
        except Exception as e:
            logger.warning("PIPELINE | internal Stockfish call failed: %s", e)
            return []

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

        logger.info(
            "BUILD_LOGITS | has_engine=%s | num_moves=%d | fen=%s",
            has_engine_data,
            len(engine_top_moves) if engine_top_moves else 0,
            board.fen()[:50],
        )

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
                    # Wider spread: #1 gets 7.0, #5 gets ~2.0
                    logits[idx] = 7.0 - i * 1.2 + cp_diff * 0.8
                except (ValueError, IndexError):
                    continue

            # Non-engine moves: MUCH lower base logits to create a clear gap.
            # Gap between engine move #5 (~2.0) and best non-engine (-3.0) is 5+ points.
            # At temperature 0.5 that's softmax(10) vs softmax(-6) — effectively zero
            # for non-engine moves at high ratings.
            for move in board.legal_moves:
                try:
                    idx = encode_move(move, board)
                    if logits[idx] != float("-inf"):
                        continue

                    piece = board.piece_at(move.from_square)
                    base_logit = -8.0

                    if piece:
                        pt = piece.piece_type
                        if pt == chess.PAWN:
                            to_file = chess.square_file(move.to_square)
                            central = to_file in (2, 3, 4, 5)
                            base_logit = -3.0 if central else -4.5
                        elif pt == chess.KNIGHT:
                            to_rank = chess.square_rank(move.to_square)
                            to_file = chess.square_file(move.to_square)
                            central = 2 <= to_file <= 5 and 2 <= to_rank <= 5
                            base_logit = -4.0 if central else -5.5
                        elif pt == chess.BISHOP:
                            base_logit = -5.5
                        elif pt == chess.ROOK:
                            base_logit = -7.0
                        elif pt == chess.QUEEN:
                            base_logit = -9.0
                        elif pt == chess.KING:
                            if board.is_castling(move):
                                base_logit = -0.5  # Castling is often good
                            else:
                                base_logit = -12.0

                    # Small bonus for captures among non-engine moves
                    if board.is_capture(move):
                        base_logit += 1.5

                    logits[idx] = base_logit + random.gauss(0, 0.1)
                except (ValueError, IndexError):
                    continue
        else:
            # No Stockfish data — use strong chess heuristics.
            # This is the last resort and should still produce sensible play.
            for move in board.legal_moves:
                try:
                    idx = encode_move(move, board)
                    score = 0.0
                    piece = board.piece_at(move.from_square)
                    if not piece:
                        logits[idx] = -8.0
                        continue

                    pt = piece.piece_type
                    to_file = chess.square_file(move.to_square)
                    to_rank = chess.square_rank(move.to_square)
                    move_num = board.fullmove_number

                    # === Captures: always attractive (MVV-LVA) ===
                    if board.is_capture(move):
                        victim = board.piece_at(move.to_square)
                        attacker_val = {1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 100}
                        victim_val = {1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 100}
                        if victim:
                            gain = victim_val.get(victim.piece_type, 0) - attacker_val.get(pt, 0)
                            if gain > 0:
                                score += 3.0 + gain * 0.5  # Winning capture
                            elif gain == 0:
                                score += 1.5  # Equal trade
                            else:
                                score += -1.0  # Losing capture
                        elif board.is_en_passant(move):
                            score += 1.5

                    # === Check / checkmate ===
                    board.push(move)
                    is_check = board.is_check()
                    is_checkmate = board.is_checkmate()
                    board.pop()
                    if is_checkmate:
                        score += 20.0  # Always play checkmate
                    elif is_check:
                        score += 1.5

                    # === Castling: almost always good ===
                    if board.is_castling(move):
                        score += 3.5

                    # === Centralization ===
                    center_dist = abs(to_file - 3.5) + abs(to_rank - 3.5)
                    score += max(0, (4.0 - center_dist)) * 0.15

                    # === Piece development (opening) ===
                    if move_num <= 12:
                        from_rank_own = chess.square_rank(move.from_square)
                        if board.turn == chess.BLACK:
                            from_rank_own = 7 - from_rank_own
                            to_rank_adj = 7 - to_rank
                        else:
                            to_rank_adj = to_rank
                        # Develop minor pieces off back rank
                        if pt in (chess.KNIGHT, chess.BISHOP):
                            if from_rank_own <= 1 and to_rank_adj >= 2:
                                score += 1.5
                        # Don't move queen early
                        if pt == chess.QUEEN and move_num < 6:
                            score -= 2.5
                        # Don't move king (non-castling) in opening
                        if pt == chess.KING and not board.is_castling(move):
                            score -= 3.0

                    # === Pawn structure ===
                    if pt == chess.PAWN:
                        if to_file in (3, 4) and to_rank in (3, 4):
                            score += 0.8  # Center pawns to center
                        if to_file in (0, 7) and move_num < 15:
                            score -= 0.5  # Don't push edge pawns early

                    # === Hanging piece avoidance ===
                    if board.is_attacked_by(not board.turn, move.from_square):
                        if pt in (chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT):
                            score += 0.5  # Bonus for moving attacked piece

                    # === Don't hang the moved piece ===
                    if board.is_attacked_by(not board.turn, move.to_square):
                        if not board.is_attacked_by(board.turn, move.to_square):
                            piece_val = {1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 100}
                            penalty = piece_val.get(pt, 0) * 0.5
                            score -= penalty

                    # === Penalize aimless king moves ===
                    if pt == chess.KING and not board.is_castling(move):
                        score -= 1.5

                    # === Penalize random queen moves mid/late ===
                    if pt == chess.QUEEN and move_num >= 6:
                        # Only penalize non-captures, non-checks
                        if not board.is_capture(move) and not is_check:
                            score -= 0.5

                    logits[idx] = score + random.gauss(0, 0.1)
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


def _stats_to_style(stats: np.ndarray) -> StyleOverrides:
    """Derive StyleOverrides from a player stats vector.

    Stats vector layout (see player_stats.py PlayerStats.to_vector()):
      [3]  blunder_rate       → blunder_frequency (0-100)
      [4]  aggression_index   → aggression (0-100)
      [10] consistency        → inverse maps to risk_taking (0-100)
    """
    aggression = float(stats[4]) * 100.0           # aggression_index is 0-1
    blunder_frequency = float(stats[3]) * 100.0    # blunder_rate is 0-1
    consistency = float(stats[10])                 # 0=wild, 1=very consistent
    risk_taking = (1.0 - consistency) * 100.0      # low consistency → high risk

    return StyleOverrides(
        aggression=max(0.0, min(100.0, aggression)),
        risk_taking=max(0.0, min(100.0, risk_taking)),
        blunder_frequency=max(0.0, min(100.0, blunder_frequency)),
    )


# Global singleton
prediction_pipeline = PredictionPipeline()
