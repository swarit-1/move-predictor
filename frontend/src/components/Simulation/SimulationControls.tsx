import { useGameStore } from "../../store/gameStore";

export function SimulationControls() {
  const sessionId = useGameStore((s) => s.simulationSessionId);
  const resetGame = useGameStore((s) => s.resetGame);

  if (!sessionId) return null;

  return (
    <div className="flex gap-2">
      <button
        onClick={resetGame}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition"
      >
        End Game
      </button>
    </div>
  );
}
