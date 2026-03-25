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
import { useEvaluation } from "../../hooks/useEvaluation";

interface Props {
  onBack: () => void;
}

export function GameScreen({ onBack }: Props) {
  const moveHistory = useGameStore((s) => s.moveHistory);
  const chess = useGameStore((s) => s.chess);
  const playerColor = useGameStore((s) => s.playerColor);
  const showEvalBar = useGameStore((s) => s.showEvalBar);
  const setShowEvalBar = useGameStore((s) => s.setShowEvalBar);
  const opponent = usePlayerStore((s) => s.opponent);
  const { fetchPrediction, predictionError, retryPrediction } = usePrediction();
  const prevMoveCountRef = useRef(moveHistory.length);

  // Start eval tracking
  useEvaluation();

  // Auto-predict after the player makes a move (it's now the opponent's turn)
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
        <div className="max-w-[1280px] mx-auto px-6 h-12 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            New Game
          </button>

          <div className="flex items-center gap-4">
            {opponent && <OpponentBadge />}
          </div>

          {/* Eval toggle */}
          <button
            onClick={() => setShowEvalBar(!showEvalBar)}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              showEvalBar ? "text-gray-400 hover:text-gray-200" : "text-gray-600 hover:text-gray-400"
            }`}
            title={showEvalBar ? "Hide evaluation bar" : "Show evaluation bar"}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13h2v8H3zM8 9h2v12H8zM13 5h2v16h-2zM18 1h2v20h-2z" />
            </svg>
            Eval
          </button>
        </div>
      </header>

      {/* Error banner */}
      {predictionError && (
        <div className="bg-amber-500/5 border-b border-amber-500/10 flex-shrink-0">
          <div className="max-w-[1280px] mx-auto px-6 py-2 flex items-center justify-between">
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
      <main className="flex-1 flex items-start justify-center pt-6 pb-12 px-6">
        <div className="flex gap-6 items-start">
          {/* Eval bar + Board */}
          <div className="flex items-start gap-2">
            {showEvalBar && <EvalBar />}
            <div>
              <ChessBoard />
              <GameControls />
            </div>
          </div>

          {/* Analysis sidebar */}
          <div className="w-[300px] space-y-2.5 flex-shrink-0">
            <PredictionPanel />
            <Explainability />
            <MoveList />
          </div>
        </div>
      </main>
    </div>
  );
}
