import { useRef, useEffect } from "react";
import { useGameStore } from "../../store/gameStore";

export function MoveList() {
  const chess = useGameStore((s) => s.chess);
  const goToMove = useGameStore((s) => s.goToMove);
  const moveHistory = useGameStore((s) => s.moveHistory);
  const scrollRef = useRef<HTMLDivElement>(null);

  const history = chess.history();

  const pairs: Array<{ number: number; white: string; black?: string }> = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      white: history[i],
      black: history[i + 1],
    });
  }

  // Auto-scroll to bottom on new moves
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moveHistory.length]);

  return (
    <div className="bg-gray-900/80 border border-gray-800/60 rounded-xl p-4">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-2">
        Moves
      </p>
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
                onClick={() => goToMove((pair.number - 1) * 2)}
                className="w-16 text-left px-1.5 py-[3px] rounded text-gray-300
                           hover:bg-gray-800/80 hover:text-white transition-colors"
              >
                {pair.white}
              </button>
              {pair.black && (
                <button
                  onClick={() => goToMove((pair.number - 1) * 2 + 1)}
                  className="w-16 text-left px-1.5 py-[3px] rounded text-gray-400
                             hover:bg-gray-800/80 hover:text-white transition-colors"
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
