import { create } from "zustand";
import { Chess } from "chess.js";

export interface PredictionData {
  move: string;
  probability: number;
  temperature: number;
  topMoves: Array<{
    move_uci: string;
    probability: number;
    engine_rank?: number;
  }>;
  predictedCpl: number;
  blunderProbability: number;
  engineBest: string | null;
  engineTopMoves: Array<{ move: string; rank: number; cp: number | null }>;
  explanation: {
    is_deviation: boolean;
    deviation_reason: string;
    factors: string[];
  } | null;
}

interface GameState {
  // Chess game state
  chess: Chess;
  fen: string;
  moveHistory: string[];
  pgn: string;

  // Prediction state
  prediction: PredictionData | null;
  isLoading: boolean;

  // Mode
  mode: "analyze" | "simulate";
  simulationSessionId: string | null;

  // Actions
  setFen: (fen: string) => void;
  makeMove: (from: string, to: string, promotion?: string) => boolean;
  undoMove: () => void;
  resetGame: () => void;
  setPrediction: (pred: PredictionData | null) => void;
  setLoading: (loading: boolean) => void;
  setMode: (mode: "analyze" | "simulate") => void;
  setSimulationSession: (id: string | null) => void;
  loadPgn: (pgn: string) => void;
  goToMove: (moveIndex: number) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  chess: new Chess(),
  fen: new Chess().fen(),
  moveHistory: [],
  pgn: "",
  prediction: null,
  isLoading: false,
  mode: "analyze",
  simulationSessionId: null,

  setFen: (fen) => {
    const chess = new Chess(fen);
    set({ chess, fen, prediction: null });
  },

  makeMove: (from, to, promotion) => {
    const chess = get().chess;
    try {
      const result = chess.move({ from, to, promotion: promotion || "q" });
      if (result) {
        set({
          fen: chess.fen(),
          moveHistory: [...get().moveHistory, result.lan],
          pgn: chess.pgn(),
          prediction: null,
        });
        return true;
      }
    } catch {
      // Invalid move
    }
    return false;
  },

  undoMove: () => {
    const chess = get().chess;
    chess.undo();
    const history = get().moveHistory.slice(0, -1);
    set({
      fen: chess.fen(),
      moveHistory: history,
      pgn: chess.pgn(),
      prediction: null,
    });
  },

  resetGame: () => {
    const chess = new Chess();
    set({
      chess,
      fen: chess.fen(),
      moveHistory: [],
      pgn: "",
      prediction: null,
      simulationSessionId: null,
    });
  },

  setPrediction: (pred) => set({ prediction: pred }),
  setLoading: (loading) => set({ isLoading: loading }),
  setMode: (mode) => set({ mode }),
  setSimulationSession: (id) => set({ simulationSessionId: id }),

  loadPgn: (pgn) => {
    const chess = new Chess();
    chess.loadPgn(pgn);
    set({
      chess,
      fen: chess.fen(),
      pgn: chess.pgn(),
      moveHistory: chess.history(),
      prediction: null,
    });
  },

  goToMove: (moveIndex) => {
    const chess = new Chess();
    const history = get().chess.history();
    for (let i = 0; i <= moveIndex && i < history.length; i++) {
      chess.move(history[i]);
    }
    set({ fen: chess.fen() });
  },
}));
