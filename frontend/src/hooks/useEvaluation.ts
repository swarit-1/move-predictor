import { useEffect, useRef, useCallback } from "react";
import { useGameStore } from "../store/gameStore";
import { analyzePosition } from "../api/client";

/**
 * Fetches Stockfish evaluation after every move, independent of predictions.
 * Also updates eval when a prediction returns engine data.
 */
export function useEvaluation() {
  const fen = useGameStore((s) => s.fen);
  const showEvalBar = useGameStore((s) => s.showEvalBar);
  const moveHistory = useGameStore((s) => s.moveHistory);
  const setPositionEval = useGameStore((s) => s.setPositionEval);
  const setEvalLoading = useGameStore((s) => s.setEvalLoading);

  const prevFenRef = useRef(fen);
  const abortRef = useRef<AbortController | null>(null);
  const failedRef = useRef(false);

  const fetchEval = useCallback(async (currentFen: string) => {
    if (!showEvalBar || failedRef.current) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setEvalLoading(true);
    try {
      const response = await analyzePosition(currentFen, 12);
      if (controller.signal.aborted) return;

      if (response.success && response.data) {
        const topMove = response.data.top_moves?.[0];
        if (topMove && topMove.cp !== null && topMove.cp !== undefined) {
          setPositionEval({ cp: topMove.cp, mate: topMove.mate ?? null });
        } else if (topMove?.mate !== null && topMove?.mate !== undefined) {
          setPositionEval({ cp: topMove.mate > 0 ? 10000 : -10000, mate: topMove.mate });
        }
      }
    } catch {
      // If analysis service is down, stop trying
      failedRef.current = true;
    } finally {
      if (!controller.signal.aborted) {
        setEvalLoading(false);
      }
    }
  }, [showEvalBar, setPositionEval, setEvalLoading]);

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
  const prediction = useGameStore((s) => s.prediction);
  useEffect(() => {
    if (prediction?.engineTopMoves?.length) {
      const bestCp = prediction.engineTopMoves[0]?.cp;
      if (bestCp !== null && bestCp !== undefined) {
        setPositionEval({ cp: bestCp, mate: null });
      }
    }
  }, [prediction, setPositionEval]);

  return {
    retryEval: () => {
      failedRef.current = false;
      fetchEval(fen);
    },
  };
}
