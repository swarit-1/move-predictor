import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "../src/store/authStore";
import { useSavedGamesStore } from "../src/store/savedGamesStore";
import { coachAnalysis } from "../src/api/client";
import { colors } from "../src/theme/colors";

interface BlunderPattern {
  pattern: string;
  count: number;
  description: string;
  severity: "high" | "medium" | "low";
}

interface PhaseAccuracy {
  opening: number;
  middlegame: number;
  endgame: number;
}

interface CoachResult {
  patterns: BlunderPattern[];
  phaseAccuracy: PhaseAccuracy;
  totalGames: number;
  totalMoves: number;
}

export default function CoachScreen() {
  const user = useAuthStore((s) => s.user);
  const { games, fetchGames, loading: gamesLoading } = useSavedGamesStore();
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (games.length === 0) fetchGames();
  }, []);

  const handleAnalyze = async () => {
    if (games.length === 0) return;
    setAnalyzing(true);
    setError(null);
    try {
      const pgns = games.slice(0, 20).map((g) => g.pgn);
      const res = await coachAnalysis(pgns, user?.username || "Player");
      if (res?.success) {
        setResult({
          patterns: res.data.patterns || [],
          phaseAccuracy: res.data.phase_accuracy || { opening: 0, middlegame: 0, endgame: 0 },
          totalGames: res.data.total_games || pgns.length,
          totalMoves: res.data.total_moves || 0,
        });
      } else {
        setError(res?.error || "Analysis failed");
      }
    } catch (err: any) {
      setError(err?.message || "Coach analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Coach</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Blunder Pattern Analysis</Text>
        <Text style={styles.subtitle}>
          The coach analyzes your saved games and surfaces recurring patterns
          where you lose material or miss tactics.
        </Text>

        {games.length === 0 && !gamesLoading && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No saved games found. Play some games first, then come back for
              analysis.
            </Text>
          </View>
        )}

        {games.length > 0 && !result && !analyzing && (
          <View>
            <Text style={styles.gamesInfo}>
              {games.length} saved game{games.length !== 1 ? "s" : ""} available
            </Text>
            <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyze}>
              <Text style={styles.analyzeBtnText}>
                Analyze {Math.min(games.length, 20)} games
              </Text>
            </TouchableOpacity>
            <Text style={styles.analyzeHint}>
              This may take a few minutes.
            </Text>
          </View>
        )}

        {analyzing && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={styles.loadingText}>Analyzing your games...</Text>
            <Text style={styles.loadingSub}>
              Running Stockfish on every move. This takes 2-5 minutes.
            </Text>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {result && (
          <View style={styles.resultContainer}>
            {/* Summary */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{result.totalGames}</Text>
                <Text style={styles.summaryLabel}>Games</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{result.totalMoves}</Text>
                <Text style={styles.summaryLabel}>Moves</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{result.patterns.length}</Text>
                <Text style={styles.summaryLabel}>Patterns</Text>
              </View>
            </View>

            {/* Phase accuracy */}
            <View style={styles.phaseCard}>
              <Text style={styles.sectionTitle}>Accuracy by Phase</Text>
              <View style={styles.phaseRow}>
                <PhaseBar label="Opening" value={result.phaseAccuracy.opening} />
                <PhaseBar label="Middlegame" value={result.phaseAccuracy.middlegame} />
                <PhaseBar label="Endgame" value={result.phaseAccuracy.endgame} />
              </View>
            </View>

            {/* Patterns */}
            <Text style={styles.sectionTitle}>Recurring Blunder Patterns</Text>
            {result.patterns.length === 0 ? (
              <Text style={styles.noPatternsText}>
                No clear recurring patterns found. Great play!
              </Text>
            ) : (
              result.patterns.map((p, i) => (
                <View key={i} style={styles.patternCard}>
                  <View style={styles.patternHeader}>
                    <Text style={styles.patternName}>{p.pattern}</Text>
                    <View
                      style={[
                        styles.severityBadge,
                        {
                          backgroundColor:
                            p.severity === "high"
                              ? colors.blunder + "20"
                              : p.severity === "medium"
                                ? colors.inaccuracy + "20"
                                : colors.human + "20",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.severityText,
                          {
                            color:
                              p.severity === "high"
                                ? colors.blunder
                                : p.severity === "medium"
                                  ? colors.inaccuracy
                                  : colors.human,
                          },
                        ]}
                      >
                        {p.severity}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.patternDesc}>{p.description}</Text>
                  <Text style={styles.patternCount}>
                    Occurred {p.count} time{p.count !== 1 ? "s" : ""}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PhaseBar({ label, value }: { label: string; value: number }) {
  const barColor =
    value >= 80 ? colors.human : value >= 60 ? colors.inaccuracy : colors.blunder;
  return (
    <View style={styles.phaseItem}>
      <Text style={styles.phaseLabel}>{label}</Text>
      <View style={styles.phaseBarBg}>
        <View
          style={[
            styles.phaseBarFill,
            { width: `${Math.min(100, value)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      <Text style={[styles.phaseValue, { color: barColor }]}>
        {value.toFixed(0)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface0 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.edge,
  },
  backText: { fontSize: 13, color: colors.zinc500, fontWeight: "600" },
  title: { fontSize: 15, fontWeight: "700", color: colors.paper },

  content: { padding: 20, paddingBottom: 40 },
  heading: { fontSize: 22, fontWeight: "700", color: colors.paper, marginBottom: 6 },
  subtitle: { fontSize: 13, color: colors.zinc500, lineHeight: 19, marginBottom: 20 },

  emptyCard: {
    backgroundColor: colors.surface1,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.edge,
  },
  emptyText: { fontSize: 13, color: colors.zinc400, lineHeight: 19 },

  gamesInfo: { fontSize: 13, color: colors.zinc400, marginBottom: 12 },
  analyzeBtn: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  analyzeBtnText: { fontSize: 15, fontWeight: "700", color: colors.surface0 },
  analyzeHint: { fontSize: 11, color: colors.zinc600, marginTop: 8, textAlign: "center" },

  loadingContainer: { alignItems: "center", paddingTop: 40 },
  loadingText: { fontSize: 15, color: colors.paper, marginTop: 16 },
  loadingSub: { fontSize: 12, color: colors.zinc500, marginTop: 4, textAlign: "center" },

  error: { fontSize: 13, color: colors.blunder, marginTop: 12 },

  resultContainer: { gap: 16 },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.edge,
  },
  summaryValue: { fontSize: 22, fontWeight: "700", color: colors.paper, fontFamily: "monospace" },
  summaryLabel: { fontSize: 10, color: colors.zinc500, marginTop: 2 },

  phaseCard: {
    backgroundColor: colors.surface1,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.edge,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.zinc500,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  phaseRow: { gap: 10 },
  phaseItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  phaseLabel: { width: 80, fontSize: 11, color: colors.zinc400, fontWeight: "600" },
  phaseBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surface2,
    borderRadius: 4,
  },
  phaseBarFill: { height: 8, borderRadius: 4 },
  phaseValue: { width: 36, fontSize: 11, fontWeight: "700", fontFamily: "monospace", textAlign: "right" },

  noPatternsText: { fontSize: 13, color: colors.zinc400, fontStyle: "italic" },
  patternCard: {
    backgroundColor: colors.surface1,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.edge,
  },
  patternHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  patternName: { fontSize: 14, fontWeight: "700", color: colors.paper, flex: 1 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  severityText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  patternDesc: { fontSize: 12, color: colors.zinc400, lineHeight: 18, marginBottom: 4 },
  patternCount: { fontSize: 10, color: colors.zinc600 },
});
