import { useState, useCallback } from "react";
import { SetupScreen } from "./components/Setup/SetupScreen";
import { GameScreen } from "./components/Game/GameScreen";
import { useGameStore } from "./store/gameStore";

type AppPhase = "setup" | "playing";

export default function App() {
  const [phase, setPhase] = useState<AppPhase>("setup");
  const resetGame = useGameStore((s) => s.resetGame);

  const handleStart = useCallback(() => {
    resetGame();
    setPhase("playing");
  }, [resetGame]);

  const handleBackToSetup = useCallback(() => {
    setPhase("setup");
  }, []);

  if (phase === "setup") {
    return <SetupScreen onStart={handleStart} />;
  }

  return <GameScreen onBack={handleBackToSetup} />;
}
