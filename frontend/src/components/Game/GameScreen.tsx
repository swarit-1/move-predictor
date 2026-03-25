import { useEffect, useRef, useState } from "react";
import { ChessBoard } from "../Board/ChessBoard";
import { EvalBar } from "../Board/EvalBar";
import { PredictionPanel } from "../Prediction/PredictionPanel";
import { Explainability } from "../Prediction/Explainability";
import { MoveList } from "./MoveList";
import { GameControls } from "./GameControls";
import { GameOverModal } from "./GameOverModal";
import { OpponentBadge } from "../Player/OpponentBadge";
import { StylePanel } from "../Player/StylePanel";
import { useGameStore } from "../../store/gameStore";
import { usePlayerStore } from "../../store/playerStore";
import { usePrediction } from "../../hooks/usePrediction";
import { useEvaluation } from "../../hooks/useEvaluation";
import { useSoundEffects } from "../../hooks/useSoundEffects";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

interface Props {
  onBack: () => void;
}

export function GameScreen({ onBack }: Props) {
  const moveHistory = useGameStore((s) => s.moveHistory);
  const chess = useGameStore((s) => s.chess);
  const playerColor = useGameStore((s) => s.playerColor);
  const showEvalBar = useGameStore((s) => s.showEvalBar);
  const setShowEvalBar = useGameStore((s) => s.setShowEvalBar);
  const applyPredictedMove = useGameStore((s) => s.applyPredictedMove);
  const prediction = useGameStore((s) => s.prediction);
  const opponent = usePlayerStore((s) => s.opponent);
  const { fetchPrediction, predictionError, retryPrediction } = usePrediction();
  const prevMoveCountRef = useRef(moveHistory.length);
  const hasTriggeredFirstMove = useRef(false);
  const [showStylePanel, setShowStylePanel] = useState(false);

  // Hooks
  useEvaluation();
  useSoundEffects();
  useKeyboardShortcuts({ onBack });

  // When playing as Black, trigger AI's first move on mount
  useEffect(() => {
    if (
      playerColor === "b" &&
      moveHistory.length === 0 &&
      !hasTriggeredFirstMove.current
    ) {
      hasTriggeredFirstMove.current = true;
      fetchPrediction();
    }
  }, [playerColor, moveHistory.length, fetchPrediction]);

  // Apply prediction to the board when it arrives (opponent's move)
  useEffect(() => {
    if (prediction?.move) {
      const currentTurn = chess.turn();
      const isOpponentTurn = currentTurn !== playerColor;
      if (isOpponentTurn) {
        // Small delay for the "thinking" feel
        const timer = setTimeout(() => {
          applyPredictedMove(prediction.move);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [prediction, chess, playerColor, applyPredictedMove]);

  // Auto-predict after the player makes a move
  useEffect(() => {
    const currentCount = moveHistory.length;
    if (currentCount > prevMoveCountRef.current && currentCount > 0) {
      const currentTurn = chess.turn();
      const isOpponentTurn = currentTurn !== playerColor;
      if (isOpponentTurn && !chess.isGameOver()) {
        fetchPrediction();
      }
    }
    prevMoveCountRef.current = currentCount;
  }, [moveHistory.length, chess, playerColor, fetchPrediction]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Top bar */}
      <header className="border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-sm flex-shrink-0 sticky top-0 z-10">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="hidden sm:inline">New Game</span>
          </button>

          <div className="flex items-center gap-4">
            {opponent && <OpponentBadge />}
          </div>

          <div className="flex items-center gap-3">
            {/* Style panel toggle */}
            <button
              onClick={() => setShowStylePanel(!showStylePanel)}
              className={`flex items-center gap-1.5 text-xs transition-colors ${
                showStylePanel ? "text-blue-400" : "text-gray-600 hover:text-gray-400"
              }`}
              title="Adjust opponent style"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span className="hidden sm:inline">Style</span>
            </button>

            {/* Eval toggle */}
            <button
              onClick={() => setShowEvalBar(!showEvalBar)}
              className={`flex items-center gap-1.5 text-xs transition-colors ${
                showEvalBar ? "text-gray-400 hover:text-gray-200" : "text-gray-600 hover:text-gray-400"
              }`}
              title={showEvalBar ? "Hide evaluation" : "Show evaluation"}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13h2v8H3zM8 9h2v12H8zM13 5h2v16h-2zM18 1h2v20h-2z" />
              </svg>
              <span className="hidden sm:inline">Eval</span>
            </button>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {predictionError && (
        <div className="bg-amber-500/5 border-b border-amber-500/10 flex-shrink-0">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
            <p className="text-xs text-amber-400/80">{predictionError}</p>
            <button
              onClick={retryPrediction}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium ml-4"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Main game area */}
      <main className="flex-1 flex items-start justify-center pt-4 sm:pt-6 pb-12 px-2 sm:px-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-center lg:items-start w-full max-w-[960px]">
          {/* Eval bar + Board */}
          <div className="flex items-start gap-2 flex-shrink-0">
            {showEvalBar && <EvalBar />}
            <div>
              <ChessBoard />
              <GameControls />
            </div>
          </div>

          {/* Analysis sidebar */}
          <div className="w-full lg:w-[300px] space-y-2.5 flex-shrink-0">
            {showStylePanel && <StylePanel />}
            <PredictionPanel />
            <Explainability />
            <MoveList />
          </div>
        </div>
      </main>

      {/* Game over modal */}
      <GameOverModal onNewGame={onBack} />
    </div>
  );
}
