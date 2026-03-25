import { useGameStore } from "../../store/gameStore";
import { MoveDistribution } from "./MoveDistribution";
import { Chess } from "chess.js";

export function PredictionPanel() {
  const prediction = useGameStore((s) => s.prediction);
  const isLoading = useGameStore((s) => s.isLoading);
  const playerColor = useGameStore((s) => s.playerColor);
  const chess = useGameStore((s) => s.chess);
  const fen = useGameStore((s) => s.fen);
  const viewIndex = useGameStore((s) => s.viewIndex);

  // Check game over on the actual game state (not view state)
  const isGameOver = chess.isGameOver();

  if (isGameOver && !isLoading) {
    return (
      <div className="glass-card p-4">
        <p className="text-xs text-zinc-400 leading-relaxed">
          Game complete. Click "Review" to analyze moves.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="w-4 h-4 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
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

  // Convert UCI to SAN for display if possible
  let moveSan = prediction.move;
  try {
    const tempChess = new Chess(fen);
    const from = prediction.move.slice(0, 2);
    const to = prediction.move.slice(2, 4);
    const promo = prediction.move.length > 4 ? prediction.move[4] : undefined;
    const result = tempChess.move({ from, to, promotion: promo });
    if (result) moveSan = result.san;
  } catch {
    // Fall back to UCI
  }

  return (
    <div className="glass-card p-4 space-y-3.5">
      {/* Header row: predicted move + engine comparison */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-human/[0.08] border border-human/[0.15] rounded-xl">
            <span className="text-sm font-bold text-human font-mono">
              {moveSan}
            </span>
          </div>
          <div className="text-xs">
            {/* Confidence bar */}
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full bg-human/60 rounded-full transition-all duration-500"
                  style={{ width: `${prediction.probability * 100}%` }}
                />
              </div>
              <span className="text-human font-semibold font-mono">
                {(prediction.probability * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {prediction.engineBest && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-engine/80">{prediction.engineBest}</span>
            {matchesEngine ? (
              <span className="text-[10px] text-human/70 bg-human/[0.06] px-1.5 py-0.5 rounded">
                Engine agrees
              </span>
            ) : (
              <span className="text-[10px] text-gold/70 bg-gold-dim px-1.5 py-0.5 rounded">
                Human choice
              </span>
            )}
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
              ? "text-blunder"
              : prediction.blunderProbability > 0.1
              ? "text-inaccuracy"
              : "text-human"
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
