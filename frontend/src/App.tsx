import { useState } from "react";
import { ChessBoard } from "./components/Board/ChessBoard";
import { EvalBar } from "./components/Board/EvalBar";
import { PredictionPanel } from "./components/Prediction/PredictionPanel";
import { MoveList } from "./components/Game/MoveList";
import { GameControls } from "./components/Game/GameControls";
import { GameImport } from "./components/Game/GameImport";
import { PlayerSearch } from "./components/Player/PlayerSearch";
import { PlayerProfile } from "./components/Player/PlayerProfile";
import { StyleSliders } from "./components/Player/StyleSliders";
import { Explainability } from "./components/Prediction/Explainability";
import { useGameStore } from "./store/gameStore";

type Tab = "analyze" | "simulate" | "import";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("analyze");
  const mode = useGameStore((s) => s.mode);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">
            <span className="text-blue-400">Move</span> Predictor
          </h1>
          <nav className="flex gap-1">
            {(["analyze", "simulate", "import"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition ${
                  activeTab === tab
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Sidebar */}
          <div className="lg:col-span-3 space-y-4">
            {activeTab === "import" && <GameImport />}
            {(activeTab === "simulate" || activeTab === "analyze") && (
              <>
                <PlayerSearch />
                <PlayerProfile />
                <StyleSliders />
              </>
            )}
          </div>

          {/* Center: Chess Board */}
          <div className="lg:col-span-5">
            <div className="flex items-start gap-2">
              <EvalBar />
              <ChessBoard />
            </div>
            <GameControls />
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-4 space-y-4">
            <PredictionPanel />
            <Explainability />
            <MoveList />
          </div>
        </div>
      </main>
    </div>
  );
}
