import { useCallback, useState } from "react";
import { usePlayerStore, PlayerProfile } from "../store/playerStore";
import { buildPlayerProfile } from "../api/client";

export function usePlayerProfile() {
  const { opponent, opponentLoading, setOpponent, setOpponentLoading } =
    usePlayerStore();
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(
    async (source: "lichess" | "chesscom", username: string) => {
      setOpponentLoading(true);
      setError(null);

      try {
        const response = await buildPlayerProfile(source, username);

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
