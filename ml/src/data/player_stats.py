"""Compute aggregate player statistics from their games.

These stats feed into the player embedding as continuous features.
"""

import re
import numpy as np
import chess
import chess.pgn
from io import StringIO
from dataclasses import dataclass


@dataclass
class PlayerStats:
    """Aggregated statistics for a player across their games.

    PRD §4.2 / §5.2: indices 0–24 are the original 25-dim vector. Indices
    25–32 are the new "Phase 2" dimensions that drive the expanded slider
    set. Order is append-only so checkpoint compatibility breaks
    predictably — bumping `num_player_stats` is the version bump.
    """

    # ── Indices 0–24 (original) ────────────────────────────────────
    rating: float = 1500.0
    num_games: int = 0
    avg_centipawn_loss: float = 50.0
    blunder_rate: float = 0.05
    aggression_index: float = 0.5  # ratio of attacking vs quiet moves
    tactical_tendency: float = 0.5  # ratio of tactical (captures/checks) moves
    opening_diversity: float = 0.5  # entropy of opening choices
    endgame_accuracy: float = 0.5
    avg_move_time: float = 0.0  # seconds per move; populated from [%clk]
    time_pressure_tendency: float = 0.0  # fraction of moves played with <30s
    consistency: float = 0.5  # low variance in performance
    win_rate: float = 0.5
    draw_rate: float = 0.1
    avg_game_length: float = 40.0
    # Opening preferences (encoded as ratios)
    e4_ratio: float = 0.0
    d4_ratio: float = 0.0
    other_opening_ratio: float = 0.0
    # Positional metrics
    piece_activity: float = 0.5
    king_safety_preference: float = 0.5
    pawn_structure_care: float = 0.5
    exchange_tendency: float = 0.5
    # Endgame
    endgame_conversion: float = 0.5
    opposite_color_bishop_skill: float = 0.5  # placeholder — not yet computed
    rook_endgame_skill: float = 0.5            # placeholder — not yet computed
    pawn_endgame_skill: float = 0.5            # placeholder — not yet computed

    # ── Indices 25–32 (PRD §4.2 expansion) ──────────────────────────
    sacrifice_rate: float = 0.0
    """Fraction of player moves where their own move dropped eval ≥150 cp
    but the game was still won or drawn — a proxy for intentional
    sacrificial play vs simple blunders."""

    eval_volatility: float = 0.0
    """Stdev of move-by-move eval swings across the player's games,
    normalized to [0,1]. High = sharp/chaotic player; low = positional."""

    king_attack_intensity: float = 0.0
    """Average per-move increase in the count of own pieces attacking the
    7-square enemy king zone. Captures the urge to launch attacks."""

    quiet_move_ratio: float = 0.5
    """Fraction of moves that are neither captures, checks, nor castles.
    High = positional maneuverer; low = tactical/forcing player."""

    opening_cpl: float = 50.0
    """Average centipawn loss across moves 1–12. Lower = strong theory."""

    middlegame_cpl: float = 50.0
    """Average centipawn loss across moves 13–40. The core skill phase."""

    endgame_cpl: float = 50.0
    """Average centipawn loss for moves past move 40."""

    capture_initiation_rate: float = 0.0
    """Fraction of captures that are *initiating* trades (capturing a
    piece that wasn't the immediate recapture). High = aggressive trader."""

    # ── Not in to_vector() — the 33-dim vector is frozen for checkpoint
    # compatibility. Drives slider baselines + sampler biases only. ──
    pawn_aggression: float = 0.0
    """PRD §4.1 #11: fraction of middlegame moves that are flank pawn
    pushes (a/b/g/h files) or pawn advances past the 4th rank — the
    signature of a pawn-storm player."""

    def to_vector(self) -> np.ndarray:
        """Convert to a numpy vector for model input.

        Returns 33 normalized float values. Order MUST match the indices
        documented above; downstream code (sampler, opening-book
        derivation, dataset loader) reads positionally.
        """
        return np.array([
            self.rating / 3000.0,
            min(self.num_games / 1000.0, 1.0),
            min(self.avg_centipawn_loss / 200.0, 1.0),
            self.blunder_rate,
            self.aggression_index,
            self.tactical_tendency,
            self.opening_diversity,
            self.endgame_accuracy,
            min(self.avg_move_time / 120.0, 1.0),
            self.time_pressure_tendency,
            self.consistency,
            self.win_rate,
            self.draw_rate,
            min(self.avg_game_length / 100.0, 1.0),
            self.e4_ratio,
            self.d4_ratio,
            self.other_opening_ratio,
            self.piece_activity,
            self.king_safety_preference,
            self.pawn_structure_care,
            self.exchange_tendency,
            self.endgame_conversion,
            self.opposite_color_bishop_skill,
            self.rook_endgame_skill,
            self.pawn_endgame_skill,
            # PRD §4.2 expansion ─────
            self.sacrifice_rate,
            self.eval_volatility,
            self.king_attack_intensity,
            self.quiet_move_ratio,
            min(self.opening_cpl / 200.0, 1.0),
            min(self.middlegame_cpl / 200.0, 1.0),
            min(self.endgame_cpl / 200.0, 1.0),
            self.capture_initiation_rate,
        ], dtype=np.float32)


