import { useRef, useState, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { useChessGame } from "../../hooks/useChessGame";
import { useGameStore } from "../../store/gameStore";
import { usePlayerStore } from "../../store/playerStore";
import type { Square, Piece } from "react-chessboard/dist/chessboard/types";

const MAX_BOARD_SIZE = 560;
const MIN_BOARD_SIZE = 320;

export function ChessBoard() {
  const { fen, onPieceDrop, turn, isGameOver } = useChessGame();
  const prediction = useGameStore((s) => s.prediction);
  const isLoading = useGameStore((s) => s.isLoading);
  const playerColor = useGameStore((s) => s.playerColor);
  const viewIndex = useGameStore((s) => s.viewIndex);
  const opponent = usePlayerStore((s) => s.opponent);

  const containerRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(MAX_BOARD_SIZE);

  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        const parentWidth = containerRef.current.parentElement?.clientWidth ?? window.innerWidth;
        const available = Math.min(parentWidth - 32, window.innerWidth - 32);
        setBoardSize(Math.max(MIN_BOARD_SIZE, Math.min(MAX_BOARD_SIZE, available)));
      }
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const customArrows: [Square, Square, string][] = [];
  if (prediction && viewIndex === -1) {
    if (prediction.engineBest) {
      const from = prediction.engineBest.slice(0, 2) as Square;
      const to = prediction.engineBest.slice(2, 4) as Square;
      customArrows.push([from, to, "rgba(99, 102, 241, 0.4)"]);
    }
    if (prediction.move) {
      const from = prediction.move.slice(0, 2) as Square;
      const to = prediction.move.slice(2, 4) as Square;
      customArrows.push([from, to, "rgba(34, 197, 94, 0.5)"]);
    }
  }

  const isPlayerTurn =
    (playerColor === "w" && turn === "white") ||
    (playerColor === "b" && turn === "black");

  const opponentName = opponent?.username ?? "Opponent";
  const isViewingHistory = viewIndex !== -1;

  return (
    <div ref={containerRef} style={{ width: boardSize }}>
      {/* Top player label (opponent) */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full transition-all duration-500 ${
            !isPlayerTurn && !isGameOver && !isViewingHistory
              ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
              : "bg-zinc-700"
          }`} />
          <span className="text-xs text-zinc-400 font-medium truncate max-w-[200px]">
            {opponentName}
          </span>
        </div>
        {isLoading && (
          <span className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="w-3 h-3 border-[1.5px] border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
            <span className="font-light">Thinking</span>
          </span>
        )}
        {isViewingHistory && (
          <span className="text-[10px] text-amber-400/70 font-medium bg-amber-400/[0.06] px-2 py-0.5 rounded-md">
            Viewing history
          </span>
        )}
      </div>

      {/* Board wrapper with glow */}
      <div className="rounded-lg overflow-hidden shadow-2xl shadow-black/40 ring-1 ring-white/[0.04]">
        <Chessboard
          position={fen}
          onPieceDrop={(src, tgt, piece) => {
            if (isViewingHistory) return false;
            return onPieceDrop(src, tgt, piece);
          }}
          customArrows={customArrows}
          boardWidth={boardSize}
          boardOrientation={playerColor === "w" ? "white" : "black"}
          animationDuration={200}
          autoPromoteToQueen={false}
          customBoardStyle={{
            borderRadius: "0px",
          }}
          customDarkSquareStyle={{ backgroundColor: "#779952" }}
          customLightSquareStyle={{ backgroundColor: "#edeed1" }}
        />
      </div>

      {/* Bottom player label (you) */}
      <div className="flex items-center justify-between mt-2 px-0.5">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full transition-all duration-500 ${
            isPlayerTurn && !isGameOver && !isViewingHistory
              ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
              : "bg-zinc-700"
          }`} />
          <span className="text-xs text-zinc-200 font-medium">You</span>
        </div>
        {isGameOver && (
          <span className="text-xs text-zinc-500 font-medium bg-white/[0.04] px-2.5 py-0.5 rounded-md">
            Game over
          </span>
        )}
        {prediction && !isLoading && !isGameOver && viewIndex === -1 && (
          <span className="text-xs text-zinc-500 font-mono flex items-center gap-1.5">
            <span className="text-zinc-400">{prediction.move}</span>
            <span className="text-emerald-400/70 font-semibold">
              {(prediction.probability * 100).toFixed(0)}%
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
