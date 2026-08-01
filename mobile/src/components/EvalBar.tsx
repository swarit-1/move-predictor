import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useGameStore } from "../store/gameStore";
import { colors } from "../theme/colors";

export function EvalBar() {
  const positionEval = useGameStore((s) => s.positionEval);
  const playerColor = useGameStore((s) => s.playerColor);

  const cp = positionEval?.cp ?? 0;
  const mate = positionEval?.mate ?? null;

  let whitePercent: number;
  let displayText: string;

  if (mate !== null) {
    whitePercent = mate > 0 ? 95 : 5;
    displayText = `M${Math.abs(mate)}`;
  } else {
    const clampedCp = Math.max(-1000, Math.min(1000, cp));
    whitePercent = 50 + (clampedCp / 1000) * 45;
    const pawns = Math.abs(cp / 100);
    displayText = `${cp >= 0 ? "+" : ""}${pawns.toFixed(1)}`;
  }

  const flipped = playerColor === "b";

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        <View
          style={[
            styles.whitePortion,
            {
              height: flipped
                ? `${100 - whitePercent}%`
                : `${whitePercent}%`,
            },
          ]}
        />
      </View>
      <Text style={styles.label}>{displayText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    width: 24,
  },
  bar: {
    width: 20,
    height: "100%",
    backgroundColor: colors.zinc800,
    borderRadius: 4,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  whitePortion: {
    width: "100%",
    backgroundColor: "#E8E0D0",
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    color: colors.zinc400,
    marginTop: 4,
    fontFamily: "monospace",
  },
});
