import { useGameStore } from "../../store/gameStore";

export function SimulationControls() {
  const sessionId = useGameStore((s) => s.simulationSessionId);
  const resetGame = useGameStore((s) => s.resetGame);

  if (!sessionId) return null;

  return (
    <div className="flex gap-2">
      <button
        onClick={resetGame}
        className="px-4 py-2 bg-red-500/[0.1] hover:bg-red-500/[0.15] border border-red-500/[0.15]
                   rounded-xl text-sm font-medium text-red-400 transition-all duration-200"
      >
        End Game
      </button>
    </div>
  );
}
