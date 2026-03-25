import { usePlayerStore, StyleOverrides } from "../../store/playerStore";

export function StyleSliders() {
  const { styleOverrides, setStyleOverride, resetStyleOverrides } =
    usePlayerStore();

  const sliders: Array<{
    key: keyof StyleOverrides;
    label: string;
    description: string;
  }> = [
    {
      key: "aggression",
      label: "Aggression",
      description: "Prefer attacking moves, captures, and checks",
    },
    {
      key: "risk_taking",
      label: "Risk Taking",
      description: "More variance in move selection",
    },
    {
      key: "blunder_frequency",
      label: "Blunder Frequency",
      description: "Likelihood of making mistakes",
    },
  ];

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-500">Style Controls</p>
        <button
          onClick={resetStyleOverrides}
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors duration-200"
        >
          Reset
        </button>
      </div>

      {sliders.map(({ key, label, description }) => (
        <div key={key}>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-zinc-400 font-medium">{label}</span>
            <span className="text-zinc-300 font-mono text-[11px] font-semibold">
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
          <p className="text-[10px] text-zinc-600 mt-1 font-light">{description}</p>
        </div>
      ))}
    </div>
  );
}
