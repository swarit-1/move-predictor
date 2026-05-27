import { useCallback, useEffect, useRef } from "react";
import axios from "axios";
import { useGameStore, PredictionData } from "../store/gameStore";
import { usePlayerStore } from "../store/playerStore";
import { predictMove } from "../api/client";

/**
 * Prediction hook.
 *
 * PRD §6.1 — concurrency and recovery:
 *  - Each fetch carries an `AbortController`. If the player makes a move
 *    (or another fetch is triggered) while one is in flight, we cancel the
 *    stale request instead of waiting for its 30 s axios timeout. Without
 *    this, a premove storm queues up requests behind the Stockfish pool
 *    and the UI appears to hang.
 *  - We no longer early-return on `isLoading` — the abort handles it.
 *    The old guard silently dropped retries and was a primary contributor
 *    to the "premove hang" symptom.
 */
export function usePrediction() {
  const {
    fen,
    moveHistory,
    prediction,
    isLoading,
    predictionError,
    setPrediction,
    setLoading,
    setPredictionError,
    timeControl,
    opponentTimeLeft,
  } = useGameStore();
  const { opponent, styleOverrides } = usePlayerStore();

  // Track the in-flight controller so we can cancel it on rerun/unmount.
  const inFlightRef = useRef<AbortController | null>(null);

  const fetchPrediction = useCallback(async () => {
    // Cancel any stale in-flight request before starting a new one.
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    setLoading(true);
    try {
      // Use playerKey from profile (set by ML service), or build from source:username
      const playerKey =
        opponent?.playerKey ||
        (opponent &&
        opponent.source !== "rating" &&
        opponent.source !== "style"
          ? `${opponent.source}:${opponent.username}`.toLowerCase()
          : undefined);

      const response = await predictMove(
        {
          fen,
          move_history: moveHistory,
          player_id: 0,
          player_rating: opponent?.rating || 1500,
          player_key: playerKey,
          // PRD §5.2: send the full 10-dim style profile.
          style_overrides: {
            aggression: styleOverrides.aggression,
            risk_taking: styleOverrides.risk_taking,
            blunder_frequency: styleOverrides.blunder_frequency,
            king_attack: styleOverrides.king_attack,
            positional: styleOverrides.positional,
            trade_preference: styleOverrides.trade_preference,
            opening_loyalty: styleOverrides.opening_loyalty,
            repertoire_width: styleOverrides.repertoire_width,
            endgame_strength: styleOverrides.endgame_strength,
            defensive_tenacity: styleOverrides.defensive_tenacity,
          },
          time_remaining: timeControl ? opponentTimeLeft : undefined,
          time_control_initial: timeControl ? timeControl.initial : undefined,
        },
        controller.signal,
      );

      // If a newer request superseded us before the response came back,
      // drop this result silently.
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
      // Cancelled by us — not a real failure.
      if (
        axios.isCancel(error) ||
        error?.name === "CanceledError" ||
        error?.code === "ERR_CANCELED"
      ) {
        return;
      }
      const code = error?.code;
      const status = error?.response?.status;

      if (
        code === "ECONNREFUSED" ||
        code === "ERR_NETWORK" ||
        status === 502 ||
        status === 503
      ) {
        setPredictionError("ML service is not running. Will retry on next move.");
      } else if (status === 500) {
        setPredictionError("ML service error. Will retry on next move.");
      } else {
        console.error("Prediction failed:", error?.message || error);
      }
    } finally {
      // Only the most-recent controller should flip loading off.
      if (inFlightRef.current === controller) {
        setLoading(false);
        inFlightRef.current = null;
      }
    }
  }, [
    fen,
    moveHistory,
    opponent,
    styleOverrides,
    setPrediction,
    setLoading,
    setPredictionError,
    timeControl,
    opponentTimeLeft,
  ]);

  // Cancel any in-flight request on unmount.
  useEffect(() => {
    return () => {
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, []);

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
