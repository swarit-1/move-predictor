/**
 * Game import service — fetches games from external sources.
 *
 * Delegates the actual fetching to the ML service, which has the
 * Python clients for Lichess/Chess.com APIs.
 */

import { mlClient } from "./mlClient";
import { logger } from "../config";

export interface ImportResult {
  username: string;
  source: string;
  gamesImported: number;
  playerProfile: any;
}

export async function importPlayerGames(
  source: "lichess" | "chesscom",
  username: string,
  maxGames: number = 200
): Promise<ImportResult> {
  logger.info(`Importing games for ${username} from ${source}`, { maxGames });

  // Build player profile (which also fetches games)
  const profile = await mlClient.buildPlayerProfile({
    source,
    username,
    max_games: maxGames,
  });

  return {
    username: profile.username,
    source: profile.source,
    gamesImported: profile.num_games,
    playerProfile: profile,
  };
}
