import { useGameStore } from "../../store/gameStore";

interface Props {
  height?: number;
}

export function EvalBar({ height = 560 }: Props) {
  const positionEval = useGameStore((s) => s.positionEval);
  const evalLoading = useGameStore((s) => s.evalLoading);

  const cpValue = positionEval?.cp ?? 0;
  const evalScore = cpValue / 100;

  let displayText: string;
  if (positionEval?.mate !== null && positionEval?.mate !== undefined) {
    displayText = `M${Math.abs(positionEval.mate)}`;
  } else {
    displayText = evalScore >= 0 ? `+${evalScore.toFixed(1)}` : evalScore.toFixed(1);
  }

  const whitePercent = positionEval
    ? 50 + 50 * (2 / (1 + Math.exp(-evalScore * 0.5)) - 1)
    : 50;

  return (
    <div className="flex flex-col items-center">
      <div
        className="w-4 rounded-sm overflow-hidden relative bg-[#3a3a3a]"
        style={{ height }}
        title={`Eval: ${displayText}`}
      >
        <div
          className="absolute top-0 left-0 right-0 bg-[#3a3a3a] transition-all duration-700 ease-out"
          style={{ height: `${100 - whitePercent}%` }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 bg-[#e8e8e8] transition-all duration-700 ease-out"
          style={{ height: `${whitePercent}%` }}
        />
        <div className="absolute left-0 right-0 top-1/2 h-px bg-gray-500/40" />
      </div>
      <span className={`text-[10px] mt-1.5 font-mono tabular-nums ${
        evalLoading ? "text-gray-600 animate-pulse" : "text-gray-400"
      }`}>
        {displayText}
      </span>
    </div>
  );
}
