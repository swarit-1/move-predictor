import { useCallback } from "react";
import { useGameStore, PredictionData } from "../store/gameStore";
import { usePlayerStore } from "../store/playerStore";
import { predictMove } from "../api/client";

export function usePrediction() {
  const { fen, moveHistory, prediction, isLoading, predictionError, setPrediction, setLoading, setPredictionError } =
    useGameStore();
  const { opponent, styleOverrides } = usePlayerStore();

  const fetchPrediction = useCallback(async () => {
    if (isLoading) return;

    // Don't keep hammering a dead backend
    if (predictionError) return;

    setLoading(true);
    try {
      const response = await predictMove({
        fen,
        move_history: moveHistory,
        player_id: 0,
        player_rating: opponent?.rating || 1500,
        style_overrides: {
          aggression: styleOverrides.aggression,
          risk_taking: styleOverrides.risk_taking,
          blunder_frequency: styleOverrides.blunder_frequency,
        },
      });

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
      const code = error?.code;
      const status = error?.response?.status;

      if (code === "ECONNREFUSED" || code === "ERR_NETWORK" || status === 502 || status === 503) {
        setPredictionError("ML service is not running. Predictions are disabled.");
      } else if (status === 500) {
        setPredictionError("ML service error. Predictions are disabled until you retry.");
      } else {
        console.error("Prediction failed:", error?.message || error);
      }
    } finally {
      setLoading(false);
    }
  }, [fen, moveHistory, opponent, styleOverrides, isLoading, predictionError, setPrediction, setLoading, setPredictionError]);

  const retryPrediction = useCallback(() => {
    setPredictionError(null);
    // Will auto-trigger on next move
  }, [setPredictionError]);

  return {
    prediction,
    isLoading,
    predictionError,
    fetchPrediction,
    retryPrediction,
  };
}
