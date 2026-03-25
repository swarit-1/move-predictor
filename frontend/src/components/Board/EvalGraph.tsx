import { useGameStore } from "../../store/gameStore";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export function EvalGraph() {
  const evalHistory = useGameStore((s) => s.evalHistory);

  if (evalHistory.length < 2) {
    return (
      <div className="glass-card p-3">
        <p className="text-[10px] text-zinc-600 text-center font-light">
          Evaluation graph appears after a few moves
        </p>
      </div>
    );
  }

  const data = evalHistory.map((entry) => ({
    move: entry.moveNumber,
    eval: entry.mate !== null
      ? (entry.mate > 0 ? 10 : -10)
      : Math.max(-10, Math.min(10, entry.cp / 100)),
  }));

  return (
    <div className="glass-card p-3">
      <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-[0.12em] mb-2">
        Evaluation
      </p>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="evalGradientPos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="evalGradientNeg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="move"
            tick={{ fontSize: 9, fill: "#52525b" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[-10, 10]}
            hide
          />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 2" />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(10, 10, 15, 0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "10px",
              fontSize: "11px",
              color: "#d4d4d8",
              padding: "6px 10px",
              backdropFilter: "blur(8px)",
            }}
            formatter={(value: number) => [`${value > 0 ? "+" : ""}${value.toFixed(1)}`, "Eval"]}
            labelFormatter={(label) => `Move ${label}`}
          />
          <Area
            type="monotone"
            dataKey="eval"
            stroke="#6366f1"
            strokeWidth={1.5}
            fill="url(#evalGradientPos)"
            dot={false}
            activeDot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
