import { useCallback } from "react";
import { useGameStore, PredictionData } from "../store/gameStore";
import { usePlayerStore } from "../store/playerStore";
import { predictMove } from "../api/client";

export function usePrediction() {
  const { fen, moveHistory, prediction, isLoading, predictionError, setPrediction, setLoading, setPredictionError, timeControl, opponentTimeLeft } =
    useGameStore();
  const { opponent, styleOverrides } = usePlayerStore();

  const fetchPrediction = useCallback(async () => {
    if (isLoading) return;

    setLoading(true);
    try {
      // Use playerKey from profile (set by ML service), or build from source:username
      const playerKey = opponent?.playerKey
        || (opponent && opponent.source !== "rating" && opponent.source !== "style"
          ? `${opponent.source}:${opponent.username}`.toLowerCase()
          : undefined);

      const response = await predictMove({
        fen,
        move_history: moveHistory,
        player_id: 0,
        player_rating: opponent?.rating || 1500,
        player_key: playerKey,
        style_overrides: {
          aggression: styleOverrides.aggression,
          risk_taking: styleOverrides.risk_taking,
          blunder_frequency: styleOverrides.blunder_frequency,
        },
        time_remaining: timeControl ? opponentTimeLeft : undefined,
        time_control_initial: timeControl ? timeControl.initial : undefined,
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
        setPredictionError("ML service is not running. Will retry on next move.");
      } else if (status === 500) {
        setPredictionError("ML service error. Will retry on next move.");
      } else {
        console.error("Prediction failed:", error?.message || error);
      }
    } finally {
      setLoading(false);
    }
  }, [fen, moveHistory, opponent, styleOverrides, isLoading, predictionError, setPrediction, setLoading, setPredictionError, timeControl, opponentTimeLeft]);

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
