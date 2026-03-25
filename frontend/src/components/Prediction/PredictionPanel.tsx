import { useGameStore } from "../../store/gameStore";
import { MoveDistribution } from "./MoveDistribution";

export function PredictionPanel() {
  const prediction = useGameStore((s) => s.prediction);
  const isLoading = useGameStore((s) => s.isLoading);
  const playerColor = useGameStore((s) => s.playerColor);

  if (isLoading) {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
          <span className="font-light">Analyzing position...</span>
        </div>
      </div>
    );
  }

  if (!prediction) {
    const colorName = playerColor === "w" ? "White" : "Black";
    return (
      <div className="glass-card p-4">
        <p className="text-xs text-zinc-500 leading-relaxed font-light">
          Make a move as {colorName} to see the opponent's predicted response.
        </p>
      </div>
    );
  }

  const matchesEngine = prediction.move === prediction.engineBest;

  return (
    <div className="glass-card p-4 space-y-3.5">
      {/* Header row: predicted move + engine comparison */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-emerald-500/[0.08] border border-emerald-500/[0.12] rounded-xl glow-green">
            <span className="text-sm font-bold text-emerald-400 font-mono">
              {prediction.move}
            </span>
          </div>
          <div className="text-xs">
            <span className="text-emerald-400 font-semibold font-mono">
              {(prediction.probability * 100).toFixed(0)}%
            </span>
            <span className="text-zinc-700 mx-1.5">|</span>
            <span className="text-zinc-500 font-mono">
              T={prediction.temperature.toFixed(2)}
            </span>
          </div>
        </div>

        {prediction.engineBest && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-indigo-400/80">{prediction.engineBest}</span>
            <span className={`w-2 h-2 rounded-full ${
              matchesEngine
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]"
                : "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.3)]"
            }`} title={matchesEngine ? "Matches engine" : "Deviates from engine"} />
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="flex gap-2">
        <div className="flex-1 bg-white/[0.02] rounded-xl px-3 py-2.5 border border-white/[0.03]">
          <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">CPL</p>
          <p className="text-sm font-bold font-mono text-zinc-200 mt-0.5">
            {prediction.predictedCpl.toFixed(0)}
          </p>
        </div>
        <div className="flex-1 bg-white/[0.02] rounded-xl px-3 py-2.5 border border-white/[0.03]">
          <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-wider">Blunder</p>
          <p className={`text-sm font-bold font-mono mt-0.5 ${
            prediction.blunderProbability > 0.3
              ? "text-red-400"
              : prediction.blunderProbability > 0.1
              ? "text-amber-400"
              : "text-emerald-400"
          }`}>
            {(prediction.blunderProbability * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      <MoveDistribution
        topMoves={prediction.topMoves}
        engineTopMoves={prediction.engineTopMoves}
      />
    </div>
  );
}
