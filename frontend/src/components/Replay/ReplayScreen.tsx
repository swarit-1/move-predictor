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
    <div className="min-h-screen bg-surface-0 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-white/[0.04] bg-surface-0/90 flex-shrink-0 sticky top-0 z-20">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => { store.reset(); onBack(); }}
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors duration-200 group"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="hidden sm:inline font-medium">Back</span>
          </button>

          <div className="text-center">
            <p className="text-sm font-semibold text-zinc-200">{game.title}</p>
            <p className="text-[10px] text-zinc-500">{game.white} vs {game.black}, {game.year}</p>
          </div>

          <div className="w-20" /> {/* Spacer for centering */}
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

            <div className="rounded-lg shadow-2xl shadow-black/40 ring-1 ring-white/[0.04]">
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
            <div className="glass-card p-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-medium mb-2">About this game</p>
              <p className="text-xs text-zinc-400 font-light leading-relaxed">{game.description}</p>
              <div className="flex items-center gap-3 mt-3 text-[10px] text-zinc-500">
                <span>{game.event}, {game.year}</span>
                <span>Result: {game.result}</span>
              </div>
            </div>

            {/* Move list */}
            <div className="glass-card p-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-medium mb-3">Moves</p>
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
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl animate-fade-in">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors duration-200 group mb-6"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          <span className="font-medium">Back</span>
        </button>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gradient mb-2">Replay a Famous Game</h1>
          <p className="text-sm text-zinc-500 font-light">
            Step through iconic games move by move. Fork at any point to explore alternatives.
          </p>
        </div>

        <div className="grid gap-3">
          {famousGames.map((game) => (
            <button
              key={game.id}
              onClick={() => onSelect(game)}
              className="w-full glass-card glass-card-hover p-4 text-left group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">
                    {game.title}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {game.white} vs {game.black} — {game.event}, {game.year}
                  </p>
                  <p className="text-xs text-zinc-600 mt-1 font-light leading-relaxed line-clamp-2">
                    {game.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                  <span className="text-[10px] text-zinc-500 bg-white/[0.04] px-2 py-0.5 rounded">{game.result}</span>
                  <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>
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
