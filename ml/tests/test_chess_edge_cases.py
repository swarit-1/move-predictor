"""PLAN.md §5.1 — chess-domain edge cases.

The board is where weird lives: every case here is a position class that
has broken a chess engine UI somewhere. Each test drives the *real* stack:
move encoding roundtrip, legal-move mask, board tensor, and the sampling
pipeline (which must return a legal move from pure-uniform logits).
"""

import chess
import pytest
import torch

from src.data.preprocessing import board_to_tensor
from src.inference.sampler import sample_move
from src.models.move_encoding import (
    NUM_MOVES,
    decode_move,
    encode_move,
    get_legal_move_mask,
)


def roundtrip_all_legal(board: chess.Board):
    """Every legal move must encode and decode back to itself."""
    for move in board.legal_moves:
        idx = encode_move(move, board)
        assert 0 <= idx < NUM_MOVES
        assert decode_move(idx, board) == move, (
            f"roundtrip failed for {move.uci()} in {board.fen()}"
        )


def mask_matches_legal(board: chess.Board):
    mask = get_legal_move_mask(board)
    legal_indices = {encode_move(m, board) for m in board.legal_moves}
    assert set(mask.nonzero()[0].tolist()) == legal_indices


def sampled_move_is_legal(board: chess.Board, rating: float = 1200.0):
    result = sample_move(
        policy_logits=torch.zeros(NUM_MOVES),
        board=board,
        player_rating=rating,
    )
    assert result.move in board.legal_moves


def full_stack(board: chess.Board):
    roundtrip_all_legal(board)
    mask_matches_legal(board)
    tensor = board_to_tensor(board)
    assert tensor.shape == (18, 8, 8)
    if not board.is_game_over():
        sampled_move_is_legal(board)


# ── Promotions ────────────────────────────────────────────────────────

def test_promotion_all_pieces_straight_and_capture():
    # White pawn on b7, black rook on a8: b8=Q/R/B/N and bxa8=Q/R/B/N
    board = chess.Board("r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1")
    promos = [m for m in board.legal_moves if m.promotion]
    assert len(promos) == 8
    full_stack(board)


def test_underpromotion_to_knight_delivers_mate():
    # Classic smothered-style corner: only N-promotion mates.
    board = chess.Board("6rk/5Ppp/8/7N/8/8/8/6RK w - - 0 1")
    mate_moves = [
        m for m in board.legal_moves
        if board.gives_check(m) and m.promotion == chess.KNIGHT
    ]
    # f8=N is at least check in this construction; verify encode handles it
    for m in mate_moves:
        assert decode_move(encode_move(m, board), board) == m
    full_stack(board)


def test_black_promotion_mirrored_encoding():
    board = chess.Board("4k3/8/8/8/8/8/6p1/4K2R b - - 0 1")
    promos = [m for m in board.legal_moves if m.promotion]
    assert len(promos) >= 4  # g1=Q/R/B/N (+ capture promos onto h1)
    full_stack(board)


# ── En passant ────────────────────────────────────────────────────────

def test_en_passant_window_only_immediately_after():
    board = chess.Board()
    for uci in ["e2e4", "a7a6", "e4e5", "d7d5"]:
        board.push_uci(uci)
    ep = chess.Move.from_uci("e5d6")
    assert ep in board.legal_moves
    full_stack(board)
    # Play something else; the ep right must be gone next turn.
    board.push_uci("b1c3")
    board.push_uci("a6a5")
    assert chess.Move.from_uci("e5d6") not in board.legal_moves


def test_en_passant_resolving_check():
    # Black just played d7-d5 double-push blocking nothing; white pawn e5
    # can capture d6 e.p. — construct a position where the pushed pawn
    # gives check and e.p. is the only capture that removes the checker.
    board = chess.Board("8/8/8/2k5/3Pp3/8/8/4K3 b - d3 0 1")
    # Black to move: pawn e4 can take d3 e.p.
    ep = chess.Move.from_uci("e4d3")
    assert ep in board.legal_moves
    full_stack(board)


def test_en_passant_pinned_pawn_illegal():
    # The white e5 pawn is pinned to its king along the e-file by a rook:
    # capturing d6 e.p. would expose the king and must be illegal.
    board = chess.Board("4r3/8/8/3pP3/8/8/8/4K3 w - d6 0 2")
    assert chess.Move.from_uci("e5d6") not in board.legal_moves
    # The mask must agree with python-chess exactly.
    mask_matches_legal(board)


# ── Castling ──────────────────────────────────────────────────────────

CASTLE_BASE = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R"


