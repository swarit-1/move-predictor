import { useGameStore } from "../../store/gameStore";

/**
 * Explainability panel: explains why the model predicted a specific move,
 * especially when it deviates from the engine's best.
 */
export function Explainability() {
  const prediction = useGameStore((s) => s.prediction);

  if (!prediction?.explanation) return null;

  const { explanation } = prediction;

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-2">
      <h3 className="text-sm font-semibold text-gray-300">Why This Move?</h3>

      {/* Deviation indicator */}
      {explanation.is_deviation ? (
        <div className="flex items-start gap-2 text-xs">
          <span className="mt-0.5 w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
          <p className="text-gray-300">{explanation.deviation_reason}</p>
        </div>
      ) : (
        <div className="flex items-start gap-2 text-xs">
          <span className="mt-0.5 w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
          <p className="text-gray-300">
            Model agrees with the engine's best move.
          </p>
        </div>
      )}

      {/* Contributing factors */}
      {explanation.factors.length > 1 && (
        <div className="space-y-1 ml-4">
          {explanation.factors.slice(1).map((factor, i) => (
            <p key={i} className="text-[11px] text-gray-400">
              {factor}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
