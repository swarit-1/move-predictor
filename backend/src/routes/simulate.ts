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
}

const sessions = new Map<string, GameSession>();

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
    const session: GameSession = {
      id: uuidv4(),
      chess: new Chess(),
      moveHistory: [],
      whitePlayerId: params.white_player_id,
      blackPlayerId: params.black_player_id,
      whiteRating: params.white_rating,
      blackRating: params.black_rating,
      styleOverrides: params.style_overrides,
      createdAt: new Date(),
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
    const session = sessions.get(req.params.sessionId);
    if (!session) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }

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
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    res.status(404).json({ success: false, error: "Session not found" });
    return;
  }

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
