import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useGameStore } from "../store/gameStore";
import { colors } from "../theme/colors";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function GameClock() {
  const timeControl = useGameStore((s) => s.timeControl);
  const playerTimeLeft = useGameStore((s) => s.playerTimeLeft);
  const opponentTimeLeft = useGameStore((s) => s.opponentTimeLeft);
  const playerColor = useGameStore((s) => s.playerColor);
  const chess = useGameStore((s) => s.chess);
  const flagGameOver = useGameStore((s) => s.flagGameOver);
  const tickClock = useGameStore((s) => s.tickClock);
  const onFlag = useGameStore((s) => s.onFlag);
  const moveHistory = useGameStore((s) => s.moveHistory);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!timeControl || flagGameOver || chess.isGameOver()) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    if (moveHistory.length === 0) return;

    const currentTurn = chess.turn();
    const side: "player" | "opponent" =
      currentTurn === playerColor ? "player" : "opponent";

    intervalRef.current = setInterval(() => {
      tickClock(side, 0.1);
      const timeLeft =
        side === "player"
          ? useGameStore.getState().playerTimeLeft
          : useGameStore.getState().opponentTimeLeft;
      if (timeLeft <= 0) {
        onFlag(side);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timeControl, chess.turn(), flagGameOver, moveHistory.length, playerColor]);

  if (!timeControl) return null;

  const playerLow = playerTimeLeft < 30;
  const opponentLow = opponentTimeLeft < 30;

  return (
    <View style={styles.container}>
      <View style={[styles.clock, opponentLow && styles.lowTime]}>
        <Text style={[styles.label, { color: colors.zinc500 }]}>OPP</Text>
        <Text style={[styles.time, opponentLow && styles.lowTimeText]}>
          {formatTime(opponentTimeLeft)}
        </Text>
      </View>
      <View style={[styles.clock, playerLow && styles.lowTime]}>
        <Text style={[styles.label, { color: colors.zinc500 }]}>YOU</Text>
        <Text style={[styles.time, playerLow && styles.lowTimeText]}>
          {formatTime(playerTimeLeft)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginTop: 8,
  },
  clock: {
    backgroundColor: colors.surface2,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 80,
    alignItems: "center",
  },
  lowTime: {
    backgroundColor: "rgba(202, 52, 49, 0.15)",
  },
  label: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  time: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.zinc200,
    fontFamily: "monospace",
  },
  lowTimeText: {
    color: colors.blunder,
  },
});
