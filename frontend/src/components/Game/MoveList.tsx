import { useGameStore } from "../../store/gameStore";

/**
 * Scrollable list of moves in the current game, displayed as move pairs.
 */
export function MoveList() {
  const pgn = useGameStore((s) => s.pgn);
  const chess = useGameStore((s) => s.chess);
  const goToMove = useGameStore((s) => s.goToMove);

  const history = chess.history();

  // Group moves into pairs (white, black)
  const pairs: Array<{ number: number; white: string; black?: string }> = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      white: history[i],
      black: history[i + 1],
    });
  }

  if (pairs.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Moves</h3>
        <p className="text-xs text-gray-500">No moves yet. Make a move on the board.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-2">Moves</h3>
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {pairs.map((pair) => (
          <div key={pair.number} className="flex text-xs font-mono">
            <span className="w-8 text-gray-500">{pair.number}.</span>
            <button
              onClick={() => goToMove((pair.number - 1) * 2)}
              className="w-20 text-left px-1 rounded hover:bg-gray-700 text-gray-200"
            >
              {pair.white}
            </button>
            {pair.black && (
              <button
                onClick={() => goToMove((pair.number - 1) * 2 + 1)}
                className="w-20 text-left px-1 rounded hover:bg-gray-700 text-gray-200"
              >
                {pair.black}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
