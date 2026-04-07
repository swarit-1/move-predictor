import { Router, Request, Response } from "express";
import { z } from "zod";
import axios from "axios";
import { mlClient } from "../services/mlClient";
import { logger } from "../config";

export const playersRouter = Router();

const buildProfileSchema = z.object({
  source: z.enum(["lichess", "chesscom"]),
  username: z.string().min(1).max(100),
  max_games: z.number().int().min(10).max(5000).optional().default(200),
  time_control: z
    .enum(["bullet", "blitz", "rapid", "classical"])
    .optional()
    .nullable()
    .default(null),
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
      time_control: params.time_control,
    });

    res.json({ success: true, data: profile });
  } catch (error: any) {
    logger.error("Build profile failed", { error: error.message });
    const status = error.name === "ZodError" ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
});

interface LichessPlayer {
  id: string;
  name: string;
  patron?: boolean;
  online?: boolean;
  perfs?: Record<string, { rating: number; games: number }>;
}

/**
 * GET /api/players/search?q=name
 * Search for players by username using the Lichess autocomplete API.
 */
playersRouter.get("/search", async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query || query.length < 2) {
    res.status(400).json({ success: false, error: "Query too short" });
    return;
  }

  try {
    const response = await axios.get<{ result: LichessPlayer[] }>(
      "https://lichess.org/api/player/autocomplete",
      {
        params: { term: query, object: true },
        headers: { Accept: "application/json" },
        timeout: 5000,
      }
    );

    const players = (response.data.result || []).map((p: LichessPlayer) => {
      // Extract the best available rating
      const perfs = p.perfs || {};
      const ratingEntry =
        perfs.blitz || perfs.rapid || perfs.classical || perfs.bullet;
      return {
        username: p.name || p.id,
        rating: ratingEntry?.rating ?? null,
        online: p.online ?? false,
      };
    });

    res.json({ success: true, data: { players, query } });
  } catch (error: any) {
    logger.error("Player search failed", { error: error.message });
    res.status(502).json({
      success: false,
      error: "Failed to search players from Lichess",
    });
  }
});
