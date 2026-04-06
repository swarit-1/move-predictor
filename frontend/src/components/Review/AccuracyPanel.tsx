import type { PlayerAccuracy } from "../../store/reviewStore";
import { CLASSIFICATION_COLORS } from "../../store/reviewStore";

interface Props {
  label: string;
  accuracy: PlayerAccuracy;
  color: "white" | "black";
}

export function AccuracyPanel({ label, accuracy, color }: Props) {
  const ringColor = color === "white" ? "#e4e4e7" : "#52525b";
  const fillColor = getAccuracyColor(accuracy.accuracy);

  // SVG ring progress
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const progress = (accuracy.accuracy / 100) * circumference;

  const categories = [
    { key: "best", count: accuracy.best + accuracy.excellent, label: "Best", color: CLASSIFICATION_COLORS.best },
    { key: "good", count: accuracy.good, label: "Good", color: "#71717a" },
    { key: "inaccuracy", count: accuracy.inaccuracy, label: "Inaccuracy", color: CLASSIFICATION_COLORS.inaccuracy },
    { key: "mistake", count: accuracy.mistake, label: "Mistake", color: CLASSIFICATION_COLORS.mistake },
    { key: "blunder", count: accuracy.blunder, label: "Blunder", color: CLASSIFICATION_COLORS.blunder },
  ];

  return (
    <div className="glass-card p-4 space-y-3">
      {/* Player label */}
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-sm"
          style={{ backgroundColor: color === "white" ? "#edeed1" : "#779952" }}
        />
        <span className="text-xs font-medium text-zinc-300 truncate">{label}</span>
      </div>

      {/* Accuracy ring */}
      <div className="flex items-center justify-center">
        <div className="relative">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle
              cx="40" cy="40" r={radius}
              fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"
            />
            <circle
              cx="40" cy="40" r={radius}
              fill="none" stroke={fillColor} strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              transform="rotate(-90 40 40)"
              className="transition-all duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold font-mono" style={{ color: fillColor }}>
              {accuracy.accuracy.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="space-y-1">
        {categories.map((cat) => (
          <div key={cat.key} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: cat.color }}
              />
              <span className="text-[10px] text-zinc-500">{cat.label}</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-400">{cat.count}</span>
          </div>
        ))}
      </div>

      {/* Avg CPL */}
      <div className="pt-1 border-t border-white/[0.04]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500">Avg CPL</span>
          <span className="text-[10px] font-mono text-zinc-400">{accuracy.avg_cpl}</span>
        </div>
      </div>
    </div>
  );
}

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 90) return "#96BC4B";
  if (accuracy >= 70) return "#F7C631";
  if (accuracy >= 50) return "#E68A2E";
  return "#CA3431";
}
