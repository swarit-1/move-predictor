import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Chessboard } from "react-chessboard";
import { useChessGame } from "../../hooks/useChessGame";
import { useGameStore } from "../../store/gameStore";
import { usePlayerStore } from "../../store/playerStore";
import { CapturedPieces } from "./CapturedPieces";
import { GameClock } from "./GameClock";
import type { Square, Piece } from "react-chessboard/dist/chessboard/types";
import { Chess } from "chess.js";

// Build a chess.js instance with the side-to-move forced to `playerColor`,
// so we can compute pseudo-legal targets for premoves. Returns null if the
// resulting position is rejected by chess.js (e.g. opponent's king in check
// after a check has just been delivered) — in that case the caller should
// allow drag/drop without visual hints.
function buildPremoveChess(fen: string, playerColor: "w" | "b"): Chess | null {
  const parts = fen.split(" ");
  parts[1] = playerColor;
  parts[3] = "-"; // en-passant square is no longer reliable
  try {
    return new Chess(parts.join(" "));
  } catch {
    return null;
  }
}

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
  const premove = useGameStore((s) => s.premove);
  const setPremove = useGameStore((s) => s.setPremove);
  const clearPremove = useGameStore((s) => s.clearPremove);

  const containerRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(MAX_BOARD_SIZE);

  // Click-to-select state: track which square is selected and its legal destinations
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoveSquares, setLegalMoveSquares] = useState<Record<string, React.CSSProperties>>({});

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

  const isViewingHistory = viewIndex !== -1;

  // Clear selection whenever fen changes (opponent moved, or player moved)
  useEffect(() => {
    setSelectedSquare(null);
    setLegalMoveSquares({});
  }, [fen]);

  const selectSquare = useCallback((square: Square, chess: Chess, isPremoveMode: boolean) => {
    const moves = chess.moves({ square, verbose: true });
    if (moves.length === 0) return;

    setSelectedSquare(square);

    // Orange for premove, green for normal selection.
    const rgb = isPremoveMode ? "245,158,11" : "74,222,128";
    const sourceAlpha = isPremoveMode ? 0.4 : 0.25;

    const styles: Record<string, React.CSSProperties> = {
      [square]: { background: `rgba(${rgb}, ${sourceAlpha})` },
    };

    moves.forEach((m) => {
      const occupied = chess.get(m.to as Square);
      const isCapture = !!occupied || m.flags.includes("e");
      styles[m.to] = isCapture
        ? {
            background: `radial-gradient(circle, transparent 58%, rgba(${rgb},0.55) 60%, rgba(${rgb},0.55) 75%, transparent 77%)`,
          }
        : {
            background: `radial-gradient(circle, rgba(${rgb},0.55) 28%, transparent 30%)`,
          };
    });

    setLegalMoveSquares(styles);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setLegalMoveSquares({});
  }, []);

  const handleSquareClick = useCallback((square: Square) => {
    if (isViewingHistory || isGameOver) return;

    const liveChess = new Chess(fen);
    const piece = liveChess.get(square);

    // Pick the chess instance used for selection / move generation. On the
    // player's turn we use the live position; on the opponent's turn we
    // generate pseudo-legal targets from a flipped FEN so the player can
    // queue a premove.
    const selectionChess = isPlayerTurn
      ? liveChess
      : buildPremoveChess(fen, playerColor);

    if (selectedSquare) {
      if (square === selectedSquare) {
        clearSelection();
        return;
      }

      // Destination is a legal target → execute move or set premove
      if (legalMoveSquares[square] !== undefined) {
        if (isPlayerTurn) {
          onPieceDrop(selectedSquare, square, "" as Piece);
        } else {
          // Auto-queen on premove promotions for simplicity.
          const movingPiece = liveChess.get(selectedSquare);
          const isPromotion =
            movingPiece?.type === "p" &&
            ((playerColor === "w" && square[1] === "8") ||
              (playerColor === "b" && square[1] === "1"));
          setPremove(selectedSquare, square, isPromotion ? "q" : undefined);
        }
        clearSelection();
        return;
      }

      // Clicking another friendly piece → re-select (in the right mode)
      if (piece && piece.color === playerColor && selectionChess) {
        selectSquare(square, selectionChess, !isPlayerTurn);
        return;
      }

      clearSelection();
      return;
    }

    // Nothing selected: pick up a friendly piece. Allow on opponent's turn
    // too so the player can queue a premove.
    if (piece && piece.color === playerColor && selectionChess) {
      selectSquare(square, selectionChess, !isPlayerTurn);
      return;
    }

    // Empty/opponent square click with no selection → cancel any queued premove.
    if (premove) {
      clearPremove();
    }
  }, [
    selectedSquare,
    legalMoveSquares,
    fen,
    isPlayerTurn,
    isViewingHistory,
    isGameOver,
    playerColor,
    onPieceDrop,
    selectSquare,
    clearSelection,
    premove,
    setPremove,
    clearPremove,
  ]);

  const onFlag = useGameStore((s) => s.onFlag);
  const flagGameOver = useGameStore((s) => s.flagGameOver);

  // Drop handler that supports both real moves (player's turn) and premoves
  // (opponent's turn). Returns false in the premove case so react-chessboard
  // animates the piece back — the premove is shown via highlights instead.
  const handlePieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: Piece, promotion?: string): boolean => {
      if (isViewingHistory || isGameOver) return false;
      clearSelection();

      if (isPlayerTurn) {
        return onPieceDrop(sourceSquare, targetSquare, piece, promotion);
      }

      // Premove: validate via the flipped-FEN pseudo-legal targets when possible.
      const liveChess = new Chess(fen);
      const movingPiece = liveChess.get(sourceSquare as Square);
      if (!movingPiece || movingPiece.color !== playerColor) return false;

      const premoveChess = buildPremoveChess(fen, playerColor);
      if (premoveChess) {
        const targets = premoveChess.moves({ square: sourceSquare as Square, verbose: true });
        if (!targets.some((m) => m.to === targetSquare)) return false;
      }

      const isPromotion =
        movingPiece.type === "p" &&
        ((playerColor === "w" && targetSquare[1] === "8") ||
          (playerColor === "b" && targetSquare[1] === "1"));
      setPremove(sourceSquare, targetSquare, promotion || (isPromotion ? "q" : undefined));
      return false;
    },
    [isViewingHistory, isGameOver, isPlayerTurn, fen, playerColor, onPieceDrop, setPremove, clearSelection],
  );

  // Merge selection highlights with premove highlights. Premove highlights
  // are only shown on the live position (not when reviewing history) and
  // never overwrite an active selection on the same square.
  const displayStyles = useMemo(() => {
    const merged: Record<string, React.CSSProperties> = { ...legalMoveSquares };
    if (premove && !isViewingHistory) {
      const premoveBg = { background: "rgba(245, 158, 11, 0.55)" };
      if (merged[premove.from] === undefined) merged[premove.from] = premoveBg;
      if (merged[premove.to] === undefined) merged[premove.to] = premoveBg;
    }
    return merged;
  }, [legalMoveSquares, premove, isViewingHistory]);

  const handleSquareRightClick = useCallback(() => {
    if (premove) clearPremove();
    if (selectedSquare) clearSelection();
  }, [premove, clearPremove, selectedSquare, clearSelection]);

  // Cancel premove with the Escape key.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (premove) clearPremove();
        if (selectedSquare) clearSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [premove, clearPremove, selectedSquare, clearSelection]);


  const opponentName = opponent?.username ?? "Opponent";
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
          onSquareClick={handleSquareClick}
          onSquareRightClick={handleSquareRightClick}
          onPieceDrop={(src, tgt, piece) => handlePieceDrop(src, tgt, piece)}
          onPieceDragBegin={(_piece, square) => {
            if (isViewingHistory || isGameOver) return;
            // Show legal/pseudo-legal targets while dragging.
            const chess = isPlayerTurn
              ? new Chess(fen)
              : buildPremoveChess(fen, playerColor);
            if (chess) selectSquare(square as Square, chess, !isPlayerTurn);
          }}
          onPieceDragEnd={clearSelection}
          onPromotionCheck={(sourceSquare, targetSquare, piece) => {
            // react-chessboard only triggers this when the user actually
            // releases on the live board (player's turn). Premove promotions
            // are auto-queened in handlePieceDrop.
            if (!isPlayerTurn) return false;
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
              return handlePieceDrop(promoteFromSquare, promoteToSquare, piece, promotion);
            }
            return false;
          }}
          customSquareStyles={displayStyles}
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
