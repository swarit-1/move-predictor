import { useState, useCallback } from "react";
import { WelcomeScreen } from "./components/Welcome/WelcomeScreen";
import { SetupScreen } from "./components/Setup/SetupScreen";
import { GameScreen } from "./components/Game/GameScreen";
import { ReplayScreen } from "./components/Replay/ReplayScreen";
import { PracticeScreen } from "./components/Practice/PracticeScreen";
import { ReviewScreen } from "./components/Review/ReviewScreen";
import { useGameStore } from "./store/gameStore";
import { useReviewStore } from "./store/reviewStore";

type AppPhase = "welcome" | "setup" | "playing" | "replay" | "practice" | "review";

export default function App() {
  const [phase, setPhase] = useState<AppPhase>("welcome");
  const resetGame = useGameStore((s) => s.resetGame);
  const setGameData = useReviewStore((s) => s.setGameData);
  const resetReview = useReviewStore((s) => s.resetReview);

  const handlePlay = useCallback(() => {
    setPhase("setup");
  }, []);

  const handleReplay = useCallback(() => {
    setPhase("replay");
  }, []);

  const handlePractice = useCallback(() => {
    setPhase("practice");
  }, []);

  const handleStart = useCallback(() => {
    resetGame();
    setPhase("playing");
  }, [resetGame]);

  const handleBackToWelcome = useCallback(() => {
    setPhase("welcome");
  }, []);

  const handleReview = useCallback(() => {
    const { moveHistory, playerColor } = useGameStore.getState();
    resetReview();
    setGameData(moveHistory, playerColor);
    setPhase("review");
  }, [resetReview, setGameData]);

  if (phase === "welcome") {
    return (
      <WelcomeScreen
        onPlay={handlePlay}
        onReplay={handleReplay}
        onPractice={handlePractice}
      />
    );
  }

  if (phase === "setup") {
    return <SetupScreen onStart={handleStart} onBack={handleBackToWelcome} />;
  }

  if (phase === "replay") {
    return <ReplayScreen onBack={handleBackToWelcome} />;
  }

  if (phase === "practice") {
    return (
      <PracticeScreen
        onStartGame={() => setPhase("playing")}
        onBack={handleBackToWelcome}
      />
    );
  }

  if (phase === "review") {
    return <ReviewScreen onBack={handleBackToWelcome} />;
  }

  return <GameScreen onBack={handleBackToWelcome} onReview={handleReview} />;
}
