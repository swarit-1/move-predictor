import { useRef, useEffect } from "react";
import { useGameStore } from "../../store/gameStore";

export function MoveList() {
  const chess = useGameStore((s) => s.chess);
  const goToMove = useGameStore((s) => s.goToMove);
  const goToLatest = useGameStore((s) => s.goToLatest);
  const moveHistory = useGameStore((s) => s.moveHistory);
  const viewIndex = useGameStore((s) => s.viewIndex);
  const scrollRef = useRef<HTMLDivElement>(null);

  const history = chess.history();
  const currentIndex = viewIndex === -1 ? history.length - 1 : viewIndex;

  const pairs: Array<{ number: number; white: string; black?: string; whiteIdx: number; blackIdx: number }> = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      white: history[i],
      black: history[i + 1],
      whiteIdx: i,
      blackIdx: i + 1,
    });
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moveHistory.length]);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-[0.12em]">
          Moves
        </p>
        {viewIndex !== -1 && (
          <button
            onClick={goToLatest}
            className="text-[10px] text-gold hover:text-gold-light transition-colors duration-200 font-medium"
          >
            Latest
          </button>
        )}
      </div>
      {pairs.length === 0 ? (
        <p className="text-xs text-zinc-600 font-light">No moves yet.</p>
      ) : (
        <div ref={scrollRef} className="max-h-56 overflow-y-auto space-y-px pr-1">
          {pairs.map((pair) => (
            <div key={pair.number} className="flex text-xs font-mono items-center">
              <span className="w-7 text-zinc-600 tabular-nums text-right pr-2 flex-shrink-0">
                {pair.number}.
              </span>
              <button
                onClick={() => goToMove(pair.whiteIdx)}
                className={`w-16 text-left px-2 py-[3px] rounded-md transition-all duration-150 ${
                  currentIndex === pair.whiteIdx
                    ? "bg-gold-dim text-gold ring-1 ring-gold/20"
                    : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {pair.white}
              </button>
              {pair.black && (
                <button
                  onClick={() => goToMove(pair.blackIdx)}
                  className={`w-16 text-left px-2 py-[3px] rounded-md transition-all duration-150 ${
                    currentIndex === pair.blackIdx
                      ? "bg-gold-dim text-gold ring-1 ring-gold/20"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  {pair.black}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
