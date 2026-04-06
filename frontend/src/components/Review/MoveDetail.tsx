import type { MoveAnnotation, MoveClassification } from "../../store/reviewStore";
import { CLASSIFICATION_COLORS } from "../../store/reviewStore";

interface Props {
  annotation: MoveAnnotation;
}

export function MoveDetail({ annotation }: Props) {
  const cls = annotation.classification as MoveClassification;
  const color = CLASSIFICATION_COLORS[cls];
  const isBest = annotation.move_uci === annotation.best_move_uci;

  const evalBefore = formatEval(annotation.eval_before, annotation.mate_before);
  const evalAfter = formatEval(annotation.eval_after, annotation.mate_after);

  return (
    <div className="glass-card p-4 space-y-3 animate-fade-in">
      {/* Classification header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {annotation.ply % 2 === 0 ? "W" : "B"}
          </span>
          <div>
            <span className="text-sm font-semibold text-zinc-200">
              {Math.floor(annotation.ply / 2) + 1}
              {annotation.ply % 2 === 0 ? "." : "..."}{" "}
              {annotation.move_san}
            </span>
            {annotation.is_book && (
              <span className="ml-2 text-[10px] text-zinc-500 bg-white/[0.04] px-1.5 py-0.5 rounded">
                Book
              </span>
            )}
          </div>
        </div>
        {!annotation.is_book && (
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-lg capitalize"
            style={{ backgroundColor: color + "1A", color }}
          >
            {cls}
          </span>
        )}
      </div>

      {/* Best move comparison */}
      {!annotation.is_book && !isBest && (
        <div className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-engine" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Best move</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-semibold text-engine">
              {annotation.best_move_san}
            </span>
          </div>
        </div>
      )}

      {/* Eval bar */}
      {!annotation.is_book && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>Before: {evalBefore}</span>
            <span>After: {evalAfter}</span>
          </div>

          {/* CPL */}
          {annotation.cpl > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500">CPL</span>
              <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, annotation.cpl / 3)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <span className="text-[10px] font-mono text-zinc-400">
                {annotation.cpl.toFixed(0)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Engine top moves */}
      {annotation.top_moves.length > 0 && !annotation.is_book && (
        <div className="space-y-1">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">
            Engine lines
          </span>
          {annotation.top_moves.map((m, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-600 font-mono w-3">{i + 1}.</span>
                <span className="font-mono text-zinc-400">{m.move}</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                {m.mate !== null
                  ? `M${Math.abs(m.mate)}`
                  : m.cp !== null
                    ? `${m.cp > 0 ? "+" : ""}${(m.cp / 100).toFixed(1)}`
                    : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatEval(cp: number | null, mate: number | null): string {
  if (mate !== null) return `M${mate > 0 ? "+" : ""}${mate}`;
  if (cp !== null) return `${cp > 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
  return "—";
}
