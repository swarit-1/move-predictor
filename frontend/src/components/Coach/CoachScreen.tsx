import { useState, useCallback } from "react";
import { coachAnalysis, listSavedGames, getSavedGame } from "../../api/client";
import { useAuthStore } from "../../store/authStore";

interface BlunderPattern {
  position_category: string;
  blunder_type: string;
  occurrences: number;
  example_fen: string | null;
  example_move: string | null;
  description: string;
}

interface CoachInsight {
  total_games_analyzed: number;
  total_moves_analyzed: number;
  total_blunders: number;
  avg_cpl: number;
  weakest_phase: string;
  strongest_phase: string;
  top_patterns: BlunderPattern[];
  phase_accuracy: Record<string, number>;
}

interface Props {
  onBack: () => void;
}

export function CoachScreen({ onBack }: Props) {
  const user = useAuthStore((s) => s.user);
  const [insights, setInsights] = useState<CoachInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch the user's saved games to feed to the coach endpoint.
      const games = await listSavedGames(undefined, 50);
      if (!games?.data?.games || games.data.games.length === 0) {
        setError(
          "No saved games found. Play and save some games first, then come back for coaching insights."
        );
        return;
      }

      // Fetch full PGN for each game.
      const pgns: string[] = [];
      for (const g of games.data.games.slice(0, 30)) {
        try {
          const full = await getSavedGame(g.id);
          if (full?.data?.pgn) pgns.push(full.data.pgn);
        } catch {
          // Skip games we can't fetch.
        }
      }

      if (pgns.length === 0) {
        setError("Could not load any saved game PGNs.");
        return;
      }

      const res = await coachAnalysis(pgns, user.username, {
        maxGames: 30,
        stockfishDepth: 8,
      });

      if (res?.success && res.data?.insights) {
        setInsights(res.data.insights);
      } else {
        setError(res?.error || "Analysis failed.");
      }
    } catch (err: any) {
      setError(err?.message || "Coach analysis failed.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-surface-0 p-6">
      <div className="max-w-3xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors group"
          >
            <svg
              className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            <span className="font-medium">Back</span>
          </button>
          <h1 className="text-xl font-bold text-gradient">Coach</h1>
          <div className="w-16" />
        </div>

        {/* Start analysis */}
        {!insights && !loading && (
          <div className="glass-card p-8 text-center space-y-4">
            <h2 className="text-lg font-semibold text-zinc-200">
              Discover your blind spots
            </h2>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              The coach analyzes your saved games and finds the recurring
              blunder patterns you might not notice — position types
              where you consistently lose material, miss tactics, or
              ignore king safety.
            </p>
            <button
              onClick={runAnalysis}
              disabled={!user}
              className="px-6 py-3 bg-gold hover:brightness-110 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-xl text-sm font-semibold text-surface-0 transition-all shadow-lg shadow-gold/20"
            >
              {user ? "Analyze my games" : "Sign in to use Coach"}
            </button>
            {error && (
              <p className="text-xs text-red-400/80 font-light">{error}</p>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="glass-card p-8 text-center space-y-3">
            <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin mx-auto" />
            <p className="text-sm text-zinc-400">
              Analyzing your games with Stockfish...
            </p>
            <p className="text-xs text-zinc-600">
              This may take a few minutes depending on how many games you have.
            </p>
          </div>
        )}

        {/* Results */}
        {insights && (
          <div className="space-y-5">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                label="Games"
                value={String(insights.total_games_analyzed)}
              />
              <StatCard
                label="Avg CPL"
                value={insights.avg_cpl.toFixed(0)}
              />
              <StatCard
                label="Blunders"
                value={String(insights.total_blunders)}
              />
              <StatCard
                label="Weakest"
                value={insights.weakest_phase}
              />
            </div>

            {/* Phase accuracy */}
            <div className="glass-card p-4 space-y-3">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Accuracy by phase
              </p>
              {Object.entries(insights.phase_accuracy).map(([phase, acc]) => (
                <div key={phase} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 w-24 capitalize">
                    {phase}
                  </span>
                  <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(2, acc)}%`,
                        backgroundColor:
                          acc >= 80
                            ? "#96BC4B"
                            : acc >= 60
                              ? "#F7C631"
                              : "#CA3431",
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-zinc-300 w-12 text-right">
                    {acc.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>

            {/* Top blunder patterns */}
            <div className="glass-card p-4 space-y-3">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Recurring blunder patterns
              </p>
              {insights.top_patterns.length === 0 && (
                <p className="text-xs text-zinc-600">
                  No strong patterns detected. Play more games!
                </p>
              )}
              {insights.top_patterns.map((pat, i) => (
                <div
                  key={i}
                  className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-300 capitalize">
                      {pat.position_category.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] font-mono text-red-400/70 bg-red-500/[0.08] px-2 py-0.5 rounded">
                      {pat.occurrences}x
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    {pat.description}
                  </p>
                </div>
              ))}
            </div>

            {/* Re-run */}
            <div className="text-center pt-2">
              <button
                onClick={runAnalysis}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Re-analyze with latest games
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-3 text-center">
      <div className="text-lg font-bold font-mono text-zinc-200 capitalize">
        {value}
      </div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
        {label}
      </div>
    </div>
  );
}
