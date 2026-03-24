import { usePlayerStore } from "../../store/playerStore";

export function OpponentBadge() {
  const opponent = usePlayerStore((s) => s.opponent);

  if (!opponent) return null;

  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="text-gray-500">vs</span>
      <span className="text-gray-300 font-medium">{opponent.username}</span>
      <span className="font-mono text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
        {opponent.rating.toFixed(0)}
      </span>
    </div>
  );
}
