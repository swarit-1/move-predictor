import { useEffect, useRef } from "react";
import { ChessBoard } from "../Board/ChessBoard";
import { EvalBar } from "../Board/EvalBar";
import { PredictionPanel } from "../Prediction/PredictionPanel";
import { Explainability } from "../Prediction/Explainability";
import { MoveList } from "./MoveList";
import { GameControls } from "./GameControls";
import { OpponentBadge } from "../Player/OpponentBadge";
import { useGameStore } from "../../store/gameStore";
import { usePlayerStore } from "../../store/playerStore";
import { usePrediction } from "../../hooks/usePrediction";

interface Props {
  onBack: () => void;
}

export function GameScreen({ onBack }: Props) {
  const moveHistory = useGameStore((s) => s.moveHistory);
  const chess = useGameStore((s) => s.chess);
  const playerColor = useGameStore((s) => s.playerColor);
  const opponent = usePlayerStore((s) => s.opponent);
  const { fetchPrediction, predictionError, retryPrediction } = usePrediction();
  const prevMoveCountRef = useRef(moveHistory.length);

  // Auto-predict after the player makes a move (it's now the opponent's turn)
  useEffect(() => {
    const currentCount = moveHistory.length;
    if (currentCount > prevMoveCountRef.current && currentCount > 0) {
      const currentTurn = chess.turn(); // "w" or "b"
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
      <header className="border-b border-gray-800/60 bg-gray-950 flex-shrink-0">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            New Game
          </button>
          <h1 className="text-sm font-semibold tracking-tight text-gray-400">
            Move Predictor
          </h1>
          {opponent && <OpponentBadge />}
          {!opponent && <div className="w-24" />}
        </div>
      </header>

      {/* Error banner */}
      {predictionError && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 flex-shrink-0">
          <div className="max-w-[1200px] mx-auto px-6 py-2.5 flex items-center justify-between">
            <p className="text-xs text-yellow-400">{predictionError}</p>
            <button
              onClick={retryPrediction}
              className="text-xs text-yellow-400 hover:text-yellow-300 underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Main game area — fills remaining height, centers content */}
      <main className="flex-1 flex items-start justify-center pt-8 px-6">
        <div className="flex gap-8 items-start">
          {/* Eval bar + Board */}
          <div className="flex items-start gap-3">
            <EvalBar />
            <div>
              <ChessBoard />
              <GameControls />
            </div>
          </div>

          {/* Analysis panel */}
          <div className="w-80 space-y-3">
            <PredictionPanel />
            <Explainability />
            <MoveList />
          </div>
        </div>
      </main>
    </div>
  );
}
