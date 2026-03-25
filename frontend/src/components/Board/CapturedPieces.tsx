import { useGameStore } from "../../store/gameStore";

const PIECE_UNICODE: Record<string, string> = {
  wp: "\u2659", wn: "\u2658", wb: "\u2657", wr: "\u2656", wq: "\u2655",
  bp: "\u265F", bn: "\u265E", bb: "\u265D", br: "\u265C", bq: "\u265B",
};

const PIECE_ORDER = ["q", "r", "b", "n", "p"];

const STARTING_COUNTS: Record<string, number> = {
  p: 8, n: 2, b: 2, r: 2, q: 1, k: 1,
};

function getCapturedPieces(fen: string): { white: string[]; black: string[] } {
  const boardPart = fen.split(" ")[0];

  const counts: Record<string, number> = {
    wp: 0, wn: 0, wb: 0, wr: 0, wq: 0, wk: 0,
    bp: 0, bn: 0, bb: 0, br: 0, bq: 0, bk: 0,
  };

  for (const ch of boardPart) {
    if (ch >= "A" && ch <= "Z") {
      const piece = ch.toLowerCase();
      const key = "w" + piece;
      if (key in counts) counts[key]++;
    } else if (ch >= "a" && ch <= "z") {
      const key = "b" + ch;
      if (key in counts) counts[key]++;
    }
  }

  // Captured = starting - remaining
  const whiteCaptured: string[] = []; // black pieces captured by white
  const blackCaptured: string[] = []; // white pieces captured by black

  for (const piece of PIECE_ORDER) {
    const start = STARTING_COUNTS[piece] ?? 0;
    const bMissing = start - (counts["b" + piece] ?? 0);
    for (let i = 0; i < bMissing; i++) whiteCaptured.push("b" + piece);
    const wMissing = start - (counts["w" + piece] ?? 0);
    for (let i = 0; i < wMissing; i++) blackCaptured.push("w" + piece);
  }

  return { white: whiteCaptured, black: blackCaptured };
}

function materialDiff(captured: { white: string[]; black: string[] }): number {
  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let diff = 0;
  for (const p of captured.white) diff += values[p[1]] ?? 0;
  for (const p of captured.black) diff -= values[p[1]] ?? 0;
  return diff;
}

interface Props {
  color: "white" | "black";
}

export function CapturedPieces({ color }: Props) {
  const fen = useGameStore((s) => s.fen);
  const captured = getCapturedPieces(fen);
  const pieces = color === "white" ? captured.white : captured.black;
  const diff = materialDiff(captured);
  const showDiff = color === "white" ? diff > 0 : diff < 0;
  const diffValue = Math.abs(diff);

  if (pieces.length === 0) return null;

  return (
    <span className="flex items-center gap-px text-sm opacity-70">
      {pieces.map((p, i) => (
        <span key={i} className="leading-none -mx-[1px]">
          {PIECE_UNICODE[p] ?? ""}
        </span>
      ))}
      {showDiff && diffValue > 0 && (
        <span className="text-[10px] text-zinc-500 font-mono ml-1">
          +{diffValue}
        </span>
      )}
    </span>
  );
}
