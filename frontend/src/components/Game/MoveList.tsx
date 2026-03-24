import { useGameStore } from "../../store/gameStore";

export function MoveList() {
  const chess = useGameStore((s) => s.chess);
  const goToMove = useGameStore((s) => s.goToMove);

  const history = chess.history();

  const pairs: Array<{ number: number; white: string; black?: string }> = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      white: history[i],
      black: history[i + 1],
    });
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs font-medium text-gray-500 mb-2">Moves</p>
      {pairs.length === 0 ? (
        <p className="text-xs text-gray-600">No moves yet.</p>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-px">
          {pairs.map((pair) => (
            <div key={pair.number} className="flex text-xs font-mono">
              <span className="w-7 text-gray-600 tabular-nums">
                {pair.number}.
              </span>
              <button
                onClick={() => goToMove((pair.number - 1) * 2)}
                className="w-16 text-left px-1.5 py-0.5 rounded text-gray-300
                           hover:bg-gray-800 transition-colors"
              >
                {pair.white}
              </button>
              {pair.black && (
                <button
                  onClick={() => goToMove((pair.number - 1) * 2 + 1)}
                  className="w-16 text-left px-1.5 py-0.5 rounded text-gray-300
                             hover:bg-gray-800 transition-colors"
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
