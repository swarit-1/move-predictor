import { useCallback, useEffect, useRef } from "react";
import axios from "axios";
import { useGameStore, PredictionData } from "../store/gameStore";
import { usePlayerStore } from "../store/playerStore";
import { predictMove } from "../api/client";

export function usePrediction() {
  const fen = useGameStore((s) => s.fen);
  const moveHistory = useGameStore((s) => s.moveHistory);
  const prediction = useGameStore((s) => s.prediction);
  const isLoading = useGameStore((s) => s.isLoading);
  const predictionError = useGameStore((s) => s.predictionError);
  const setPrediction = useGameStore((s) => s.setPrediction);
  const setLoading = useGameStore((s) => s.setLoading);
  const setPredictionError = useGameStore((s) => s.setPredictionError);
  const timeControl = useGameStore((s) => s.timeControl);
  const opponentTimeLeft = useGameStore((s) => s.opponentTimeLeft);
  const opponent = usePlayerStore((s) => s.opponent);
  const styleOverrides = usePlayerStore((s) => s.styleOverrides);

  const inFlightRef = useRef<AbortController | null>(null);

  const fetchPrediction = useCallback(async () => {
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    setLoading(true);
    try {
      const playerKey =
        opponent?.playerKey ||
        (opponent && opponent.source !== "rating" && opponent.source !== "style"
          ? `${opponent.source}:${opponent.username}`.toLowerCase()
          : undefined);

      const response = await predictMove(
        {
          fen,
          move_history: moveHistory,
          player_id: 0,
          player_rating: opponent?.rating || 1500,
          player_key: playerKey,
          style_overrides: { ...styleOverrides },
          time_remaining: timeControl ? opponentTimeLeft : undefined,
          time_control_initial: timeControl ? timeControl.initial : undefined,
        },
        controller.signal,
      );

      if (controller.signal.aborted) return;

      if (response.success) {
        const data = response.data;
        const pred: PredictionData = {
          move: data.move,
          probability: data.probability,
          temperature: data.temperature,
          topMoves: data.top_moves,
          predictedCpl: data.predicted_cpl,
          blunderProbability: data.blunder_probability,
          engineBest: data.engine_best,
          engineTopMoves: data.engine_top_moves,
          explanation: data.explanation,
        };
        setPrediction(pred);
        setPredictionError(null);
      }
    } catch (error: any) {
      if (axios.isCancel(error) || error?.code === "ERR_CANCELED") return;
      const status = error?.response?.status;
      if (status === 502 || status === 503) {
        setPredictionError("ML service is not running.");
      } else if (status === 500) {
        setPredictionError("ML service error.");
      } else {
        setPredictionError("Prediction failed. Will retry.");
      }
    } finally {
      if (inFlightRef.current === controller) {
        setLoading(false);
        inFlightRef.current = null;
      }
    }
  }, [fen, moveHistory, opponent, styleOverrides, timeControl, opponentTimeLeft, setPrediction, setLoading, setPredictionError]);

  useEffect(() => {
    return () => {
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, []);

  const retryPrediction = useCallback(() => {
    setPredictionError(null);
  }, [setPredictionError]);

  return { prediction, isLoading, predictionError, fetchPrediction, retryPrediction };
}
