import { Router, Request, Response } from "express";
import { z } from "zod";
import { mlClient } from "../services/mlClient";
import {
  getCached,
  setCache,
  analysisCacheKey,
} from "../services/cache";
import { logger } from "../config";

export const predictRouter = Router();

/**
 * Validate a FEN string has the correct structure:
 * 6 fields separated by spaces, board has 8 ranks separated by /,
 * active color is w or b, etc.
 */
function isValidFen(fen: string): boolean {
  const parts = fen.trim().split(/\s+/);
  if (parts.length !== 6) return false;

  const [board, turn, castling, enPassant, halfmove, fullmove] = parts;

  // Board: 8 ranks separated by /
  const ranks = board.split("/");
  if (ranks.length !== 8) return false;

  for (const rank of ranks) {
    let count = 0;
    for (const ch of rank) {
      if (ch >= "1" && ch <= "8") count += parseInt(ch);
      else if ("pnbrqkPNBRQK".includes(ch)) count += 1;
      else return false;
    }
    if (count !== 8) return false;
  }

  // Turn
  if (turn !== "w" && turn !== "b") return false;

  // Castling
  if (!/^(-|[KQkq]{1,4})$/.test(castling)) return false;

  // En passant
  if (!/^(-|[a-h][36])$/.test(enPassant)) return false;

  // Halfmove and fullmove are non-negative integers
  if (!/^\d+$/.test(halfmove) || !/^\d+$/.test(fullmove)) return false;

  return true;
}

const fenSchema = z.string().min(10).refine(isValidFen, {
  message: "Invalid FEN: must have 8 ranks, valid pieces, and 6 space-separated fields",
});

const predictSchema = z.object({
  fen: fenSchema,
  move_history: z.array(z.string()).optional().default([]),
  player_id: z.number().int().optional().default(0),
  player_rating: z.number().min(0).max(4000).optional().default(1500),
  // Which site's scale player_rating is on; the ML service translates
  // chesscom ratings to its internal Lichess-denominated scale.
  rating_pool: z.enum(["lichess", "chesscom"]).optional(),
  player_key: z.string().optional(),
  // PRD §5.2: 10-dim style profile. All fields optional (clients sending
  // only the original 3 keep working; the ML side defaults the rest to 50).
  style_overrides: z
    .object({
      aggression: z.number().min(0).max(100).optional(),
      risk_taking: z.number().min(0).max(100).optional(),
      blunder_frequency: z.number().min(0).max(100).optional(),
      king_attack: z.number().min(0).max(100).optional(),
      positional: z.number().min(0).max(100).optional(),
      trade_preference: z.number().min(0).max(100).optional(),
      opening_loyalty: z.number().min(0).max(100).optional(),
      repertoire_width: z.number().min(0).max(100).optional(),
      endgame_strength: z.number().min(0).max(100).optional(),
      defensive_tenacity: z.number().min(0).max(100).optional(),
      pawn_aggression: z.number().min(0).max(100).optional(),
    })
    .optional(),
  time_remaining: z.number().min(0).optional(),
  time_control_initial: z.number().min(0).optional(),
});

const analyzeSchema = z.object({
  fen: fenSchema,
  depth: z.number().int().min(1).max(30).optional().default(18),
  num_lines: z.number().int().min(1).max(10).optional().default(5),
});

const reviewSchema = z.object({
  moves: z.array(z.string().min(4).max(5)).min(1).max(500),
  depth: z.number().int().min(1).max(24).optional().default(18),
  // PRD §5.7: optional clone-aware review fields
  clone_player_key: z.string().optional(),
  clone_color: z.enum(["w", "b"]).optional(),
  clone_rating: z.number().min(0).max(4000).optional(),
});

/**
 * POST /api/predict
 * Get a human move prediction for a position.
 *
 * Predictions are NOT cached because the ML service uses temperature-based
 * stochastic sampling — the same inputs produce different moves each time.
 * Caching would return the same "random" move for the entire TTL period.
 */
predictRouter.post("/", async (req: Request, res: Response) => {
  try {
    const params = predictSchema.parse(req.body);

    const prediction = await mlClient.predict({
      fen: params.fen,
      move_history: params.move_history,
      player_id: params.player_id,
      player_rating: params.player_rating,
      rating_pool: params.rating_pool,
      player_key: params.player_key,
      style_overrides: params.style_overrides,
      time_remaining: params.time_remaining,
      time_control_initial: params.time_control_initial,
    });

    res.json({ success: true, data: prediction });
  } catch (error: any) {
    logger.error("Prediction failed", { error: error.message });
    const status = error.name === "ZodError" ? 400 : 503;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/predict/analyze
 * Get raw Stockfish analysis for a position.
 * Results are deterministic and cached for 24 hours.
 */
predictRouter.post("/analyze", async (req: Request, res: Response) => {
  try {
    const params = analyzeSchema.parse(req.body);

    const cacheKey = analysisCacheKey(params.fen, params.depth);
    const cached = await getCached(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached, cached: true });
      return;
    }

    const analysis = await mlClient.analyze({
      fen: params.fen,
      depth: params.depth,
      num_lines: params.num_lines,
    });

    await setCache(cacheKey, analysis, 86400); // 24 hour TTL

    res.json({ success: true, data: analysis });
  } catch (error: any) {
    logger.error("Analysis failed", { error: error.message });
    const status = error.name === "ZodError" ? 400 : 503;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/predict/review
 * Full game review — analyzes every move and classifies them.
 * Returns per-move annotations + per-player accuracy.
 */
/**
 * POST /api/predict/coach — PRD §5.9.
 * Aggregate blunder patterns across the user's games for coaching insights.
 */
const coachSchema = z.object({
  pgns: z.array(z.string()).min(1).max(200),
  player_name: z.string().min(1).max(100),
  max_games: z.number().int().min(1).max(200).optional(),
  stockfish_depth: z.number().int().min(1).max(18).optional(),
});

predictRouter.post("/coach", async (req: Request, res: Response) => {
  try {
    const params = coachSchema.parse(req.body);
    const result = await mlClient.coachAnalysis({
      pgns: params.pgns,
      player_name: params.player_name,
      max_games: params.max_games,
      stockfish_depth: params.stockfish_depth,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error("Coach analysis failed", { error: error.message });
    const status = error.name === "ZodError" ? 400 : 503;
    res.status(status).json({ success: false, error: error.message });
  }
});

predictRouter.post("/review", async (req: Request, res: Response) => {
  try {
    const params = reviewSchema.parse(req.body);
    const review = await mlClient.reviewGame({
      moves: params.moves,
      depth: params.depth,
      clone_player_key: params.clone_player_key,
      clone_color: params.clone_color,
      clone_rating: params.clone_rating,
    });
    res.json({ success: true, data: review });
  } catch (error: any) {
    logger.error("Game review failed", { error: error.message });
    const status = error.name === "ZodError" ? 400 : 503;
    res.status(status).json({ success: false, error: error.message });
  }
});
