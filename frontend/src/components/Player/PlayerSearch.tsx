import { useState } from "react";
import { usePlayerProfile } from "../../hooks/usePlayerProfile";

export function PlayerSearch() {
  const [source, setSource] = useState<"lichess" | "chesscom">("lichess");
  const [username, setUsername] = useState("");
  const { opponentLoading, error, fetchProfile } = usePlayerProfile();

  const handleSearch = () => {
    if (username.trim()) {
      fetchProfile(source, username.trim());
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <p className="text-xs font-medium text-gray-500">Select Opponent</p>

      <div className="flex gap-2">
        {(["lichess", "chesscom"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              source === s
                ? "bg-gray-700 text-white ring-1 ring-gray-600"
                : "bg-gray-800/50 text-gray-500 hover:text-gray-300"
            }`}
          >
            {s === "lichess" ? "Lichess" : "Chess.com"}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username..."
          className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-sm
                     text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none
                     transition-colors"
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button
          onClick={handleSearch}
          disabled={opponentLoading || !username.trim()}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800
                     disabled:text-gray-600 disabled:cursor-not-allowed rounded-lg text-sm
                     font-medium text-white transition-colors"
        >
          {opponentLoading ? "..." : "Go"}
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
