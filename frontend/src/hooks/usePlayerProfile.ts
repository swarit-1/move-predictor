import { useCallback, useState } from "react";
import { usePlayerStore, PlayerProfile } from "../store/playerStore";
import { buildPlayerProfile } from "../api/client";

/**
 * Hook for fetching and managing player profiles.
 */
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
          };
          setOpponent(profile);
        } else {
          setError(response.error || "Failed to fetch profile");
        }
      } catch (err: any) {
        setError(err.response?.data?.error || err.message);
        setOpponent(null);
      } finally {
        setOpponentLoading(false);
      }
    },
    [setOpponent, setOpponentLoading]
  );

  return { opponent, opponentLoading, error, fetchProfile };
}
