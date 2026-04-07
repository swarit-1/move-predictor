/**
 * Shared types for the backend API.
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  cached?: boolean;
}

export interface PredictionResult {
  move: string;
  probability: number;
  temperature: number;
  top_moves: TopMove[];
  predicted_cpl: number;
  blunder_probability: number;
  engine_best: string | null;
  engine_top_moves: EngineMove[];
  explanation: MoveExplanation | null;
}

export interface TopMove {
  move_uci: string;
  probability: number;
  engine_rank?: number;
  engine_cp?: number;
}

export interface EngineMove {
  move: string;
  rank: number;
  cp: number | null;
  mate: number | null;
}

export interface MoveExplanation {
  is_deviation: boolean;
  deviation_reason: string;
  engine_rank: number | null;
  centipawn_cost: number | null;
  factors: string[];
}

export interface PlayerProfile {
  username: string;
  source: string;
  rating: number;
  num_games: number;
  stats: { vector: number[] };
  style_summary: {
    aggression: number;
    tactical: number;
    accuracy: number;
    consistency: number;
    opening_diversity: number;
    preferred_openings: Record<string, number>;
  };
  player_key?: string;
  opening_book_size?: number;
  ratings_by_time_control?: Record<string, number | null>;
  selected_time_control?: string | null;
}
