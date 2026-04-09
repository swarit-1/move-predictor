import { useState, useEffect, useCallback } from "react";
import { Chessboard } from "react-chessboard";
import { useReplayStore } from "../../store/replayStore";
import { famousGames, type FamousGame } from "../../data/famousGames";
import { predictMove } from "../../api/client";
import type { Square } from "react-chessboard/dist/chessboard/types";

interface Props {
  onBack: () => void;
}

export function ReplayScreen({ onBack }: Props) {
  const store = useReplayStore();
  const [boardSize, setBoardSize] = useState(560);

  useEffect(() => {
    function updateSize() {
      const available = Math.min(window.innerWidth - 64, 560);
      setBoardSize(Math.max(320, available));
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") store.stepForward();
      else if (e.key === "ArrowLeft") store.stepBackward();
      else if (e.key === "Home") store.goToStart();
      else if (e.key === "End") store.goToEnd();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [store]);

  // AI move in fork mode
  const fetchAiMove = useCallback(async () => {
    const { chess, aiColor, forked } = useReplayStore.getState();
    if (!forked || !aiColor) return;
    const turn = chess.turn();
    if (turn !== aiColor || chess.isGameOver()) return;

    store.setLoading(true);
    try {
      const resp = await predictMove({
        fen: chess.fen(),
        move_history: [],
        player_rating: 2000,
      });
      store.applyAiMove(resp.move);
    } catch {
      // Prediction failed — user can retry
    } finally {
      store.setLoading(false);
    }
  }, [store]);

  // Auto-fetch AI move when it's AI's turn in fork mode
  useEffect(() => {
    const { forked, aiColor, chess, isLoading } = store;
    if (!forked || !aiColor || isLoading || chess.isGameOver()) return;
    if (chess.turn() === aiColor) {
      const timer = setTimeout(fetchAiMove, 400);
      return () => clearTimeout(timer);
    }
  }, [store.fen, store.forked, store.aiColor, store.isLoading, fetchAiMove]);

  // Game selection screen
  if (!store.game) {
    return <GameSelector onSelect={store.loadGame} onBack={onBack} />;
  }

  const { game, originalMoves, moveIndex, forked, forkMoves, forkPoint, aiColor, isLoading, fen } = store;

  // Build move list for display
  const displayMoves = forked
    ? [...originalMoves.slice(0, forkPoint), ...forkMoves]
    : originalMoves;
  const currentMoveCount = forked ? forkPoint + forkMoves.length : moveIndex;

  const handlePieceDrop = (src: string, tgt: string, piece: string) => {
    if (!forked) return false;
    const turn = store.chess.turn();
    if (turn === aiColor) return false; // Not player's turn
    const promotion = piece[1] === "P" &&
      ((piece[0] === "w" && tgt[1] === "8") || (piece[0] === "b" && tgt[1] === "1"))
      ? "q" : undefined;
    return store.makeForkMove(src, tgt, promotion);
  };

  // Arrows for original game line
  const arrows: [Square, Square, string][] = [];
  if (!forked && moveIndex < originalMoves.length) {
    // Show next move as a hint arrow
    const tempChess = store.chess;
    try {
      const nextMove = tempChess.move(originalMoves[moveIndex]);
      if (nextMove) {
        arrows.push([nextMove.from as Square, nextMove.to as Square, "rgba(201, 168, 76, 0.4)"]);
        tempChess.undo();
      }
    } catch {
      // Can't preview
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] text-paper flex flex-col">
      {/* Sub-header */}
      <header className="border-b border-edge bg-walnut-900/85 backdrop-blur-md flex-shrink-0 sticky top-16 z-20">
        <div className="ed-shell h-14 flex items-center justify-between">
          <button
            onClick={() => { store.reset(); onBack(); }}
            className="flex items-center gap-2 text-[12px] tracking-eyebrow uppercase text-walnut-300 hover:text-paper transition-colors group"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="text-center">
            <p className="font-serif text-[18px] text-paper leading-none">{game.title}</p>
            <p className="text-[10px] tracking-eyebrow uppercase text-walnut-300 mt-1">{game.white} vs {game.black} · {game.year}</p>
          </div>

          <div className="w-20" />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center pt-5 sm:pt-8 pb-16 px-2 sm:px-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-center lg:items-start w-full max-w-[1280px]">
          {/* Board */}
          <div className="flex-shrink-0" style={{ width: boardSize }}>
            {/* Turn indicator */}
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className="text-xs text-zinc-400 font-medium">{game.black} (Black)</span>
              {isLoading && (
                <span className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="w-3 h-3 border-[1.5px] border-gold/30 border-t-gold rounded-full animate-spin" />
                  <span className="font-light">AI thinking</span>
                </span>
              )}
            </div>

            <div className="rounded-lg shadow-lift ring-1 ring-edge">
              <Chessboard
                position={fen}
                onPieceDrop={handlePieceDrop}
                customArrows={arrows}
                boardWidth={boardSize}
                boardOrientation="white"
                animationDuration={200}
                arePiecesDraggable={forked && store.chess.turn() !== aiColor}
                customBoardStyle={{ borderRadius: "8px" }}
                customDarkSquareStyle={{ backgroundColor: "#779952" }}
                customLightSquareStyle={{ backgroundColor: "#edeed1" }}
              />
            </div>

            <div className="flex items-center justify-between mt-2 px-0.5">
              <span className="text-xs text-zinc-200 font-medium">{game.white} (White)</span>
              {store.chess.isGameOver() && (
                <span className="text-xs text-zinc-500 font-medium bg-white/[0.04] px-2.5 py-0.5 rounded-md">
                  Game over
                </span>
              )}
            </div>

            {/* Navigation controls */}
            {!forked && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <NavButton onClick={store.goToStart} disabled={moveIndex === 0} title="Start">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L4.5 12l7.5-7.5" />
                </NavButton>
                <NavButton onClick={store.stepBackward} disabled={moveIndex === 0} title="Back">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 19.5L8.25 12l7.5-7.5" />
                </NavButton>
                <NavButton onClick={store.stepForward} disabled={moveIndex >= originalMoves.length} title="Forward">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </NavButton>
                <NavButton onClick={store.goToEnd} disabled={moveIndex >= originalMoves.length} title="End">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 4.5l7.5 7.5-7.5 7.5m6-15l7.5 7.5-7.5 7.5" />
                </NavButton>
              </div>
            )}

            {/* Fork controls */}
            {!forked && moveIndex > 0 && (
              <div className="flex items-center justify-center gap-2 mt-3">
                <button
                  onClick={() => store.fork("b")}
                  className="text-xs px-3 py-1.5 rounded-lg text-gold bg-gold-dim hover:bg-gold/[0.15] transition-colors"
                >
                  Fork — AI plays Black
                </button>
                <button
                  onClick={() => store.fork("w")}
                  className="text-xs px-3 py-1.5 rounded-lg text-gold bg-gold-dim hover:bg-gold/[0.15] transition-colors"
                >
                  Fork — AI plays White
                </button>
              </div>
            )}

            {forked && (
              <div className="flex items-center justify-center gap-3 mt-3">
                <span className="text-[10px] text-human font-medium bg-human/[0.08] px-2 py-0.5 rounded-md">
                  Forked at move {forkPoint}
                </span>
                <button
                  onClick={store.cancelFork}
                  className="text-xs px-3 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                >
                  Return to original
                </button>
              </div>
            )}
          </div>

          {/* Sidebar — move list + game info */}
          <div className="w-full lg:w-[340px] space-y-3 flex-shrink-0 animate-slide-in-right">
            {/* Game info */}
            <div className="ed-card p-5">
              <p className="eyebrow mb-3">About this game</p>
              <p className="text-[13px] text-walnut-300 leading-relaxed">{game.description}</p>
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-edge text-[10px] tracking-eyebrow uppercase text-walnut-400">
                <span>{game.event}, {game.year}</span>
                <span>Result · {game.result}</span>
              </div>
            </div>

            {/* Move list */}
            <div className="ed-card p-5">
              <p className="eyebrow mb-3">Moves</p>
              <div className="max-h-[400px] overflow-y-auto space-y-0.5 text-xs font-mono">
                {Array.from({ length: Math.ceil(displayMoves.length / 2) }, (_, i) => {
                  const whiteIdx = i * 2;
                  const blackIdx = i * 2 + 1;
                  const moveNum = i + 1;
                  return (
                    <div key={i} className="flex items-center gap-1">
                      <span className="w-6 text-zinc-600 text-right flex-shrink-0">{moveNum}.</span>
                      <MoveButton
                        move={displayMoves[whiteIdx]}
                        isActive={currentMoveCount === whiteIdx + 1}
                        isFork={forked && whiteIdx >= forkPoint}
                        onClick={() => !forked && store.goToMove(whiteIdx + 1)}
                        disabled={forked}
                      />
                      {displayMoves[blackIdx] && (
                        <MoveButton
                          move={displayMoves[blackIdx]}
                          isActive={currentMoveCount === blackIdx + 1}
                          isFork={forked && blackIdx >= forkPoint}
                          onClick={() => !forked && store.goToMove(blackIdx + 1)}
                          disabled={forked}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Game selector grid */
function GameSelector({ onSelect, onBack }: { onSelect: (g: FamousGame) => void; onBack: () => void }) {
  return (
    <div className="min-h-[calc(100vh-64px)] ed-shell pt-block pb-section animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[12px] tracking-eyebrow uppercase text-walnut-300 hover:text-paper transition-colors mb-block group"
      >
        <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        <span>Back</span>
      </button>

      <div className="border-b border-edge pb-block mb-block">
        <div className="eyebrow mb-3">Replay</div>
        <h1 className="font-serif text-hero text-paper">A library of famous games.</h1>
        <p className="text-walnut-300 text-[15px] mt-4 max-w-xl">
          Step through iconic games move by move. Fork at any point and let the
          model take over either side.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {famousGames.map((game) => (
          <button
            key={game.id}
            onClick={() => onSelect(game)}
            className="text-left ed-card hover:border-edgeStrong hover:bg-walnut-700/40 transition-colors p-6 group"
          >
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h3 className="font-serif text-[20px] text-paper leading-tight group-hover:text-gold transition-colors">
                {game.title}
              </h3>
              <span className="text-[10px] tracking-eyebrow uppercase text-walnut-300 font-mono shrink-0">
                {game.result}
              </span>
            </div>
            <p className="text-[12px] tracking-eyebrow uppercase text-walnut-400 mb-3">
              {game.white} vs {game.black} · {game.event}, {game.year}
            </p>
            <p className="text-[13px] text-walnut-300 leading-relaxed line-clamp-3">
              {game.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Small navigation button */
function NavButton({ onClick, disabled, title, children }: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] disabled:text-zinc-700 disabled:hover:bg-transparent transition-all"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {children}
      </svg>
    </button>
  );
}

/** Move button in the move list */
function MoveButton({ move, isActive, isFork, onClick, disabled }: {
  move: string;
  isActive: boolean;
  isFork: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
        isActive
          ? "bg-gold-dim text-gold font-semibold"
          : isFork
            ? "text-human/70 hover:text-human"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
      } ${disabled ? "cursor-default" : "cursor-pointer"}`}
    >
      {move}
    </button>
  );
}
