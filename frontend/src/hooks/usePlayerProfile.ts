import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayerStore, PlayerProfile } from "../store/playerStore";
import { buildPlayerProfile, checkCachedProfile } from "../api/client";

export function usePlayerProfile() {
  const { opponent, opponentLoading, setOpponent, setOpponentLoading } =
    usePlayerStore();
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(
    async (
      source: "lichess" | "chesscom",
      username: string,
      timeControl?: string | null,
    ) => {
      setOpponentLoading(true);
      setError(null);

      try {
        const response = await buildPlayerProfile(
          source,
          username,
          200,
          timeControl,
        );

        if (response.success) {
          const data = response.data;
          const profile: PlayerProfile = {
            username: data.username,
            source: data.source,
            rating: data.rating,
            numGames: data.num_games,
            styleSummary: data.style_summary,
            playerKey: data.player_key,
            openingBookSize: data.opening_book_size,
            ratingsByTimeControl: data.ratings_by_time_control,
            selectedTimeControl: data.selected_time_control,
            baselineStyle: data.baseline_style,
          };
          setOpponent(profile);
        } else {
          setError(response.error || "Failed to fetch profile");
        }
      } catch (err: any) {
        // Graceful error messages for common failure modes
        const status = err.response?.status;
        const code = err.code;

        if (code === "ECONNREFUSED" || code === "ERR_NETWORK") {
          setError(
            "Could not reach the analysis service. Make sure the ML backend is running."
          );
        } else if (status === 500) {
          setError(
            "The analysis service encountered an error. The ML backend may not be running or the player was not found."
          );
        } else if (status === 404) {
          setError(`Player "${username}" not found on ${source}.`);
        } else if (status === 429) {
          setError("Too many requests. Please wait a moment and try again.");
        } else {
          setError(err.response?.data?.error || err.message);
        }
        setOpponent(null);
      } finally {
        setOpponentLoading(false);
      }
    },
    [setOpponent, setOpponentLoading]
  );

  return { opponent, opponentLoading, error, fetchProfile };
}

/**
 * PRD §6.1: on app boot, re-prime any persisted opponent.
 *
 * The frontend persists the selected opponent in sessionStorage. When the
 * page is refreshed:
 *   1. ML still has it in memory → preflight returns cached=true → noop.
 *   2. ML restarted but Redis still has it → first predict call hydrates
 *      transparently → noop here.
 *   3. ML restarted AND Redis lost it (or never had it) → preflight returns
 *      cached=false → we silently rebuild so the next predict has stats.
 *
 * Runs exactly once per mount.
 */
export function usePrimePersistedOpponent() {
  const opponent = usePlayerStore((s) => s.opponent);
  const setOpponent = usePlayerStore((s) => s.setOpponent);
  const setOpponentLoading = usePlayerStore((s) => s.setOpponentLoading);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const key = opponent?.playerKey;
    if (!key) return;

    let cancelled = false;
    (async () => {
      try {
        const probe = await checkCachedProfile(key);
        if (cancelled) return;
        if (probe?.data?.cached) return; // Already warm

        // Cold — rebuild silently using whatever the user previously chose.
        if (
          opponent &&
          (opponent.source === "lichess" || opponent.source === "chesscom")
        ) {
          setOpponentLoading(true);
          const res = await buildPlayerProfile(
            opponent.source,
            opponent.username,
            200,
            opponent.selectedTimeControl ?? null
          );
          if (cancelled) return;
          if (res?.success) {
            const data = res.data;
            const profile: PlayerProfile = {
              username: data.username,
              source: data.source,
              rating: data.rating,
              numGames: data.num_games,
              styleSummary: data.style_summary,
              playerKey: data.player_key,
              openingBookSize: data.opening_book_size,
              ratingsByTimeControl: data.ratings_by_time_control,
              selectedTimeControl: data.selected_time_control,
              baselineStyle: data.baseline_style,
            };
            setOpponent(profile);
          }
        }
      } catch {
        // Best-effort. If the rebuild fails the explorer fallback at the
        // persisted rating will still produce sensible play.
      } finally {
        if (!cancelled) setOpponentLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [opponent, setOpponent, setOpponentLoading]);
}
