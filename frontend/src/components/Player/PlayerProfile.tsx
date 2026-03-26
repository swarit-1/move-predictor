import { usePlayerStore } from "../../store/playerStore";

export function PlayerProfile() {
  const opponent = usePlayerStore((s) => s.opponent);

  if (!opponent) return null;

  const style = opponent.styleSummary;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-200">
          {opponent.username}
        </p>
        <span className="text-xs font-mono text-zinc-400 bg-white/[0.05] px-2.5 py-0.5 rounded-lg">
          {opponent.rating.toFixed(0)}
        </span>
      </div>

      {opponent.numGames > 0 && (
        <p className="text-xs text-zinc-500 font-light">
          {opponent.numGames} games from {opponent.source}
        </p>
      )}

      {style && (
        <div className="space-y-2">
          <StyleBar label="Aggression" value={style.aggression} color="blunder" />
          <StyleBar label="Tactical" value={style.tactical} color="inaccuracy" />
          <StyleBar label="Accuracy" value={style.accuracy} color="human" />
          <StyleBar label="Consistency" value={style.consistency} color="engine" />
          <StyleBar label="Opening Variety" value={style.opening_diversity} color="gold" />
        </div>
      )}

      {style && Object.keys(style.preferred_openings).length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-500 mb-1.5 font-medium uppercase tracking-wider">Openings</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(style.preferred_openings).map(([name, pct]) => (
              <span
                key={name}
                className="px-2 py-0.5 bg-white/[0.04] rounded-md text-[10px] text-zinc-400 border border-white/[0.04]"
              >
                {name} {pct}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StyleBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blunder: "bg-blunder/60",
    inaccuracy: "bg-inaccuracy/60",
    human: "bg-human/60",
    engine: "bg-engine/60",
    gold: "bg-gold/60",
  };

  return (
    <div>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-zinc-500 font-medium">{label}</span>
        <span className="text-zinc-400 font-mono">{value}</span>
      </div>
      <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorMap[color] || "bg-blue-500/60"}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
