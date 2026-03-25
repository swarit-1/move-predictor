import { useGameStore } from "../../store/gameStore";

export function Explainability() {
  const prediction = useGameStore((s) => s.prediction);

  if (!prediction?.explanation) return null;

  const { explanation } = prediction;

  return (
    <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 space-y-2">
      <div className="flex items-start gap-2 text-xs">
        <span
          className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            explanation.is_deviation ? "bg-amber-400" : "bg-green-400"
          }`}
        />
        <p className="text-gray-400 leading-relaxed">
          {explanation.is_deviation
            ? explanation.deviation_reason
            : "Matches the engine's best move."}
        </p>
      </div>

      {explanation.factors.length > 1 && (
        <div className="space-y-1 pl-3.5">
          {explanation.factors.slice(1).map((factor, i) => (
            <p key={i} className="text-[11px] text-gray-500/80 leading-relaxed">
              {factor}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
