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
    <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
          Moves
        </p>
        {viewIndex !== -1 && (
          <button
            onClick={goToLatest}
            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
          >
            Latest
          </button>
        )}
      </div>
      {pairs.length === 0 ? (
        <p className="text-xs text-gray-600">No moves yet.</p>
      ) : (
        <div ref={scrollRef} className="max-h-52 overflow-y-auto space-y-px pr-1">
          {pairs.map((pair) => (
            <div key={pair.number} className="flex text-xs font-mono items-center">
              <span className="w-7 text-gray-600 tabular-nums text-right pr-1.5 flex-shrink-0">
                {pair.number}.
              </span>
              <button
                onClick={() => goToMove(pair.whiteIdx)}
                className={`w-16 text-left px-1.5 py-[3px] rounded transition-colors ${
                  currentIndex === pair.whiteIdx
                    ? "bg-blue-500/15 text-blue-300"
                    : "text-gray-300 hover:bg-gray-800/80 hover:text-white"
                }`}
              >
                {pair.white}
              </button>
              {pair.black && (
                <button
                  onClick={() => goToMove(pair.blackIdx)}
                  className={`w-16 text-left px-1.5 py-[3px] rounded transition-colors ${
                    currentIndex === pair.blackIdx
                      ? "bg-blue-500/15 text-blue-300"
                      : "text-gray-400 hover:bg-gray-800/80 hover:text-white"
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
