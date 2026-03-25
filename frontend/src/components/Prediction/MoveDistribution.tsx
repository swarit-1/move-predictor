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
      <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-1.5">
        Top Moves
      </p>
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data} layout="vertical" margin={{ left: 32, right: 4, top: 0, bottom: 0 }}>
          <XAxis
            type="number"
            domain={[0, "dataMax"]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 9, fill: "#52525b" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="move"
            tick={{ fontSize: 10, fill: "#a1a1aa", fontFamily: "JetBrains Mono, monospace" }}
            width={32}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value: number) => [`${value}%`, "Prob"]}
            contentStyle={{
              backgroundColor: "rgba(10, 10, 15, 0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "10px",
              fontSize: "11px",
              color: "#d4d4d8",
              padding: "6px 10px",
              backdropFilter: "blur(8px)",
            }}
          />
          <Bar dataKey="probability" radius={[0, 4, 4, 0]} barSize={14}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  index === 0
                    ? "#22c55e"
                    : entry.engineRank === 1
                    ? "#6366f1"
                    : "#27272a"
                }
                fillOpacity={index === 0 ? 0.55 : 0.4}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
