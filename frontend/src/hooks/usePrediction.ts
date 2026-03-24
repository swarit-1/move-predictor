import { useCallback } from "react";
import { useGameStore, PredictionData } from "../store/gameStore";
import { usePlayerStore } from "../store/playerStore";
import { predictMove } from "../api/client";

/**
 * Hook for requesting move predictions from the backend.
 */
export function usePrediction() {
  const { fen, moveHistory, prediction, isLoading, setPrediction, setLoading } =
    useGameStore();
  const { opponent, styleOverrides } = usePlayerStore();

  const fetchPrediction = useCallback(async () => {
    setLoading(true);
    try {
      const response = await predictMove({
        fen,
        move_history: moveHistory,
        player_id: 0, // TODO: use opponent's actual ID
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
      }
    } catch (error) {
      console.error("Prediction failed:", error);
      setPrediction(null);
    } finally {
      setLoading(false);
    }
  }, [fen, moveHistory, opponent, styleOverrides, setPrediction, setLoading]);

  return {
    prediction,
    isLoading,
    fetchPrediction,
  };
}
