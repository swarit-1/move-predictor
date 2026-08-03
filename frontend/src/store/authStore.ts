import { create } from "zustand";
import {
  setAuthToken,
  registerUser,
  loginUser,
  fetchMe,
  twoFaVerify,
} from "../api/client";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  createdAt: string;
  // PRD §5.6: optional linked chess identity for the "Play yourself" flow.
  linkedChessSource?: "lichess" | "chesscom" | null;
  linkedChessUsername?: string | null;
  // PLAN.md §6.1: verification + 2FA status for the account panel.
  emailVerified?: boolean;
  totpEnabled?: boolean;
  role?: string;
}

const TOKEN_KEY = "mp_token";

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  hydrated: boolean;
  // PLAN.md §6.1: short-lived pending token minted after the password step
  // of a 2FA-enabled login; the full session only exists after verify2fa.
  pending2fa: string | null;

  hydrate: () => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  /** Resolves to true when a 2FA code step is required to finish signing in. */
  login: (identifier: string, password: string) => Promise<boolean>;
  verify2fa: (code: string) => Promise<void>;
  cancel2fa: () => void;
  logout: () => void;
  clearError: () => void;
  // PRD §5.6
  setUser: (user: AuthUser | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,
  error: null,
  hydrated: false,
  pending2fa: null,

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
      // PLAN.md §6.1: 2FA-enabled accounts get a pending token instead of a
      // session; the caller must collect a TOTP / recovery code next.
      if (res.data.requires_2fa) {
        set({ pending2fa: res.data.pending_token, loading: false });
        return true;
      }
      const { user, token } = res.data;
      localStorage.setItem(TOKEN_KEY, token);
      setAuthToken(token);
      set({ user, token, loading: false, pending2fa: null });
      return false;
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Login failed";
      set({ error: msg, loading: false });
      throw err;
    }
  },

  verify2fa: async (code) => {
    const pending = get().pending2fa;
    if (!pending) throw new Error("No 2FA session in progress");
    set({ loading: true, error: null });
    try {
      const res = await twoFaVerify(pending, code);
      if (!res?.success) throw new Error(res?.error || "Verification failed");
      const { user, token } = res.data;
      localStorage.setItem(TOKEN_KEY, token);
      setAuthToken(token);
      set({ user, token, loading: false, pending2fa: null });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || err?.message || "Verification failed";
      set({ error: msg, loading: false });
      throw err;
    }
  },

  cancel2fa: () => set({ pending2fa: null, error: null }),

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthToken(null);
    set({ user: null, token: null, error: null, pending2fa: null });
  },

  clearError: () => set({ error: null }),

  setUser: (user) => set({ user }),
}));
