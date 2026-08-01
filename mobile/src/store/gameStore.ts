import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

export type GameOverReason =
  | "checkmate"
  | "stalemate"
  | "draw_repetition"
  | "draw_insufficient"
  | "draw_50_move"
  | "flag_player"
  | "flag_opponent";

export interface GameOverInfo {
  reason: GameOverReason;
  winner: "player" | "opponent" | "draw";
  description: string;
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
  viewIndex: number;
  timeControl: { initial: number; increment: number } | null;
  playerTimeLeft: number;
  opponentTimeLeft: number;
  flagGameOver: GameOverInfo | null;
  premove: { from: string; to: string; promotion?: string } | null;
  selectedSquare: string | null;

  setFen: (fen: string) => void;
  makeMove: (from: string, to: string, promotion?: string) => boolean;
  applyPredictedMove: (moveUci: string) => boolean;
  setPremove: (from: string, to: string, promotion?: string) => void;
  clearPremove: () => void;
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
  loadPgn: (pgn: string) => void;
  goToMove: (moveIndex: number) => void;
  goToLatest: () => void;
  setTimeControl: (tc: { initial: number; increment: number } | null) => void;
  tickClock: (side: "player" | "opponent", elapsed: number) => void;
  addIncrement: (side: "player" | "opponent") => void;
  onFlag: (side: "player" | "opponent") => void;
  setSelectedSquare: (sq: string | null) => void;
  rehydrateChessFromPgn: () => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
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
      viewIndex: -1,
      timeControl: null,
      playerTimeLeft: 0,
      opponentTimeLeft: 0,
      flagGameOver: null,
      premove: null,
      selectedSquare: null,

      setFen: (fen) => {
        const chess = new Chess(fen);
        set({ chess, fen, prediction: null, viewIndex: -1, premove: null, selectedSquare: null });
      },

      makeMove: (from, to, promotion) => {
        const state = get();
        if (state.flagGameOver) return false;
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
              premove: null,
              selectedSquare: null,
            });
            return true;
          }
        } catch {}
        return false;
      },

      applyPredictedMove: (moveUci) => {
        if (get().flagGameOver) return false;
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
              selectedSquare: null,
            });
            const queued = get().premove;
            if (queued) {
              set({ premove: null });
              get().makeMove(queued.from, queued.to, queued.promotion);
            }
            return true;
          }
        } catch {}
        return false;
      },

      setPremove: (from, to, promotion) => set({ premove: { from, to, promotion } }),
      clearPremove: () => set({ premove: null }),

      undoMove: () => {
        const chess = get().chess;
        chess.undo();
        set({
          fen: chess.fen(),
          moveHistory: get().moveHistory.slice(0, -1),
          pgn: chess.pgn(),
          prediction: null,
          viewIndex: -1,
          premove: null,
          selectedSquare: null,
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
          viewIndex: -1,
          flagGameOver: null,
          premove: null,
          selectedSquare: null,
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
          premove: null,
          selectedSquare: null,
        });
      },

      goToMove: (moveIndex) => {
        const fullHistory = get().chess.history();
        const viewChess = new Chess();
        for (let i = 0; i <= moveIndex && i < fullHistory.length; i++) {
          viewChess.move(fullHistory[i]);
        }
        set({ fen: viewChess.fen(), viewIndex: moveIndex, prediction: null, selectedSquare: null });
      },

      goToLatest: () => {
        set({ fen: get().chess.fen(), viewIndex: -1 });
      },

      setTimeControl: (tc) =>
        set({
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

      setSelectedSquare: (sq) => set({ selectedSquare: sq }),

      rehydrateChessFromPgn: () => {
        const pgn = get().pgn;
        if (!pgn) return;
        try {
          const chess = new Chess();
          chess.loadPgn(pgn);
          set({ chess, fen: chess.fen() });
        } catch {
          const chess = new Chess();
          set({ chess, fen: chess.fen(), moveHistory: [], pgn: "", viewIndex: -1, premove: null });
        }
      },

      onFlag: (flaggedSide) => {
        const state = get();
        if (state.flagGameOver) return;
        const opponentColor =
          flaggedSide === "player"
            ? state.playerColor === "w"
              ? "b"
              : "w"
            : state.playerColor;
        const pieces = state.chess
          .board()
          .flat()
          .filter(
            (p): p is NonNullable<typeof p> => p !== null && p.color === opponentColor,
          );
        let hasMatingMaterial = true;
        if (pieces.length === 1) {
          hasMatingMaterial = false;
        } else if (pieces.length === 2) {
          const other = pieces.find((p) => p.type !== "k");
          if (other && (other.type === "n" || other.type === "b")) {
            hasMatingMaterial = false;
          }
        }
        if (hasMatingMaterial) {
          const winner = flaggedSide === "player" ? "opponent" : "player";
          set({
            flagGameOver: {
              reason: flaggedSide === "player" ? "flag_player" : "flag_opponent",
              winner: winner as "player" | "opponent",
              description:
                flaggedSide === "player" ? "You lost on time" : "Opponent lost on time",
            },
          });
        } else {
          set({
            flagGameOver: {
              reason: "draw_insufficient",
              winner: "draw",
              description: "Draw — insufficient mating material",
            },
          });
        }
      },
    }),
    {
      name: "mp-game-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        moveHistory: state.moveHistory,
        pgn: state.pgn,
        playerColor: state.playerColor,
        viewIndex: state.viewIndex,
        timeControl: state.timeControl,
        playerTimeLeft: state.playerTimeLeft,
        opponentTimeLeft: state.opponentTimeLeft,
        flagGameOver: state.flagGameOver,
        premove: state.premove,
        evalHistory: state.evalHistory,
        showEvalBar: state.showEvalBar,
      }),
      onRehydrateStorage: () => (state) => {
        state?.rehydrateChessFromPgn();
      },
    },
  ),
);
