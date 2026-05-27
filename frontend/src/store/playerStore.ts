import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
  playerKey?: string;  // e.g. "lichess:DrNykterstein"
  openingBookSize?: number;
  ratingsByTimeControl?: Record<string, number | null>;
  selectedTimeControl?: string | null;
  // PRD §5.2 / §4.4: per-dimension measured value on the 0–100 slider
  // scale. Used by StyleSliders to render the "where this player
  // actually is" tick mark under each slider.
  baselineStyle?: Partial<StyleOverrides>;
}

/**
 * PRD §5.2: expanded style profile.
 *
 * All values are on a 0–100 scale where 50 is the neutral "play exactly
 * like the measured player" midpoint. The baseline tick mark in the UI
 * (`StyleSliders`) shows the selected opponent's measured value for each
 * dimension; dragging away from the tick mark pushes the simulation
 * more / less in that direction.
 */
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
  king_attack: 50,
  positional: 50,
  trade_preference: 50,
  opening_loyalty: 50,
  repertoire_width: 50,
  endgame_strength: 50,
  defensive_tenacity: 50,
};

// PRD §5.1 / §6.1: persist opponent + style overrides to sessionStorage so
// that a browser refresh after a profile build doesn't drop the selected
// opponent. SessionStorage (not localStorage) is intentional — we want the
// state scoped to the current tab so multiple opponents can be open in
// different tabs without colliding.
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
      storage: createJSONStorage(() => sessionStorage),
      // opponentLoading is transient — exclude it from persistence
      partialize: (state) => ({
        opponent: state.opponent,
        styleOverrides: state.styleOverrides,
      }),
    }
  )
);
