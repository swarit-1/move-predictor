import { useState, useMemo, useEffect, useCallback } from "react";
import { OPENINGS, type Opening } from "../../data/openings";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import { useGameStore } from "../../store/gameStore";
import { usePlayerStore } from "../../store/playerStore";

interface Props {
  onStartGame: () => void;
  onBack: () => void;
}

export function PracticeScreen({ onStartGame, onBack }: Props) {
  const [category, setCategory] = useState<"e4" | "d4" | "other">("e4");
  const [selectedOpening, setSelectedOpening] = useState<Opening | null>(null);
  const [practiceAs, setPracticeAs] = useState<"w" | "b">("w");
  const [opponentRating, setOpponentRating] = useState(1500);
  const [previewFen, setPreviewFen] = useState("start");

  const setPlayerColor = useGameStore((s) => s.setPlayerColor);
  const resetGame = useGameStore((s) => s.resetGame);
  const setPendingOpeningMoves = useGameStore((s) => s.setPendingOpeningMoves);
  const setOpponent = usePlayerStore((s) => s.setOpponent);

  const filtered = useMemo(
    () => OPENINGS.filter((o) => o.category === category),
    [category],
  );

  useEffect(() => {
    if (selectedOpening) {
      const previewChess = new Chess();
      for (const san of selectedOpening.moves) {
        try {
          previewChess.move(san);
        } catch {
          break;
        }
      }
      setPreviewFen(previewChess.fen());
    } else {
      setPreviewFen("start");
    }
  }, [selectedOpening]);

  const handleStart = useCallback(() => {
    if (!selectedOpening) return;

    resetGame();
    setPlayerColor(practiceAs);

    setOpponent({
      username: `${opponentRating}-rated opponent`,
      source: "rating",
      rating: opponentRating,
      numGames: 0,
      styleSummary: null,
    });

    setPendingOpeningMoves(selectedOpening.moves);
    onStartGame();
  }, [
    selectedOpening,
    practiceAs,
    opponentRating,
    resetGame,
    setPlayerColor,
    setOpponent,
    setPendingOpeningMoves,
    onStartGame,
  ]);

  return (
    <div className="min-h-screen bg-surface-0 p-6">
      <div className="max-w-5xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors group"
          >
            <svg
              className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            <span className="font-medium">Back</span>
          </button>
          <h1 className="text-xl font-bold text-gradient">Opening Practice</h1>
          <div className="w-16" />
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Opening selector */}
          <div className="flex-1 min-w-0">
            {/* Category tabs */}
            <div className="flex gap-2 mb-4">
              {(["e4", "d4", "other"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setCategory(cat);
                    setSelectedOpening(null);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    category === cat
                      ? "bg-gold text-surface-0"
                      : "bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {cat === "other" ? "Other" : `1.${cat}`}
                </button>
              ))}
            </div>

            {/* Opening list */}
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-2">
              {filtered.map((opening) => (
                <button
                  key={`${opening.eco}-${opening.variation}`}
                  onClick={() => setSelectedOpening(opening)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedOpening?.eco === opening.eco &&
                    selectedOpening?.variation === opening.variation
                      ? "bg-gold-dim border border-gold/20"
                      : "bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-500">
                      {opening.eco}
                    </span>
                    <span className="text-sm font-medium text-zinc-200">
                      {opening.name}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {opening.variation}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Preview + settings */}
          <div className="w-full lg:w-[340px] space-y-4 flex-shrink-0">
            {/* Preview board */}
            <div className="glass-card p-3">
              <Chessboard
                position={previewFen}
                boardWidth={314}
                arePiecesDraggable={false}
                boardOrientation={practiceAs === "w" ? "white" : "black"}
                customBoardStyle={{ borderRadius: "8px" }}
                customDarkSquareStyle={{ backgroundColor: "#779952" }}
                customLightSquareStyle={{ backgroundColor: "#edeed1" }}
              />
            </div>

            {selectedOpening && (
              <>
                {/* Opening info */}
                <div className="glass-card p-4">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    {selectedOpening.name}
                  </h3>
                  <p className="text-xs text-gold mt-0.5">
                    {selectedOpening.variation}
                  </p>
                  <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                    {selectedOpening.description}
                  </p>
                  <p className="text-xs text-zinc-600 mt-2 font-mono">
                    {selectedOpening.moves.join(" ")}
                  </p>
                </div>

                {/* Settings */}
                <div className="glass-card p-4 space-y-4">
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                      Play as
                    </p>
                    <div className="flex gap-2">
                      {(["w", "b"] as const).map((color) => (
                        <button
                          key={color}
                          onClick={() => setPracticeAs(color)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                            practiceAs === color
                              ? "bg-gold/10 text-gold border border-gold/20"
                              : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          {color === "w" ? "White" : "Black"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">
                      Opponent Rating:{" "}
                      <span className="text-zinc-300 font-mono">
                        {opponentRating}
                      </span>
                    </p>
                    <input
                      type="range"
                      min={400}
                      max={2800}
                      step={50}
                      value={opponentRating}
                      onChange={(e) =>
                        setOpponentRating(Number(e.target.value))
                      }
                      className="w-full accent-gold"
                    />
                  </div>

                  <button
                    onClick={handleStart}
                    className="w-full py-3 bg-gold hover:brightness-110 rounded-xl text-sm font-semibold text-surface-0 transition-all shadow-lg shadow-gold/20"
                  >
                    Practice This Opening
                  </button>
                </div>
              </>
            )}

            {!selectedOpening && (
              <div className="glass-card p-6 text-center">
                <p className="text-xs text-zinc-500">
                  Select an opening from the list to preview it
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
