import { usePlayerStore } from "../../store/playerStore";

/**
 * Display the selected opponent's style profile.
 */
export function PlayerProfile() {
  const opponent = usePlayerStore((s) => s.opponent);

  if (!opponent) return null;

  const style = opponent.styleSummary;

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">
          {opponent.username}
        </h3>
        <span className="text-xs px-2 py-0.5 bg-gray-700 rounded">
          {opponent.rating.toFixed(0)}
        </span>
      </div>

      <p className="text-xs text-gray-400">
        {opponent.numGames} games from {opponent.source}
      </p>

      {/* Style bars */}
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

      {/* Opening preferences */}
      <div className="text-xs text-gray-400">
        <p className="font-medium text-gray-300 mb-1">Openings</p>
        <div className="flex gap-2">
          {Object.entries(style.preferred_openings).map(([name, pct]) => (
            <span key={name} className="px-2 py-0.5 bg-gray-700 rounded">
              {name}: {pct}%
            </span>
          ))}
        </div>
      </div>
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
    red: "bg-red-500",
    orange: "bg-orange-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
  };

  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300">{value}%</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorMap[color] || "bg-blue-500"}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
