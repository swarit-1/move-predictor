import { useGameStore } from "../../store/gameStore";
import { MoveDistribution } from "./MoveDistribution";

/**
 * Panel showing the model's move prediction with probabilities
 * and comparison to engine analysis.
 */
export function PredictionPanel() {
  const prediction = useGameStore((s) => s.prediction);
  const isLoading = useGameStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Prediction</h3>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
          Analyzing position...
        </div>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Prediction</h3>
        <p className="text-xs text-gray-500">
          Click "Predict Move" to see what the model thinks a human would play.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-300">Prediction</h3>

      {/* Main prediction */}
      <div className="flex items-center gap-3">
        <div className="px-3 py-2 bg-green-600/20 border border-green-600/40 rounded-lg">
          <span className="text-lg font-bold text-green-400 font-mono">
            {prediction.move}
          </span>
        </div>
        <div className="text-xs text-gray-400 space-y-0.5">
          <p>
            Confidence:{" "}
            <span className="text-green-400 font-medium">
              {(prediction.probability * 100).toFixed(1)}%
            </span>
          </p>
          <p>
            Temperature:{" "}
            <span className="text-gray-300">{prediction.temperature.toFixed(2)}</span>
          </p>
        </div>
      </div>

      {/* Engine comparison */}
      {prediction.engineBest && (
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Engine best:</span>
            <span className="font-mono text-blue-400">{prediction.engineBest}</span>
            {prediction.move !== prediction.engineBest && (
              <span className="px-1.5 py-0.5 bg-yellow-600/20 text-yellow-400 rounded text-[10px]">
                Deviation
              </span>
            )}
            {prediction.move === prediction.engineBest && (
              <span className="px-1.5 py-0.5 bg-green-600/20 text-green-400 rounded text-[10px]">
                Agrees
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error prediction */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-700/50 rounded p-2">
          <p className="text-gray-400">Predicted CPL</p>
          <p className="text-lg font-bold text-gray-200">
            {prediction.predictedCpl.toFixed(0)}
          </p>
        </div>
        <div className="bg-gray-700/50 rounded p-2">
          <p className="text-gray-400">Blunder Prob</p>
          <p
            className={`text-lg font-bold ${
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

      {/* Move distribution chart */}
      <MoveDistribution
        topMoves={prediction.topMoves}
        engineTopMoves={prediction.engineTopMoves}
      />
    </div>
  );
}
