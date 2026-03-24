import { Router, Request, Response } from "express";
import { z } from "zod";
import { mlClient } from "../services/mlClient";
import { logger } from "../config";

export const playersRouter = Router();

const buildProfileSchema = z.object({
  source: z.enum(["lichess", "chesscom"]),
  username: z.string().min(1).max(100),
  max_games: z.number().int().min(10).max(5000).optional().default(200),
});

/**
 * POST /api/players/build-profile
 * Fetch a player's games and compute their style profile.
 */
playersRouter.post("/build-profile", async (req: Request, res: Response) => {
  try {
    const params = buildProfileSchema.parse(req.body);

    const profile = await mlClient.buildPlayerProfile({
      source: params.source,
      username: params.username,
      max_games: params.max_games,
    });

    res.json({ success: true, data: profile });
  } catch (error: any) {
    logger.error("Build profile failed", { error: error.message });
    const status = error.name === "ZodError" ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/players/search?q=name
 */
playersRouter.get("/search", async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query || query.length < 2) {
    res.status(400).json({ success: false, error: "Query too short" });
    return;
  }

  // In production, search the database. For now, return empty.
  res.json({ success: true, data: { players: [], query } });
});
