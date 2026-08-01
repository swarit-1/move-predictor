import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Slider from "@react-native-community/slider";
import { usePlayerStore, StyleOverrides } from "../store/playerStore";
import { colors } from "../theme/colors";

type SliderKey = keyof StyleOverrides;

interface SliderDef {
  key: SliderKey;
  label: string;
  description: string;
  group: "basics" | "advanced";
}

const SLIDERS: SliderDef[] = [
  { key: "aggression", label: "Aggression", description: "Prefer captures and checks", group: "basics" },
  { key: "blunder_frequency", label: "Blunder Frequency", description: "How often the clone slips", group: "basics" },
  { key: "risk_taking", label: "Risk Taking", description: "Variance in move selection", group: "basics" },
  { key: "king_attack", label: "King Attack", description: "Push pieces toward the enemy king", group: "advanced" },
  { key: "positional", label: "Positional", description: "Quiet maneuvering vs forcing lines", group: "advanced" },
  { key: "trade_preference", label: "Trade Preference", description: "Initiate captures vs avoid trades", group: "advanced" },
  { key: "opening_loyalty", label: "Opening Loyalty", description: "Stick to known repertoire", group: "advanced" },
  { key: "repertoire_width", label: "Repertoire Width", description: "Many openings vs one line", group: "advanced" },
  { key: "endgame_strength", label: "Endgame Strength", description: "Accuracy past move 40", group: "advanced" },
  { key: "defensive_tenacity", label: "Defensive Tenacity", description: "Fight harder when losing", group: "advanced" },
];

export function StyleSliders() {
  const { styleOverrides, setStyleOverride, resetStyleOverrides } = usePlayerStore();
  const opponent = usePlayerStore((s) => s.opponent);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const baseline = opponent?.baselineStyle ?? {};

  const resetToClone = () => {
    SLIDERS.forEach((s) => {
      const v = (baseline[s.key] as number | undefined) ?? 50;
      setStyleOverride(s.key, Math.round(v));
    });
  };

  const visible = SLIDERS.filter((s) => showAdvanced || s.group === "basics");

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Style Controls</Text>
        <View style={styles.headerActions}>
          {opponent && (
            <TouchableOpacity onPress={resetToClone}>
              <Text style={styles.resetClone}>Reset to clone</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={resetStyleOverrides}>
            <Text style={styles.resetBtn}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      {visible.map(({ key, label, description }) => {
        const value = styleOverrides[key];
        const baselineValue = typeof baseline[key] === "number" ? (baseline[key] as number) : null;
        return (
          <View key={key} style={styles.sliderRow}>
            <View style={styles.sliderHeader}>
              <Text style={styles.sliderLabel}>{label}</Text>
              <View style={styles.sliderValues}>
                {baselineValue != null && (
                  <Text style={styles.baselineValue}>{Math.round(baselineValue)}</Text>
                )}
                <Text style={styles.currentValue}>{value.toFixed(0)}</Text>
              </View>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={100}
              value={value}
              onValueChange={(v) => setStyleOverride(key, Math.round(v))}
              minimumTrackTintColor={colors.gold}
              maximumTrackTintColor={colors.zinc700}
              thumbTintColor={colors.gold}
            />
            <Text style={styles.description}>{description}</Text>
          </View>
        );
      })}

      <TouchableOpacity
        onPress={() => setShowAdvanced(!showAdvanced)}
        style={styles.toggleBtn}
      >
        <Text style={styles.toggleText}>
          {showAdvanced ? "Hide advanced controls" : "Show advanced controls"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface1,
    borderRadius: 12,
    padding: 14,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.zinc500,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerActions: {
    flexDirection: "row",
    gap: 12,
  },
  resetClone: {
    fontSize: 10,
    color: colors.zinc500,
  },
  resetBtn: {
    fontSize: 10,
    color: colors.zinc600,
  },
  sliderRow: {
    marginBottom: 14,
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
  sliderLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.zinc400,
  },
  sliderValues: {
    flexDirection: "row",
    gap: 8,
    alignItems: "baseline",
  },
  baselineValue: {
    fontSize: 10,
    color: colors.zinc600,
    fontFamily: "monospace",
  },
  currentValue: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.zinc200,
    fontFamily: "monospace",
  },
  slider: {
    width: "100%",
    height: 32,
  },
  description: {
    fontSize: 10,
    color: colors.zinc600,
    marginTop: -2,
  },
  toggleBtn: {
    alignItems: "center",
    paddingTop: 4,
  },
  toggleText: {
    fontSize: 10,
    color: colors.zinc500,
  },
});
