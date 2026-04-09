import { useState, useCallback, useEffect } from "react";
import { WelcomeScreen } from "./components/Welcome/WelcomeScreen";
import { SetupScreen } from "./components/Setup/SetupScreen";
import { GameScreen } from "./components/Game/GameScreen";
import { ReplayScreen } from "./components/Replay/ReplayScreen";
import { PracticeScreen } from "./components/Practice/PracticeScreen";
import { ReviewScreen } from "./components/Review/ReviewScreen";
import { AuthScreen } from "./components/Auth/AuthScreen";
import { HistoryScreen } from "./components/History/HistoryScreen";
import { AppHeader } from "./components/common/AppHeader";
import { useGameStore } from "./store/gameStore";
import { useReviewStore } from "./store/reviewStore";
import { useAuthStore } from "./store/authStore";
import { useSavedGamesStore, type SavedGame } from "./store/savedGamesStore";
import { usePlayerStore } from "./store/playerStore";

type AppPhase =
  | "welcome"
  | "setup"
  | "playing"
  | "replay"
  | "practice"
  | "review"
  | "auth"
  | "history";

export default function App() {
  const [phase, setPhase] = useState<AppPhase>("welcome");
  const [postAuthPhase, setPostAuthPhase] = useState<AppPhase | null>(null);

  const resetGame = useGameStore((s) => s.resetGame);
  const setGameData = useReviewStore((s) => s.setGameData);
  const resetReview = useReviewStore((s) => s.resetReview);
  const loadPgn = useGameStore((s) => s.loadPgn);

  const hydrate = useAuthStore((s) => s.hydrate);
  const user = useAuthStore((s) => s.user);
  const saveOne = useSavedGamesStore((s) => s.saveOne);

  // Hydrate auth on boot
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handlePlay = useCallback(() => setPhase("setup"), []);
  const handleReplay = useCallback(() => setPhase("replay"), []);
  const handlePractice = useCallback(() => setPhase("practice"), []);
  const handleHistory = useCallback(() => {
    if (!user) {
      setPostAuthPhase("history");
      setPhase("auth");
    } else {
      setPhase("history");
    }
  }, [user]);
  const handleAuth = useCallback(() => {
    setPostAuthPhase(null);
    setPhase("auth");
  }, []);

  const handleStart = useCallback(() => {
    resetGame();
    setPhase("playing");
  }, [resetGame]);

  const handleBackToWelcome = useCallback(() => setPhase("welcome"), []);

  const handleReview = useCallback(() => {
    const { moveHistory, playerColor } = useGameStore.getState();
    resetReview();
    setGameData(moveHistory, playerColor);
    setPhase("review");
  }, [resetReview, setGameData]);

  // Save the just-finished game from the GameOverModal
  const handleSaveCurrentGame = useCallback(async () => {
    if (!user) {
      setPostAuthPhase("playing");
      setPhase("auth");
      return;
    }
    const g = useGameStore.getState();
    const opponent = usePlayerStore.getState().opponent;
    let result: string | null = null;
    if (g.flagGameOver) {
      result =
        g.flagGameOver.winner === "draw"
          ? "1/2-1/2"
          : (g.flagGameOver.winner === "player") === (g.playerColor === "w")
            ? "1-0"
            : "0-1";
    } else if (g.chess.isCheckmate()) {
      result = g.chess.turn() === "w" ? "0-1" : "1-0";
    } else if (g.chess.isGameOver()) {
      result = "1/2-1/2";
    }
    let endReason: string | null = null;
    if (g.flagGameOver) endReason = "flag";
    else if (g.chess.isCheckmate()) endReason = "checkmate";
    else if (g.chess.isStalemate()) endReason = "stalemate";
    else if (g.chess.isDraw()) endReason = "draw";

    const tc = g.timeControl
      ? `${g.timeControl.initial}+${g.timeControl.increment}`
      : null;

    const source =
      opponent?.source === "lichess" || opponent?.source === "chesscom"
        ? (opponent.source as "lichess" | "chesscom")
        : null;

    await saveOne({
      pgn: g.pgn,
      finalFen: g.fen,
      playerColor: g.playerColor,
      opponentName: opponent?.username ?? null,
      opponentRating: opponent?.rating ?? null,
      opponentSource: source,
      result,
      numMoves: g.moveHistory.length,
      timeControl: tc,
      endReason,
    });
  }, [user, saveOne]);

  // Open a saved game from history → load into review pipeline
  const handleOpenSavedGame = useCallback(
    (g: SavedGame) => {
      loadPgn(g.pgn);
      const moves = useGameStore.getState().moveHistory;
      resetReview();
      setGameData(moves, g.playerColor);
      setPhase("review");
    },
    [loadPgn, resetReview, setGameData]
  );

  const handleAuthSuccess = useCallback(() => {
    const target = postAuthPhase ?? "welcome";
    setPostAuthPhase(null);
    setPhase(target);
  }, [postAuthPhase]);

  const handleNavigate = useCallback(
    (target: "welcome" | "history" | "auth") => {
      if (target === "history") return handleHistory();
      if (target === "auth") return handleAuth();
      setPhase("welcome");
    },
    [handleHistory, handleAuth]
  );

  const showHeader = phase !== "welcome" && phase !== "auth";

  let content: React.ReactNode;
  if (phase === "welcome") {
    content = (
      <WelcomeScreen
        onPlay={handlePlay}
        onReplay={handleReplay}
        onPractice={handlePractice}
        onHistory={handleHistory}
        onAuth={handleAuth}
      />
    );
  } else if (phase === "setup") {
    content = <SetupScreen onStart={handleStart} onBack={handleBackToWelcome} />;
  } else if (phase === "replay") {
    content = <ReplayScreen onBack={handleBackToWelcome} />;
  } else if (phase === "practice") {
    content = (
      <PracticeScreen
        onStartGame={() => setPhase("playing")}
        onBack={handleBackToWelcome}
      />
    );
  } else if (phase === "review") {
    content = <ReviewScreen onBack={handleBackToWelcome} />;
  } else if (phase === "auth") {
    content = (
      <AuthScreen onSuccess={handleAuthSuccess} onCancel={handleBackToWelcome} />
    );
  } else if (phase === "history") {
    content = (
      <HistoryScreen
        onOpenGame={handleOpenSavedGame}
        onBack={handleBackToWelcome}
      />
    );
  } else {
    content = (
      <GameScreen
        onBack={handleBackToWelcome}
        onReview={handleReview}
        onSave={handleSaveCurrentGame}
      />
    );
  }

  return (
    <>
      {showHeader && (
        <AppHeader currentPhase={phase} onNavigate={handleNavigate} />
      )}
      {content}
    </>
  );
}
