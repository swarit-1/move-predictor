import { create } from "zustand";

export type MoveClassification =
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder"
  | "book";

export interface MoveAnnotation {
  ply: number;
  move_uci: string;
  move_san: string;
  classification: MoveClassification;
  cpl: number;
  eval_before: number | null;
  eval_after: number | null;
  mate_before: number | null;
  mate_after: number | null;
  best_move_uci: string;
  best_move_san: string;
  is_book: boolean;
  top_moves: Array<{ move: string; rank: number; cp: number | null; mate: number | null }>;
}

export interface PlayerAccuracy {
  accuracy: number;
  total_moves: number;
  best: number;
  excellent: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  avg_cpl: number;
}

interface ReviewState {
  // Review data
  annotations: MoveAnnotation[];
  whiteAccuracy: PlayerAccuracy | null;
  blackAccuracy: PlayerAccuracy | null;

  // UI state
  isAnalyzing: boolean;
  analyzeProgress: string;
  analyzeError: string | null;
  selectedPly: number; // which half-move is selected (-1 = none)

  // Original game data (passed from game store)
  moves: string[]; // UCI moves
  playerColor: "w" | "b";

  // Actions
  setReviewData: (
    annotations: MoveAnnotation[],
    white: PlayerAccuracy,
    black: PlayerAccuracy,
  ) => void;
  setAnalyzing: (analyzing: boolean) => void;
  setAnalyzeProgress: (progress: string) => void;
  setAnalyzeError: (error: string | null) => void;
  setSelectedPly: (ply: number) => void;
  setGameData: (moves: string[], playerColor: "w" | "b") => void;
  resetReview: () => void;
}

export const useReviewStore = create<ReviewState>((set) => ({
  annotations: [],
  whiteAccuracy: null,
  blackAccuracy: null,
  isAnalyzing: false,
  analyzeProgress: "",
  analyzeError: null,
  selectedPly: -1,
  moves: [],
  playerColor: "w",

  setReviewData: (annotations, white, black) =>
    set({ annotations, whiteAccuracy: white, blackAccuracy: black }),

  setAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  setAnalyzeProgress: (progress) => set({ analyzeProgress: progress }),
  setAnalyzeError: (error) => set({ analyzeError: error }),
  setSelectedPly: (ply) => set({ selectedPly: ply }),

  setGameData: (moves, playerColor) => set({ moves, playerColor }),

  resetReview: () =>
    set({
      annotations: [],
      whiteAccuracy: null,
      blackAccuracy: null,
      isAnalyzing: false,
      analyzeProgress: "",
      analyzeError: null,
      selectedPly: -1,
      moves: [],
      playerColor: "w",
    }),
}));

// Classification colors (matching Chess.com's palette)
export const CLASSIFICATION_COLORS: Record<MoveClassification, string> = {
  best: "#96BC4B",     // green
  excellent: "#96BC4B", // green
  good: "#96BC4B",     // muted green
  inaccuracy: "#F7C631", // yellow
  mistake: "#E68A2E",   // orange
  blunder: "#CA3431",   // red
  book: "#A0A0A0",     // gray
};

export const CLASSIFICATION_ICONS: Record<MoveClassification, string> = {
  best: "!!",
  excellent: "!",
  good: "",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
  book: "",
};
