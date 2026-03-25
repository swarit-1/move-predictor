import { useState, useCallback } from "react";
import { importGames, uploadPgn } from "../../api/client";

export function GameImport() {
  const [source, setSource] = useState<"lichess" | "chesscom">("lichess");
  const [username, setUsername] = useState("");
  const [maxGames, setMaxGames] = useState(200);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = useCallback(async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await importGames(source, username, maxGames);
      if (response.success) {
        setResult(
          `Imported ${response.data.gamesImported} games for ${response.data.username}`
        );
      } else {
        setError(response.error);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [source, username, maxGames]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setLoading(true);
      setError(null);

      try {
        const response = await uploadPgn(file);
        if (response.success) {
          setResult(`Uploaded ${file.name}`);
        }
      } catch (err: any) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return (
    <div className="glass-card p-4 space-y-3">
      <h3 className="text-sm font-semibold text-zinc-300">Import Games</h3>

      <div className="flex gap-2">
        {(["lichess", "chesscom"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
              source === s
                ? "bg-indigo-500/[0.12] text-indigo-400 ring-1 ring-indigo-500/20"
                : "bg-white/[0.03] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]"
            }`}
          >
            {s === "lichess" ? "Lichess" : "Chess.com"}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        className="w-full px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm
                   text-white placeholder-zinc-600 focus:border-indigo-500/40 focus:outline-none
                   focus:ring-1 focus:ring-indigo-500/20 transition-all duration-200"
        onKeyDown={(e) => e.key === "Enter" && handleImport()}
      />

      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="font-medium">Max games:</span>
        <input
          type="number"
          value={maxGames}
          onChange={(e) => setMaxGames(Number(e.target.value))}
          className="w-20 px-3 py-1.5 bg-white/[0.03] border border-white/[0.06] rounded-lg text-sm text-white"
          min={10}
          max={5000}
        />
      </div>

      <button
        onClick={handleImport}
        disabled={loading || !username.trim()}
        className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400
                   disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed
                   rounded-xl text-sm font-semibold text-white transition-all duration-200
                   shadow-lg shadow-indigo-500/20 disabled:shadow-none"
      >
        {loading ? "Importing..." : "Fetch Games"}
      </button>

      <div className="flex items-center gap-3 text-xs text-zinc-600">
        <div className="flex-1 h-px bg-white/[0.04]" />
        <span>or</span>
        <div className="flex-1 h-px bg-white/[0.04]" />
      </div>

      <label className="block w-full py-2.5 bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.04]
                        rounded-xl text-sm font-medium text-zinc-400 text-center cursor-pointer
                        transition-all duration-200">
        Upload PGN File
        <input
          type="file"
          accept=".pgn"
          onChange={handleFileUpload}
          className="hidden"
        />
      </label>

      {result && (
        <p className="text-xs text-emerald-400 font-light">{result}</p>
      )}
      {error && (
        <p className="text-xs text-red-400 font-light">{error}</p>
      )}
    </div>
  );
}
