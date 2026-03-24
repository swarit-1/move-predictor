import { Chessboard } from "react-chessboard";
import { useChessGame } from "../../hooks/useChessGame";
import { useGameStore } from "../../store/gameStore";
import type { Square } from "chess.js";

const BOARD_SIZE = 560;

export function ChessBoard() {
  const { fen, onPieceDrop, turn, isGameOver } = useChessGame();
  const prediction = useGameStore((s) => s.prediction);
  const isLoading = useGameStore((s) => s.isLoading);
  const playerColor = useGameStore((s) => s.playerColor);

  const customArrows: [Square, Square, string][] = [];

  if (prediction) {
    if (prediction.engineBest) {
      const from = prediction.engineBest.slice(0, 2) as Square;
      const to = prediction.engineBest.slice(2, 4) as Square;
      customArrows.push([from, to, "rgba(59, 130, 246, 0.5)"]);
    }
    if (prediction.move) {
      const from = prediction.move.slice(0, 2) as Square;
      const to = prediction.move.slice(2, 4) as Square;
      customArrows.push([from, to, "rgba(34, 197, 94, 0.6)"]);
    }
  }

  const isPlayerTurn =
    (playerColor === "w" && turn === "white") ||
    (playerColor === "b" && turn === "black");

  return (
    <div style={{ width: BOARD_SIZE }}>
      {/* Status bar */}
      <div className="flex items-center justify-between mb-2 h-6">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isPlayerTurn ? "bg-green-400" : "bg-gray-500"
            }`}
          />
          <span className="text-xs text-gray-400">
            {isGameOver
              ? "Game over"
              : isPlayerTurn
              ? "Your turn"
              : isLoading
              ? "Analyzing..."
              : "Opponent's turn"}
          </span>
        </div>
        {prediction && !isLoading && (
          <span className="text-xs text-gray-500 font-mono">
            {prediction.move}{" "}
            <span className="text-green-400/70">
              {(prediction.probability * 100).toFixed(0)}%
            </span>
          </span>
        )}
        {isLoading && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-3 h-3 border border-blue-400/40 border-t-blue-400 rounded-full animate-spin" />
            Predicting
          </span>
        )}
      </div>

      <Chessboard
        position={fen}
        onPieceDrop={onPieceDrop}
        customArrows={customArrows}
        boardWidth={BOARD_SIZE}
        boardOrientation={playerColor === "w" ? "white" : "black"}
        animationDuration={200}
        customBoardStyle={{
          borderRadius: "6px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        }}
        customDarkSquareStyle={{ backgroundColor: "#779952" }}
        customLightSquareStyle={{ backgroundColor: "#edeed1" }}
      />
    </div>
  );
}
