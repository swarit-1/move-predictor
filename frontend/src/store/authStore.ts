import { create } from "zustand";
import {
  setAuthToken,
  registerUser,
  loginUser,
  fetchMe,
} from "../api/client";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

const TOKEN_KEY = "mp_token";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,
  error: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!stored) {
      set({ hydrated: true });
      return;
    }
    setAuthToken(stored);
    set({ token: stored, loading: true });
    try {
      const res = await fetchMe();
      if (res?.success) {
        set({ user: res.data.user, hydrated: true, loading: false });
      } else {
        throw new Error("Invalid session");
      }
    } catch {
      // Stale or invalid token — drop it.
      localStorage.removeItem(TOKEN_KEY);
      setAuthToken(null);
      set({ user: null, token: null, hydrated: true, loading: false });
    }
  },

  register: async (email, username, password) => {
    set({ loading: true, error: null });
    try {
      const res = await registerUser(email, username, password);
      if (!res?.success) throw new Error(res?.error || "Registration failed");
      const { user, token } = res.data;
      localStorage.setItem(TOKEN_KEY, token);
      setAuthToken(token);
      set({ user, token, loading: false });
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Registration failed";
      set({ error: msg, loading: false });
      throw err;
    }
  },

  login: async (identifier, password) => {
    set({ loading: true, error: null });
    try {
      const res = await loginUser(identifier, password);
      if (!res?.success) throw new Error(res?.error || "Login failed");
      const { user, token } = res.data;
      localStorage.setItem(TOKEN_KEY, token);
      setAuthToken(token);
      set({ user, token, loading: false });
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Login failed";
      set({ error: msg, loading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    set({ user: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));
