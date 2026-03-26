import { create } from "zustand";

export interface StyleSummary {
  aggression: number;
  tactical: number;
  accuracy: number;
  consistency: number;
  opening_diversity: number;
  preferred_openings: Record<string, number>;
}

export interface PlayerProfile {
  username: string;
  source: string;
  rating: number;
  numGames: number;
  styleSummary: StyleSummary | null;
}

export interface StyleOverrides {
  aggression: number;
  risk_taking: number;
  blunder_frequency: number;
}

interface PlayerState {
  // Selected opponent
  opponent: PlayerProfile | null;
  opponentLoading: boolean;

  // Style overrides
  styleOverrides: StyleOverrides;

  // Actions
  setOpponent: (profile: PlayerProfile | null) => void;
  setOpponentLoading: (loading: boolean) => void;
  setStyleOverride: (key: keyof StyleOverrides, value: number) => void;
  resetStyleOverrides: () => void;
}

const DEFAULT_STYLE: StyleOverrides = {
  aggression: 50,
  risk_taking: 50,
  blunder_frequency: 50,
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  opponent: null,
  opponentLoading: false,
  styleOverrides: { ...DEFAULT_STYLE },

  setOpponent: (profile) => set({ opponent: profile }),
  setOpponentLoading: (loading) => set({ opponentLoading: loading }),

  setStyleOverride: (key, value) =>
    set({ styleOverrides: { ...get().styleOverrides, [key]: value } }),

  resetStyleOverrides: () => set({ styleOverrides: { ...DEFAULT_STYLE } }),
}));
