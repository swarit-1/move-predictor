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
    <div className="glass-card p-4 space-y-3">
      <p className="text-xs font-medium text-zinc-500">Select Opponent</p>

      <div className="flex gap-2">
        {(["lichess", "chesscom"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
              source === s
                ? "bg-white/[0.08] text-white ring-1 ring-white/[0.12]"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
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
          className="flex-1 px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm
                     text-white placeholder-zinc-600 focus:border-indigo-500/40 focus:outline-none
                     focus:ring-1 focus:ring-indigo-500/20 transition-all duration-200"
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button
          onClick={handleSearch}
          disabled={opponentLoading || !username.trim()}
          className="px-5 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] disabled:bg-white/[0.02]
                     disabled:text-zinc-700 disabled:cursor-not-allowed rounded-xl text-sm
                     font-medium text-white transition-all duration-200"
        >
          {opponentLoading ? "..." : "Go"}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-500/[0.05] border border-red-500/[0.1] rounded-xl">
          <p className="text-xs text-red-400/80 font-light">{error}</p>
        </div>
      )}
    </div>
  );
}
