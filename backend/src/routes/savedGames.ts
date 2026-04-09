import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { logger } from "../config";

export const savedGamesRouter = Router();
savedGamesRouter.use(requireAuth);

const saveSchema = z.object({
  pgn: z.string().min(1).max(100_000),
  finalFen: z.string().min(1).max(200),
  playerColor: z.enum(["w", "b"]),
  opponentName: z.string().max(100).optional().nullable(),
  opponentRating: z.number().int().min(0).max(4000).optional().nullable(),
  opponentSource: z.enum(["lichess", "chesscom"]).optional().nullable(),
  result: z.string().max(10).optional().nullable(),
  numMoves: z.number().int().min(0).max(2000),
  timeControl: z.string().max(50).optional().nullable(),
  endReason: z.string().max(50).optional().nullable(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

savedGamesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body = saveSchema.parse(req.body);
    const game = await prisma.savedGame.create({
      data: {
        userId: req.user!.id,
        pgn: body.pgn,
        finalFen: body.finalFen,
        playerColor: body.playerColor,
        opponentName: body.opponentName ?? null,
        opponentRating: body.opponentRating ?? null,
        opponentSource: body.opponentSource ?? null,
        result: body.result ?? null,
        numMoves: body.numMoves,
        timeControl: body.timeControl ?? null,
        endReason: body.endReason ?? null,
      },
    });
    res.status(201).json({ success: true, data: game });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      res.status(400).json({ success: false, error: error.errors?.[0]?.message || "Invalid input" });
      return;
    }
    logger.error("Save game failed", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to save game" });
  }
});

savedGamesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { limit, cursor } = listQuerySchema.parse(req.query);
    const games = await prisma.savedGame.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = games.length > limit;
    const items = hasMore ? games.slice(0, limit) : games;
    const nextCursor = hasMore ? items[items.length - 1].id : null;
    res.json({ success: true, data: { items, nextCursor } });
  } catch (error: any) {
    logger.error("List games failed", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to list games" });
  }
});

savedGamesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const game = await prisma.savedGame.findUnique({ where: { id } });
    if (!game || game.userId !== req.user!.id) {
      res.status(404).json({ success: false, error: "Game not found" });
      return;
    }
    res.json({ success: true, data: game });
  } catch (error: any) {
    logger.error("Get game failed", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to load game" });
  }
});

savedGamesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const game = await prisma.savedGame.findUnique({ where: { id } });
    if (!game || game.userId !== req.user!.id) {
      res.status(404).json({ success: false, error: "Game not found" });
      return;
    }
    await prisma.savedGame.delete({ where: { id: game.id } });
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Delete game failed", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to delete game" });
  }
});
