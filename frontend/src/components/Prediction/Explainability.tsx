import { useGameStore } from "../../store/gameStore";

export function Explainability() {
  const prediction = useGameStore((s) => s.prediction);

  if (!prediction?.explanation) return null;

  const { explanation } = prediction;

  return (
    <div className="glass-card p-4 space-y-2 animate-fade-in">
      <div className="flex items-start gap-2.5 text-xs">
        <span
          className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
            explanation.is_deviation
              ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.3)]"
              : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.3)]"
          }`}
        />
        <p className="text-zinc-400 leading-relaxed font-light">
          {explanation.is_deviation
            ? explanation.deviation_reason
            : "Matches the engine's best move."}
        </p>
      </div>

      {explanation.factors.length > 1 && (
        <div className="space-y-1 pl-4.5">
          {explanation.factors.slice(1).map((factor, i) => (
            <p key={i} className="text-[11px] text-zinc-600 leading-relaxed font-light pl-[18px]">
              {factor}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
