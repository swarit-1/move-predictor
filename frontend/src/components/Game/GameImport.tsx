import { useState, useCallback } from "react";
import { importGames, uploadPgn } from "../../api/client";

/**
 * Game import panel: fetch by username or upload PGN.
 */
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
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-300">Import Games</h3>

      {/* Source selection */}
      <div className="flex gap-2">
        {(["lichess", "chesscom"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`flex-1 py-1.5 rounded text-xs font-medium ${
              source === s
                ? "bg-blue-600 text-white"
                : "bg-gray-700 text-gray-400 hover:text-white"
            }`}
          >
            {s === "lichess" ? "Lichess" : "Chess.com"}
          </button>
        ))}
      </div>

      {/* Username input */}
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        className="w-full px-3 py-2 bg-gray-700 rounded text-sm border border-gray-600
                   focus:border-blue-500 focus:outline-none"
        onKeyDown={(e) => e.key === "Enter" && handleImport()}
      />

      {/* Max games */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span>Max games:</span>
        <input
          type="number"
          value={maxGames}
          onChange={(e) => setMaxGames(Number(e.target.value))}
          className="w-20 px-2 py-1 bg-gray-700 rounded border border-gray-600 text-sm"
          min={10}
          max={5000}
        />
      </div>

      <button
        onClick={handleImport}
        disabled={loading || !username.trim()}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600
                   rounded text-sm font-medium transition"
      >
        {loading ? "Importing..." : "Fetch Games"}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <div className="flex-1 h-px bg-gray-700" />
        <span>or</span>
        <div className="flex-1 h-px bg-gray-700" />
      </div>

      {/* PGN upload */}
      <label className="block w-full py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm
                        font-medium text-center cursor-pointer transition">
        Upload PGN File
        <input
          type="file"
          accept=".pgn"
          onChange={handleFileUpload}
          className="hidden"
        />
      </label>

      {/* Feedback */}
      {result && (
        <p className="text-xs text-green-400">{result}</p>
      )}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