async def annotate_pgns_with_stockfish(
    pgn_texts: list[str],
    player_name: str,
    max_positions: int = 400,
    depth: int = 8,
) -> list[str]:
    """Run a lightweight Stockfish pass over Chess.com PGNs (PRD §5.3).

    Chess.com PGNs lack Lichess's [%eval] annotations, so CPL / blunder
    stats default to placeholders. This function samples up to
    `max_positions` of the player's own moves across the supplied games,
    runs Stockfish at `depth` (fast), and injects [%eval] comments into
    the PGN text so the existing `compute_stats_from_pgns` code picks
    up the annotations naturally.

    Designed to finish in ≤30 seconds on a 4-worker Stockfish pool at
    depth 8. If Stockfish is unavailable, returns the PGNs unchanged.
    """
    import asyncio
    try:
        from src.engine.stockfish_pool import stockfish_pool
        if stockfish_pool._executor is None:
            return pgn_texts
    except Exception:
        return pgn_texts

    annotated: list[str] = list(pgn_texts)
    positions_to_eval: list[tuple[int, int, str]] = []  # (game_idx, node_ply, fen)

    for g_idx, pgn_text in enumerate(pgn_texts):
        game = chess.pgn.read_game(StringIO(pgn_text))
        if game is None:
            continue
        is_white = game.headers.get("White", "").lower() == player_name.lower()
        board = game.board()
        ply = 0
        for node in game.mainline():
            is_player = (board.turn == chess.WHITE) == is_white
            if is_player:
                positions_to_eval.append((g_idx, ply, board.fen()))
            board.push(node.move)
            ply += 1
        if len(positions_to_eval) >= max_positions * 2:
            break

    if not positions_to_eval:
        return pgn_texts

    # Sample down to max_positions if we have more.
    import random
    if len(positions_to_eval) > max_positions:
        positions_to_eval = random.sample(positions_to_eval, max_positions)

    # Batch-evaluate with the Stockfish pool.
    loop = asyncio.get_event_loop()
    fens = [p[2] for p in positions_to_eval]
    futures = [
        loop.run_in_executor(
            None, lambda f=fen: stockfish_pool.analyze_sync(f, depth=depth, num_lines=1)
        )
        for fen in fens
    ]
    results = await asyncio.gather(*futures, return_exceptions=True)

    # Build a lookup: (game_idx, ply) → eval_cp
    eval_lookup: dict[tuple[int, int], float] = {}
    for (g_idx, ply, _fen), result in zip(positions_to_eval, results):
        if isinstance(result, Exception):
            continue
        cp = result.eval_cp
        if cp is not None:
            eval_lookup[(g_idx, ply)] = cp / 100.0

    # Re-walk the PGNs and inject [%eval] into move comments where we
    # have results. We rebuild the PGN string with the new comments.
    new_pgns: list[str] = []
    for g_idx, pgn_text in enumerate(pgn_texts):
        game = chess.pgn.read_game(StringIO(pgn_text))
        if game is None:
            new_pgns.append(pgn_text)
            continue
        node = game
        ply = 0
        for child_node in game.mainline():
            key = (g_idx, ply)
            if key in eval_lookup:
                ev = eval_lookup[key]
                existing = child_node.comment or ""
                child_node.comment = f"[%eval {ev:.2f}] {existing}".strip()
            ply += 1
        exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=True)
        new_pgns.append(game.accept(exporter))

    return new_pgns


