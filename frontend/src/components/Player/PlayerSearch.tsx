import { useState } from "react";
import { usePlayerProfile } from "../../hooks/usePlayerProfile";

/**
 * Search for a player by username to build their profile.
 */
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
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-300">Select Opponent</h3>

      <div className="flex gap-1">
        {(["lichess", "chesscom"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`flex-1 py-1 rounded text-xs font-medium ${
              source === s
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-400"
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
          className="flex-1 px-3 py-2 bg-gray-700 rounded text-sm border border-gray-600
                     focus:border-blue-500 focus:outline-none"
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button
          onClick={handleSearch}
          disabled={opponentLoading || !username.trim()}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600
                     rounded text-sm font-medium transition"
        >
          {opponentLoading ? "..." : "Go"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
