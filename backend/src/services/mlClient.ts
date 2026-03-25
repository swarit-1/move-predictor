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
      headers: { "Content-Type": "application/json" },
    });
  }

  async healthCheck(): Promise<HealthResponse> {
    const response = await this.client.get("/ml/health");
    return response.data;
  }

  async predict(params: {
    fen: string;
    move_history?: string[];
    player_id?: number;
    player_rating?: number;
    style_overrides?: Record<string, number>;
  }): Promise<PredictionResult> {
    const response = await this.client.post("/ml/predict", params);
    return response.data;
  }

  async analyze(params: {
    fen: string;
    depth?: number;
    num_lines?: number;
  }): Promise<AnalysisResult> {
    const response = await this.client.post("/ml/analyze", params);
    return response.data;
  }

  async buildPlayerProfile(params: {
    source: string;
    username: string;
    max_games?: number;
  }): Promise<PlayerProfile> {
    const response = await this.client.post(
      "/ml/player/build-profile",
      params
    );
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