def compute_stats_from_pgns(
    pgn_texts: list[str],
    player_name: str,
    color_filter: str | None = None,
) -> PlayerStats:
    """Compute player statistics from a collection of PGN games.

    Args:
        pgn_texts: List of PGN strings.
        player_name: The player's name (to determine which side they played).
        color_filter: PRD §4.1 #13 (Color-Specific Mode) — "white" or
            "black" restricts the computation to games the player played
            with that color; None uses every game.

    Returns:
        PlayerStats with computed values.
    """
    if color_filter in ("white", "black"):
        want_white = color_filter == "white"
        filtered = []
        for text in pgn_texts:
            header_zone = text.split("\n\n", 1)[0]
            m = re.search(r'\[White "([^"]*)"\]', header_zone)
            is_white = bool(m) and m.group(1).lower() == player_name.lower()
            if is_white == want_white:
                filtered.append(text)
        pgn_texts = filtered

    stats = PlayerStats()
    stats.num_games = len(pgn_texts)

    if not pgn_texts:
        return stats

    total_moves = 0
    total_captures = 0
    total_checks = 0
    total_exchanges = 0  # recaptures on the same square
    total_castles = 0
    total_king_moves = 0  # non-castling king moves (risky)
    total_center_moves = 0  # moves to central squares (piece activity proxy)
    total_pawn_moves = 0
    total_pawn_structure_moves = 0  # non-capture pawn pushes (structure-building)
    game_lengths: list[int] = []
    game_capture_rates: list[float] = []  # per-game capture rates for consistency
    results = {"win": 0, "loss": 0, "draw": 0}
    openings: list[str] = []
    endgame_results: list[bool] = []  # True = won/drew from endgame, False = lost
    all_ratings: list[float] = []  # Collect ratings to average (not just take last)
    # CPL tracking from Lichess [%eval] annotations (only populated when evals=true)
    total_cpl = 0.0
    cpl_count = 0
    blunder_count = 0  # moves with CPL > 100
    # ── PRD §4.2 new accumulators ────────────────────────────────────
    total_quiet_moves = 0  # neither capture nor check nor castle
    total_storm_pushes = 0  # PRD §4.1 #11: flank/storm pawn pushes in middlegame
    total_initiating_captures = 0  # captures that aren't recaptures
    games_with_sacrifice = 0  # games where ≥1 eval drop ≥150 cp occurred
    games_sacrifice_rewarded = 0  # of those, the player won or drew
    eval_swings: list[float] = []  # |Δeval| per player move
    king_attack_deltas: list[int] = []  # Δ(own attackers on enemy king zone)
    move_times: list[float] = []  # seconds per player move from [%clk]
    short_clock_moves = 0  # player moves where clock < 30s after the move
    clock_observed_moves = 0
    # Per-phase CPL
    cpl_open_total = 0.0; cpl_open_count = 0   # noqa: E702
    cpl_mid_total = 0.0;  cpl_mid_count = 0    # noqa: E702
    cpl_end_total = 0.0;  cpl_end_count = 0    # noqa: E702

    CENTER_SQUARES = {chess.E4, chess.D4, chess.E5, chess.D5,
                      chess.C3, chess.D3, chess.E3, chess.F3,
                      chess.C6, chess.D6, chess.E6, chess.F6}

    for pgn_text in pgn_texts:
        game = chess.pgn.read_game(StringIO(pgn_text))
        if game is None:
            continue

        headers = game.headers
        is_white = headers.get("White", "").lower() == player_name.lower()
        result = headers.get("Result", "*")

        # Track result
        if result == "1-0":
            results["win" if is_white else "loss"] += 1
        elif result == "0-1":
            results["loss" if is_white else "win"] += 1
        elif result == "1/2-1/2":
            results["draw"] += 1

        # Track rating — handle provisional ratings like "1523?"
        rating_key = "WhiteElo" if is_white else "BlackElo"
        rating_str = headers.get(rating_key, "")
        try:
            clean_rating = str(rating_str).strip().rstrip("?")
            if clean_rating:
                all_ratings.append(float(clean_rating))
        except (ValueError, TypeError):
            pass

        # Analyze moves
        board = game.board()
        move_count = 0
        game_captures = 0
        first_move = None
        last_capture_square: int | None = None
        reached_endgame = False
        endgame_started_winning = False
        prev_eval: float | None = None  # eval (from white's POV) before current move
        # PRD §4.2: per-side previous-clock readings for time-per-move estimate
        prev_clk_white: float | None = None
        prev_clk_black: float | None = None
        game_had_sacrifice_signal = False

        for node in game.mainline():
            move = node.move
            is_player_move = (board.turn == chess.WHITE) == is_white

            # Detect endgame: <= 12 non-pawn, non-king pieces total
            if not reached_endgame:
                piece_count = sum(
                    1 for sq in chess.SQUARES
                    if board.piece_at(sq) is not None
                    and board.piece_type_at(sq) not in (chess.PAWN, chess.KING)
                )
                if piece_count <= 6:
                    reached_endgame = True
                    # Heuristic: was the player ahead in material?
                    player_color = chess.WHITE if is_white else chess.BLACK
                    my_material = sum(
                        _piece_value(board.piece_type_at(sq))
                        for sq in chess.SQUARES
                        if board.piece_at(sq) is not None
                        and board.color_at(sq) == player_color
                    )
                    opp_material = sum(
                        _piece_value(board.piece_type_at(sq))
                        for sq in chess.SQUARES
                        if board.piece_at(sq) is not None
                        and board.color_at(sq) != player_color
                    )
                    endgame_started_winning = my_material >= opp_material

            if is_player_move:
                move_count += 1
                total_moves += 1

                if first_move is None:
                    first_move = move.uci()

                is_capture = board.is_capture(move)
                gives_check = board.gives_check(move)
                is_castle_move = (
                    board.piece_at(move.from_square) is not None
                    and board.piece_at(move.from_square).piece_type == chess.KING
                    and board.is_castling(move)
                )
                if is_capture:
                    total_captures += 1
                    game_captures += 1
                    # Exchange detection: recapture on the same square
                    if last_capture_square == move.to_square:
                        total_exchanges += 1
                    else:
                        total_initiating_captures += 1

                if gives_check:
                    total_checks += 1

                # PRD §4.2: quiet move = not capture, not check, not castle.
                if not is_capture and not gives_check and not is_castle_move:
                    total_quiet_moves += 1

                # PRD §4.1 #11 (Pawn Aggression): flank pawn pushes (a/b/g/h
                # files) or any pawn advancing past its 4th rank outside the
                # opening — the signature of a storm player.
                _pc = board.piece_at(move.from_square)
                if _pc is not None and _pc.piece_type == chess.PAWN and move_count >= 10:
                    _file = chess.square_file(move.to_square)
                    _rank = chess.square_rank(move.to_square)
                    _adv_rank = _rank if _pc.color == chess.WHITE else 7 - _rank
                    if _file in (0, 1, 6, 7) or _adv_rank >= 4:
                        total_storm_pushes += 1

                # PRD §4.2: king-attack intensity. Count own attackers on
                # the 9-square enemy king zone before and after the move,
                # record the positive delta.
                opp_color = not board.turn
                opp_king_sq = board.king(opp_color)
                if opp_king_sq is not None:
                    attackers_before = _count_attackers_on_king_zone(
                        board, board.turn, opp_king_sq
                    )
                    board.push(move)
                    attackers_after = _count_attackers_on_king_zone(
                        board, not board.turn, opp_king_sq
                    )
                    board.pop()
                    delta = attackers_after - attackers_before
                    if delta > 0:
                        king_attack_deltas.append(delta)

                piece = board.piece_at(move.from_square)
                if piece:
                    pt = piece.piece_type
                    if pt == chess.KING:
                        if board.is_castling(move):
                            total_castles += 1
                        else:
                            total_king_moves += 1
                    elif pt == chess.PAWN:
                        total_pawn_moves += 1
                        if not is_capture:
                            total_pawn_structure_moves += 1

                # Piece activity: moves to central/extended-center squares
                if move.to_square in CENTER_SQUARES:
                    total_center_moves += 1

            # Track last capture square for exchange detection
            if board.is_capture(move):
                last_capture_square = move.to_square
            else:
                last_capture_square = None

            # Parse Lichess [%eval X.XX] annotation (present when evals=true).
            # The annotation in node.comment is the eval AFTER this move.
            # Lichess evals are always from White's perspective.
            eval_after = _parse_eval_annotation(node.comment)
            if is_player_move and prev_eval is not None and eval_after is not None:
                if is_white:
                    # Good white move: eval rises. CPL = how much it dropped.
                    cpl = max(0.0, (prev_eval - eval_after) * 100)
                else:
                    # Good black move: eval falls (more negative). CPL = how much it rose.
                    cpl = max(0.0, (eval_after - prev_eval) * 100)
                clamped = min(cpl, 500.0)
                total_cpl += clamped
                cpl_count += 1
                if clamped > 100:
                    blunder_count += 1

                # PRD §4.2: per-phase CPL. Phase boundaries match the
                # fullmove number, not the half-move count.
                fullmove = board.fullmove_number
                if fullmove <= 12:
                    cpl_open_total += clamped
                    cpl_open_count += 1
                elif fullmove <= 40:
                    cpl_mid_total += clamped
                    cpl_mid_count += 1
                else:
                    cpl_end_total += clamped
                    cpl_end_count += 1

                # PRD §4.2: eval volatility — absolute swing across the
                # player's own move. Avoid double-counting opponent swings.
                eval_swings.append(abs(eval_after - prev_eval))

                # PRD §4.2: sacrifice signal — eval drop ≥1.5 pawns that
                # the player caused. The per-game flag is resolved
                # against the game result after the move loop.
                if clamped >= 150:
                    game_had_sacrifice_signal = True

            if eval_after is not None:
                prev_eval = eval_after

            # PRD §4.2: parse [%clk] move-time annotations. Lichess
            # provides the clock AFTER each move when `clocks=true` is
            # passed (we already do). Approximate time-per-move as the
            # diff between this player move's clock and the same
            # player's previous move's clock, plus the time-control
            # increment if known (we don't have it here — close enough).
            if is_player_move:
                clk_after = _parse_clk_annotation(node.comment)
                if clk_after is not None:
                    clock_observed_moves += 1
                    if clk_after < 30.0:
                        short_clock_moves += 1
                    # Only have current clock; convert to a per-move
                    # estimate by tracking the prior reading per side.
                    prev_clk_for_side = (
                        prev_clk_white if is_white else prev_clk_black
                    )
                    if prev_clk_for_side is not None and prev_clk_for_side >= clk_after:
                        # crude: ignore moves where increment makes diff negative
                        delta_t = prev_clk_for_side - clk_after
                        if 0 < delta_t < 600:  # filter pathological values
                            move_times.append(delta_t)
                    if is_white:
                        prev_clk_white = clk_after
                    else:
                        prev_clk_black = clk_after

            board.push(move)

        game_lengths.append(board.fullmove_number)

        # Per-game capture rate for consistency calculation
        if move_count > 0:
            game_capture_rates.append(game_captures / move_count)

        # Endgame result tracking
        if reached_endgame:
            if result == "1-0":
                endgame_results.append(is_white)
            elif result == "0-1":
                endgame_results.append(not is_white)
            elif result == "1/2-1/2":
                # Draw from a winning endgame = not great conversion
                endgame_results.append(not endgame_started_winning)

        # Track opening
        if first_move:
            openings.append(first_move)

        # PRD §4.2: resolve sacrifice signals against the game result.
        # A sac is "rewarded" if the player won or drew. Losses with
        # sacrifices are scored as plain blunders, not sacrifices.
        if game_had_sacrifice_signal:
            games_with_sacrifice += 1
            player_won_or_drew = (
                (is_white and result in ("1-0", "1/2-1/2"))
                or (not is_white and result in ("0-1", "1/2-1/2"))
            )
            if player_won_or_drew:
                games_sacrifice_rewarded += 1

    total_games = max(stats.num_games, 1)

    # Use average of all game ratings (not just last game's)
    if all_ratings:
        stats.rating = sum(all_ratings) / len(all_ratings)

    # Compute derived stats
    stats.win_rate = results["win"] / total_games
    stats.draw_rate = results["draw"] / total_games
    stats.avg_game_length = float(np.mean(game_lengths)) if game_lengths else 40.0

    if total_moves > 0:
        stats.tactical_tendency = (total_captures + total_checks) / total_moves
        stats.aggression_index = min(stats.tactical_tendency * 2, 1.0)

        # Exchange tendency: how often the player recaptures (exchanges pieces)
        stats.exchange_tendency = min(total_exchanges / total_moves * 10, 1.0)

        # Piece activity: proportion of moves going to center/extended-center
        stats.piece_activity = min(total_center_moves / total_moves * 3, 1.0)

        # King safety: high castling rate + few early king moves = safety-conscious
        castle_rate = total_castles / total_games
        king_move_rate = total_king_moves / total_moves
        stats.king_safety_preference = min(castle_rate + (1.0 - king_move_rate * 10), 1.0)
        stats.king_safety_preference = max(stats.king_safety_preference, 0.0)

        # Pawn structure care: ratio of non-capture pawn pushes
        if total_pawn_moves > 0:
            stats.pawn_structure_care = total_pawn_structure_moves / total_pawn_moves
        else:
            stats.pawn_structure_care = 0.5

    # Consistency: low variance in per-game capture rates
    if len(game_capture_rates) >= 3:
        variance = float(np.var(game_capture_rates))
        # Lower variance = higher consistency; scale so typical variance maps to ~0.5
        stats.consistency = max(0.0, min(1.0, 1.0 - variance * 20))
    elif len(game_capture_rates) > 0:
        stats.consistency = 0.5  # Not enough data

    # Accuracy from Lichess eval annotations (only set when evals were fetched)
    if cpl_count > 0:
        stats.avg_centipawn_loss = total_cpl / cpl_count
        stats.blunder_rate = blunder_count / cpl_count

    # Endgame stats
    if endgame_results:
        stats.endgame_conversion = sum(endgame_results) / len(endgame_results)
        stats.endgame_accuracy = stats.endgame_conversion  # Proxy — same data

    # Opening preferences
    if openings:
        e4_count = sum(1 for m in openings if m == "e2e4")
        d4_count = sum(1 for m in openings if m == "d2d4")
        total = len(openings)
        stats.e4_ratio = e4_count / total
        stats.d4_ratio = d4_count / total
        stats.other_opening_ratio = 1.0 - stats.e4_ratio - stats.d4_ratio

        # Opening diversity = unique openings / total games
        unique_openings = len(set(openings))
        stats.opening_diversity = min(unique_openings / total, 1.0)

    # ── PRD §4.2 derived stats ────────────────────────────────────────
    if total_moves > 0:
        stats.quiet_move_ratio = total_quiet_moves / total_moves
        stats.pawn_aggression = total_storm_pushes / total_moves
        if total_captures > 0:
            stats.capture_initiation_rate = (
                total_initiating_captures / total_captures
            )

    if king_attack_deltas:
        # Average positive king-zone delta per move where one occurred,
        # then scale by frequency. Cap at 1.0 for sane bounds.
        avg_delta = float(np.mean(king_attack_deltas))
        freq = len(king_attack_deltas) / max(total_moves, 1)
        stats.king_attack_intensity = min(avg_delta * freq * 2.0, 1.0)

    if eval_swings:
        # Normalize so that a typical "wild" game (mean swing ~1 pawn)
        # lands around 0.7 and a "quiet" game (~0.1) around 0.1.
        mean_swing = float(np.mean(eval_swings))
        stats.eval_volatility = min(mean_swing / 1.5, 1.0)

    if games_with_sacrifice > 0:
        stats.sacrifice_rate = games_sacrifice_rewarded / games_with_sacrifice
    else:
        stats.sacrifice_rate = 0.0

    if cpl_open_count > 0:
        stats.opening_cpl = cpl_open_total / cpl_open_count
    if cpl_mid_count > 0:
        stats.middlegame_cpl = cpl_mid_total / cpl_mid_count
    if cpl_end_count > 0:
        stats.endgame_cpl = cpl_end_total / cpl_end_count

    if move_times:
        stats.avg_move_time = float(np.mean(move_times))
    if clock_observed_moves > 0:
        stats.time_pressure_tendency = short_clock_moves / clock_observed_moves

    return stats


