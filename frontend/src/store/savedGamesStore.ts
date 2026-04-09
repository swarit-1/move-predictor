import { create } from "zustand";
import {
  saveGame,
  listSavedGames,
  getSavedGame,
  deleteSavedGame,
  type SavedGamePayload,
} from "../api/client";

export interface SavedGame {
  id: string;
  pgn: string;
  finalFen: string;
  playerColor: "w" | "b";
  opponentName: string | null;
  opponentRating: number | null;
  opponentSource: "lichess" | "chesscom" | null;
  result: string | null;
  numMoves: number;
  timeControl: string | null;
  endReason: string | null;
  createdAt: string;
}

interface SavedGamesState {
  games: SavedGame[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  nextCursor: string | null;

  fetchGames: () => Promise<void>;
  saveOne: (payload: SavedGamePayload) => Promise<SavedGame>;
  loadOne: (id: string) => Promise<SavedGame>;
  deleteOne: (id: string) => Promise<void>;
  reset: () => void;
}

export const useSavedGamesStore = create<SavedGamesState>((set, get) => ({
  games: [],
  loading: false,
  saving: false,
  error: null,
  nextCursor: null,

  fetchGames: async () => {
    set({ loading: true, error: null });
    try {
      const res = await listSavedGames();
      if (!res?.success) throw new Error(res?.error || "Failed to load games");
      set({ games: res.data.items, nextCursor: res.data.nextCursor, loading: false });
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Failed to load games";
      set({ error: msg, loading: false });
    }
  },

  saveOne: async (payload) => {
    set({ saving: true, error: null });
    try {
      const res = await saveGame(payload);
      if (!res?.success) throw new Error(res?.error || "Failed to save game");
      const created: SavedGame = res.data;
      set({ games: [created, ...get().games], saving: false });
      return created;
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Failed to save game";
      set({ error: msg, saving: false });
      throw err;
    }
  },

  loadOne: async (id) => {
    const res = await getSavedGame(id);
    if (!res?.success) throw new Error(res?.error || "Failed to load game");
    return res.data as SavedGame;
  },

  deleteOne: async (id) => {
    const res = await deleteSavedGame(id);
    if (!res?.success) throw new Error(res?.error || "Failed to delete game");
    set({ games: get().games.filter((g) => g.id !== id) });
  },

  reset: () => set({ games: [], nextCursor: null, error: null }),
}));
