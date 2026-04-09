import { useEffect } from "react";
import { useSavedGamesStore, type SavedGame } from "../../store/savedGamesStore";
import { useAuthStore } from "../../store/authStore";
import { Avatar } from "../common/Avatar";
import { Button } from "../common/Button";
import { Card } from "../common/Card";

interface HistoryScreenProps {
  onOpenGame: (game: SavedGame) => void;
  onBack: () => void;
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function resultLabel(result: string | null, playerColor: "w" | "b"): { label: string; tone: string } {
  if (!result) return { label: "—", tone: "text-walnut-300" };
  if (result === "1/2-1/2") return { label: "Draw", tone: "text-walnut-300" };
  if (result === "*") return { label: "Unfinished", tone: "text-walnut-300" };
  const playerWon =
    (playerColor === "w" && result === "1-0") ||
    (playerColor === "b" && result === "0-1");
  return playerWon
    ? { label: "Win", tone: "text-success" }
    : { label: "Loss", tone: "text-danger" };
}

export function HistoryScreen({ onOpenGame, onBack }: HistoryScreenProps) {
  const user = useAuthStore((s) => s.user);
  const games = useSavedGamesStore((s) => s.games);
  const loading = useSavedGamesStore((s) => s.loading);
  const error = useSavedGamesStore((s) => s.error);
  const fetchGames = useSavedGamesStore((s) => s.fetchGames);
  const deleteOne = useSavedGamesStore((s) => s.deleteOne);

  useEffect(() => {
    if (user) fetchGames();
  }, [user, fetchGames]);

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="eyebrow mb-3">Restricted</div>
          <h1 className="font-serif text-h1 text-paper mb-4">Sign in to see your games</h1>
          <p className="text-walnut-300 mb-block">
            Your saved game library appears here once you create an account.
          </p>
          <Button onClick={onBack} variant="outline">
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ed-shell pt-block pb-section">
      <div className="flex items-end justify-between mb-block border-b border-edge pb-6">
        <div>
          <div className="eyebrow mb-3">Library</div>
          <h1 className="font-serif text-hero text-paper">My Games</h1>
          <p className="mt-3 text-walnut-300 text-[15px]">
            {games.length} saved game{games.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          Home
        </Button>
      </div>

      {loading && (
        <div className="text-walnut-300 text-[14px]">Loading your games…</div>
      )}
      {error && (
        <div className="text-danger text-[14px] border border-danger/30 bg-danger/[0.06] rounded-md px-4 py-3 mb-6">
          {error}
        </div>
      )}

      {!loading && games.length === 0 && (
        <Card variant="paper" className="p-block text-center">
          <div className="eyebrow mb-3">Empty</div>
          <h2 className="font-serif text-h2 text-paper mb-3">No games yet</h2>
          <p className="text-walnut-300 max-w-md mx-auto">
            Play a game against an imitated opponent and tap "Save game" when it's
            over to start building your library.
          </p>
        </Card>
      )}

      {games.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {games.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              onOpen={() => onOpenGame(g)}
              onDelete={() => {
                if (confirm("Delete this game permanently?")) {
                  deleteOne(g.id);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GameCard({
  game,
  onOpen,
  onDelete,
}: {
  game: SavedGame;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { label, tone } = resultLabel(game.result, game.playerColor);
  const opponentName = game.opponentName || "Anonymous";
  return (
    <Card interactive variant="solid" className="overflow-hidden group">
      <div onClick={onOpen} className="p-5">
        <div className="flex items-start gap-4">
          <Avatar name={opponentName} size={48} />
          <div className="flex-1 min-w-0">
            <div className="eyebrow mb-1">vs.</div>
            <div className="font-serif text-[20px] text-paper truncate leading-tight">
              {opponentName}
            </div>
            {game.opponentRating && (
              <div className="text-[12px] text-walnut-300 mt-0.5">
                {game.opponentRating} · {game.opponentSource ?? ""}
              </div>
            )}
          </div>
          <div className={`text-[11px] tracking-eyebrow uppercase ${tone}`}>{label}</div>
        </div>

        <div className="mt-5 pt-4 border-t border-edge grid grid-cols-3 gap-2 text-[11px] tracking-[0.08em] uppercase text-walnut-300">
          <div>
            <div className="text-walnut-400">Color</div>
            <div className="text-paper mt-1 font-mono">
              {game.playerColor === "w" ? "White" : "Black"}
            </div>
          </div>
          <div>
            <div className="text-walnut-400">Moves</div>
            <div className="text-paper mt-1 font-mono">{game.numMoves}</div>
          </div>
          <div>
            <div className="text-walnut-400">Played</div>
            <div className="text-paper mt-1 font-mono">{relTime(game.createdAt)}</div>
          </div>
        </div>
      </div>
      <div className="border-t border-edge px-5 py-2.5 flex items-center justify-between bg-walnut-900/40">
        <span className="text-[11px] tracking-eyebrow uppercase text-walnut-300">
          {game.timeControl || "untimed"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-[11px] tracking-eyebrow uppercase text-walnut-300 hover:text-danger transition-colors"
        >
          Delete
        </button>
      </div>
    </Card>
  );
}
