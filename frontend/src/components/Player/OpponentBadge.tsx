import { usePlayerStore } from "../../store/playerStore";

export function OpponentBadge() {
  const opponent = usePlayerStore((s) => s.opponent);

  if (!opponent) return null;

  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="text-zinc-600 font-light">vs</span>
      <span className="text-zinc-300 font-medium">{opponent.username}</span>
      <span className="font-mono text-[11px] text-zinc-400 bg-white/[0.05] px-2.5 py-0.5 rounded-lg border border-white/[0.04]">
        {opponent.rating.toFixed(0)}
      </span>
    </div>
  );
}
