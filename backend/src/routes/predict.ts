import { Router, Request, Response } from "express";
import { z } from "zod";
import { mlClient } from "../services/mlClient";
import {
  getCached,
  setCache,
  predictionCacheKey,
  analysisCacheKey,
} from "../services/cache";
import { logger } from "../config";

export const predictRouter = Router();

const predictSchema = z.object({
  fen: z.string().min(10),
  move_history: z.array(z.string()).optional().default([]),
  player_id: z.number().int().optional().default(0),
  player_rating: z.number().min(0).max(4000).optional().default(1500),
  style_overrides: z
    .object({
      aggression: z.number().min(0).max(100).optional(),
      risk_taking: z.number().min(0).max(100).optional(),
      blunder_frequency: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

/**
 * POST /api/predict
 * Get a human move prediction for a position.
 */
predictRouter.post("/", async (req: Request, res: Response) => {
  try {
    const params = predictSchema.parse(req.body);

    // Check cache
    const cacheKey = predictionCacheKey(
      params.fen,
      params.player_id,
      params.style_overrides
    );
    const cached = await getCached(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached, cached: true });
      return;
    }

    // Call ML service
    const prediction = await mlClient.predict({
      fen: params.fen,
      move_history: params.move_history,
      player_id: params.player_id,
      player_rating: params.player_rating,
      style_overrides: params.style_overrides,
    });

    // Cache result
    await setCache(cacheKey, prediction, 1800); // 30 min TTL

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
 */
predictRouter.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { fen, depth = 18, num_lines = 5 } = req.body;

    // Check cache
    const cacheKey = analysisCacheKey(fen, depth);
    const cached = await getCached(cacheKey);
    if (cached) {
      res.json({ success: true, data: cached, cached: true });
      return;
    }

    const analysis = await mlClient.analyze({ fen, depth, num_lines });

    // Cache Stockfish results longer (they're deterministic)
    await setCache(cacheKey, analysis, 86400); // 24 hour TTL

    res.json({ success: true, data: analysis });
  } catch (error: any) {
    logger.error("Analysis failed", { error: error.message });
    res.status(503).json({ success: false, error: error.message });
  }
});
