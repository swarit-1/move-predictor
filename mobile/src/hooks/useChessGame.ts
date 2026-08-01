import { useCallback } from "react";
import { useGameStore } from "../store/gameStore";

export function useChessGame() {
  const chess = useGameStore((s) => s.chess);
  const fen = useGameStore((s) => s.fen);
  const moveHistory = useGameStore((s) => s.moveHistory);
  const pgn = useGameStore((s) => s.pgn);
  const makeMove = useGameStore((s) => s.makeMove);
  const undoMove = useGameStore((s) => s.undoMove);
  const resetGame = useGameStore((s) => s.resetGame);
  const setFen = useGameStore((s) => s.setFen);
  const flagGameOver = useGameStore((s) => s.flagGameOver);

  const onSquarePress = useCallback(
    (square: string): boolean => {
      const selected = useGameStore.getState().selectedSquare;
      if (selected) {
        const result = makeMove(selected, square);
        useGameStore.getState().setSelectedSquare(null);
        if (result) return true;
        // If move failed, select this square instead (might be selecting a new piece)
        const piece = chess.get(square as any);
        if (piece && piece.color === chess.turn()) {
          useGameStore.getState().setSelectedSquare(square);
        }
        return false;
      } else {
        const piece = chess.get(square as any);
        if (piece && piece.color === chess.turn()) {
          useGameStore.getState().setSelectedSquare(square);
        }
        return false;
      }
    },
    [chess, makeMove],
  );

  const isGameOver = chess.isGameOver() || !!flagGameOver;
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
    onSquarePress,
    undoMove,
    resetGame,
    setFen,
    legalMoves: chess.moves({ verbose: true }),
  };
}
