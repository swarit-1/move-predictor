import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useGameStore } from "../store/gameStore";
import { colors } from "../theme/colors";

export function PredictionPanel() {
  const prediction = useGameStore((s) => s.prediction);
  const isLoading = useGameStore((s) => s.isLoading);

  if (!prediction && !isLoading) return null;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Prediction</Text>
          <View style={styles.spinner} />
        </View>
        <Text style={styles.thinking}>Thinking...</Text>
      </View>
    );
  }

  if (!prediction) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Prediction</Text>
        <Text style={styles.confidence}>
          {(prediction.probability * 100).toFixed(0)}%
        </Text>
      </View>

      <View style={styles.statsRow}>
        <StatBox
          label="CPL"
          value={prediction.predictedCpl.toFixed(0)}
          color={
            prediction.predictedCpl < 20
              ? colors.human
              : prediction.predictedCpl < 50
                ? colors.inaccuracy
                : colors.blunder
          }
        />
        <StatBox
          label="Blunder"
          value={`${(prediction.blunderProbability * 100).toFixed(0)}%`}
          color={
            prediction.blunderProbability < 0.05
              ? colors.human
              : prediction.blunderProbability < 0.15
                ? colors.inaccuracy
                : colors.blunder
          }
        />
        <StatBox
          label="Temp"
          value={prediction.temperature.toFixed(2)}
          color={colors.zinc400}
        />
      </View>

      {prediction.topMoves.length > 0 && (
        <View style={styles.topMoves}>
          <Text style={styles.subTitle}>Top Moves</Text>
          {prediction.topMoves.slice(0, 4).map((m, i) => (
            <View key={i} style={styles.topMoveRow}>
              <Text style={styles.topMoveUci}>{m.move_uci}</Text>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      width: `${Math.max(5, m.probability * 100)}%`,
                      backgroundColor:
                        i === 0 ? colors.gold : colors.zinc600,
                    },
                  ]}
                />
              </View>
              <Text style={styles.topMoveProb}>
                {(m.probability * 100).toFixed(0)}%
              </Text>
            </View>
          ))}
        </View>
      )}

      {prediction.explanation && prediction.explanation.is_deviation && (
        <View style={styles.deviation}>
          <Text style={styles.deviationText}>
            {prediction.explanation.deviation_reason}
          </Text>
        </View>
      )}
    </View>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface1,
    borderRadius: 12,
    padding: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.zinc500,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  confidence: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.gold,
    fontFamily: "monospace",
  },
  thinking: {
    fontSize: 12,
    color: colors.zinc500,
    fontStyle: "italic",
  },
  spinner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.zinc600,
    borderTopColor: colors.gold,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: 8,
    padding: 8,
    alignItems: "center",
  },
  statValue: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  statLabel: {
    fontSize: 9,
    color: colors.zinc600,
    marginTop: 2,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  topMoves: {
    marginTop: 4,
  },
  subTitle: {
    fontSize: 10,
    color: colors.zinc600,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  topMoveRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  topMoveUci: {
    width: 44,
    fontSize: 11,
    color: colors.zinc300,
    fontFamily: "monospace",
    fontWeight: "600",
  },
  barContainer: {
    flex: 1,
    height: 6,
    backgroundColor: colors.surface2,
    borderRadius: 3,
    marginHorizontal: 8,
  },
  bar: {
    height: 6,
    borderRadius: 3,
  },
  topMoveProb: {
    width: 32,
    fontSize: 10,
    color: colors.zinc500,
    fontFamily: "monospace",
    textAlign: "right",
  },
  deviation: {
    marginTop: 8,
    backgroundColor: "rgba(200, 168, 78, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(200, 168, 78, 0.12)",
    borderRadius: 8,
    padding: 8,
  },
  deviationText: {
    fontSize: 11,
    color: colors.gold,
  },
});
