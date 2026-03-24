import { useCallback } from "react";
import { useGameStore } from "../store/gameStore";

/**
 * Hook for managing chess game interactions on the board.
 */
export function useChessGame() {
  const {
    chess,
    fen,
    moveHistory,
    pgn,
    makeMove,
    undoMove,
    resetGame,
    setFen,
  } = useGameStore();

  const onPieceDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string): boolean => {
      // Determine promotion piece
      const isPromotion =
        piece[1] === "P" &&
        ((piece[0] === "w" && targetSquare[1] === "8") ||
          (piece[0] === "b" && targetSquare[1] === "1"));

      return makeMove(
        sourceSquare,
        targetSquare,
        isPromotion ? "q" : undefined
      );
    },
    [makeMove]
  );

  const isGameOver = chess.isGameOver();
  const turn = chess.turn() === "w" ? "white" : "black";
  const inCheck = chess.inCheck();

  return {
    fen,
    moveHistory,
    pgn,
    turn,
    isGameOver,
    inCheck,
    onPieceDrop,
    undoMove,
    resetGame,
    setFen,
    legalMoves: chess.moves({ verbose: true }),
  };
}
