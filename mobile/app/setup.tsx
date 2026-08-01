import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import Slider from "@react-native-community/slider";
import { router } from "expo-router";
import { usePlayerStore, StyleOverrides } from "../src/store/playerStore";
import { usePlayerProfile } from "../src/hooks/usePlayerProfile";
import { useGameStore } from "../src/store/gameStore";
import { colors } from "../src/theme/colors";

type Tab = "profile" | "rating" | "style";

const TIME_CONTROLS = [
  { label: "No Clock", initial: 0, increment: 0 },
  { label: "1+0", initial: 60, increment: 0 },
  { label: "3+0", initial: 180, increment: 0 },
  { label: "3+2", initial: 180, increment: 2 },
  { label: "5+0", initial: 300, increment: 0 },
  { label: "5+3", initial: 300, increment: 3 },
  { label: "10+0", initial: 600, increment: 0 },
  { label: "15+10", initial: 900, increment: 10 },
];

const PRESETS = [800, 1000, 1200, 1500, 1800, 2000, 2200, 2500];

export default function SetupScreen() {
  const [tab, setTab] = useState<Tab>("rating");
  const [source, setSource] = useState<"lichess" | "chesscom">("lichess");
  const [username, setUsername] = useState("");
  const [manualRating, setManualRating] = useState(1500);
  const [selectedTC, setSelectedTC] = useState(0);

  const playerColor = useGameStore((s) => s.playerColor);
  const setPlayerColor = useGameStore((s) => s.setPlayerColor);
  const setTimeControl = useGameStore((s) => s.setTimeControl);
  const resetGame = useGameStore((s) => s.resetGame);
  const { styleOverrides, setStyleOverride, resetStyleOverrides } = usePlayerStore();
  const { opponent, opponentLoading, error, fetchProfile } = usePlayerProfile();

  const handleSearch = () => {
    if (username.trim()) fetchProfile(source, username.trim());
  };

  const handleStart = () => {
    if (tab === "rating" && !opponent) {
      usePlayerStore.getState().setOpponent({
        username: `${manualRating}-rated`,
        source: "rating",
        rating: manualRating,
        numGames: 0,
        styleSummary: null,
      });
    }
    if (tab === "style" && !opponent) {
      usePlayerStore.getState().setOpponent({
        username: "Custom",
        source: "style",
        rating: 1500,
        numGames: 0,
        styleSummary: null,
      });
    }
    const tc = TIME_CONTROLS[selectedTC];
    setTimeControl(tc.initial > 0 ? { initial: tc.initial, increment: tc.increment } : null);
    resetGame();
    router.push("/game");
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "Player" },
    { key: "rating", label: "Rating" },
    { key: "style", label: "Style" },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Move Predictor</Text>
        <Text style={styles.subtitle}>
          Play against an AI that mimics human playing styles
        </Text>

        {/* Color picker */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Play as</Text>
          <View style={styles.colorRow}>
            {(["w", "b"] as const).map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.colorBtn, playerColor === c && styles.colorBtnActive]}
                onPress={() => setPlayerColor(c)}
              >
                <View
                  style={[
                    styles.colorDot,
                    c === "w" ? styles.whiteDot : styles.blackDot,
                  ]}
                />
                <Text
                  style={[
                    styles.colorLabel,
                    playerColor === c && styles.colorLabelActive,
                  ]}
                >
                  {c === "w" ? "White" : "Black"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
              onPress={() => setTab(t.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  tab === t.key && styles.tabTextActive,
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        <View style={styles.tabContent}>
          {tab === "profile" && (
            <View style={styles.tabInner}>
              <View style={styles.sourceRow}>
                {(["lichess", "chesscom"] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sourceBtn, source === s && styles.sourceBtnActive]}
                    onPress={() => setSource(s)}
                  >
                    <Text
                      style={[
                        styles.sourceBtnText,
                        source === s && styles.sourceBtnTextActive,
                      ]}
                    >
                      {s === "lichess" ? "Lichess" : "Chess.com"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Username..."
                  placeholderTextColor={colors.zinc600}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  returnKeyType="search"
                  onSubmitEditing={handleSearch}
                />
                <TouchableOpacity
                  style={[styles.searchBtn, opponentLoading && styles.disabled]}
                  onPress={handleSearch}
                  disabled={opponentLoading || !username.trim()}
                >
                  {opponentLoading ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={styles.searchBtnText}>Search</Text>
                  )}
                </TouchableOpacity>
              </View>

              {error && <Text style={styles.error}>{error}</Text>}

              {opponent && (
                <View style={styles.profileCard}>
                  <View style={styles.profileHeader}>
                    <Text style={styles.profileName}>{opponent.username}</Text>
                    <Text style={styles.profileRating}>
                      {opponent.rating.toFixed(0)}
                    </Text>
                  </View>
                  <Text style={styles.profileGames}>
                    {opponent.numGames} games analyzed
                  </Text>
                  {opponent.styleSummary && (
                    <View style={styles.statGrid}>
                      {[
                        { label: "AGG", value: opponent.styleSummary.aggression, color: colors.blunder },
                        { label: "TAC", value: opponent.styleSummary.tactical, color: colors.inaccuracy },
                        { label: "ACC", value: opponent.styleSummary.accuracy, color: colors.human },
                        { label: "CON", value: opponent.styleSummary.consistency, color: colors.engine },
                        { label: "VAR", value: opponent.styleSummary.opening_diversity, color: colors.gold },
                      ].map((s) => (
                        <View key={s.label} style={styles.statCell}>
                          <Text style={[styles.statCellValue, { color: s.color }]}>
                            {s.value}
                          </Text>
                          <Text style={styles.statCellLabel}>{s.label}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {tab === "rating" && (
            <View style={styles.tabInner}>
              <View style={styles.ratingHeader}>
                <Text style={styles.ratingLabel}>Opponent Rating</Text>
                <Text style={styles.ratingValue}>{manualRating}</Text>
              </View>
              <Slider
                style={styles.ratingSlider}
                minimumValue={400}
                maximumValue={3000}
                step={25}
                value={manualRating}
                onValueChange={(v) => setManualRating(v)}
                minimumTrackTintColor={colors.gold}
                maximumTrackTintColor={colors.zinc700}
                thumbTintColor={colors.gold}
              />
              <View style={styles.presetGrid}>
                {PRESETS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.presetBtn,
                      manualRating === r && styles.presetBtnActive,
                    ]}
                    onPress={() => setManualRating(r)}
                  >
                    <Text
                      style={[
                        styles.presetText,
                        manualRating === r && styles.presetTextActive,
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {tab === "style" && (
            <View style={styles.tabInner}>
              <View style={styles.styleHeader}>
                <Text style={styles.styleHeaderText}>Fine-tune style</Text>
                <TouchableOpacity onPress={resetStyleOverrides}>
                  <Text style={styles.resetText}>Reset</Text>
                </TouchableOpacity>
              </View>
              {(
                [
                  { key: "aggression" as const, label: "Aggression", low: "Passive", high: "Aggressive" },
                  { key: "risk_taking" as const, label: "Risk Taking", low: "Safe", high: "Risky" },
                  { key: "blunder_frequency" as const, label: "Blunder Rate", low: "Accurate", high: "Error-prone" },
                ] as const
              ).map(({ key, label, low, high }) => (
                <View key={key} style={styles.styleSlider}>
                  <View style={styles.styleSliderHeader}>
                    <Text style={styles.styleSliderLabel}>{label}</Text>
                    <Text style={styles.styleSliderValue}>
                      {styleOverrides[key].toFixed(0)}
                    </Text>
                  </View>
                  <Slider
                    style={styles.slider}
                    minimumValue={0}
                    maximumValue={100}
                    value={styleOverrides[key]}
                    onValueChange={(v) => setStyleOverride(key, Math.round(v))}
                    minimumTrackTintColor={colors.gold}
                    maximumTrackTintColor={colors.zinc700}
                    thumbTintColor={colors.gold}
                  />
                  <View style={styles.sliderLabels}>
                    <Text style={styles.sliderLabelText}>{low}</Text>
                    <Text style={styles.sliderLabelText}>{high}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Time control */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Time Control</Text>
          <View style={styles.tcGrid}>
            {TIME_CONTROLS.map((tc, i) => (
              <TouchableOpacity
                key={tc.label}
                style={[styles.tcBtn, selectedTC === i && styles.tcBtnActive]}
                onPress={() => setSelectedTC(i)}
              >
                <Text
                  style={[
                    styles.tcText,
                    selectedTC === i && styles.tcTextActive,
                  ]}
                >
                  {tc.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Start */}
        <TouchableOpacity
          style={[
            styles.startBtn,
            tab === "profile" && !opponent && styles.disabled,
          ]}
          onPress={handleStart}
          disabled={tab === "profile" && !opponent}
        >
          <Text style={styles.startBtnText}>Start Game</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface0 },
  content: { padding: 20, paddingBottom: 40 },
  backBtn: { marginBottom: 20 },
  backText: { fontSize: 14, color: colors.zinc500 },
  title: { fontSize: 26, fontWeight: "700", color: colors.paper, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.zinc500, marginBottom: 24 },

  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.zinc500,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  colorRow: { flexDirection: "row", gap: 8 },
  colorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  colorBtnActive: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.edgeStrong,
  },
  colorDot: { width: 14, height: 14, borderRadius: 4, borderWidth: 1 },
  whiteDot: { backgroundColor: colors.zinc100, borderColor: colors.zinc300 },
  blackDot: { backgroundColor: colors.zinc700, borderColor: colors.zinc500 },
  colorLabel: { fontSize: 12, color: colors.zinc500, fontWeight: "600" },
  colorLabelActive: { color: colors.white },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.edge,
    marginBottom: 16,
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.gold },
  tabText: { fontSize: 13, fontWeight: "600", color: colors.zinc500 },
  tabTextActive: { color: colors.white },

  tabContent: { minHeight: 200, marginBottom: 20 },
  tabInner: { gap: 12 },

  sourceRow: { flexDirection: "row", gap: 8 },
  sourceBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.edge,
    alignItems: "center",
  },
  sourceBtnActive: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: colors.edgeStrong },
  sourceBtnText: { fontSize: 12, color: colors.zinc500 },
  sourceBtnTextActive: { color: colors.white },

  searchRow: { flexDirection: "row", gap: 8 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.paper,
    fontSize: 13,
    backgroundColor: colors.surface1,
  },
  searchBtn: {
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.edge,
  },
  searchBtnText: { fontSize: 12, fontWeight: "600", color: colors.white },

  error: { fontSize: 12, color: colors.blunder, paddingHorizontal: 4 },

  profileCard: {
    backgroundColor: colors.surface1,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.edge,
    gap: 8,
  },
  profileHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  profileName: { fontSize: 15, fontWeight: "700", color: colors.white },
  profileRating: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.zinc200,
    backgroundColor: colors.surface2,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontFamily: "monospace",
  },
  profileGames: { fontSize: 11, color: colors.zinc500 },
  statGrid: { flexDirection: "row", gap: 6 },
  statCell: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: "center",
  },
  statCellValue: { fontSize: 14, fontWeight: "700", fontFamily: "monospace" },
  statCellLabel: { fontSize: 9, color: colors.zinc600, fontWeight: "600", marginTop: 2 },

  ratingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  ratingLabel: { fontSize: 12, color: colors.zinc400, fontWeight: "600" },
  ratingValue: { fontSize: 28, fontWeight: "700", color: colors.white, fontFamily: "monospace" },
  ratingSlider: { width: "100%", height: 40 },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  presetBtn: {
    width: "23%",
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface1,
    alignItems: "center",
  },
  presetBtnActive: { backgroundColor: colors.goldDim, borderWidth: 1, borderColor: "rgba(200,168,78,0.25)" },
  presetText: { fontSize: 12, fontWeight: "600", color: colors.zinc500, fontFamily: "monospace" },
  presetTextActive: { color: colors.gold },

  styleHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  styleHeaderText: { fontSize: 12, color: colors.zinc500 },
  resetText: { fontSize: 11, color: colors.zinc600 },
  styleSlider: { marginBottom: 8 },
  styleSliderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  styleSliderLabel: { fontSize: 12, fontWeight: "600", color: colors.zinc300 },
  styleSliderValue: { fontSize: 12, fontWeight: "700", color: colors.gold, fontFamily: "monospace" },
  slider: { width: "100%", height: 32 },
  sliderLabels: { flexDirection: "row", justifyContent: "space-between" },
  sliderLabelText: { fontSize: 10, color: colors.zinc600 },

  tcGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tcBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surface1,
  },
  tcBtnActive: { backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: colors.edgeStrong },
  tcText: { fontSize: 12, fontWeight: "600", color: colors.zinc500 },
  tcTextActive: { color: colors.white },

  startBtn: {
    backgroundColor: colors.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  startBtnText: { fontSize: 15, fontWeight: "700", color: colors.surface0 },
  disabled: { opacity: 0.4 },
});
