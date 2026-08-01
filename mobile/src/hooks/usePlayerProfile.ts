import { useCallback, useState } from "react";
import { usePlayerStore, PlayerProfile } from "../store/playerStore";
import { buildPlayerProfile } from "../api/client";

export function usePlayerProfile() {
  const opponent = usePlayerStore((s) => s.opponent);
  const opponentLoading = usePlayerStore((s) => s.opponentLoading);
  const setOpponent = usePlayerStore((s) => s.setOpponent);
  const setOpponentLoading = usePlayerStore((s) => s.setOpponentLoading);
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
        const response = await buildPlayerProfile(source, username, 200, timeControl);
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
        const status = err.response?.status;
        if (status === 404) {
          setError(`Player "${username}" not found on ${source}.`);
        } else if (status === 429) {
          setError("Too many requests. Please wait.");
        } else {
          setError(err?.message || "Failed to fetch profile");
        }
        setOpponent(null);
      } finally {
        setOpponentLoading(false);
      }
    },
    [setOpponent, setOpponentLoading],
  );

  return { opponent, opponentLoading, error, fetchProfile };
}
