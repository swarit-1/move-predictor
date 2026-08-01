import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  playerKey?: string;
  openingBookSize?: number;
  ratingsByTimeControl?: Record<string, number | null>;
  selectedTimeControl?: string | null;
  baselineStyle?: Partial<StyleOverrides>;
}

export interface StyleOverrides {
  aggression: number;
  risk_taking: number;
  blunder_frequency: number;
  king_attack: number;
  positional: number;
  trade_preference: number;
  opening_loyalty: number;
  repertoire_width: number;
  endgame_strength: number;
  defensive_tenacity: number;
}

interface PlayerState {
  opponent: PlayerProfile | null;
  opponentLoading: boolean;
  styleOverrides: StyleOverrides;

  setOpponent: (profile: PlayerProfile | null) => void;
  setOpponentLoading: (loading: boolean) => void;
  setStyleOverride: (key: keyof StyleOverrides, value: number) => void;
  resetStyleOverrides: () => void;
}

const DEFAULT_STYLE: StyleOverrides = {
  aggression: 50,
  risk_taking: 50,
  blunder_frequency: 50,
  king_attack: 50,
  positional: 50,
  trade_preference: 50,
  opening_loyalty: 50,
  repertoire_width: 50,
  endgame_strength: 50,
  defensive_tenacity: 50,
};

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      opponent: null,
      opponentLoading: false,
      styleOverrides: { ...DEFAULT_STYLE },

      setOpponent: (profile) => set({ opponent: profile }),
      setOpponentLoading: (loading) => set({ opponentLoading: loading }),
      setStyleOverride: (key, value) =>
        set({ styleOverrides: { ...get().styleOverrides, [key]: value } }),
      resetStyleOverrides: () => set({ styleOverrides: { ...DEFAULT_STYLE } }),
    }),
    {
      name: "mp-player-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        opponent: state.opponent,
        styleOverrides: state.styleOverrides,
      }),
    },
  ),
);
