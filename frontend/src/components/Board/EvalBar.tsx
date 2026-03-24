import { useGameStore } from "../../store/gameStore";

/**
 * Vertical evaluation bar showing engine assessment.
 * White advantage fills from bottom, black from top.
 */
export function EvalBar() {
  const prediction = useGameStore((s) => s.prediction);

  // Default to equal position
  let evalScore = 0;
  let displayText = "0.0";

  if (prediction?.engineTopMoves?.length) {
    const bestCp = prediction.engineTopMoves[0]?.cp;
    if (bestCp !== null && bestCp !== undefined) {
      evalScore = bestCp / 100;
      displayText = evalScore >= 0 ? `+${evalScore.toFixed(1)}` : evalScore.toFixed(1);
    }
  }

  // Convert eval to percentage (sigmoid-like mapping)
  // Maps eval in pawns to 0-100% white advantage
  const whitePercent = 50 + 50 * (2 / (1 + Math.exp(-evalScore * 0.5)) - 1);

  return (
    <div className="flex flex-col items-center">
      <div
        className="w-6 h-[560px] rounded-sm overflow-hidden relative border border-gray-600"
        title={`Eval: ${displayText}`}
      >
        {/* Black side (top) */}
        <div
          className="absolute top-0 left-0 right-0 bg-gray-800 transition-all duration-300"
          style={{ height: `${100 - whitePercent}%` }}
        />
        {/* White side (bottom) */}
        <div
          className="absolute bottom-0 left-0 right-0 bg-white transition-all duration-300"
          style={{ height: `${whitePercent}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 mt-1">{displayText}</span>
    </div>
  );
}
