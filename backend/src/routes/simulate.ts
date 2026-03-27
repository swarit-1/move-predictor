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
  // Time control
  whiteTimeRemaining: number; // milliseconds
  blackTimeRemaining: number; // milliseconds
  increment: number; // milliseconds
  initialTime: number; // milliseconds
  lastMoveTimestamp: number; // Date.now()
  gameOver: boolean;
  gameOverReason?: string;
  winner?: "white" | "black" | "draw";
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
  time_control: z
    .object({
      initial_time: z.number().min(0), // seconds
      increment: z.number().min(0), // seconds
    })
    .optional(),
  player_color: z.enum(["white", "black"]).optional().default("white"),
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
    const tc = params.time_control;
    const initialMs = tc ? tc.initial_time * 1000 : 0;
    const incrementMs = tc ? tc.increment * 1000 : 0;

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
      whiteTimeRemaining: initialMs,
      blackTimeRemaining: initialMs,
      increment: incrementMs,
      initialTime: initialMs,
      lastMoveTimestamp: Date.now(),
      gameOver: false,
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

    if (session.gameOver || session.chess.isGameOver()) {
      res.json({
        success: true,
        data: {
          game_over: true,
          result: session.gameOverReason || getResult(session.chess),
          winner: session.winner,
          fen: session.chess.fen(),
          pgn: session.chess.pgn(),
          white_time: session.whiteTimeRemaining,
          black_time: session.blackTimeRemaining,
        },
      });
      return;
    }

    // Deduct elapsed time from the moving side's clock
    const now = Date.now();
    if (session.initialTime > 0) {
      const elapsed = now - session.lastMoveTimestamp;
      const movingSide = session.chess.turn() === "w" ? "white" : "black";
      const timeKey = movingSide === "white" ? "whiteTimeRemaining" : "blackTimeRemaining";
      session[timeKey] -= elapsed;

      // Check flag
      if (session[timeKey] <= 0) {
        session[timeKey] = 0;
        session.gameOver = true;
        session.gameOverReason = "flag";
        session.winner = movingSide === "white" ? "black" : "white";
        res.json({
          success: true,
          data: {
            game_over: true,
            result: "flag",
            winner: session.winner,
            fen: session.chess.fen(),
            pgn: session.chess.pgn(),
            white_time: session.whiteTimeRemaining,
            black_time: session.blackTimeRemaining,
          },
        });
        return;
      }
    }

    if (move) {
      // Human plays a move
      const result = session.chess.move(move);
      if (!result) {
        res.status(400).json({ success: false, error: "Illegal move" });
        return;
      }
      session.moveHistory.push(result.lan);

      // Add increment to the player who just moved
      if (session.initialTime > 0) {
        const movedSide = session.chess.turn() === "w" ? "black" : "white";
        const movedTimeKey = movedSide === "white" ? "whiteTimeRemaining" : "blackTimeRemaining";
        session[movedTimeKey] += session.increment;
      }
      session.lastMoveTimestamp = Date.now();
    }

    // If it's the AI's turn (or no move was provided), get AI prediction
    let aiMove = null;
    if (!session.chess.isGameOver() && !session.gameOver) {
      const isWhiteTurn = session.chess.turn() === "w";
      const playerId = isWhiteTurn
        ? session.whitePlayerId
        : session.blackPlayerId;
      const rating = isWhiteTurn
        ? session.whiteRating
        : session.blackRating;

      // Pass time info to ML service for time pressure calculation
      const aiTimeKey = isWhiteTurn ? "whiteTimeRemaining" : "blackTimeRemaining";
      const timeRemaining = session.initialTime > 0
        ? session[aiTimeKey] / 1000
        : undefined;
      const timeControlInitial = session.initialTime > 0
        ? session.initialTime / 1000
        : undefined;

      const prediction = await mlClient.predict({
        fen: session.chess.fen(),
        move_history: session.moveHistory,
        player_id: playerId,
        player_rating: rating,
        style_overrides: session.styleOverrides,
        time_remaining: timeRemaining,
        time_control_initial: timeControlInitial,
      });

      // Apply the predicted move
      const aiResult = session.chess.move(prediction.move);
      if (aiResult) {
        session.moveHistory.push(aiResult.lan);

        // Add increment to AI's clock
        if (session.initialTime > 0) {
          session[aiTimeKey] += session.increment;
        }
        session.lastMoveTimestamp = Date.now();

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
        game_over: session.gameOver || session.chess.isGameOver(),
        result: session.gameOver
          ? session.gameOverReason
          : session.chess.isGameOver()
            ? getResult(session.chess)
            : null,
        winner: session.winner,
        ai_move: aiMove,
        move_history: session.moveHistory,
        pgn: session.chess.pgn(),
        white_time: session.whiteTimeRemaining,
        black_time: session.blackTimeRemaining,
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
      game_over: session.gameOver || session.chess.isGameOver(),
      move_history: session.moveHistory,
      pgn: session.chess.pgn(),
      white_time: session.whiteTimeRemaining,
      black_time: session.blackTimeRemaining,
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
