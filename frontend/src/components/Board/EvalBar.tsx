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
    <div className="flex flex-col items-center animate-fade-in">
      <div
        className="w-[14px] rounded-lg overflow-hidden relative"
        style={{ height }}
        title={`Eval: ${displayText}`}
      >
        {/* Black side (top) */}
        <div
          className="absolute top-0 left-0 right-0 transition-all duration-700 ease-out"
          style={{
            height: `${100 - whitePercent}%`,
            background: "linear-gradient(180deg, #1a1a2e 0%, #2a2a3e 100%)",
          }}
        />
        {/* White side (bottom) */}
        <div
          className="absolute bottom-0 left-0 right-0 transition-all duration-700 ease-out"
          style={{
            height: `${whitePercent}%`,
            background: "linear-gradient(180deg, #e8e8ec 0%, #d4d4d8 100%)",
          }}
        />
        {/* Center line */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-zinc-500/30" />
      </div>
      <span className={`text-[10px] mt-2 font-mono font-semibold tabular-nums ${
        evalLoading ? "text-zinc-600 animate-pulse" : "text-zinc-400"
      }`}>
        {displayText}
      </span>
    </div>
  );
}
