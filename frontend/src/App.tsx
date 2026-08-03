import { useState, useCallback, useEffect } from "react";
import { WelcomeScreen } from "./components/Welcome/WelcomeScreen";
import { SetupScreen } from "./components/Setup/SetupScreen";
import { GameScreen } from "./components/Game/GameScreen";
import { ReplayScreen } from "./components/Replay/ReplayScreen";
import { PracticeScreen } from "./components/Practice/PracticeScreen";
import { ReviewScreen } from "./components/Review/ReviewScreen";
import { AuthScreen } from "./components/Auth/AuthScreen";
import { VerifyEmailScreen } from "./components/Auth/VerifyEmailScreen";
import { ResetPasswordScreen } from "./components/Auth/ResetPasswordScreen";
import { AccountScreen } from "./components/Auth/AccountScreen";
import { HistoryScreen } from "./components/History/HistoryScreen";
import { CoachScreen } from "./components/Coach/CoachScreen";
import { AppHeader } from "./components/common/AppHeader";
import { useGameStore } from "./store/gameStore";
import { useReviewStore } from "./store/reviewStore";
import { useAuthStore } from "./store/authStore";
import { useSavedGamesStore, type SavedGame } from "./store/savedGamesStore";
import { usePlayerStore } from "./store/playerStore";
import { usePlayerProfile, usePrimePersistedOpponent } from "./hooks/usePlayerProfile";

type AppPhase =
  | "welcome"
  | "setup"
  | "playing"
  | "replay"
  | "practice"
  | "review"
  | "auth"
  | "history"
  | "coach"
  | "account"
  | "verify-email"
  | "reset-password";

// PLAN.md §6.1: the app is an SPA with no router, but the verification and
// reset emails link to /verify-email?token=… and /reset-password?token=…
// (both fall through to index.html via the vite dev server / nginx
// try_files). Read the landing intent exactly once at module load, then
// scrub the token from the URL so it never lingers in the address bar or
// browser history.
interface AuthLanding {
  flow: "verify-email" | "reset-password";
  token: string;
}

function readAuthLanding(): AuthLanding | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (!token) return null;
  const path = window.location.pathname.replace(/\/+$/, "");
  const flowParam = params.get("flow");
  let flow: AuthLanding["flow"] | null = null;
  if (path.endsWith("/verify-email") || flowParam === "verify-email") {
    flow = "verify-email";
  } else if (path.endsWith("/reset-password") || flowParam === "reset-password") {
    flow = "reset-password";
  }
  if (!flow) return null;
  window.history.replaceState({}, "", "/");
  return { flow, token };
}

const authLanding = readAuthLanding();

export default function App() {
  const [phase, setPhase] = useState<AppPhase>(authLanding?.flow ?? "welcome");
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

  // PRD §6.1: if a persisted opponent exists but the ML cache lost it
  // (service restart, Redis flushed), silently rebuild the profile so the
  // first prediction after refresh has full stats + opening book.
  usePrimePersistedOpponent();

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
  const handleCoach = useCallback(() => {
    if (!user) {
      setPostAuthPhase("coach");
      setPhase("auth");
    } else {
      setPhase("coach");
    }
  }, [user]);
  const handleAuth = useCallback(() => {
    setPostAuthPhase(null);
    setPhase("auth");
  }, []);
  // PLAN.md §6.1: account & security panel — sign-in required.
  const handleAccount = useCallback(() => {
    if (!user) {
      setPostAuthPhase("account");
      setPhase("auth");
    } else {
      setPhase("account");
    }
  }, [user]);

  const handleStart = useCallback(() => {
    resetGame();
    setPhase("playing");
  }, [resetGame]);

  // PRD §5.6: "Play yourself" — uses the user's linked Lichess /
  // Chess.com identity, fetches their own profile, then enters the
  // game screen against their own clone. If the build fails for any
  // reason we fall through to the regular setup screen.
  const { fetchProfile } = usePlayerProfile();
  const handlePlayYourself = useCallback(async () => {
    if (!user) {
      setPostAuthPhase("playing");
      setPhase("auth");
      return;
    }
    const src = user.linkedChessSource;
    const uname = user.linkedChessUsername;
    if (!src || !uname) return;
    resetGame();
    await fetchProfile(src, uname, null);
    setPhase("playing");
  }, [user, fetchProfile, resetGame]);

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
    (target: "welcome" | "history" | "auth" | "account") => {
      if (target === "history") return handleHistory();
      if (target === "auth") return handleAuth();
      if (target === "account") return handleAccount();
      setPhase("welcome");
    },
    [handleHistory, handleAuth, handleAccount]
  );

  const showHeader =
    phase !== "welcome" &&
    phase !== "auth" &&
    phase !== "verify-email" &&
    phase !== "reset-password";

  let content: React.ReactNode;
  if (phase === "welcome") {
    content = (
      <WelcomeScreen
        onPlay={handlePlay}
        onReplay={handleReplay}
        onPractice={handlePractice}
        onHistory={handleHistory}
        onAuth={handleAuth}
        onPlayYourself={handlePlayYourself}
        onCoach={handleCoach}
        onAccount={handleAccount}
      />
    );
  } else if (phase === "verify-email") {
    content = (
      <VerifyEmailScreen
        token={authLanding?.token ?? ""}
        onContinue={handleBackToWelcome}
      />
    );
  } else if (phase === "reset-password") {
    content = (
      <ResetPasswordScreen
        token={authLanding?.token ?? ""}
        onDone={handleAuth}
        onCancel={handleBackToWelcome}
      />
    );
  } else if (phase === "account") {
    content = (
      <AccountScreen
        onBack={handleBackToWelcome}
        onSignedOut={handleBackToWelcome}
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
  } else if (phase === "coach") {
    content = <CoachScreen onBack={handleBackToWelcome} />;
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
