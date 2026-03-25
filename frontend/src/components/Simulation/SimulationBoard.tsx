import { useState, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { useGameStore } from "../../store/gameStore";
import { usePlayerStore } from "../../store/playerStore";
import { startSimulation, makeSimulationMove } from "../../api/client";
import type { Square } from "chess.js";

export function SimulationBoard() {
  const { fen, simulationSessionId, setSimulationSession, setPrediction, setLoading } =
    useGameStore();
  const opponent = usePlayerStore((s) => s.opponent);
  const styleOverrides = usePlayerStore((s) => s.styleOverrides);
  const [simFen, setSimFen] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  const [aiThinking, setAiThinking] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [lastAiMove, setLastAiMove] = useState<string | null>(null);

  const startGame = useCallback(async () => {
    try {
      const response = await startSimulation({
        black_rating: opponent?.rating || 1500,
        style_overrides: styleOverrides,
      });

      if (response.success) {
        setSimulationSession(response.data.session_id);
        setSimFen(response.data.fen);
        setGameOver(false);
        setLastAiMove(null);
      }
    } catch (error) {
      console.error("Failed to start simulation:", error);
    }
  }, [opponent, styleOverrides, setSimulationSession]);

  const onPieceDrop = useCallback(
    async (sourceSquare: string, targetSquare: string): Promise<boolean> => {
      if (!simulationSessionId || aiThinking || gameOver) return false;

      const move = `${sourceSquare}${targetSquare}`;
      setAiThinking(true);

      try {
        const response = await makeSimulationMove(simulationSessionId, move);

        if (response.success) {
          setSimFen(response.data.fen);

          if (response.data.ai_move) {
            setLastAiMove(response.data.ai_move.move);
          }

          if (response.data.game_over) {
            setGameOver(true);
          }

          return true;
        }
      } catch (error) {
        console.error("Move failed:", error);
      } finally {
        setAiThinking(false);
      }

      return false;
    },
    [simulationSessionId, aiThinking, gameOver]
  );

  const customArrows: [Square, Square, string][] = [];
  if (lastAiMove) {
    const from = lastAiMove.slice(0, 2) as Square;
    const to = lastAiMove.slice(2, 4) as Square;
    customArrows.push([from, to, "rgba(239, 68, 68, 0.5)"]);
  }

  return (
    <div className="space-y-3">
      {!simulationSessionId ? (
        <button
          onClick={startGame}
          className="w-full py-3 bg-gold hover:bg-gold-light
                     rounded-xl text-sm font-semibold text-surface-0 transition-all duration-200
                     shadow-lg shadow-gold/20"
        >
          Start Game vs {opponent?.username || "AI"}
        </button>
      ) : (
        <>
          <div className="rounded-lg overflow-hidden shadow-2xl shadow-black/40 ring-1 ring-white/[0.04]">
            <Chessboard
              position={simFen}
              onPieceDrop={onPieceDrop}
              customArrows={customArrows}
              boardWidth={480}
              customDarkSquareStyle={{ backgroundColor: "#779952" }}
              customLightSquareStyle={{ backgroundColor: "#edeed1" }}
            />
          </div>
          {aiThinking && (
            <p className="text-xs text-amber-400/70 animate-pulse font-light">
              Opponent is thinking...
            </p>
          )}
          {gameOver && (
            <div className="text-center space-y-3">
              <p className="text-sm text-zinc-300 font-medium">Game Over</p>
              <button
                onClick={startGame}
                className="px-6 py-2.5 bg-gold hover:bg-gold-light
                           rounded-xl text-sm font-semibold text-surface-0 transition-all duration-200"
              >
                Play Again
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
