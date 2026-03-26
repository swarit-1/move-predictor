import { create } from "zustand";
import { Chess } from "chess.js";
import type { FamousGame } from "../data/famousGames";

interface ReplayState {
  /** The loaded game metadata */
  game: FamousGame | null;

  /** Full list of moves (SAN) from the original game */
  originalMoves: string[];

  /** Chess instance for the current position */
  chess: Chess;

  /** Current FEN for display */
  fen: string;

  /** Index into originalMoves — how far we've stepped (0 = start position, n = after n moves) */
  moveIndex: number;

  /** Whether we've forked from the original line */
  forked: boolean;

  /** Moves made after forking (SAN) */
  forkMoves: string[];

  /** The move index at which the fork occurred */
  forkPoint: number;

  /** Which side the AI plays in fork mode */
  aiColor: "w" | "b" | null;

  /** Loading state for AI prediction in fork mode */
  isLoading: boolean;

  /** Load a famous game */
  loadGame: (game: FamousGame) => void;

  /** Step forward one move in the original game */
  stepForward: () => void;

  /** Step backward one move */
  stepBackward: () => void;

  /** Jump to a specific move index */
  goToMove: (index: number) => void;

  /** Jump to start */
  goToStart: () => void;

  /** Jump to end */
  goToEnd: () => void;

  /** Fork from the current position — AI plays the specified side */
  fork: (aiColor: "w" | "b") => void;

  /** Make a move in fork mode (player's move) */
  makeForkMove: (from: string, to: string, promotion?: string) => boolean;

  /** Apply an AI move in fork mode */
  applyAiMove: (moveUci: string) => boolean;

  /** Cancel fork and return to original line at fork point */
  cancelFork: () => void;

  /** Set loading state */
  setLoading: (loading: boolean) => void;

  /** Reset the replay store */
  reset: () => void;
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  game: null,
  originalMoves: [],
  chess: new Chess(),
  fen: new Chess().fen(),
  moveIndex: 0,
  forked: false,
  forkMoves: [],
  forkPoint: 0,
  aiColor: null,
  isLoading: false,

  loadGame: (game) => {
    const chess = new Chess();
    chess.loadPgn(game.pgn);
    const moves = chess.history();
    // Reset to starting position
    const fresh = new Chess();
    set({
      game,
      originalMoves: moves,
      chess: fresh,
      fen: fresh.fen(),
      moveIndex: 0,
      forked: false,
      forkMoves: [],
      forkPoint: 0,
      aiColor: null,
      isLoading: false,
    });
  },

  stepForward: () => {
    const { originalMoves, moveIndex, chess, forked } = get();
    if (forked || moveIndex >= originalMoves.length) return;
    const newChess = new Chess(chess.fen());
    newChess.move(originalMoves[moveIndex]);
    set({
      chess: newChess,
      fen: newChess.fen(),
      moveIndex: moveIndex + 1,
    });
  },

  stepBackward: () => {
    const { originalMoves, moveIndex, forked } = get();
    if (forked || moveIndex <= 0) return;
    // Rebuild position up to moveIndex - 1
    const newChess = new Chess();
    for (let i = 0; i < moveIndex - 1; i++) {
      newChess.move(originalMoves[i]);
    }
    set({
      chess: newChess,
      fen: newChess.fen(),
      moveIndex: moveIndex - 1,
    });
  },

  goToMove: (index) => {
    const { originalMoves, forked } = get();
    if (forked) return;
    const clamped = Math.max(0, Math.min(index, originalMoves.length));
    const newChess = new Chess();
    for (let i = 0; i < clamped; i++) {
      newChess.move(originalMoves[i]);
    }
    set({
      chess: newChess,
      fen: newChess.fen(),
      moveIndex: clamped,
    });
  },

  goToStart: () => {
    const { forked } = get();
    if (forked) return;
    const newChess = new Chess();
    set({ chess: newChess, fen: newChess.fen(), moveIndex: 0 });
  },

  goToEnd: () => {
    const { originalMoves, forked } = get();
    if (forked) return;
    const newChess = new Chess();
    for (const m of originalMoves) newChess.move(m);
    set({
      chess: newChess,
      fen: newChess.fen(),
      moveIndex: originalMoves.length,
    });
  },

  fork: (aiColor) => {
    const { moveIndex } = get();
    set({
      forked: true,
      forkPoint: moveIndex,
      forkMoves: [],
      aiColor,
    });
  },

  makeForkMove: (from, to, promotion) => {
    const { chess, forked } = get();
    if (!forked) return false;
    try {
      const newChess = new Chess(chess.fen());
      const result = newChess.move({ from, to, promotion: promotion || "q" });
      if (result) {
        set({
          chess: newChess,
          fen: newChess.fen(),
          forkMoves: [...get().forkMoves, result.san],
        });
        return true;
      }
    } catch {
      // Invalid move
    }
    return false;
  },

  applyAiMove: (moveUci) => {
    const { chess, forked } = get();
    if (!forked) return false;
    try {
      const from = moveUci.slice(0, 2);
      const to = moveUci.slice(2, 4);
      const promotion = moveUci.length > 4 ? moveUci[4] : undefined;
      const newChess = new Chess(chess.fen());
      const result = newChess.move({ from, to, promotion });
      if (result) {
        set({
          chess: newChess,
          fen: newChess.fen(),
          forkMoves: [...get().forkMoves, result.san],
        });
        return true;
      }
    } catch {
      // Invalid move
    }
    return false;
  },

  cancelFork: () => {
    const { originalMoves, forkPoint } = get();
    const newChess = new Chess();
    for (let i = 0; i < forkPoint; i++) {
      newChess.move(originalMoves[i]);
    }
    set({
      chess: newChess,
      fen: newChess.fen(),
      moveIndex: forkPoint,
      forked: false,
      forkMoves: [],
      aiColor: null,
      isLoading: false,
    });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  reset: () => {
    const fresh = new Chess();
    set({
      game: null,
      originalMoves: [],
      chess: fresh,
      fen: fresh.fen(),
      moveIndex: 0,
      forked: false,
      forkMoves: [],
      forkPoint: 0,
      aiColor: null,
      isLoading: false,
    });
  },
}));
