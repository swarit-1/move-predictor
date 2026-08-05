import { useMemo, useState } from "react";
import { usePlayerStore, StyleOverrides } from "../../store/playerStore";

/**
 * Style sliders.
 *
 * PRD §5.2 / §4.4: 10 dimensions grouped into Basics (always visible) and
 * Advanced (collapsed by default). Each slider renders a baseline tick at
 * the selected opponent's measured value so dragging away from it is
 * legible as "I am pushing this opponent more / less <dimension> than they
 * actually are." A `Reset to clone` button snaps every slider back to the
 * measured baseline (falling through to the neutral 50 mid if no opponent
 * is selected).
 */
type SliderKey = keyof StyleOverrides;

interface SliderDef {
  key: SliderKey;
  label: string;
  description: string;
  group: "basics" | "advanced";
}

const SLIDERS: SliderDef[] = [
  // ── Basics (always visible) ─────────────────────────────────────
  {
    key: "aggression",
    label: "Aggression",
    description: "Prefer captures and checks",
    group: "basics",
  },
  {
    key: "blunder_frequency",
    label: "Blunder Frequency",
    description: "How often the clone slips",
    group: "basics",
  },
  {
    key: "risk_taking",
    label: "Risk Taking",
    description: "Variance in move selection",
    group: "basics",
  },
  // ── Advanced (collapsed by default) ─────────────────────────────
  {
    key: "king_attack",
    label: "King Attack",
    description: "Push pieces toward the enemy king",
    group: "advanced",
  },
  {
    key: "positional",
    label: "Positional",
    description: "Higher → quiet maneuvering; lower → forcing lines",
    group: "advanced",
  },
  {
    key: "trade_preference",
    label: "Trade Preference",
    description: "Initiate captures vs avoid trades",
    group: "advanced",
  },
  {
    key: "opening_loyalty",
    label: "Opening Loyalty",
    description: "Stick to the player's known repertoire",
    group: "advanced",
  },
  {
    key: "repertoire_width",
    label: "Repertoire Width",
    description: "Pick from many openings vs lock to one line",
    group: "advanced",
  },
  {
    key: "endgame_strength",
    label: "Endgame Strength",
    description: "Accuracy past move 40",
    group: "advanced",
  },
  {
    key: "defensive_tenacity",
    label: "Defensive Tenacity",
    description: "Fight harder when the position is worse",
    group: "advanced",
  },
  {
    key: "pawn_aggression",
    label: "Pawn Aggression",
    description: "Flank pawn storms and space-grabbing pushes",
    group: "advanced",
  },
];

export function StyleSliders() {
  const { styleOverrides, setStyleOverride, resetStyleOverrides } =
    usePlayerStore();
  const opponent = usePlayerStore((s) => s.opponent);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const baseline = opponent?.baselineStyle ?? {};

  // Reset to "clone" means: snap every slider to the measured baseline.
  // If no baseline value exists for a dim, fall back to the neutral 50.
  const resetToClone = () => {
    SLIDERS.forEach((s) => {
      const v = (baseline[s.key] as number | undefined) ?? 50;
      setStyleOverride(s.key, Math.round(v));
    });
  };

  const visible = useMemo(
    () => SLIDERS.filter((s) => showAdvanced || s.group === "basics"),
    [showAdvanced]
  );

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-500">Style Controls</p>
        <div className="flex items-center gap-3">
          {opponent && (
            <button
              onClick={resetToClone}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors duration-200"
              title="Snap every slider to the selected player's measured value"
            >
              Reset to clone
            </button>
          )}
          <button
            onClick={resetStyleOverrides}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors duration-200"
            title="Snap every slider back to neutral (50)"
          >
            Reset
          </button>
        </div>
      </div>

      {visible.map(({ key, label, description }) => {
        const value = styleOverrides[key];
        const baselineValue =
          typeof baseline[key] === "number" ? (baseline[key] as number) : null;
        return (
          <SliderRow
            key={key}
            label={label}
            description={description}
            value={value}
            baseline={baselineValue}
            onChange={(v) => setStyleOverride(key, v)}
          />
        );
      })}

      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="w-full text-center text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors duration-200 pt-2"
      >
        {showAdvanced ? "Hide advanced controls" : "Show advanced controls"}
      </button>
    </div>
  );
}

function SliderRow({
  label,
  description,
  value,
  baseline,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  baseline: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-zinc-400 font-medium">{label}</span>
        <span className="flex items-baseline gap-2">
          {baseline != null && (
            <span
              className="text-zinc-600 font-mono text-[10px]"
              title="Measured value for the selected player"
            >
              {Math.round(baseline)}
            </span>
          )}
          <span className="text-zinc-300 font-mono text-[11px] font-semibold">
            {value.toFixed(0)}
          </span>
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full"
        />
        {baseline != null && (
          <span
            // Tick mark for the player's measured baseline.
            className="pointer-events-none absolute top-1/2 -translate-y-1/2 w-px h-3 bg-amber-300/70"
            style={{ left: `${Math.max(0, Math.min(100, baseline))}%` }}
            aria-label={`Baseline ${Math.round(baseline)}`}
          />
        )}
      </div>
      <p className="text-[10px] text-zinc-600 mt-1 font-light">{description}</p>
    </div>
  );
}