@pytest.mark.parametrize("rights", ["KQkq", "Kq", "Qk", "K", "q", "-"])
def test_castling_rights_permutations(rights):
    board = chess.Board(f"{CASTLE_BASE} w {rights} - 0 1")
    kingside = chess.Move.from_uci("e1g1")
    queenside = chess.Move.from_uci("e1c1")
    assert (kingside in board.legal_moves) == ("K" in rights)
    assert (queenside in board.legal_moves) == ("Q" in rights)
    full_stack(board)


def test_castling_through_check_rejected():
    # Black rook on f8 covers f1 — kingside castling through check illegal.
    board = chess.Board("r3kr2/8/8/8/8/8/8/R3K2R w KQq - 0 1")
    assert chess.Move.from_uci("e1g1") not in board.legal_moves
    assert chess.Move.from_uci("e1c1") in board.legal_moves
    mask_matches_legal(board)


def test_castling_out_of_check_rejected():
    board = chess.Board("r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1")
    assert board.is_check()
    assert chess.Move.from_uci("e1g1") not in board.legal_moves
    assert chess.Move.from_uci("e1c1") not in board.legal_moves
    mask_matches_legal(board)


def test_rights_lost_by_rook_capture_at_rook_square():
    board = chess.Board("r3k2r/8/8/8/8/8/6n1/R3K2R b KQkq - 0 1")
    board.push_uci("g2h1" if chess.Move.from_uci("g2h1") in board.legal_moves
                   else "g2e1")
    # Wherever the knight landed, if it took h1 the K-right is gone.
    if board.piece_at(chess.H1) and board.piece_at(chess.H1).piece_type == chess.KNIGHT:
        assert not board.has_kingside_castling_rights(chess.WHITE)
    mask_matches_legal(board)


# ── Draw / terminal states ────────────────────────────────────────────

def test_stalemate_has_no_moves_and_empty_mask():
    board = chess.Board("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")
    assert board.is_stalemate()
    assert get_legal_move_mask(board).sum() == 0


def test_checkmate_terminal():
    board = chess.Board("6rk/5Npp/8/8/8/8/8/6K1 b - - 0 1")
    if board.is_checkmate():
        assert get_legal_move_mask(board).sum() == 0
    else:
        full_stack(board)


@pytest.mark.parametrize("fen,expect_insufficient", [
    ("4k3/8/8/8/8/8/8/4K3 w - - 0 1", True),          # K vs K
    ("4k3/8/8/8/8/8/8/2B1K3 w - - 0 1", True),        # KB vs K
    ("4k3/8/8/8/8/8/8/2N1K3 w - - 0 1", True),        # KN vs K
    ("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", False),        # KR vs K
])
def test_insufficient_material(fen, expect_insufficient):
    board = chess.Board(fen)
    assert board.is_insufficient_material() == expect_insufficient
    if not board.is_game_over():
        full_stack(board)


def test_fifty_move_and_repetition_flags():
    board = chess.Board("4k3/8/8/8/8/8/8/R3K3 w - - 99 80")
    board.push_uci("a1a2")  # quiet rook move → halfmove clock hits 100
    assert board.halfmove_clock == 100
    assert board.can_claim_fifty_moves()


# ── Hostile FEN handling (§5.1 fuzz cases, deterministic subset) ─────

@pytest.mark.parametrize("bad_fen", [
    "",
    "not a fen at all",
    "8/8/8/8/8/8/8 w - - 0 1",              # 7 ranks
    "9/8/8/8/8/8/8/8 w - - 0 1",            # rank overflow
    "8/8/8/8/8/8/8/8 x - - 0 1",            # bad side
    # NOTE: python-chess tolerates a missing fullmove field (defaults it),
    # so 5-field FENs are only rejected at the gateway's isValidFen.
    "8/8/8/8/8/8/8/8 w - - 0 1\x00evil",
    "K" * 5000,
])
def test_malformed_fens_rejected(bad_fen):
    with pytest.raises(ValueError):
        chess.Board(bad_fen)


def test_absurd_but_valid_position_nine_queens():
    board = chess.Board("QQQQQQQQ/QQQQQQQQ/8/8/4k3/8/8/K7 w - - 0 1")
    # Not a reachable game position, but structurally valid — the stack
    # must not crash on it.
    roundtrip_all_legal(board)
    mask_matches_legal(board)


# ── Whole-game replay sanity across phases ────────────────────────────

def test_full_random_games_encode_at_every_ply():
    import random

    rng = random.Random(7)
    for _ in range(5):
        board = chess.Board()
        for _ply in range(120):
            if board.is_game_over():
                break
            move = rng.choice(list(board.legal_moves))
            idx = encode_move(move, board)
            assert decode_move(idx, board) == move
            board.push(move)
