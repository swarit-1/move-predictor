import { Router, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { importPlayerGames } from "../services/gameImport";
import { logger } from "../config";

export const gamesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith(".pgn") || file.mimetype === "text/plain") {
      cb(null, true);
    } else {
      cb(new Error("Only PGN files are accepted"));
    }
  },
});

const importSchema = z.object({
  source: z.enum(["lichess", "chesscom"]),
  username: z.string().min(1).max(100),
  max_games: z.number().int().min(1).max(5000).optional().default(200),
});

/**
 * POST /api/games/import
 * Fetch games from Lichess or Chess.com for a given username.
 */
gamesRouter.post("/import", async (req: Request, res: Response) => {
  try {
    const params = importSchema.parse(req.body);

    const result = await importPlayerGames(
      params.source,
      params.username,
      params.max_games
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error("Game import failed", { error: error.message });
    const status = error.name === "ZodError" ? 400 : 500;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/games/upload
 * Upload a PGN file directly.
 */
gamesRouter.post(
  "/upload",
  upload.single("pgn"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: "No file uploaded" });
        return;
      }

      const pgnContent = req.file.buffer.toString("utf-8");

      // Forward to ML service for processing
      const { mlClient } = await import("../services/mlClient");
      const result = await mlClient.buildPlayerProfile({
        source: "upload",
        username: req.body.player_name || "uploaded",
      });

      res.json({
        success: true,
        data: {
          filename: req.file.originalname,
          size: req.file.size,
          profile: result,
        },
      });
    } catch (error: any) {
      logger.error("PGN upload failed", { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  }
);
