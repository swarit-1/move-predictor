import { useEffect, useRef, useCallback } from "react";
import { useGameStore } from "../store/gameStore";
import { analyzePosition } from "../api/client";

/**
 * Fetches Stockfish evaluation after every move, independent of predictions.
 * All eval values are normalized to White's perspective (positive = White winning).
 */
export function useEvaluation() {
  const fen = useGameStore((s) => s.fen);
  const showEvalBar = useGameStore((s) => s.showEvalBar);
  const moveHistory = useGameStore((s) => s.moveHistory);
  const setPositionEval = useGameStore((s) => s.setPositionEval);
  const setEvalLoading = useGameStore((s) => s.setEvalLoading);
  const pushEvalHistory = useGameStore((s) => s.pushEvalHistory);

  const prevFenRef = useRef(fen);
  const abortRef = useRef<AbortController | null>(null);
  const failedRef = useRef(false);

  const fetchEval = useCallback(async (currentFen: string) => {
    if (!showEvalBar || failedRef.current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Determine side to move from FEN for perspective normalization
    const sideToMove = currentFen.split(" ")[1]; // 'w' or 'b'
    const flip = sideToMove === "b" ? -1 : 1;

    setEvalLoading(true);
    try {
      const response = await analyzePosition(currentFen, 12);
      if (controller.signal.aborted) return;

      if (response.success && response.data) {
        const topMove = response.data.top_moves?.[0];
        if (topMove && topMove.cp !== null && topMove.cp !== undefined) {
          // Stockfish returns cp from side-to-move perspective.
          // Normalize to White's perspective.
          const cpWhite = topMove.cp * flip;
          const mateRaw = topMove.mate ?? null;
          const mateWhite = mateRaw !== null ? mateRaw * flip : null;
          const evalEntry = { cp: cpWhite, mate: mateWhite };
          setPositionEval(evalEntry);
          pushEvalHistory({ moveNumber: moveHistory.length, ...evalEntry });
        } else if (topMove?.mate !== null && topMove?.mate !== undefined) {
          const mateWhite = topMove.mate * flip;
          const evalEntry = {
            cp: mateWhite > 0 ? 10000 : -10000,
            mate: mateWhite,
          };
          setPositionEval(evalEntry);
          pushEvalHistory({ moveNumber: moveHistory.length, ...evalEntry });
        }
      }
    } catch {
      failedRef.current = true;
    } finally {
      if (!controller.signal.aborted) {
        setEvalLoading(false);
      }
    }
  }, [showEvalBar, setPositionEval, setEvalLoading, pushEvalHistory, moveHistory.length]);

  // Fetch eval whenever position changes
  useEffect(() => {
    if (fen !== prevFenRef.current) {
      prevFenRef.current = fen;
      fetchEval(fen);
    }
  }, [fen, fetchEval]);

  // Reset failure state when eval bar is re-enabled
  useEffect(() => {
    if (showEvalBar) {
      failedRef.current = false;
    }
  }, [showEvalBar]);

  // Also extract eval from prediction engine data when available
  // Prediction engine data is also from side-to-move perspective
  const prediction = useGameStore((s) => s.prediction);
  useEffect(() => {
    if (prediction?.engineTopMoves?.length) {
      const bestCp = prediction.engineTopMoves[0]?.cp;
      if (bestCp !== null && bestCp !== undefined) {
        // Prediction is made for the opponent's move, so fen at time of prediction
        // has the opponent to move. We need to flip based on current fen's side.
        const sideToMove = fen.split(" ")[1];
        const flip = sideToMove === "b" ? -1 : 1;
        setPositionEval({ cp: bestCp * flip, mate: null });
      }
    }
  }, [prediction, setPositionEval, fen]);

  return {
    retryEval: () => {
      failedRef.current = false;
      fetchEval(fen);
    },
  };
}
