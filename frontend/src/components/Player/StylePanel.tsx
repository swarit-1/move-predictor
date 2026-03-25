import { usePlayerStore, StyleOverrides } from "../../store/playerStore";

export function StylePanel() {
  const { styleOverrides, setStyleOverride, resetStyleOverrides } = usePlayerStore();
  const opponent = usePlayerStore((s) => s.opponent);

  const sliders: { key: keyof StyleOverrides; label: string; low: string; high: string }[] = [
    { key: "aggression", label: "Aggression", low: "Passive", high: "Aggressive" },
    { key: "risk_taking", label: "Risk Taking", low: "Safe", high: "Risky" },
    { key: "blunder_frequency", label: "Blunder Rate", low: "Accurate", high: "Error-prone" },
  ];

  return (
    <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
          Opponent Style
        </p>
        <button
          onClick={resetStyleOverrides}
          className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
        >
          Reset
        </button>
      </div>

      {opponent && (
        <div className="flex items-center gap-2 pb-1">
          <span className="text-xs text-gray-300 font-medium">{opponent.username}</span>
          <span className="text-[10px] text-gray-500 font-mono bg-gray-800/50 px-1.5 py-0.5 rounded">
            {opponent.rating.toFixed(0)}
          </span>
        </div>
      )}

      {sliders.map(({ key, label, low, high }) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-[11px] text-gray-400">{label}</label>
            <span className="text-[11px] font-mono font-semibold text-white tabular-nums">
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
          <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
            <span>{low}</span>
            <span>{high}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
