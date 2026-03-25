import { useState, useEffect } from "react";
import { useGameStore } from "../../store/gameStore";

interface Props {
  onNewGame: () => void;
}

export function GameOverModal({ onNewGame }: Props) {
  const chess = useGameStore((s) => s.chess);
  const playerColor = useGameStore((s) => s.playerColor);
  const moveHistory = useGameStore((s) => s.moveHistory);
  const [dismissed, setDismissed] = useState(false);

  const isOver = chess.isGameOver();

  // Reset dismissed when game resets
  useEffect(() => {
    if (!isOver) setDismissed(false);
  }, [isOver]);

  if (!isOver || dismissed) return null;

  let result: string;
  let description: string;
  let resultColor: string;

  if (chess.isCheckmate()) {
    const loser = chess.turn();
    const playerWon = loser !== playerColor;
    result = playerWon ? "You Win!" : "You Lose";
    description = `Checkmate in ${Math.ceil(moveHistory.length / 2)} moves`;
    resultColor = playerWon ? "text-green-400" : "text-red-400";
  } else if (chess.isStalemate()) {
    result = "Draw";
    description = "Stalemate — no legal moves";
    resultColor = "text-gray-300";
  } else if (chess.isThreefoldRepetition()) {
    result = "Draw";
    description = "Threefold repetition";
    resultColor = "text-gray-300";
  } else if (chess.isInsufficientMaterial()) {
    result = "Draw";
    description = "Insufficient material";
    resultColor = "text-gray-300";
  } else if (chess.isDraw()) {
    result = "Draw";
    description = "50-move rule";
    resultColor = "text-gray-300";
  } else {
    result = "Game Over";
    description = "";
    resultColor = "text-gray-300";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700/60 rounded-2xl p-6 w-[340px] text-center space-y-4 shadow-2xl">
        <div>
          <h2 className={`text-2xl font-bold ${resultColor}`}>{result}</h2>
          <p className="text-sm text-gray-400 mt-1">{description}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Moves</p>
            <p className="text-lg font-mono font-bold text-gray-200">
              {Math.ceil(moveHistory.length / 2)}
            </p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Half-moves</p>
            <p className="text-lg font-mono font-bold text-gray-200">{moveHistory.length}</p>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onNewGame}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-semibold text-white transition-colors"
          >
            New Game
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm font-medium text-gray-300 transition-colors border border-gray-700/50"
          >
            Review
          </button>
        </div>
      </div>
    </div>
  );
}
