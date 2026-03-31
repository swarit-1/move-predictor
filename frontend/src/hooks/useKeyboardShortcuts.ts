import { useEffect, useRef } from "react";
import { useGameStore } from "../store/gameStore";

interface Options {
  onBack: () => void;
}

export function useKeyboardShortcuts({ onBack }: Options) {
  const undoMove = useGameStore((s) => s.undoMove);
  const resetGame = useGameStore((s) => s.resetGame);
  const playerColor = useGameStore((s) => s.playerColor);
  const setPlayerColor = useGameStore((s) => s.setPlayerColor);
  const showEvalBar = useGameStore((s) => s.showEvalBar);
  const setShowEvalBar = useGameStore((s) => s.setShowEvalBar);
  const goToMove = useGameStore((s) => s.goToMove);
  const goToLatest = useGameStore((s) => s.goToLatest);
  const viewIndex = useGameStore((s) => s.viewIndex);
  const moveHistory = useGameStore((s) => s.moveHistory);

  // Use refs so the keydown handler always sees the latest values without
  // needing to re-register on every move (avoids stale closure).
  const viewIndexRef = useRef(viewIndex);
  const moveHistoryRef = useRef(moveHistory);
  viewIndexRef.current = viewIndex;
  moveHistoryRef.current = moveHistory;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const totalMoves = moveHistoryRef.current.length;
      const vi = viewIndexRef.current;

      // ← ArrowLeft: step back one move
      if (e.key === "ArrowLeft" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (totalMoves === 0) return;
        if (vi === -1) {
          if (totalMoves >= 2) goToMove(totalMoves - 2);
          // if only 1 move played, already at the only move — nothing earlier
        } else if (vi > 0) {
          goToMove(vi - 1);
        }
        return;
      }

      // → ArrowRight: step forward one move
      if (e.key === "ArrowRight" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (vi === -1) return; // already at latest
        if (vi >= totalMoves - 1) {
          goToLatest();
        } else {
          goToMove(vi + 1);
        }
        return;
      }

      // Home: jump to first move
      if (e.key === "Home" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (totalMoves > 0) goToMove(0);
        return;
      }

      // End: jump to latest
      if (e.key === "End" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        goToLatest();
        return;
      }

      // Ctrl+Z / Cmd+Z → undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoMove();
        return;
      }

      // N → new game
      if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
        onBack();
        return;
      }

      // F → flip board
      if (e.key === "f" && !e.ctrlKey && !e.metaKey) {
        setPlayerColor(playerColor === "w" ? "b" : "w");
        return;
      }

      // E → toggle eval bar
      if (e.key === "e" && !e.ctrlKey && !e.metaKey) {
        setShowEvalBar(!showEvalBar);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoMove, onBack, playerColor, setPlayerColor, showEvalBar, setShowEvalBar, goToMove, goToLatest]);
}
