import { usePlayerStore, StyleOverrides } from "../../store/playerStore";

export function StylePanel() {
  const { styleOverrides, setStyleOverride, resetStyleOverrides } = usePlayerStore();
  const opponent = usePlayerStore((s) => s.opponent);

  const sliders: { key: keyof StyleOverrides; label: string; low: string; high: string; color: string }[] = [
    { key: "aggression", label: "Aggression", low: "Passive", high: "Aggressive", color: "text-red-400" },
    { key: "risk_taking", label: "Risk Taking", low: "Safe", high: "Risky", color: "text-amber-400" },
    { key: "blunder_frequency", label: "Blunder Rate", low: "Accurate", high: "Error-prone", color: "text-orange-400" },
  ];

  return (
    <div className="glass-card p-4 space-y-3 animate-slide-up">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.12em]">
          Opponent Style
        </p>
        <button
          onClick={resetStyleOverrides}
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors duration-200"
        >
          Reset
        </button>
      </div>

      {opponent && (
        <div className="flex items-center gap-2 pb-1">
          <span className="text-xs text-zinc-300 font-medium">{opponent.username}</span>
          <span className="text-[10px] text-zinc-500 font-mono bg-white/[0.04] px-2 py-0.5 rounded-md">
            {opponent.rating.toFixed(0)}
          </span>
        </div>
      )}

      {sliders.map(({ key, label, low, high, color }) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-zinc-400 font-medium">{label}</label>
            <span className={`text-[11px] font-mono font-bold tabular-nums ${color}`}>
              {styleOverrides[key].toFixed(0)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={styleOverrides[key]}
            onChange={(e) => setStyleOverride(key, Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[9px] text-zinc-600 mt-0.5">
            <span>{low}</span>
            <span>{high}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
