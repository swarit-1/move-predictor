import { useChessGame } from "../../hooks/useChessGame";
import { useGameStore } from "../../store/gameStore";

export function GameControls() {
  const { undoMove, resetGame, isGameOver, moveHistory } = useChessGame();
  const isLoading = useGameStore((s) => s.isLoading);

  return (
    <div className="flex items-center gap-2 mt-2.5">
      <button
        onClick={undoMove}
        disabled={isLoading || moveHistory.length === 0}
        className="px-3.5 py-1.5 bg-gray-800/60 hover:bg-gray-800 disabled:opacity-30
                   disabled:cursor-not-allowed rounded-lg text-xs font-medium
                   text-gray-400 hover:text-gray-200 transition-all border border-gray-700/40"
        title="Undo last move"
      >
        <svg className="w-3.5 h-3.5 inline-block mr-1 -mt-px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
        Undo
      </button>
      <button
        onClick={resetGame}
        disabled={moveHistory.length === 0}
        className="px-3.5 py-1.5 bg-gray-800/60 hover:bg-gray-800 disabled:opacity-30
                   disabled:cursor-not-allowed rounded-lg text-xs font-medium
                   text-gray-400 hover:text-gray-200 transition-all border border-gray-700/40"
      >
        Reset
      </button>
      {isGameOver && (
        <span className="ml-2 text-xs text-amber-400/80 font-medium">
          Game over
        </span>
      )}
    </div>
  );
}
