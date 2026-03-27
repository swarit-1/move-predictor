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

export interface PositionEval {
  cp: number;
  mate: number | null;
}

export interface EvalHistoryEntry {
  moveNumber: number;
  cp: number;
  mate: number | null;
}

interface GameState {
  chess: Chess;
  fen: string;
  moveHistory: string[];
  pgn: string;

  prediction: PredictionData | null;
  isLoading: boolean;
  predictionError: string | null;

  positionEval: PositionEval | null;
  evalLoading: boolean;
  showEvalBar: boolean;
  evalHistory: EvalHistoryEntry[];

  playerColor: "w" | "b";

  mode: "analyze" | "simulate";
  simulationSessionId: string | null;

  // Track current viewing position vs full history for move navigation
  viewIndex: number; // -1 = latest position

  // Opening practice — pre-loaded moves to apply on game start
  pendingOpeningMoves: string[] | null;

  // Time control
  timeControl: { initial: number; increment: number } | null;
  playerTimeLeft: number;
  opponentTimeLeft: number;

  setFen: (fen: string) => void;
  makeMove: (from: string, to: string, promotion?: string) => boolean;
  applyPredictedMove: (moveUci: string) => boolean;
  undoMove: () => void;
  resetGame: () => void;
  setPrediction: (pred: PredictionData | null) => void;
  setLoading: (loading: boolean) => void;
  setPredictionError: (error: string | null) => void;
  setPositionEval: (eval_: PositionEval | null) => void;
  setEvalLoading: (loading: boolean) => void;
  setShowEvalBar: (show: boolean) => void;
  pushEvalHistory: (entry: EvalHistoryEntry) => void;
  setPlayerColor: (color: "w" | "b") => void;
  setMode: (mode: "analyze" | "simulate") => void;
  setSimulationSession: (id: string | null) => void;
  loadPgn: (pgn: string) => void;
  goToMove: (moveIndex: number) => void;
  goToLatest: () => void;
  setPendingOpeningMoves: (moves: string[] | null) => void;
  applyPendingOpening: () => void;
  setTimeControl: (tc: { initial: number; increment: number } | null) => void;
  tickClock: (side: "player" | "opponent", elapsed: number) => void;
  addIncrement: (side: "player" | "opponent") => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  chess: new Chess(),
  fen: new Chess().fen(),
  moveHistory: [],
  pgn: "",
  prediction: null,
  isLoading: false,
  predictionError: null,
  positionEval: null,
  evalLoading: false,
  showEvalBar: true,
  evalHistory: [],
  playerColor: "w",
  mode: "analyze",
  simulationSessionId: null,
  viewIndex: -1,
  pendingOpeningMoves: null,
  timeControl: null,
  playerTimeLeft: 0,
  opponentTimeLeft: 0,

  setFen: (fen) => {
    const chess = new Chess(fen);
    set({ chess, fen, prediction: null, viewIndex: -1 });
  },

  makeMove: (from, to, promotion) => {
    const state = get();
    // If viewing history, jump to latest before making a move
    let chess = state.chess;
    if (state.viewIndex !== -1) {
      chess = new Chess();
      const fullHistory = state.chess.history();
      for (const m of fullHistory) chess.move(m);
    }

    try {
      const result = chess.move({ from, to, promotion: promotion || "q" });
      if (result) {
        set({
          chess,
          fen: chess.fen(),
          moveHistory: [...state.moveHistory, result.lan],
          pgn: chess.pgn(),
          prediction: null,
          viewIndex: -1,
        });
        return true;
      }
    } catch {
      // Invalid move
    }
    return false;
  },

  applyPredictedMove: (moveUci) => {
    const chess = get().chess;
    try {
      const from = moveUci.slice(0, 2);
      const to = moveUci.slice(2, 4);
      const promotion = moveUci.length > 4 ? moveUci[4] : undefined;
      const result = chess.move({ from, to, promotion });
      if (result) {
        set({
          fen: chess.fen(),
          moveHistory: [...get().moveHistory, result.lan],
          pgn: chess.pgn(),
          viewIndex: -1,
        });
        return true;
      }
    } catch {
      // Invalid predicted move
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
      viewIndex: -1,
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
      predictionError: null,
      positionEval: null,
      evalLoading: false,
      evalHistory: [],
      simulationSessionId: null,
      viewIndex: -1,
    });
  },

  setPrediction: (pred) => set({ prediction: pred }),
  setLoading: (loading) => set({ isLoading: loading }),
  setPredictionError: (error) => set({ predictionError: error }),
  setPositionEval: (eval_) => set({ positionEval: eval_ }),
  setEvalLoading: (loading) => set({ evalLoading: loading }),
  setShowEvalBar: (show) => set({ showEvalBar: show }),
  pushEvalHistory: (entry) => set((s) => ({ evalHistory: [...s.evalHistory, entry] })),
  setPlayerColor: (color) => set({ playerColor: color }),
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
      viewIndex: -1,
    });
  },

  goToMove: (moveIndex) => {
    const fullHistory = get().chess.history();
    const viewChess = new Chess();
    for (let i = 0; i <= moveIndex && i < fullHistory.length; i++) {
      viewChess.move(fullHistory[i]);
    }
    set({
      fen: viewChess.fen(),
      viewIndex: moveIndex,
      prediction: null,
    });
  },

  goToLatest: () => {
    const chess = get().chess;
    set({
      fen: chess.fen(),
      viewIndex: -1,
    });
  },

  setPendingOpeningMoves: (moves) => set({ pendingOpeningMoves: moves }),

  applyPendingOpening: () => {
    const moves = get().pendingOpeningMoves;
    if (!moves || moves.length === 0) return;

    const chess = get().chess;
    const moveHistory: string[] = [];

    for (const san of moves) {
      try {
        const result = chess.move(san);
        if (result) {
          moveHistory.push(result.lan);
        }
      } catch {
        break;
      }
    }

    set({
      fen: chess.fen(),
      moveHistory: [...get().moveHistory, ...moveHistory],
      pgn: chess.pgn(),
      pendingOpeningMoves: null,
    });
  },

  setTimeControl: (tc) => set({
    timeControl: tc,
    playerTimeLeft: tc?.initial ?? 0,
    opponentTimeLeft: tc?.initial ?? 0,
  }),

  tickClock: (side, elapsed) => {
    if (side === "player") {
      set((s) => ({ playerTimeLeft: Math.max(0, s.playerTimeLeft - elapsed) }));
    } else {
      set((s) => ({ opponentTimeLeft: Math.max(0, s.opponentTimeLeft - elapsed) }));
    }
  },

  addIncrement: (side) => {
    const tc = get().timeControl;
    if (!tc) return;
    if (side === "player") {
      set((s) => ({ playerTimeLeft: s.playerTimeLeft + tc.increment }));
    } else {
      set((s) => ({ opponentTimeLeft: s.opponentTimeLeft + tc.increment }));
    }
  },
}));
