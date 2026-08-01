import axios from "axios";
import * as SecureStore from "expo-secure-store";

const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001/api";

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

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

export async function loadStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync("mp_token");
  } catch {
    return null;
  }
}

export async function storeToken(token: string) {
  await SecureStore.setItemAsync("mp_token", token);
  setAuthToken(token);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync("mp_token");
  setAuthToken(null);
}

// Auth
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

export async function linkChessAccount(source: "lichess" | "chesscom", username: string) {
  const { data } = await api.post("/auth/link-chess", { source, username });
  return data;
}

export async function unlinkChessAccount() {
  const { data } = await api.delete("/auth/link-chess");
  return data;
}

// Saved games
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

// Predictions
export async function predictMove(
  params: {
    fen: string;
    move_history?: string[];
    player_id?: number;
    player_rating?: number;
    player_key?: string;
    style_overrides?: Record<string, number>;
    time_remaining?: number;
    time_control_initial?: number;
  },
  signal?: AbortSignal,
) {
  const { data } = await api.post("/predict", params, { signal });
  return data;
}

export async function analyzePosition(fen: string, depth = 18) {
  const { data } = await api.post("/predict/analyze", { fen, depth });
  return data;
}

export async function reviewGame(
  moves: string[],
  depth = 18,
  cloneOptions?: { playerKey: string; color: "w" | "b"; rating?: number },
) {
  const body: Record<string, unknown> = { moves, depth };
  if (cloneOptions) {
    body.clone_player_key = cloneOptions.playerKey;
    body.clone_color = cloneOptions.color;
    if (cloneOptions.rating != null) body.clone_rating = cloneOptions.rating;
  }
  const { data } = await api.post("/predict/review", body, { timeout: 180000 });
  return data;
}

export async function coachAnalysis(
  pgns: string[],
  playerName: string,
  opts?: { maxGames?: number; stockfishDepth?: number },
) {
  const body: Record<string, unknown> = { pgns, player_name: playerName };
  if (opts?.maxGames != null) body.max_games = opts.maxGames;
  if (opts?.stockfishDepth != null) body.stockfish_depth = opts.stockfishDepth;
  const { data } = await api.post("/predict/coach", body, { timeout: 300000 });
  return data;
}

// Players
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

export async function checkCachedProfile(playerKey: string) {
  const { data } = await api.get(`/players/profile/${encodeURIComponent(playerKey)}`);
  return data;
}

export async function personalizePlayer(
  playerKey: string,
  source: "lichess" | "chesscom",
  username: string,
) {
  const { data } = await api.post(
    `/players/${encodeURIComponent(playerKey)}/personalize`,
    { source, username },
    { timeout: 180000 },
  );
  return data;
}

// Simulation
export async function startSimulation(params: Record<string, unknown>) {
  const { data } = await api.post("/simulate/start", params);
  return data;
}

export async function makeSimulationMove(sessionId: string, move?: string) {
  const { data } = await api.post(`/simulate/${sessionId}/move`, { move });
  return data;
}
