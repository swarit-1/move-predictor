import { Chessboard } from "react-chessboard";
import { useChessGame } from "../../hooks/useChessGame";
import { useGameStore } from "../../store/gameStore";
import type { Square } from "chess.js";

export function ChessBoard() {
  const { fen, onPieceDrop, turn } = useChessGame();
  const prediction = useGameStore((s) => s.prediction);

  // Build arrows from prediction
  const customArrows: [Square, Square, string][] = [];

  if (prediction) {
    // Engine best move in blue
    if (prediction.engineBest) {
      const from = prediction.engineBest.slice(0, 2) as Square;
      const to = prediction.engineBest.slice(2, 4) as Square;
      customArrows.push([from, to, "rgba(59, 130, 246, 0.6)"]);
    }

    // Model predicted move in green
    if (prediction.move) {
      const from = prediction.move.slice(0, 2) as Square;
      const to = prediction.move.slice(2, 4) as Square;
      customArrows.push([from, to, "rgba(34, 197, 94, 0.7)"]);
    }
  }

  return (
    <div className="w-full max-w-[560px]">
      <div className="text-xs text-gray-400 mb-1 flex justify-between">
        <span>{turn === "white" ? "White to move" : "Black to move"}</span>
        {prediction && (
          <span className="text-green-400">
            Prediction: {prediction.move} ({(prediction.probability * 100).toFixed(1)}%)
          </span>
        )}
      </div>
      <Chessboard
        position={fen}
        onPieceDrop={onPieceDrop}
        customArrows={customArrows}
        boardWidth={560}
        customBoardStyle={{
          borderRadius: "4px",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
        }}
        customDarkSquareStyle={{ backgroundColor: "#779952" }}
        customLightSquareStyle={{ backgroundColor: "#edeed1" }}
      />
    </div>
  );
}
