import { useGameStore } from "../../store/gameStore";
import { MoveDistribution } from "./MoveDistribution";

export function PredictionPanel() {
  const prediction = useGameStore((s) => s.prediction);
  const isLoading = useGameStore((s) => s.isLoading);
  const playerColor = useGameStore((s) => s.playerColor);

  if (isLoading) {
    return (
      <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4">
        <div className="flex items-center gap-2.5 text-sm text-gray-400">
          <span className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          Analyzing position...
        </div>
      </div>
    );
  }

  if (!prediction) {
    const colorName = playerColor === "w" ? "White" : "Black";
    return (
      <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          Make a move as {colorName} to see the opponent's predicted response.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 space-y-3">
      {/* Header row: predicted move + engine comparison */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="px-2.5 py-1.5 bg-green-500/10 border border-green-500/15 rounded-lg">
            <span className="text-sm font-bold text-green-400 font-mono">
              {prediction.move}
            </span>
          </div>
          <div className="text-xs">
            <span className="text-green-400 font-medium font-mono">
              {(prediction.probability * 100).toFixed(0)}%
            </span>
            <span className="text-gray-600 mx-1.5">/</span>
            <span className="text-gray-500 font-mono">
              T={prediction.temperature.toFixed(2)}
            </span>
          </div>
        </div>

        {prediction.engineBest && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-mono text-blue-400/80">{prediction.engineBest}</span>
            {prediction.move === prediction.engineBest ? (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="Matches engine" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Deviates from engine" />
            )}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="flex gap-2">
        <div className="flex-1 bg-gray-800/40 rounded-lg px-3 py-2">
          <p className="text-[10px] text-gray-500">CPL</p>
          <p className="text-sm font-semibold font-mono text-gray-300">
            {prediction.predictedCpl.toFixed(0)}
          </p>
        </div>
        <div className="flex-1 bg-gray-800/40 rounded-lg px-3 py-2">
          <p className="text-[10px] text-gray-500">Blunder</p>
          <p className={`text-sm font-semibold font-mono ${
            prediction.blunderProbability > 0.3
              ? "text-red-400"
              : prediction.blunderProbability > 0.1
              ? "text-amber-400"
              : "text-green-400"
          }`}>
            {(prediction.blunderProbability * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      <MoveDistribution
        topMoves={prediction.topMoves}
        engineTopMoves={prediction.engineTopMoves}
      />
    </div>
  );
}
