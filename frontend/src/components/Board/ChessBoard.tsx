import { Chessboard } from "react-chessboard";
import { useChessGame } from "../../hooks/useChessGame";
import { useGameStore } from "../../store/gameStore";
import { usePlayerStore } from "../../store/playerStore";
import type { Square } from "chess.js";

const BOARD_SIZE = 560;

export function ChessBoard() {
  const { fen, onPieceDrop, turn, isGameOver } = useChessGame();
  const prediction = useGameStore((s) => s.prediction);
  const isLoading = useGameStore((s) => s.isLoading);
  const playerColor = useGameStore((s) => s.playerColor);
  const opponent = usePlayerStore((s) => s.opponent);

  const customArrows: [Square, Square, string][] = [];

  if (prediction) {
    if (prediction.engineBest) {
      const from = prediction.engineBest.slice(0, 2) as Square;
      const to = prediction.engineBest.slice(2, 4) as Square;
      customArrows.push([from, to, "rgba(59, 130, 246, 0.45)"]);
    }
    if (prediction.move) {
      const from = prediction.move.slice(0, 2) as Square;
      const to = prediction.move.slice(2, 4) as Square;
      customArrows.push([from, to, "rgba(34, 197, 94, 0.55)"]);
    }
  }

  const isPlayerTurn =
    (playerColor === "w" && turn === "white") ||
    (playerColor === "b" && turn === "black");

  const opponentName = opponent?.username ?? "Opponent";

  return (
    <div style={{ width: BOARD_SIZE }}>
      {/* Top player label (opponent) */}
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full transition-colors ${
            !isPlayerTurn && !isGameOver ? "bg-green-400 shadow-sm shadow-green-400/50" : "bg-gray-600"
          }`} />
          <span className="text-xs text-gray-400 font-medium truncate max-w-[200px]">
            {opponentName}
          </span>
        </div>
        {isLoading && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-3 h-3 border-[1.5px] border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
            Thinking
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
          borderRadius: "4px",
          boxShadow: "0 4px 24px rgba(0, 0, 0, 0.5)",
        }}
        customDarkSquareStyle={{ backgroundColor: "#779952" }}
        customLightSquareStyle={{ backgroundColor: "#edeed1" }}
      />

      {/* Bottom player label (you) */}
      <div className="flex items-center justify-between mt-1.5 px-0.5">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full transition-colors ${
            isPlayerTurn && !isGameOver ? "bg-green-400 shadow-sm shadow-green-400/50" : "bg-gray-600"
          }`} />
          <span className="text-xs text-gray-300 font-medium">You</span>
        </div>
        {isGameOver && (
          <span className="text-xs text-gray-500 font-medium">Game over</span>
        )}
        {prediction && !isLoading && !isGameOver && (
          <span className="text-xs text-gray-500 font-mono">
            {prediction.move}{" "}
            <span className="text-green-400/60">
              {(prediction.probability * 100).toFixed(0)}%
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
