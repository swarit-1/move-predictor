import { useEffect, useCallback, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Square } from "react-chessboard/dist/chessboard/types";
import { reviewGame } from "../../api/client";
import { useReviewStore, CLASSIFICATION_COLORS } from "../../store/reviewStore";
import type { MoveAnnotation, MoveClassification } from "../../store/reviewStore";
import { usePlayerStore } from "../../store/playerStore";
import { ReviewMoveList } from "./ReviewMoveList";
import { AccuracyPanel } from "./AccuracyPanel";
import { MoveDetail } from "./MoveDetail";

interface Props {
  onBack: () => void;
}

export function ReviewScreen({ onBack }: Props) {
  const {
    annotations, whiteAccuracy, blackAccuracy,
    isAnalyzing, analyzeProgress, analyzeError,
    selectedPly, moves, playerColor,
    setReviewData, setAnalyzing, setAnalyzeProgress,
    setAnalyzeError, setSelectedPly,
  } = useReviewStore();

  const opponent = usePlayerStore((s) => s.opponent);
  const containerRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(520);

  // Responsive board sizing
  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        const parentWidth = containerRef.current.parentElement?.clientWidth ?? window.innerWidth;
        const available = Math.min(parentWidth - 32, window.innerWidth - 420);
        setBoardSize(Math.max(320, Math.min(560, available)));
      }
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Run analysis on mount
  useEffect(() => {
    if (moves.length > 0 && annotations.length === 0 && !isAnalyzing) {
      runAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves]);

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalyzeProgress("Analyzing game...");
    setAnalyzeError(null);
    try {
      const response = await reviewGame(moves, 18);
      if (response.success && response.data) {
        setReviewData(
          response.data.annotations,
          response.data.white,
          response.data.black,
        );
        setSelectedPly(0);
      } else {
        setAnalyzeError("Analysis failed. Please try again.");
      }
    } catch (err: any) {
      setAnalyzeError(err?.message || "Analysis failed.");
    } finally {
      setAnalyzing(false);
      setAnalyzeProgress("");
    }
  }

  // Build board FEN for current selected ply
  const getFenAtPly = useCallback((ply: number): string => {
    const chess = new Chess();
    for (let i = 0; i <= ply && i < moves.length; i++) {
      try { chess.move({ from: moves[i].slice(0, 2), to: moves[i].slice(2, 4), promotion: moves[i][4] }); }
      catch { break; }
    }
    return chess.fen();
  }, [moves]);

  const currentFen = selectedPly >= 0 ? getFenAtPly(selectedPly) : new Chess().fen();
  const currentAnnotation: MoveAnnotation | null =
    selectedPly >= 0 && selectedPly < annotations.length ? annotations[selectedPly] : null;

  // Arrows: show played move (green/red) + best move (blue) if different
  const customArrows: [Square, Square, string][] = [];
  if (currentAnnotation) {
    const cls = currentAnnotation.classification as MoveClassification;
    const moveColor = CLASSIFICATION_COLORS[cls] || "#4ADE80";
    const from = currentAnnotation.move_uci.slice(0, 2) as Square;
    const to = currentAnnotation.move_uci.slice(2, 4) as Square;
    customArrows.push([from, to, moveColor + "99"]);

    if (
      currentAnnotation.best_move_uci !== currentAnnotation.move_uci &&
      !currentAnnotation.is_book
    ) {
      const bf = currentAnnotation.best_move_uci.slice(0, 2) as Square;
      const bt = currentAnnotation.best_move_uci.slice(2, 4) as Square;
      customArrows.push([bf, bt, "rgba(91, 141, 239, 0.55)"]);
    }
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedPly(Math.max(-1, selectedPly - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedPly(Math.min(annotations.length - 1, selectedPly + 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setSelectedPly(-1);
      } else if (e.key === "End") {
        e.preventDefault();
        setSelectedPly(annotations.length - 1);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedPly, annotations.length, setSelectedPly]);

  return (
    <div className="min-h-screen bg-surface-0 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-white/[0.04] bg-surface-0/90 flex-shrink-0 sticky top-0 z-20">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors duration-200 group"
          >
            <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="hidden sm:inline font-medium">Back</span>
          </button>
          <h1 className="text-sm font-semibold text-zinc-300">Game Review</h1>
          <div className="w-16" />
        </div>
      </header>

      {/* Loading state */}
      {isAnalyzing && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-fade-in">
          <div className="w-10 h-10 border-2 border-gold/20 border-t-gold rounded-full animate-spin" />
          <p className="text-sm text-zinc-400 font-light">{analyzeProgress || "Analyzing moves..."}</p>
          <p className="text-xs text-zinc-600">This may take 30-60 seconds</p>
        </div>
      )}

      {/* Error state */}
      {analyzeError && !isAnalyzing && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-blunder">{analyzeError}</p>
          <button
            onClick={runAnalysis}
            className="px-5 py-2.5 bg-gold hover:bg-gold-light rounded-xl text-sm font-semibold text-surface-0 transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* Review content */}
      {!isAnalyzing && !analyzeError && annotations.length > 0 && (
        <main className="flex-1 flex items-start justify-center pt-5 sm:pt-8 pb-16 px-2 sm:px-6">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-center lg:items-start w-full max-w-[1280px]">
            {/* Board */}
            <div ref={containerRef} className="flex-shrink-0" style={{ width: boardSize }}>
              {/* Opponent label */}
              <div className="flex items-center gap-2 mb-2 px-0.5">
                <span className="text-xs text-zinc-400 font-medium">
                  {playerColor === "w" ? (opponent?.username ?? "Opponent") : "You"}
                </span>
              </div>

              <div className="rounded-lg shadow-2xl shadow-black/40 ring-1 ring-white/[0.04]">
                <Chessboard
                  position={currentFen}
                  customArrows={customArrows}
                  boardWidth={boardSize}
                  boardOrientation={playerColor === "w" ? "white" : "black"}
                  animationDuration={150}
                  arePiecesDraggable={false}
                  customBoardStyle={{ borderRadius: "8px" }}
                  customDarkSquareStyle={{ backgroundColor: "#779952" }}
                  customLightSquareStyle={{ backgroundColor: "#edeed1" }}
                />
              </div>

              {/* Player label */}
              <div className="flex items-center gap-2 mt-2 px-0.5">
                <span className="text-xs text-zinc-200 font-medium">
                  {playerColor === "w" ? "You" : (opponent?.username ?? "Opponent")}
                </span>
              </div>

              {/* Nav buttons */}
              <div className="flex items-center justify-center gap-1 mt-3">
                {[
                  { label: "<<", action: () => setSelectedPly(-1) },
                  { label: "<", action: () => setSelectedPly(Math.max(-1, selectedPly - 1)) },
                  { label: ">", action: () => setSelectedPly(Math.min(annotations.length - 1, selectedPly + 1)) },
                  { label: ">>", action: () => setSelectedPly(annotations.length - 1) },
                ].map(({ label, action }) => (
                  <button
                    key={label}
                    onClick={action}
                    className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] rounded-lg text-sm font-mono text-zinc-400 hover:text-zinc-200 transition-all"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sidebar */}
            <div className="w-full lg:w-[380px] space-y-3 flex-shrink-0 animate-slide-in-right">
              {/* Accuracy panels */}
              <div className="grid grid-cols-2 gap-3">
                {whiteAccuracy && (
                  <AccuracyPanel
                    label={playerColor === "w" ? "You" : (opponent?.username ?? "Opponent")}
                    accuracy={whiteAccuracy}
                    color="white"
                  />
                )}
                {blackAccuracy && (
                  <AccuracyPanel
                    label={playerColor === "b" ? "You" : (opponent?.username ?? "Opponent")}
                    accuracy={blackAccuracy}
                    color="black"
                  />
                )}
              </div>

              {/* Move detail */}
              {currentAnnotation && (
                <MoveDetail annotation={currentAnnotation} />
              )}

              {/* Move list */}
              <ReviewMoveList
                annotations={annotations}
                selectedPly={selectedPly}
                onSelectPly={setSelectedPly}
              />
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
