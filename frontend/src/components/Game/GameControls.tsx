import { useChessGame } from "../../hooks/useChessGame";
import { useGameStore } from "../../store/gameStore";

export function GameControls() {
  const { undoMove, resetGame, isGameOver } = useChessGame();
  const isLoading = useGameStore((s) => s.isLoading);

  return (
    <div className="flex gap-2 mt-3">
      <button
        onClick={undoMove}
        disabled={isLoading}
        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40
                   disabled:cursor-not-allowed rounded-lg text-xs font-medium
                   text-gray-300 transition-colors border border-gray-700/50"
      >
        Undo
      </button>
      <button
        onClick={resetGame}
        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs
                   font-medium text-gray-300 transition-colors border border-gray-700/50"
      >
        Reset
      </button>
      {isGameOver && (
        <span className="flex items-center px-3 text-xs text-gray-500">
          Game over
        </span>
      )}
    </div>
  );
}
