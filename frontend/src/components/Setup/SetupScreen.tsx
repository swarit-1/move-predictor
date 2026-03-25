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

  const tabs: { key: OpponentTab; label: string }[] = [
    { key: "profile", label: "Player" },
    { key: "rating", label: "Rating" },
    { key: "style", label: "Style" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Move Predictor
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Play against an AI that mimics human playing styles
          </p>
        </div>

        {/* Main card */}
        <div className="bg-gray-900/80 border border-gray-800/60 rounded-2xl overflow-hidden">
          {/* Color + Settings row */}
          <div className="px-5 pt-4 pb-3 border-b border-gray-800/50">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                  Play as
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setPlayerColor("w")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                      playerColor === "w"
                        ? "bg-gray-800 text-white ring-1 ring-gray-600/60"
                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/40"
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-sm bg-gray-100 border border-gray-300" />
                    White
                  </button>
                  <button
                    onClick={() => setPlayerColor("b")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                      playerColor === "b"
                        ? "bg-gray-800 text-white ring-1 ring-gray-600/60"
                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/40"
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-sm bg-gray-600 border border-gray-500" />
                    Black
                  </button>
                </div>
              </div>

              {/* Eval bar toggle */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                  Eval bar
                </p>
                <button
                  onClick={() => setShowEvalBar(!showEvalBar)}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                    showEvalBar
                      ? "bg-gray-800 text-white ring-1 ring-gray-600/60"
                      : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/40"
                  }`}
                >
                  {showEvalBar ? "On" : "Off"}
                </button>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-gray-800/50 px-1 pt-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 px-3 py-2.5 text-xs font-medium transition-all relative rounded-t-lg ${
                  activeTab === tab.key
                    ? "text-white bg-gray-800/40"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-blue-500 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="px-5 py-4">
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
          <div className="px-5 pb-5">
            <button
              onClick={handleStart}
              disabled={activeTab === "profile" && !opponent && !opponentLoading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700
                         disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed
                         rounded-xl text-sm font-semibold text-white transition-colors"
            >
              Start Game
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-600 mt-5">
          Opponent moves are predicted automatically after each of your moves.
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
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Search for a real player and play against their style
      </p>

      <div className="flex gap-1.5">
        {(["lichess", "chesscom"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
              source === s
                ? "bg-gray-800 text-white ring-1 ring-gray-600/60"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/40"
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
          className="flex-1 px-3.5 py-2 bg-gray-800/40 border border-gray-700/50 rounded-lg text-sm
                     text-white placeholder-gray-600 focus:border-blue-500/50 focus:outline-none
                     focus:ring-1 focus:ring-blue-500/20 transition-all"
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
        />
        <button
          onClick={onSearch}
          disabled={loading || !username.trim()}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/50
                     disabled:text-gray-600 disabled:cursor-not-allowed rounded-lg text-xs
                     font-medium text-white transition-colors"
        >
          {loading ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border-[1.5px] border-white/20 border-t-white rounded-full animate-spin" />
              ...
            </span>
          ) : (
            "Search"
          )}
        </button>
      </div>

      {error && (
        <div className="px-3 py-2.5 bg-red-500/5 border border-red-500/15 rounded-lg">
          <p className="text-xs text-red-400/80">
            {error.includes("500") || error.includes("ECONNREFUSED")
              ? "Could not reach the analysis service. Make sure the ML backend is running."
              : error}
          </p>
        </div>
      )}

      {opponent && (
        <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">
                {opponent.username}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {opponent.numGames} games
              </p>
            </div>
            <span className="text-sm font-mono font-semibold text-gray-300 bg-gray-700/40 px-2.5 py-1 rounded-lg">
              {opponent.rating.toFixed(0)}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {[
              { label: "AGG", value: opponent.styleSummary.aggression, color: "text-red-400" },
              { label: "TAC", value: opponent.styleSummary.tactical, color: "text-orange-400" },
              { label: "ACC", value: opponent.styleSummary.accuracy, color: "text-green-400" },
              { label: "CON", value: opponent.styleSummary.consistency, color: "text-blue-400" },
              { label: "VAR", value: opponent.styleSummary.opening_diversity, color: "text-purple-400" },
            ].map((stat) => (
              <div key={stat.label} className="text-center py-1.5 bg-gray-800/30 rounded-lg">
                <p className={`text-sm font-semibold font-mono ${stat.color}`}>
                  {stat.value}
                </p>
                <p className="text-[9px] text-gray-500 mt-0.5">{stat.label}</p>
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
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Set an opponent rating to simulate skill level
      </p>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <label className="text-xs text-gray-400">Opponent Rating</label>
          <span className="text-xl font-mono font-bold text-white tabular-nums">
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
        <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
          <span>400</span>
          <span>3000</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {presets.map((r) => (
          <button
            key={r}
            onClick={() => setRating(r)}
            className={`py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              rating === r
                ? "bg-blue-600/15 text-blue-400 ring-1 ring-blue-500/25"
                : "bg-gray-800/40 text-gray-500 hover:bg-gray-800/70 hover:text-gray-300"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-gray-500 leading-relaxed bg-gray-800/20 rounded-lg px-3 py-2">
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
  }[] = [
    { key: "aggression", label: "Aggression", low: "Passive", high: "Aggressive" },
    { key: "risk_taking", label: "Risk Taking", low: "Safe", high: "Risky" },
    { key: "blunder_frequency", label: "Blunder Rate", low: "Accurate", high: "Blunder-prone" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Fine-tune playing style parameters</p>
        <button
          onClick={resetStyleOverrides}
          className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
        >
          Reset
        </button>
      </div>

      {sliders.map(({ key, label, low, high }) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-300">{label}</label>
            <span className="text-xs font-mono font-semibold text-white tabular-nums">
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
          <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
            <span>{low}</span>
            <span>{high}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
