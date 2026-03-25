import { useEffect } from "react";
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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
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
  }, [undoMove, resetGame, onBack, playerColor, setPlayerColor, showEvalBar, setShowEvalBar]);
}
