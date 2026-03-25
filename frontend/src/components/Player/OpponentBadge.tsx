import { usePlayerStore } from "../../store/playerStore";

export function OpponentBadge() {
  const opponent = usePlayerStore((s) => s.opponent);

  if (!opponent) return null;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">vs</span>
      <span className="text-gray-300 font-medium">{opponent.username}</span>
      <span className="font-mono text-[11px] text-gray-500 bg-gray-800/80 px-2 py-0.5 rounded-md border border-gray-700/40">
        {opponent.rating.toFixed(0)}
      </span>
    </div>
  );
}
