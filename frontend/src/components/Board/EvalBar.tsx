import { useGameStore } from "../../store/gameStore";

export function EvalBar() {
  const prediction = useGameStore((s) => s.prediction);

  let evalScore = 0;
  let displayText = "0.0";

  if (prediction?.engineTopMoves?.length) {
    const bestCp = prediction.engineTopMoves[0]?.cp;
    if (bestCp !== null && bestCp !== undefined) {
      evalScore = bestCp / 100;
      displayText =
        evalScore >= 0 ? `+${evalScore.toFixed(1)}` : evalScore.toFixed(1);
    }
  }

  const whitePercent = 50 + 50 * (2 / (1 + Math.exp(-evalScore * 0.5)) - 1);

  return (
    <div className="flex flex-col items-center mt-8">
      <div
        className="w-[14px] rounded overflow-hidden relative bg-gray-700"
        style={{ height: 560 }}
        title={`Eval: ${displayText}`}
      >
        <div
          className="absolute top-0 left-0 right-0 bg-gray-800 transition-all duration-500"
          style={{ height: `${100 - whitePercent}%` }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 bg-gray-200 transition-all duration-500"
          style={{ height: `${whitePercent}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-500 mt-1.5 font-mono">
        {displayText}
      </span>
    </div>
  );
}
