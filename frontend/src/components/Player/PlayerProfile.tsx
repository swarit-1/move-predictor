import { usePlayerStore } from "../../store/playerStore";

export function PlayerProfile() {
  const opponent = usePlayerStore((s) => s.opponent);

  if (!opponent) return null;

  const style = opponent.styleSummary;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-200">
          {opponent.username}
        </p>
        <span className="text-xs font-mono text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
          {opponent.rating.toFixed(0)}
        </span>
      </div>

      <p className="text-xs text-gray-500">
        {opponent.numGames} games from {opponent.source}
      </p>

      <div className="space-y-2">
        <StyleBar label="Aggression" value={style.aggression} color="red" />
        <StyleBar label="Tactical" value={style.tactical} color="orange" />
        <StyleBar label="Accuracy" value={style.accuracy} color="green" />
        <StyleBar label="Consistency" value={style.consistency} color="blue" />
        <StyleBar
          label="Opening Variety"
          value={style.opening_diversity}
          color="purple"
        />
      </div>

      {Object.keys(style.preferred_openings).length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-1.5">Openings</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(style.preferred_openings).map(([name, pct]) => (
              <span
                key={name}
                className="px-2 py-0.5 bg-gray-800 rounded text-[10px] text-gray-400"
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
    red: "bg-red-500/70",
    orange: "bg-orange-500/70",
    green: "bg-green-500/70",
    blue: "bg-blue-500/70",
    purple: "bg-purple-500/70",
  };

  return (
    <div>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-400 font-mono">{value}</span>
      </div>
      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorMap[color] || "bg-blue-500/70"}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
