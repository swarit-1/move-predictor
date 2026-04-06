import { useEffect, useRef } from "react";
import type { MoveAnnotation, MoveClassification } from "../../store/reviewStore";
import { CLASSIFICATION_COLORS, CLASSIFICATION_ICONS } from "../../store/reviewStore";

interface Props {
  annotations: MoveAnnotation[];
  selectedPly: number;
  onSelectPly: (ply: number) => void;
}

function ClassBadge({ cls }: { cls: MoveClassification }) {
  const icon = CLASSIFICATION_ICONS[cls];
  const color = CLASSIFICATION_COLORS[cls];

  if (!icon) return null;

  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold flex-shrink-0"
      style={{ backgroundColor: color, color: "#fff" }}
    >
      {icon}
    </span>
  );
}

export function ReviewMoveList({ annotations, selectedPly, onSelectPly }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedPly]);

  // Group moves into pairs (white + black)
  const pairs: Array<{ number: number; white: MoveAnnotation | null; black: MoveAnnotation | null }> = [];
  for (let i = 0; i < annotations.length; i += 2) {
    pairs.push({
      number: Math.floor(i / 2) + 1,
      white: annotations[i] || null,
      black: annotations[i + 1] || null,
    });
  }

  return (
    <div className="glass-card p-3">
      <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-[0.12em] mb-2">
        Moves
      </p>
      <div
        ref={scrollRef}
        className="max-h-[320px] overflow-y-auto space-y-0.5"
      >
        {pairs.map((pair) => (
          <div key={pair.number} className="flex items-center gap-0.5">
            {/* Move number */}
            <span className="w-7 text-right text-[10px] text-zinc-600 font-mono flex-shrink-0 pr-1">
              {pair.number}.
            </span>

            {/* White move */}
            {pair.white && (
              <MoveButton
                annotation={pair.white}
                isSelected={selectedPly === pair.white.ply}
                onClick={() => onSelectPly(pair.white!.ply)}
                ref={selectedPly === pair.white.ply ? activeRef : undefined}
              />
            )}

            {/* Black move */}
            {pair.black && (
              <MoveButton
                annotation={pair.black}
                isSelected={selectedPly === pair.black.ply}
                onClick={() => onSelectPly(pair.black!.ply)}
                ref={selectedPly === pair.black.ply ? activeRef : undefined}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import { forwardRef } from "react";

const MoveButton = forwardRef<HTMLButtonElement, {
  annotation: MoveAnnotation;
  isSelected: boolean;
  onClick: () => void;
}>(({ annotation, isSelected, onClick }, ref) => {
  const cls = annotation.classification as MoveClassification;
  const color = CLASSIFICATION_COLORS[cls];
  const isNotable = cls !== "best" && cls !== "excellent" && cls !== "good" && cls !== "book";

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono transition-all duration-150 flex-1 min-w-0 ${
        isSelected
          ? "bg-white/[0.1] ring-1 ring-white/[0.15]"
          : "hover:bg-white/[0.04]"
      }`}
      style={isNotable && !isSelected ? { borderLeft: `2px solid ${color}` } : undefined}
    >
      <ClassBadge cls={cls} />
      <span
        className={`truncate ${isSelected ? "text-zinc-100" : "text-zinc-400"}`}
        style={isNotable ? { color } : undefined}
      >
        {annotation.move_san}
      </span>
    </button>
  );
});
