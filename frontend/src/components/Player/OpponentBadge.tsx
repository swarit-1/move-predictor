import { usePlayerStore } from "../../store/playerStore";
import { useCloneStatus } from "../../hooks/useCloneStatus";

const STAGE_DISPLAY: Record<
  string,
  { label: string; dot: string; title: string }
> = {
  generic: {
    label: "Generic",
    dot: "bg-zinc-500",
    title: "Playing at rating level — profile still loading",
  },
  repertoire: {
    label: "Repertoire",
    dot: "bg-sky-400",
    title:
      "Clone uses this player's openings, position history, and style. " +
      "Personalized fine-tune in progress…",
  },
  personalized: {
    label: "Personalized",
    dot: "bg-emerald-400",
    title:
      "Fully personalized clone — fine-tuned on this player's own games",
  },
};

export function OpponentBadge() {
  const opponent = usePlayerStore((s) => s.opponent);
  const cloneStatus = useCloneStatus(opponent?.playerKey);

  if (!opponent) return null;

  const stage = cloneStatus?.stage ?? "generic";
  const display = STAGE_DISPLAY[stage] ?? STAGE_DISPLAY.generic;
  // Repertoire with a failed personalize is still a good clone — show the
  // stage without the "in progress" promise.
  const title =
    stage === "repertoire" &&
    cloneStatus?.personalization.status === "failed"
      ? "Clone uses this player's openings, position history, and style."
      : display.title;

  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="text-zinc-600 font-light">vs</span>
      <span className="text-zinc-300 font-medium">{opponent.username}</span>
      <span className="font-mono text-[11px] text-zinc-400 bg-white/[0.05] px-2.5 py-0.5 rounded-lg border border-white/[0.04]">
        {opponent.rating.toFixed(0)}
      </span>
      {opponent.playerKey && (
        <span
          title={title}
          className="flex items-center gap-1.5 text-[11px] text-zinc-400 bg-white/[0.05] px-2.5 py-0.5 rounded-lg border border-white/[0.04]"
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${display.dot} ${
              stage !== "personalized" ? "animate-pulse" : ""
            }`}
          />
          {display.label}
        </span>
      )}
    </div>
  );
}
