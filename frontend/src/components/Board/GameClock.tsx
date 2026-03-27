import { useEffect, useRef } from "react";

interface Props {
  timeLeft: number; // seconds
  isRunning: boolean;
  onTick: (elapsed: number) => void;
  onTimeOut: () => void;
}

export function GameClock({ timeLeft, isRunning, onTick, onTimeOut }: Props) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      lastTickRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = (now - lastTickRef.current) / 1000;
        lastTickRef.current = now;
        onTick(elapsed);
      }, 100);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, timeLeft > 0, onTick]);

  useEffect(() => {
    if (timeLeft <= 0 && isRunning) {
      onTimeOut();
    }
  }, [timeLeft, isRunning, onTimeOut]);

  const minutes = Math.floor(Math.max(0, timeLeft) / 60);
  const seconds = Math.floor(Math.max(0, timeLeft) % 60);
  const tenths = Math.floor((Math.max(0, timeLeft) * 10) % 10);
  const isLow = timeLeft < 30;
  const isCritical = timeLeft < 10;

  return (
    <div
      className={`font-mono text-sm font-bold tabular-nums px-2.5 py-1 rounded-lg transition-colors ${
        isCritical
          ? "text-red-400 bg-red-500/10 animate-pulse"
          : isLow
            ? "text-amber-400 bg-amber-500/5"
            : isRunning
              ? "text-white bg-white/[0.06]"
              : "text-zinc-500 bg-white/[0.03]"
      }`}
    >
      {minutes}:{seconds.toString().padStart(2, "0")}
      {isLow && <span className="text-[10px]">.{tenths}</span>}
    </div>
  );
}
