/**
 * HTTP client for communicating with the Python ML service.
 */

import axios, { AxiosInstance } from "axios";
import { config, logger } from "../config";
import {
  PredictionResult,
  PlayerProfile,
  TopMove,
  EngineMove,
  MoveExplanation,
} from "../types";

export interface AnalysisResult {
  best_move: string;
  eval_cp: number | null;
  eval_mate: number | null;
  top_moves: Array<{
    move: string;
    rank: number;
    cp: number | null;
    mate: number | null;
  }>;
  depth: number;
}

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
  has_checkpoint: boolean;
  stockfish_available: boolean;
  uptime_seconds?: number;
}

export interface TrainingStatus {
  job_id: string;
  status: string;
  progress: number;
  metrics?: Record<string, number>;
}

export interface TrainingStartResult {
  job_id: string;
  status: string;
  message: string;
}

class MLClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.mlServiceUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        // PLAN.md S2: authenticate to the ML service; it rejects requests
        // without this key when configured.
        ...(config.mlInternalKey
          ? { "X-Internal-Key": config.mlInternalKey }
          : {}),
      },
    });
  }

  async healthCheck(): Promise<HealthResponse> {
    const response = await this.client.get("/ml/health");
    return response.data;
  }

  async predict(params: {
    rating_pool?: "lichess" | "chesscom";
    fen: string;
    move_history?: string[];
    player_id?: number;
    player_rating?: number;
    player_key?: string;
    // PRD §5.2: 10-dim style profile (3 original + 7 new). All optional.
    style_overrides?: {
      aggression?: number;
      risk_taking?: number;
      blunder_frequency?: number;
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
  }): Promise<PredictionResult> {
    const response = await this.client.post<PredictionResult>("/ml/predict", params);
    return response.data;
  }

  async analyze(params: {
    fen: string;
    depth?: number;
    num_lines?: number;
  }): Promise<AnalysisResult> {
    const response = await this.client.post<AnalysisResult>("/ml/analyze", params);
    return response.data;
  }

  async buildPlayerProfile(params: {
    source: string;
    username: string;
    max_games?: number;
    time_control?: string | null;
  }): Promise<PlayerProfile> {
    const response = await this.client.post(
      "/ml/player/build-profile",
      params
    );
    return response.data;
  }

  async getCachedProfile(
    playerKey: string
  ): Promise<{ player_key: string; cached: boolean; location: string }> {
    const response = await this.client.get(
      `/ml/player/profile/${encodeURIComponent(playerKey)}`
    );
    return response.data;
  }

  // Progressive clone-fidelity stage for the opponent badge
  // (generic → repertoire → personalized).
  async getCloneStatus(playerKey: string): Promise<{
    player_key: string;
    stage: "generic" | "repertoire" | "personalized";
    profile_loaded: boolean;
    opening_book: { loaded: boolean; games: number };
    personal_explorer: { loaded: boolean; positions: number };
    personalization: { status: string; error: string | null };
  }> {
    const response = await this.client.get(
      `/ml/player/clone-status/${encodeURIComponent(playerKey)}`
    );
    return response.data;
  }

  // PRD §5.9: coach-mode blunder pattern analysis.
  async coachAnalysis(params: {
    pgns: string[];
    player_name: string;
    max_games?: number;
    stockfish_depth?: number;
  }): Promise<any> {
    const response = await this.client.post("/ml/coach", params, {
      timeout: 300000, // 5 min — walks every move of every game via Stockfish
    });
    return response.data;
  }

  // PRD §5.5: kick off a Phase 3 fine-tune for a built profile.
  async personalizePlayer(params: {
    player_key: string;
    source: string;
    username: string;
    steps?: number;
    batch_size?: number;
    learning_rate?: number;
  }): Promise<any> {
    const { player_key, ...body } = params;
    const response = await this.client.post(
      `/ml/player/${encodeURIComponent(player_key)}/personalize`,
      body,
      { timeout: 180000 }, // 3 minutes — full Phase 3 pass
    );
    return response.data;
  }

  async reviewGame(params: {
    moves: string[];
    depth?: number;
    // PRD §5.7: clone-aware review. When `clone_player_key` is set, the
    // review will also surface "what would the clone have played here"
    // for non-best moves on `clone_color`'s side.
    clone_player_key?: string;
    clone_color?: "w" | "b";
    clone_rating?: number;
  }): Promise<any> {
    const response = await this.client.post("/ml/review", params, {
      timeout: 180000, // 3 minutes — clone queries add a few seconds per move
    });
    return response.data;
  }

  async startTraining(params: {
    phase: number;
    data_path?: string;
    num_epochs?: number;
  }): Promise<TrainingStartResult> {
    const response = await this.client.post("/ml/training/start", params);
    return response.data;
  }

  async getTrainingStatus(jobId: string): Promise<TrainingStatus> {
    const response = await this.client.get(`/ml/training/${jobId}`);
    return response.data;
  }
}

export const mlClient = new MLClient();