def _piece_value(piece_type: int | None) -> int:
    """Simple material value for endgame detection."""
    if piece_type is None:
        return 0
    return {
        chess.PAWN: 1,
        chess.KNIGHT: 3,
        chess.BISHOP: 3,
        chess.ROOK: 5,
        chess.QUEEN: 9,
        chess.KING: 0,
    }.get(piece_type, 0)


def _count_attackers_on_king_zone(
    board: chess.Board,
    attacker_color: chess.Color,
    king_square: int,
) -> int:
    """Count `attacker_color`'s pieces attacking any square in the 9-square
    zone centered on `king_square` (the king square plus its 8 neighbours).

    Used by the king-attack-intensity stat (PRD §4.2). Counts unique
    (piece × target-square) attacks: a queen pinging three king-zone
    squares contributes 3, since each is a distinct pressure point.
    """
    zone_squares = [king_square]
    kr = chess.square_rank(king_square)
    kf = chess.square_file(king_square)
    for dr in (-1, 0, 1):
        for df in (-1, 0, 1):
            if dr == 0 and df == 0:
                continue
            r, f = kr + dr, kf + df
            if 0 <= r < 8 and 0 <= f < 8:
                zone_squares.append(chess.square(f, r))
    total = 0
    for sq in zone_squares:
        total += len(board.attackers(attacker_color, sq))
    return total


