import { useState } from "react";
import { usePlayerStore, StyleOverrides } from "../../store/playerStore";
import { usePlayerProfile } from "../../hooks/usePlayerProfile";
import { useGameStore } from "../../store/gameStore";

type OpponentTab = "profile" | "rating" | "style";

interface Props {
  onStart: () => void;
}

export function SetupScreen({ onStart }: Props) {
  const [activeTab, setActiveTab] = useState<OpponentTab>("rating");
  const [source, setSource] = useState<"lichess" | "chesscom">("lichess");
  const [username, setUsername] = useState("");
  const [manualRating, setManualRating] = useState(1500);
  const playerColor = useGameStore((s) => s.playerColor);
  const setPlayerColor = useGameStore((s) => s.setPlayerColor);
  const showEvalBar = useGameStore((s) => s.showEvalBar);
  const setShowEvalBar = useGameStore((s) => s.setShowEvalBar);
  const { styleOverrides, setStyleOverride, resetStyleOverrides } =
    usePlayerStore();
  const { opponent, opponentLoading, error, fetchProfile } =
    usePlayerProfile();

  const handleSearch = () => {
    if (username.trim()) {
      fetchProfile(source, username.trim());
    }
  };

  const handleStart = () => {
    if (activeTab === "rating" && !opponent) {
      usePlayerStore.getState().setOpponent({
        username: `${manualRating}-rated player`,
        source: "manual",
        rating: manualRating,
        numGames: 0,
        styleSummary: {
          aggression: styleOverrides.aggression,
          tactical: 50,
          accuracy: Math.min(95, manualRating / 30),
          consistency: 50,
          opening_diversity: 50,
          preferred_openings: {},
        },
      });
    }
    if (activeTab === "style" && !opponent) {
      usePlayerStore.getState().setOpponent({
        username: "Custom opponent",
        source: "manual",
        rating: 1500,
        numGames: 0,
        styleSummary: {
          aggression: styleOverrides.aggression,
          tactical: 50,
          accuracy: 50,
          consistency: 50,
          opening_diversity: 50,
          preferred_openings: {},
        },
      });
    }
    onStart();
  };

  const tabs: { key: OpponentTab; label: string; icon: string }[] = [
    { key: "profile", label: "Player", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
    { key: "rating", label: "Rating", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
    { key: "style", label: "Style", icon: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient background */}
      <div className="ambient-orb w-[600px] h-[600px] bg-indigo-500 -top-[200px] -left-[200px]" />
      <div className="ambient-orb w-[500px] h-[500px] bg-purple-600 -bottom-[150px] -right-[150px]" />

      <div className="w-full max-w-lg relative z-10 animate-fade-in">
        {/* Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M12 2L15 8H9L12 2Z" />
                <path d="M8 8h8v3H8z" />
                <path d="M7 11h10l1 9H6l1-9z" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gradient">
            Move Predictor
          </h1>
          <p className="mt-2 text-sm text-zinc-500 font-light">
            Play against an AI that mimics human playing styles
          </p>
        </div>

        {/* Main card */}
        <div className="glass-card overflow-hidden">
          {/* Color + Settings row */}
          <div className="px-6 pt-5 pb-4 border-b border-white/[0.04]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-medium mb-2.5">
                  Play as
                </p>
                <div className="flex gap-2">
                  {(["w", "b"] as const).map((color) => (
                    <button
                      key={color}
                      onClick={() => setPlayerColor(color)}
                      className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                        playerColor === color
                          ? "bg-white/[0.08] text-white ring-1 ring-white/[0.12] shadow-sm"
                          : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-[4px] border ${
                        color === "w"
                          ? "bg-zinc-100 border-zinc-300"
                          : "bg-zinc-700 border-zinc-500"
                      }`} />
                      {color === "w" ? "White" : "Black"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-medium mb-2.5">
                  Eval bar
                </p>
                <button
                  onClick={() => setShowEvalBar(!showEvalBar)}
                  className={`px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                    showEvalBar
                      ? "bg-white/[0.08] text-white ring-1 ring-white/[0.12] shadow-sm"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
                  }`}
                >
                  {showEvalBar ? "On" : "Off"}
                </button>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-white/[0.04] px-2 pt-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-xs font-medium transition-all relative ${
                  activeTab === tab.key
                    ? "text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                </svg>
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="px-6 py-5">
            {activeTab === "profile" && (
              <ProfileTab
                source={source}
                setSource={setSource}
                username={username}
                setUsername={setUsername}
                onSearch={handleSearch}
                loading={opponentLoading}
                error={error}
                opponent={opponent}
              />
            )}

            {activeTab === "rating" && (
              <RatingTab rating={manualRating} setRating={setManualRating} />
            )}

            {activeTab === "style" && (
              <StyleTab
                styleOverrides={styleOverrides}
                setStyleOverride={setStyleOverride}
                resetStyleOverrides={resetStyleOverrides}
              />
            )}
          </div>

          {/* Start button */}
          <div className="px-6 pb-6">
            <button
              onClick={handleStart}
              disabled={activeTab === "profile" && !opponent && !opponentLoading}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400
                         active:from-indigo-700 active:to-indigo-600
                         disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed
                         rounded-xl text-sm font-semibold text-white transition-all duration-200
                         shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30
                         disabled:shadow-none"
            >
              Start Game
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-zinc-600 mt-6 font-light">
          Opponent moves are predicted automatically after each of your moves
        </p>
      </div>
    </div>
  );
}

/* ── Profile Tab ─────────────────────────────────────────────── */

function ProfileTab({
  source,
  setSource,
  username,
  setUsername,
  onSearch,
  loading,
  error,
  opponent,
}: {
  source: "lichess" | "chesscom";
  setSource: (s: "lichess" | "chesscom") => void;
  username: string;
  setUsername: (s: string) => void;
  onSearch: () => void;
  loading: boolean;
  error: string | null;
  opponent: any;
}) {
  return (
    <div className="space-y-4 animate-fade-in">
      <p className="text-xs text-zinc-500 font-light">
        Search for a real player and play against their style
      </p>

      <div className="flex gap-2">
        {(["lichess", "chesscom"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
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
          placeholder="Username..."
          className="flex-1 px-4 py-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm
                     text-white placeholder-zinc-600 focus:border-indigo-500/40 focus:outline-none
                     focus:ring-1 focus:ring-indigo-500/20 transition-all duration-200"
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
        />
        <button
          onClick={onSearch}
          disabled={loading || !username.trim()}
          className="px-5 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] disabled:bg-white/[0.02]
                     disabled:text-zinc-700 disabled:cursor-not-allowed rounded-xl text-xs
                     font-medium text-white transition-all duration-200"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-[1.5px] border-white/20 border-t-white rounded-full animate-spin" />
            </span>
          ) : (
            "Search"
          )}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-500/[0.05] border border-red-500/[0.1] rounded-xl">
          <p className="text-xs text-red-400/80 font-light">
            {error.includes("500") || error.includes("ECONNREFUSED")
              ? "Could not reach the analysis service. Make sure the ML backend is running."
              : error}
          </p>
        </div>
      )}

      {opponent && (
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-4 space-y-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">
                {opponent.username}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5 font-light">
                {opponent.numGames} games
              </p>
            </div>
            <span className="text-sm font-mono font-bold text-zinc-200 bg-white/[0.06] px-3 py-1.5 rounded-xl">
              {opponent.rating.toFixed(0)}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {[
              { label: "AGG", value: opponent.styleSummary.aggression, color: "text-red-400" },
              { label: "TAC", value: opponent.styleSummary.tactical, color: "text-orange-400" },
              { label: "ACC", value: opponent.styleSummary.accuracy, color: "text-emerald-400" },
              { label: "CON", value: opponent.styleSummary.consistency, color: "text-blue-400" },
              { label: "VAR", value: opponent.styleSummary.opening_diversity, color: "text-purple-400" },
            ].map((stat) => (
              <div key={stat.label} className="text-center py-2 bg-white/[0.03] rounded-xl">
                <p className={`text-sm font-bold font-mono ${stat.color}`}>
                  {stat.value}
                </p>
                <p className="text-[9px] text-zinc-600 mt-0.5 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Rating Tab ──────────────────────────────────────────────── */

function RatingTab({
  rating,
  setRating,
}: {
  rating: number;
  setRating: (r: number) => void;
}) {
  const presets = [800, 1000, 1200, 1500, 1800, 2000, 2200, 2500];

  const ratingLabel =
    rating < 1000
      ? "Beginner — frequent blunders and missed tactics"
      : rating < 1500
      ? "Intermediate — reasonable moves, occasional mistakes"
      : rating < 2000
      ? "Advanced — strong positional play with tactical awareness"
      : rating < 2400
      ? "Expert — highly accurate with deep understanding"
      : "Master — near-optimal play in most positions";

  return (
    <div className="space-y-5 animate-fade-in">
      <p className="text-xs text-zinc-500 font-light">
        Set an opponent rating to simulate skill level
      </p>

      <div>
        <div className="flex items-baseline justify-between mb-3">
          <label className="text-xs text-zinc-400 font-medium">Opponent Rating</label>
          <span className="text-2xl font-mono font-bold text-white tabular-nums tracking-tight">
            {rating}
          </span>
        </div>
        <input
          type="range"
          min={400}
          max={3000}
          step={25}
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
          <span>400</span>
          <span>3000</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {presets.map((r) => (
          <button
            key={r}
            onClick={() => setRating(r)}
            className={`py-2 rounded-xl text-xs font-mono font-medium transition-all duration-200 ${
              rating === r
                ? "bg-indigo-500/[0.12] text-indigo-400 ring-1 ring-indigo-500/25"
                : "bg-white/[0.03] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-zinc-500 leading-relaxed bg-white/[0.02] rounded-xl px-4 py-3 font-light">
        {ratingLabel}
      </p>
    </div>
  );
}

/* ── Style Tab ───────────────────────────────────────────────── */

function StyleTab({
  styleOverrides,
  setStyleOverride,
  resetStyleOverrides,
}: {
  styleOverrides: StyleOverrides;
  setStyleOverride: (key: keyof StyleOverrides, value: number) => void;
  resetStyleOverrides: () => void;
}) {
  const sliders: {
    key: keyof StyleOverrides;
    label: string;
    low: string;
    high: string;
    color: string;
  }[] = [
    { key: "aggression", label: "Aggression", low: "Passive", high: "Aggressive", color: "text-red-400" },
    { key: "risk_taking", label: "Risk Taking", low: "Safe", high: "Risky", color: "text-amber-400" },
    { key: "blunder_frequency", label: "Blunder Rate", low: "Accurate", high: "Blunder-prone", color: "text-orange-400" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500 font-light">Fine-tune playing style parameters</p>
        <button
          onClick={resetStyleOverrides}
          className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors duration-200"
        >
          Reset
        </button>
      </div>

      {sliders.map(({ key, label, low, high, color }) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-zinc-300 font-medium">{label}</label>
            <span className={`text-xs font-mono font-bold tabular-nums ${color}`}>
              {styleOverrides[key].toFixed(0)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={styleOverrides[key]}
            onChange={(e) => setStyleOverride(key, Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-zinc-600 mt-0.5">
            <span>{low}</span>
            <span>{high}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
