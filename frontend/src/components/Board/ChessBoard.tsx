import { useRef, useState, useEffect, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { useChessGame } from "../../hooks/useChessGame";
import { useGameStore } from "../../store/gameStore";
import { usePlayerStore } from "../../store/playerStore";
import { CapturedPieces } from "./CapturedPieces";
import { GameClock } from "./GameClock";
import type { Square, Piece } from "react-chessboard/dist/chessboard/types";

const MAX_BOARD_SIZE = 640;
const MIN_BOARD_SIZE = 320;

export function ChessBoard() {
  const { fen, onPieceDrop, turn, isGameOver } = useChessGame();
  const prediction = useGameStore((s) => s.prediction);
  const isLoading = useGameStore((s) => s.isLoading);
  const playerColor = useGameStore((s) => s.playerColor);
  const viewIndex = useGameStore((s) => s.viewIndex);
  const opponent = usePlayerStore((s) => s.opponent);
  const timeControl = useGameStore((s) => s.timeControl);
  const playerTimeLeft = useGameStore((s) => s.playerTimeLeft);
  const opponentTimeLeft = useGameStore((s) => s.opponentTimeLeft);
  const tickClock = useGameStore((s) => s.tickClock);
  const showArrows = useGameStore((s) => s.showArrows);

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
  if (showArrows && prediction && viewIndex === -1) {
    if (prediction.engineBest) {
      const from = prediction.engineBest.slice(0, 2) as Square;
      const to = prediction.engineBest.slice(2, 4) as Square;
      customArrows.push([from, to, "rgba(91, 141, 239, 0.4)"]);
    }
    if (prediction.move) {
      const from = prediction.move.slice(0, 2) as Square;
      const to = prediction.move.slice(2, 4) as Square;
      customArrows.push([from, to, "rgba(74, 222, 128, 0.5)"]);
    }
  }

  const isPlayerTurn =
    (playerColor === "w" && turn === "white") ||
    (playerColor === "b" && turn === "black");

  const onFlag = useGameStore((s) => s.onFlag);
  const flagGameOver = useGameStore((s) => s.flagGameOver);

  const opponentName = opponent?.username ?? "Opponent";
  const isViewingHistory = viewIndex !== -1;
  const hasClock = timeControl !== null && timeControl.initial > 0;
  const anyGameOver = isGameOver || !!flagGameOver;
  const opponentClockRunning = hasClock && !isPlayerTurn && !anyGameOver && !isViewingHistory;
  const playerClockRunning = hasClock && isPlayerTurn && !anyGameOver && !isViewingHistory;

  const onOpponentTick = useCallback((elapsed: number) => tickClock("opponent", elapsed), [tickClock]);
  const onPlayerTick = useCallback((elapsed: number) => tickClock("player", elapsed), [tickClock]);
  const onOpponentTimeOut = useCallback(() => onFlag("opponent"), [onFlag]);
  const onPlayerTimeOut = useCallback(() => onFlag("player"), [onFlag]);

  return (
    <div ref={containerRef} style={{ width: boardSize }}>
      {/* Top player label (opponent) */}
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full transition-all duration-500 ${
            !isPlayerTurn && !isGameOver && !isViewingHistory
              ? "bg-human shadow-[0_0_8px_rgba(74,222,128,0.5)]"
              : "bg-zinc-700"
          }`} />
          <span className="text-xs text-zinc-400 font-medium truncate max-w-[200px]">
            {opponentName}
          </span>
          <CapturedPieces color={playerColor === "w" ? "black" : "white"} />
        </div>
        {isLoading && (
          <span className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="w-3 h-3 border-[1.5px] border-gold/30 border-t-gold rounded-full animate-spin" />
            <span className="font-light">Thinking</span>
          </span>
        )}
        {isViewingHistory && (
          <span className="text-[10px] text-inaccuracy/70 font-medium bg-inaccuracy/[0.06] px-2 py-0.5 rounded-md">
            Viewing history
          </span>
        )}
        {hasClock && (
          <GameClock
            timeLeft={opponentTimeLeft}
            isRunning={opponentClockRunning}
            onTick={onOpponentTick}
            onTimeOut={onOpponentTimeOut}
          />
        )}
      </div>

      {/* Board */}
      <div className="rounded-lg shadow-2xl shadow-black/40 ring-1 ring-white/[0.04]" style={{ position: "relative", zIndex: 10 }}>
        <Chessboard
          position={fen}
          onPieceDrop={(src, tgt, piece) => {
            if (isViewingHistory) return false;
            // Non-promotion moves go through directly
            return onPieceDrop(src, tgt, piece);
          }}
          onPromotionCheck={(sourceSquare, targetSquare, piece) => {
            // Check if a pawn is reaching the last rank
            return (
              piece[1] === "P" &&
              ((piece[0] === "w" && targetSquare[1] === "8") ||
                (piece[0] === "b" && targetSquare[1] === "1"))
            );
          }}
          onPromotionPieceSelect={(piece, promoteFromSquare, promoteToSquare) => {
            if (piece && promoteFromSquare && promoteToSquare) {
              const promoMap: Record<string, string> = {
                wQ: "q", wR: "r", wB: "b", wN: "n",
                bQ: "q", bR: "r", bB: "b", bN: "n",
              };
              const promotion = promoMap[piece] || "q";
              return onPieceDrop(promoteFromSquare, promoteToSquare, piece, promotion);
            }
            return false;
          }}
          customArrows={customArrows}
          boardWidth={boardSize}
          boardOrientation={playerColor === "w" ? "white" : "black"}
          animationDuration={200}
          autoPromoteToQueen={false}
          customBoardStyle={{
            borderRadius: "8px",
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
              ? "bg-human shadow-[0_0_8px_rgba(74,222,128,0.5)]"
              : "bg-zinc-700"
          }`} />
          <span className="text-xs text-zinc-200 font-medium">You</span>
          <CapturedPieces color={playerColor === "w" ? "white" : "black"} />
        </div>
        {isGameOver && (
          <span className="text-xs text-zinc-500 font-medium bg-white/[0.04] px-2.5 py-0.5 rounded-md">
            Game over
          </span>
        )}
        <div className="flex items-center gap-2">
          {prediction && !isLoading && !isGameOver && viewIndex === -1 && (
            <span className="text-xs text-zinc-500 font-mono flex items-center gap-1.5">
              <span className="text-zinc-400">{prediction.move}</span>
              <span className="text-human/70 font-semibold">
                {(prediction.probability * 100).toFixed(0)}%
              </span>
            </span>
          )}
          {hasClock && (
            <GameClock
              timeLeft={playerTimeLeft}
              isRunning={playerClockRunning}
              onTick={onPlayerTick}
              onTimeOut={onPlayerTimeOut}
            />
          )}
        </div>
      </div>
    </div>
  );
}
