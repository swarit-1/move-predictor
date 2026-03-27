import { useState, useEffect } from "react";
import { useGameStore } from "../../store/gameStore";

interface Props {
  onNewGame: () => void;
}

export function GameOverModal({ onNewGame }: Props) {
  const chess = useGameStore((s) => s.chess);
  const playerColor = useGameStore((s) => s.playerColor);
  const moveHistory = useGameStore((s) => s.moveHistory);
  const flagGameOver = useGameStore((s) => s.flagGameOver);
  const [dismissed, setDismissed] = useState(false);

  const isChessOver = chess.isGameOver();
  const isOver = isChessOver || !!flagGameOver;

  useEffect(() => {
    if (!isOver) setDismissed(false);
  }, [isOver]);

  if (!isOver || dismissed) return null;

  let result: string;
  let description: string;
  let resultGradient: string;
  let glowColor: string;

  if (flagGameOver) {
    // Game ended by time (flag)
    if (flagGameOver.winner === "draw") {
      result = "Draw";
      description = flagGameOver.description;
      resultGradient = "from-zinc-300 to-zinc-400";
      glowColor = "shadow-zinc-500/10";
    } else {
      const playerWon = flagGameOver.winner === "player";
      result = playerWon ? "Victory" : "Defeat";
      description = flagGameOver.description;
      resultGradient = playerWon
        ? "from-human to-green-300"
        : "from-blunder to-rose-300";
      glowColor = playerWon
        ? "shadow-human/20"
        : "shadow-blunder/20";
    }
  } else if (chess.isCheckmate()) {
    const loser = chess.turn();
    const playerWon = loser !== playerColor;
    result = playerWon ? "Victory" : "Defeat";
    description = `Checkmate in ${Math.ceil(moveHistory.length / 2)} moves`;
    resultGradient = playerWon
      ? "from-human to-green-300"
      : "from-blunder to-rose-300";
    glowColor = playerWon
      ? "shadow-human/20"
      : "shadow-blunder/20";
  } else if (chess.isStalemate()) {
    result = "Draw";
    description = "Stalemate — no legal moves";
    resultGradient = "from-zinc-300 to-zinc-400";
    glowColor = "shadow-zinc-500/10";
  } else if (chess.isThreefoldRepetition()) {
    result = "Draw";
    description = "Threefold repetition";
    resultGradient = "from-zinc-300 to-zinc-400";
    glowColor = "shadow-zinc-500/10";
  } else if (chess.isInsufficientMaterial()) {
    result = "Draw";
    description = "Insufficient material";
    resultGradient = "from-zinc-300 to-zinc-400";
    glowColor = "shadow-zinc-500/10";
  } else if (chess.isDraw()) {
    result = "Draw";
    description = "50-move rule";
    resultGradient = "from-zinc-300 to-zinc-400";
    glowColor = "shadow-zinc-500/10";
  } else {
    result = "Game Over";
    description = "";
    resultGradient = "from-zinc-300 to-zinc-400";
    glowColor = "shadow-zinc-500/10";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in">
      <div className={`glass-card p-7 w-[360px] text-center space-y-5 shadow-2xl ${glowColor} animate-slide-up`}>
        <div>
          <h2 className={`text-3xl font-bold bg-gradient-to-r ${resultGradient} bg-clip-text text-transparent`}>
            {result}
          </h2>
          <p className="text-sm text-zinc-400 mt-1.5 font-light">{description}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Moves</p>
            <p className="text-xl font-mono font-bold text-zinc-200 mt-0.5">
              {Math.ceil(moveHistory.length / 2)}
            </p>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Half-moves</p>
            <p className="text-xl font-mono font-bold text-zinc-200 mt-0.5">{moveHistory.length}</p>
          </div>
        </div>

        <div className="flex gap-2.5 pt-1">
          <button
            onClick={onNewGame}
            className="flex-1 py-3 bg-gold hover:bg-gold-light
                       rounded-xl text-sm font-semibold text-surface-0 transition-all duration-200
                       shadow-lg shadow-gold/20"
          >
            New Game
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="flex-1 py-3 bg-white/[0.05] hover:bg-white/[0.08] rounded-xl text-sm font-medium
                       text-zinc-300 transition-all duration-200 border border-white/[0.06]"
          >
            Review
          </button>
        </div>
      </div>
    </div>
  );
}
