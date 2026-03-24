import { usePlayerStore, StyleOverrides } from "../../store/playerStore";

/**
 * User-adjustable sliders for controlling the simulated player's style.
 */
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
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Style Controls</h3>
        <button
          onClick={resetStyleOverrides}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          Reset
        </button>
      </div>

      {sliders.map(({ key, label, description }) => (
        <div key={key}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">{label}</span>
            <span className="text-gray-300 font-mono">
              {styleOverrides[key].toFixed(0)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={styleOverrides[key]}
            onChange={(e) => setStyleOverride(key, Number(e.target.value))}
            className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                       [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-blue-500"
          />
          <p className="text-[10px] text-gray-500 mt-0.5">{description}</p>
        </div>
      ))}
    </div>
  );
}
