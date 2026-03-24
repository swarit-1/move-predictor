import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface Props {
  topMoves: Array<{
    move_uci: string;
    probability: number;
    engine_rank?: number;
  }>;
  engineTopMoves: Array<{
    move: string;
    rank: number;
    cp: number | null;
  }>;
}

/**
 * Horizontal bar chart showing the probability distribution of top predicted moves.
 */
export function MoveDistribution({ topMoves, engineTopMoves }: Props) {
  if (!topMoves || topMoves.length === 0) return null;

  const data = topMoves.slice(0, 5).map((m) => {
    // Find engine rank for this move
    const engineEntry = engineTopMoves?.find((e) => e.move === m.move_uci);

    return {
      move: m.move_uci,
      probability: +(m.probability * 100).toFixed(1),
      engineRank: m.engine_rank || engineEntry?.rank || null,
      engineCp: engineEntry?.cp,
    };
  });

  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">Move Distribution</p>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} layout="vertical" margin={{ left: 40, right: 10 }}>
          <XAxis
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
          />
          <YAxis
            type="category"
            dataKey="move"
            tick={{ fontSize: 11, fill: "#d1d5db", fontFamily: "monospace" }}
            width={40}
          />
          <Tooltip
            formatter={(value: number, name: string) => [`${value}%`, "Probability"]}
            contentStyle={{
              backgroundColor: "#1f2937",
              border: "1px solid #374151",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="probability" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  index === 0
                    ? "#22c55e" // top prediction: green
                    : entry.engineRank === 1
                    ? "#3b82f6" // engine best: blue
                    : "#6b7280" // other: gray
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
