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

/**
 * POST /api/players/:playerKey/personalize — kick off a Phase 3
 * per-player fine-tune. PRD §5.5. Returns 412 if no bracket
 * checkpoint exists yet, 404 if the profile isn't built.
 */
const personalizeSchema = z.object({
  source: z.enum(["lichess", "chesscom"]),
  username: z.string().min(1).max(100),
  steps: z.number().int().min(1).max(2000).optional(),
  batch_size: z.number().int().min(1).max(256).optional(),
  learning_rate: z.number().min(1e-6).max(1.0).optional(),
});

playersRouter.post("/:playerKey/personalize", async (req: Request, res: Response) => {
  try {
    const playerKey = String(req.params.playerKey ?? "");
    if (!playerKey) {
      res.status(400).json({ success: false, error: "Missing player key" });
      return;
    }
    const params = personalizeSchema.parse(req.body);
    const result = await mlClient.personalizePlayer({
      player_key: playerKey,
      source: params.source,
      username: params.username,
      steps: params.steps,
      batch_size: params.batch_size,
      learning_rate: params.learning_rate,
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    const upstreamStatus = error?.response?.status;
    const upstreamDetail = error?.response?.data?.detail;
    if (upstreamStatus) {
      res.status(upstreamStatus).json({
        success: false,
        error: upstreamDetail ?? error.message,
      });
      return;
    }
    logger.error("Personalize failed", { error: error.message });
    const status = error.name === "ZodError" ? 400 : 503;
    res.status(status).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/players/profile/:playerKey — preflight check.
 *
 * Used by the frontend on app load to verify that a persisted
 * playerKey (from sessionStorage) still has a cached profile on the
 * ML side. See PRD §6.1.
 */
playersRouter.get("/profile/:playerKey", async (req: Request, res: Response) => {
  try {
    const playerKey = String(req.params.playerKey ?? "");
    if (!playerKey) {
      res.status(400).json({ success: false, error: "Missing player key" });
      return;
    }
    const result = await mlClient.getCachedProfile(playerKey);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error("Profile preflight failed", { error: error.message });
    res.status(502).json({ success: false, error: "Failed to query profile cache" });
  }
});

/**
 * GET /api/players/clone-status/:playerKey
 * Progressive clone-fidelity stage for the opponent badge.
 */
playersRouter.get(
  "/clone-status/:playerKey",
  async (req: Request, res: Response) => {
    try {
      const playerKey = String(req.params.playerKey ?? "");
      if (!playerKey) {
        res.status(400).json({ success: false, error: "Missing player key" });
        return;
      }
      const result = await mlClient.getCloneStatus(playerKey);
      res.json({ success: true, data: result });
    } catch (error: any) {
      logger.error("Clone status failed", { error: error.message });
      res
        .status(502)
        .json({ success: false, error: "Failed to query clone status" });
    }
  }
);

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
