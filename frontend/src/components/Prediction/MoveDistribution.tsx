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

export function MoveDistribution({ topMoves, engineTopMoves }: Props) {
  if (!topMoves || topMoves.length === 0) return null;

  const data = topMoves.slice(0, 5).map((m) => {
    const engineEntry = engineTopMoves?.find((e) => e.move === m.move_uci);
    return {
      move: m.move_uci,
      probability: +(m.probability * 100).toFixed(1),
      engineRank: m.engine_rank || engineEntry?.rank || null,
    };
  });

  return (
    <div>
      <p className="text-[10px] text-gray-500 mb-1">Top Moves</p>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data} layout="vertical" margin={{ left: 32, right: 4, top: 0, bottom: 0 }}>
          <XAxis
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 9, fill: "#4b5563" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="move"
            tick={{ fontSize: 10, fill: "#9ca3af", fontFamily: "ui-monospace, monospace" }}
            width={32}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number) => [`${value}%`, "Prob"]}
            contentStyle={{
              backgroundColor: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "8px",
              fontSize: "11px",
              color: "#d1d5db",
              padding: "6px 10px",
            }}
          />
          <Bar dataKey="probability" radius={[0, 3, 3, 0]} barSize={14}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  index === 0
                    ? "#22c55e"
                    : entry.engineRank === 1
                    ? "#3b82f6"
                    : "#374151"
                }
                fillOpacity={index === 0 ? 0.6 : 0.4}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
