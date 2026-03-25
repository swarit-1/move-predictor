import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { Chess } from "chess.js";
import { z } from "zod";
import { mlClient } from "../services/mlClient";
import { logger } from "../config";

export const simulateRouter = Router();

// In-memory session store (production would use Redis or DB)
interface GameSession {
  id: string;
  chess: Chess;
  moveHistory: string[];
  whitePlayerId: number;
  blackPlayerId: number;
  whiteRating: number;
  blackRating: number;
  styleOverrides?: Record<string, number>;
  createdAt: Date;
  lastAccessedAt: Date;
}

const sessions = new Map<string, GameSession>();

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_SESSIONS = 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Run cleanup every 5 minutes

/**
 * Remove sessions that have exceeded the TTL.
 * If still over MAX_SESSIONS after TTL eviction, evict LRU sessions.
 */
function cleanupSessions(): void {
  const now = Date.now();

  // 1. TTL-based eviction
  for (const [id, session] of sessions) {
    if (now - session.lastAccessedAt.getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }

  // 2. LRU eviction if still over limit
  if (sessions.size > MAX_SESSIONS) {
    const sorted = [...sessions.entries()].sort(
      (a, b) => a[1].lastAccessedAt.getTime() - b[1].lastAccessedAt.getTime()
    );
    const toRemove = sessions.size - MAX_SESSIONS;
    for (let i = 0; i < toRemove; i++) {
      sessions.delete(sorted[i][0]);
    }
  }
}

// Periodic cleanup
const cleanupInterval = setInterval(cleanupSessions, CLEANUP_INTERVAL_MS);
// Allow the Node.js process to exit even if the interval is still active
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

const startSchema = z.object({
  white_player_id: z.number().int().optional().default(0),
  black_player_id: z.number().int().optional().default(0),
  white_rating: z.number().optional().default(1500),
  black_rating: z.number().optional().default(1500),
  style_overrides: z.record(z.number()).optional(),
});

/**
 * POST /api/simulate/start
 * Start a new simulation game.
 */
simulateRouter.post("/start", (req: Request, res: Response) => {
  try {
    const params = startSchema.parse(req.body);

    // Enforce session limit before creating a new one
    if (sessions.size >= MAX_SESSIONS) {
      cleanupSessions();
    }

    const now = new Date();
    const session: GameSession = {
      id: uuidv4(),
      chess: new Chess(),
      moveHistory: [],
      whitePlayerId: params.white_player_id,
      blackPlayerId: params.black_player_id,
      whiteRating: params.white_rating,
      blackRating: params.black_rating,
      styleOverrides: params.style_overrides,
      createdAt: now,
      lastAccessedAt: now,
    };

    sessions.set(session.id, session);

    res.json({
      success: true,
      data: {
        session_id: session.id,
        fen: session.chess.fen(),
        turn: session.chess.turn() === "w" ? "white" : "black",
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/simulate/:sessionId/move
 * Make a move or request the AI to play.
 */
simulateRouter.post("/:sessionId/move", async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId as string;
    const session = sessions.get(sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }

    // Update LRU timestamp
    session.lastAccessedAt = new Date();

    const { move } = req.body;

    if (session.chess.isGameOver()) {
      res.json({
        success: true,
        data: {
          game_over: true,
          result: getResult(session.chess),
          fen: session.chess.fen(),
          pgn: session.chess.pgn(),
        },
      });
      return;
    }

    if (move) {
      // Human plays a move
      const result = session.chess.move(move);
      if (!result) {
        res.status(400).json({ success: false, error: "Illegal move" });
        return;
      }
      session.moveHistory.push(result.lan);
    }

    // If it's the AI's turn (or no move was provided), get AI prediction
    let aiMove = null;
    if (!session.chess.isGameOver()) {
      const isWhiteTurn = session.chess.turn() === "w";
      const playerId = isWhiteTurn
        ? session.whitePlayerId
        : session.blackPlayerId;
      const rating = isWhiteTurn
        ? session.whiteRating
        : session.blackRating;

      const prediction = await mlClient.predict({
        fen: session.chess.fen(),
        move_history: session.moveHistory,
        player_id: playerId,
        player_rating: rating,
        style_overrides: session.styleOverrides,
      });

      // Apply the predicted move
      const aiResult = session.chess.move(prediction.move);
      if (aiResult) {
        session.moveHistory.push(aiResult.lan);
        aiMove = {
          move: prediction.move,
          probability: prediction.probability,
          top_moves: prediction.top_moves,
          engine_best: prediction.engine_best,
          blunder_probability: prediction.blunder_probability,
          explanation: prediction.explanation,
        };
      }
    }

    res.json({
      success: true,
      data: {
        fen: session.chess.fen(),
        turn: session.chess.turn() === "w" ? "white" : "black",
        game_over: session.chess.isGameOver(),
        result: session.chess.isGameOver() ? getResult(session.chess) : null,
        ai_move: aiMove,
        move_history: session.moveHistory,
        pgn: session.chess.pgn(),
      },
    });
  } catch (error: any) {
    logger.error("Simulation move failed", { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/simulate/:sessionId
 * Get current session state.
 */
simulateRouter.get("/:sessionId", (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ success: false, error: "Session not found" });
    return;
  }

  // Update LRU timestamp
  session.lastAccessedAt = new Date();

  res.json({
    success: true,
    data: {
      session_id: session.id,
      fen: session.chess.fen(),
      turn: session.chess.turn() === "w" ? "white" : "black",
      game_over: session.chess.isGameOver(),
      move_history: session.moveHistory,
      pgn: session.chess.pgn(),
    },
  });
});

function getResult(chess: Chess): string {
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? "0-1" : "1-0";
  }
  if (chess.isDraw()) return "1/2-1/2";
  return "*";
}
