import { useChessGame } from "../../hooks/useChessGame";
import { usePrediction } from "../../hooks/usePrediction";

/**
 * Game control buttons: undo, reset, get prediction.
 */
export function GameControls() {
  const { undoMove, resetGame, isGameOver } = useChessGame();
  const { fetchPrediction, isLoading } = usePrediction();

  return (
    <div className="flex gap-2 mt-3">
      <button
        onClick={fetchPrediction}
        disabled={isLoading || isGameOver}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600
                   disabled:cursor-not-allowed rounded-md text-sm font-medium transition"
      >
        {isLoading ? "Predicting..." : "Predict Move"}
      </button>
      <button
        onClick={undoMove}
        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-sm font-medium transition"
      >
        Undo
      </button>
      <button
        onClick={resetGame}
        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-sm font-medium transition"
      >
        New Game
      </button>
    </div>
  );
}
