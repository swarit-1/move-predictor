import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// JWT injection — set by authStore.loadFromStorage / login / logout.
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
api.interceptors.request.use((cfg) => {
  if (authToken) {
    cfg.headers = cfg.headers ?? {};
    (cfg.headers as Record<string, string>).Authorization = `Bearer ${authToken}`;
  }
  return cfg;
});

// ── Auth ─────────────────────────────────────────────────────────
export async function registerUser(email: string, username: string, password: string) {
  const { data } = await api.post("/auth/register", { email, username, password });
  return data;
}
export async function loginUser(identifier: string, password: string) {
  const { data } = await api.post("/auth/login", { identifier, password });
  return data;
}
export async function fetchMe() {
  const { data } = await api.get("/auth/me");
  return data;
}

// ── Saved games ──────────────────────────────────────────────────
export interface SavedGamePayload {
  pgn: string;
  finalFen: string;
  playerColor: "w" | "b";
  opponentName?: string | null;
  opponentRating?: number | null;
  opponentSource?: "lichess" | "chesscom" | null;
  result?: string | null;
  numMoves: number;
  timeControl?: string | null;
  endReason?: string | null;
}
export async function saveGame(payload: SavedGamePayload) {
  const { data } = await api.post("/saved-games", payload);
  return data;
}
export async function listSavedGames(cursor?: string, limit = 50) {
  const { data } = await api.get("/saved-games", { params: { cursor, limit } });
  return data;
}
export async function getSavedGame(id: string) {
  const { data } = await api.get(`/saved-games/${id}`);
  return data;
}
export async function deleteSavedGame(id: string) {
  const { data } = await api.delete(`/saved-games/${id}`);
  return data;
}

// ── Game Import ──────────────────────────────────────────────────
export async function importGames(
  source: "lichess" | "chesscom",
  username: string,
  maxGames = 200
) {
  const { data } = await api.post("/games/import", {
    source,
    username,
    max_games: maxGames,
  });
  return data;
}

export async function uploadPgn(file: File) {
  const formData = new FormData();
  formData.append("pgn", file);
  const { data } = await api.post("/games/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// ── Predictions ──────────────────────────────────────────────────
export async function predictMove(params: {
  fen: string;
  move_history?: string[];
  player_id?: number;
  player_rating?: number;
  player_key?: string;
  style_overrides?: { aggression?: number; risk_taking?: number; blunder_frequency?: number };
  time_remaining?: number;
  time_control_initial?: number;
}) {
  const { data } = await api.post("/predict", params);
  return data;
}

export async function analyzePosition(fen: string, depth = 18) {
  const { data } = await api.post("/predict/analyze", { fen, depth });
  return data;
}

export async function reviewGame(moves: string[], depth = 18) {
  const { data } = await api.post("/predict/review", { moves, depth }, {
    timeout: 120000, // 2 minutes — full game analysis
  });
  return data;
}

// ── Players ──────────────────────────────────────────────────────
export async function buildPlayerProfile(
  source: "lichess" | "chesscom",
  username: string,
  maxGames = 200,
  timeControl?: string | null,
) {
  const { data } = await api.post("/players/build-profile", {
    source,
    username,
    max_games: maxGames,
    time_control: timeControl || null,
  });
  return data;
}

// ── Simulation ───────────────────────────────────────────────────
export async function startSimulation(params: {
  white_player_id?: number;
  black_player_id?: number;
  white_rating?: number;
  black_rating?: number;
  style_overrides?: Record<string, number>;
}) {
  const { data } = await api.post("/simulate/start", params);
  return data;
}

export async function makeSimulationMove(
  sessionId: string,
  move?: string
) {
  const { data } = await api.post(`/simulate/${sessionId}/move`, { move });
  return data;
}

export async function getSimulationState(sessionId: string) {
  const { data } = await api.get(`/simulate/${sessionId}`);
  return data;
}

// ── Health ───────────────────────────────────────────────────────
export async function healthCheck() {
  const { data } = await api.get("/health");
  return data;
}
