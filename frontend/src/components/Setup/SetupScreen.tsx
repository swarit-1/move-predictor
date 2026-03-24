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

  const tabs: { key: OpponentTab; label: string; desc: string }[] = [
    {
      key: "profile",
      label: "Player Profile",
      desc: "Search for a real player and play against their style",
    },
    {
      key: "rating",
      label: "By Rating",
      desc: "Set an opponent rating to simulate skill level",
    },
    {
      key: "style",
      label: "Custom Style",
      desc: "Fine-tune aggression, risk, and blunder tendencies",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Move Predictor
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Play against an AI that mimics real human playing styles
          </p>
        </div>

        {/* Main card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {/* Color picker */}
          <div className="px-6 pt-5 pb-4 border-b border-gray-800">
            <p className="text-xs text-gray-500 mb-3">Play as</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPlayerColor("w")}
                className={`flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-medium transition-all ${
                  playerColor === "w"
                    ? "bg-gray-800 text-white ring-1 ring-gray-600"
                    : "bg-gray-800/30 text-gray-500 hover:text-gray-300"
                }`}
              >
                <span className="w-5 h-5 rounded bg-gray-100 border border-gray-300" />
                White
              </button>
              <button
                onClick={() => setPlayerColor("b")}
                className={`flex-1 flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-medium transition-all ${
                  playerColor === "b"
                    ? "bg-gray-800 text-white ring-1 ring-gray-600"
                    : "bg-gray-800/30 text-gray-500 hover:text-gray-300"
                }`}
              >
                <span className="w-5 h-5 rounded bg-gray-700 border border-gray-600" />
                Black
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-gray-800">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 px-4 py-3.5 text-sm font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? "text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                )}
              </button>
            ))}
          </div>

          {/* Tab description */}
          <div className="px-6 pt-5 pb-2">
            <p className="text-xs text-gray-500">
              {tabs.find((t) => t.key === activeTab)?.desc}
            </p>
          </div>

          {/* Tab content */}
          <div className="px-6 pb-6">
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
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700
                         disabled:text-gray-500 disabled:cursor-not-allowed rounded-xl
                         text-sm font-semibold text-white transition-colors"
            >
              Start Game
            </button>
          </div>
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs text-gray-600 mt-6">
          The model predicts the opponent's moves automatically after each of your moves.
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
    <div className="space-y-4 mt-3">
      <div className="flex gap-2">
        {(["lichess", "chesscom"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
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
          className="flex-1 px-4 py-2.5 bg-gray-800/50 border border-gray-700 rounded-lg text-sm
                     text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none
                     focus:ring-1 focus:ring-blue-500/30 transition-colors"
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
        />
        <button
          onClick={onSearch}
          disabled={loading || !username.trim()}
          className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800
                     disabled:text-gray-600 disabled:cursor-not-allowed rounded-lg text-sm
                     font-medium text-white transition-colors"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Searching
            </span>
          ) : (
            "Search"
          )}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">
            {error.includes("500") || error.includes("ECONNREFUSED")
              ? "Could not reach the analysis service. Make sure the ML backend is running."
              : error}
          </p>
        </div>
      )}

      {opponent && (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">
                {opponent.username}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {opponent.numGames} games analyzed
              </p>
            </div>
            <span className="text-sm font-mono font-semibold text-gray-300 bg-gray-700/50 px-3 py-1 rounded-lg">
              {opponent.rating.toFixed(0)}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {[
              { label: "AGG", value: opponent.styleSummary.aggression, color: "text-red-400" },
              { label: "TAC", value: opponent.styleSummary.tactical, color: "text-orange-400" },
              { label: "ACC", value: opponent.styleSummary.accuracy, color: "text-green-400" },
              { label: "CON", value: opponent.styleSummary.consistency, color: "text-blue-400" },
              { label: "VAR", value: opponent.styleSummary.opening_diversity, color: "text-purple-400" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className={`text-sm font-semibold font-mono ${stat.color}`}>
                  {stat.value}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">{stat.label}</p>
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

  return (
    <div className="space-y-5 mt-3">
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm text-gray-400">Opponent Rating</label>
          <span className="text-lg font-mono font-semibold text-white">
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
        <div className="flex justify-between text-[10px] text-gray-600 mt-1">
          <span>400</span>
          <span>3000</span>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Quick select</p>
        <div className="grid grid-cols-4 gap-2">
          {presets.map((r) => (
            <button
              key={r}
              onClick={() => setRating(r)}
              className={`py-2 rounded-lg text-sm font-mono font-medium transition-colors ${
                rating === r
                  ? "bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/30"
                  : "bg-gray-800/50 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-800/30 rounded-lg px-4 py-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          {rating < 1000
            ? "Beginner level — expect frequent blunders and missed tactics."
            : rating < 1500
            ? "Intermediate — reasonable moves with occasional mistakes."
            : rating < 2000
            ? "Advanced — strong positional play with tactical awareness."
            : rating < 2400
            ? "Expert — highly accurate with deep understanding."
            : "Master level — near-optimal play in most positions."}
        </p>
      </div>
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
    {
      key: "aggression",
      label: "Aggression",
      low: "Passive",
      high: "Aggressive",
    },
    {
      key: "risk_taking",
      label: "Risk Taking",
      low: "Safe",
      high: "Risky",
    },
    {
      key: "blunder_frequency",
      label: "Blunder Frequency",
      low: "Accurate",
      high: "Blunder-prone",
    },
  ];

  return (
    <div className="space-y-5 mt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Adjust playing style parameters</p>
        <button
          onClick={resetStyleOverrides}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          Reset to defaults
        </button>
      </div>

      {sliders.map(({ key, label, low, high }) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm text-gray-300">{label}</label>
            <span className="text-sm font-mono font-semibold text-white">
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
          <div className="flex justify-between text-[10px] text-gray-600 mt-1">
            <span>{low}</span>
            <span>{high}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
