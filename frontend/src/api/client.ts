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

// PRD §5.6: link / unlink a Lichess / Chess.com identity to the user.
export async function linkChessAccount(
  source: "lichess" | "chesscom",
  username: string,
) {
  const { data } = await api.post("/auth/link-chess", { source, username });
  return data;
}
export async function unlinkChessAccount() {
  const { data } = await api.delete("/auth/link-chess");
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
export async function predictMove(
  params: {
    fen: string;
    move_history?: string[];
    player_id?: number;
    player_rating?: number;
    player_key?: string;
    style_overrides?: {
      aggression?: number;
      risk_taking?: number;
      blunder_frequency?: number;
      // PRD §5.2 expansion
      king_attack?: number;
      positional?: number;
      trade_preference?: number;
      opening_loyalty?: number;
      repertoire_width?: number;
      endgame_strength?: number;
      defensive_tenacity?: number;
    };
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

/**
 * Full game review (Stockfish per-move classification + accuracy scores).
 *
 * PRD §5.7: when `cloneOptions` is supplied, the review additionally
 * annotates every non-best move on `cloneOptions.color`'s side with the
 * move the named clone would have played, so the UI can render "your
 * opponent would not have made this mistake."
 */
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
  const { data } = await api.post("/predict/review", body, {
    timeout: 180000, // 3 minutes — clone queries add a few seconds per move
  });
  return data;
}

/**
 * PRD §5.9: coach mode — send a batch of PGNs and get blunder-pattern
 * analysis back. Heavy endpoint; allow 5 min timeout.
 */
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

/**
 * Preflight: is the ML service still holding the cached profile for this
 * player_key? Used on app boot to decide whether the persisted opponent
 * needs a rebuild. See PRD §6.1.
 */
export async function checkCachedProfile(playerKey: string) {
  const { data } = await api.get(
    `/players/profile/${encodeURIComponent(playerKey)}`
  );
  return data;
}

/**
 * PRD §5.5: trigger a Phase 3 fine-tune for the named profile. Returns
 * 412 if no bracket checkpoint exists for the player's rating (the §5.4
 * training pipeline has not been run yet).
 */
export async function personalizePlayer(
  playerKey: string,
  source: "lichess" | "chesscom",
  username: string,
  opts?: { steps?: number; batchSize?: number; learningRate?: number },
) {
  const body: Record<string, unknown> = { source, username };
  if (opts?.steps != null) body.steps = opts.steps;
  if (opts?.batchSize != null) body.batch_size = opts.batchSize;
  if (opts?.learningRate != null) body.learning_rate = opts.learningRate;
  const { data } = await api.post(
    `/players/${encodeURIComponent(playerKey)}/personalize`,
    body,
    { timeout: 180000 },
  );
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
