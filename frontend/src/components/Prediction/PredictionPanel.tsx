import { useGameStore } from "../../store/gameStore";
import { MoveDistribution } from "./MoveDistribution";

export function PredictionPanel() {
  const prediction = useGameStore((s) => s.prediction);
  const isLoading = useGameStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs font-medium text-gray-500 mb-3">Prediction</p>
        <div className="flex items-center gap-2.5 text-sm text-gray-400">
          <span className="w-4 h-4 border-2 border-blue-500/40 border-t-blue-500 rounded-full animate-spin" />
          Analyzing position...
        </div>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs font-medium text-gray-500 mb-2">Prediction</p>
        <p className="text-xs text-gray-600">
          Make a move as White to see the model's prediction for Black.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
      <p className="text-xs font-medium text-gray-500">Prediction</p>

      {/* Main prediction */}
      <div className="flex items-center gap-3">
        <div className="px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <span className="text-base font-bold text-green-400 font-mono">
            {prediction.move}
          </span>
        </div>
        <div className="text-xs space-y-1">
          <p className="text-gray-400">
            Confidence{" "}
            <span className="text-green-400 font-medium font-mono">
              {(prediction.probability * 100).toFixed(1)}%
            </span>
          </p>
          <p className="text-gray-500">
            Temp{" "}
            <span className="text-gray-400 font-mono">
              {prediction.temperature.toFixed(2)}
            </span>
          </p>
        </div>
      </div>

      {/* Engine comparison */}
      {prediction.engineBest && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Engine best</span>
          <span className="font-mono text-blue-400">{prediction.engineBest}</span>
          {prediction.move === prediction.engineBest ? (
            <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400/80 rounded text-[10px]">
              Match
            </span>
          ) : (
            <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400/80 rounded text-[10px]">
              Deviation
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-800/50 rounded-lg p-2.5">
          <p className="text-[10px] text-gray-500 mb-0.5">Predicted CPL</p>
          <p className="text-sm font-semibold font-mono text-gray-200">
            {prediction.predictedCpl.toFixed(0)}
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2.5">
          <p className="text-[10px] text-gray-500 mb-0.5">Blunder Prob</p>
          <p
            className={`text-sm font-semibold font-mono ${
              prediction.blunderProbability > 0.3
                ? "text-red-400"
                : prediction.blunderProbability > 0.1
                ? "text-yellow-400"
                : "text-green-400"
            }`}
          >
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
