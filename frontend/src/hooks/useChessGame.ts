import { useCallback } from "react";
import { useGameStore } from "../store/gameStore";

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
    (sourceSquare: string, targetSquare: string, piece: string, promotion?: string): boolean => {
      return makeMove(sourceSquare, targetSquare, promotion);
    },
    [makeMove]
  );

  const isGameOver = chess.isGameOver();
  // Derive turn from fen (not chess instance) so it's correct when viewing history
  const fenTurn = fen.split(" ")[1];
  const turn = fenTurn === "b" ? "black" : "white";
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
