"""Mass self-play audit: play N games through the REAL sampling pipeline
and taxonomize every suspicious move (PLAN.md §1.2 blunder realism).

The specific failure this hunts: "no real person would play that" moves —
above all, moving a piece to a square where a strictly lower-valued
attacker takes it for free (Qd6?? next to a pawn). Real humans at club
level almost never do this; if the pipeline does, something upstream
(logits, biases, temperature, nucleus) is broken and every flagged case
is dumped with its full stage trace for diagnosis.

Runs in-process (no HTTP), uses the real checkpoint + sampler with the
exact serving configuration, full incremental histories like the app.

Usage:
    python3 scripts/selfplay_audit.py --bracket 1600_1800 --rating 1600 \
        --games 500 [--json out.json] [--device mps]
"""

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import chess
import numpy as np
import torch

from src.config import settings
from src.data.preprocessing import board_to_tensor, classify_game_phase
from src.inference.sampler import sample_move
from src.models.move_encoding import encode_move, get_legal_move_mask
from src.models.move_predictor import MovePredictor

PIECE_VAL = {
    chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3,
    chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 99,
}


def free_hang_audit(board: chess.Board, move: chess.Move) -> dict | None:
    """After `move`, can the opponent capture the moved piece at a profit
    with a strictly lower-valued attacker?

    Conservative definition (near-zero false positives): the landed piece
    is attacked by a cheaper enemy piece, and either it's undefended or
    the attacker survives the exchange favorably (attacker_value <
    victim_value means even defended it's a win for the attacker).
    Excludes captures that gained equal/greater material (a queen taking a
    rook "hangs" profitably) and mate deliveries.
    """
    mover = board.piece_at(move.from_square)
    if mover is None or mover.piece_type == chess.KING:
        return None
    victim_value = PIECE_VAL[mover.piece_type]

    captured_value = 0
    if board.is_capture(move):
        cap = board.piece_at(move.to_square)
        captured_value = PIECE_VAL[cap.piece_type] if cap else 1  # ep

    board.push(move)
    try:
        if board.is_checkmate():
            return None
        to_sq = move.to_square
        attackers = board.attackers(board.turn, to_sq)
        cheaper = [
            sq for sq in attackers
            if PIECE_VAL[board.piece_at(sq).piece_type] < victim_value
        ]
        if not cheaper:
            return None
        cheapest_val = min(PIECE_VAL[board.piece_at(sq).piece_type] for sq in cheaper)
        # Net loss if opponent plays the cheap capture: they lose at most
        # their attacker (if we recapture), we lose the piece. From the
        # mover's side: -(victim) + (attacker if defended else 0) + captured
        defended = bool(board.attackers(not board.turn, to_sq))
        net = -victim_value + (cheapest_val if defended else 0) + captured_value
        if net <= -3:  # lost at least a minor piece for nothing
            return {
                "piece": chess.piece_name(mover.piece_type),
                "attacker_value": cheapest_val,
                "net_material": net,
            }
        return None
    finally:
        board.pop()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--bracket", required=True, help="e.g. 1600_1800")
    p.add_argument("--rating", type=float, required=True)
    p.add_argument("--games", type=int, default=200)
    p.add_argument("--max-plies", type=int, default=140)
    p.add_argument("--device", default="cpu")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--json", default=None)
    args = p.parse_args()

    torch.set_num_threads(4)
    device = torch.device(args.device)
    torch.manual_seed(args.seed)
    random.seed(args.seed)

    model = MovePredictor()
    ckpt = torch.load(
        f"data/checkpoints/{args.bracket}/phase1_best.pt", map_location="cpu"
    )
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval().to(device)

    stats_vec = np.zeros(settings.num_player_stats, dtype=np.float32)
    stats_vec[0] = args.rating / 3000.0
    stats_t = torch.from_numpy(stats_vec).unsqueeze(0).to(device)

    total_moves = 0
    nonfinite_events = 0
    hang_events: list[dict] = []
    results = Counter()
    game_lengths = []

    for g in range(args.games):
        board = chess.Board()
        hist_idx: list[int] = []
        for ply in range(args.max_plies):
            if board.is_game_over():
                break
            T = settings.history_length
            h = np.zeros(T, dtype=np.int64)
            recent = hist_idx[-T:]
            if recent:
                h[T - len(recent):] = recent

            with torch.no_grad():
                out = model(
                    board_tensor=torch.from_numpy(board_to_tensor(board)).unsqueeze(0).to(device),
                    move_history=torch.from_numpy(h).unsqueeze(0).to(device),
                    player_id=torch.tensor([0], device=device),
                    player_stats=stats_t,
                    game_phase=torch.tensor([classify_game_phase(board)], device=device),
                    legal_move_mask=torch.from_numpy(get_legal_move_mask(board)).unsqueeze(0).to(device),
                    time_control=torch.tensor([2], device=device),
                )
            logits = out["policy_logits"][0].cpu()
            if not torch.isfinite(logits[torch.from_numpy(get_legal_move_mask(board))]).all():
                nonfinite_events += 1

            cpl_pred = max(0.0, out["cpl_pred"][0].item())
            blunder_p = float(torch.sigmoid(out["blunder_logit"][0]).item())
            sampled = sample_move(
                policy_logits=logits,
                board=board,
                predicted_cpl=cpl_pred,
                blunder_prob=blunder_p,
                player_rating=args.rating,
                blind_spot_scale=settings.model_path_blind_spot_scale,
                game_phase=classify_game_phase(board),
            )
            move = sampled.move
            total_moves += 1

            hang = free_hang_audit(board, move)
            if hang is not None:
                # Capture the full context for diagnosis
                masked = logits.clone()
                masked[~torch.from_numpy(get_legal_move_mask(board))] = float("-inf")
                model_probs = torch.softmax(masked, -1)
                hang.update({
                    "game": g,
                    "ply": ply,
                    "fen": board.fen(),
                    "move": move.uci(),
                    "model_prob": round(model_probs[encode_move(move, board)].item(), 4),
                    "sampled_prob": round(sampled.probability, 4),
                    "temperature": round(sampled.temperature, 3),
                })
                hang_events.append(hang)

            try:
                hist_idx.append(encode_move(move, board))
            except (ValueError, IndexError):
                hist_idx.append(0)
            board.push(move)

        game_lengths.append(board.ply())
        results[board.result(claim_draw=True)] += 1
        if (g + 1) % 50 == 0:
            print(
                f"  [{g+1}/{args.games} games] moves={total_moves} "
                f"hangs={len(hang_events)} ({len(hang_events)/max(total_moves,1)*100:.2f}%) "
                f"nonfinite={nonfinite_events}",
                flush=True,
            )

    piece_counts = Counter(h["piece"] for h in hang_events)
    report = {
        "bracket": args.bracket,
        "rating": args.rating,
        "games": args.games,
        "total_moves": total_moves,
        "avg_game_plies": round(float(np.mean(game_lengths)), 1),
        "results": dict(results),
        "nonfinite_logit_events": nonfinite_events,
        "free_hangs": len(hang_events),
        "free_hang_rate_pct": round(len(hang_events) / max(total_moves, 1) * 100, 3),
        "hangs_by_piece": dict(piece_counts),
        "worst_10": sorted(hang_events, key=lambda h: h["net_material"])[:10],
    }
    print(json.dumps({k: v for k, v in report.items() if k != "worst_10"}, indent=2))
    print("\nWORST 10 (full trace):")
    for h in report["worst_10"]:
        print(f"  {h['move']} ({h['piece']}, net {h['net_material']}) "
              f"model_p={h['model_prob']} sampled_p={h['sampled_prob']} "
              f"T={h['temperature']} fen={h['fen']}")
    if args.json:
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