def _parse_clk_annotation(comment: str) -> float | None:
    """Parse a Lichess [%clk H:MM:SS] annotation. Returns seconds remaining
    on the clock after the move was played, or None if not present.

    Examples:
        "{ [%eval 0.17] [%clk 0:09:55] }" → 595.0
        "{ [%clk 0:00:03.5] }"            → 3.5
    """
    if not comment:
        return None
    match = re.search(r"\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]", comment)
    if not match:
        return None
    try:
        h = int(match.group(1))
        m = int(match.group(2))
        s = float(match.group(3))
        return h * 3600 + m * 60 + s
    except ValueError:
        return None


def _parse_eval_annotation(comment: str) -> float | None:
    """Parse a Lichess [%eval X.XX] annotation from a PGN move comment.

    Lichess includes engine evaluations in move comments when evals=true is
    requested. The eval is always from White's perspective.

    Returns the eval as a float (centipawns / 100), or None if not present
    or if it's a mate score (which can't be used for CPL computation).

    Examples:
        "{ [%eval 0.17] [%clk 0:09:55] }" → 0.17
        "{ [%eval -1.30] }"               → -1.30
        "{ [%eval #3] }"                  → None  (mate score, skip)
        ""                                → None
    """
    if not comment:
        return None
    match = re.search(r'\[%eval\s+([^\]]+)\]', comment)
    if not match:
        return None
    val = match.group(1).strip()
    if val.startswith('#') or val.startswith('-#'):
        return None  # Mate score — skip, can't compute meaningful CPL
    try:
        return float(val)
    except ValueError:
        return None
