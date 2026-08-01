import React, { useEffect } from "react";
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
import { Chess } from "chess.js";
import { ChessBoard } from "../src/components/ChessBoard";
import {
  useReviewStore,
  CLASSIFICATION_COLORS,
  MoveClassification,
} from "../src/store/reviewStore";
import { useGameStore } from "../src/store/gameStore";
import { usePlayerStore } from "../src/store/playerStore";
import { reviewGame } from "../src/api/client";
import { colors } from "../src/theme/colors";

export default function ReviewScreen() {
  const annotations = useReviewStore((s) => s.annotations);
  const whiteAccuracy = useReviewStore((s) => s.whiteAccuracy);
  const blackAccuracy = useReviewStore((s) => s.blackAccuracy);
  const isAnalyzing = useReviewStore((s) => s.isAnalyzing);
  const analyzeError = useReviewStore((s) => s.analyzeError);
  const selectedPly = useReviewStore((s) => s.selectedPly);
  const moves = useReviewStore((s) => s.moves);
  const playerColor = useReviewStore((s) => s.playerColor);
  const setReviewData = useReviewStore((s) => s.setReviewData);
  const setAnalyzing = useReviewStore((s) => s.setAnalyzing);
  const setAnalyzeError = useReviewStore((s) => s.setAnalyzeError);
  const setSelectedPly = useReviewStore((s) => s.setSelectedPly);
  const opponent = usePlayerStore((s) => s.opponent);

  const setFen = useGameStore((s) => s.setFen);

  useEffect(() => {
    if (moves.length === 0 || annotations.length > 0) return;

    const analyze = async () => {
      setAnalyzing(true);
      try {
        const cloneOptions = opponent?.playerKey
          ? {
              playerKey: opponent.playerKey,
              color: (playerColor === "w" ? "b" : "w") as "w" | "b",
              rating: opponent.rating,
            }
          : undefined;

        const res = await reviewGame(moves, 18, cloneOptions);
        if (res?.success) {
          setReviewData(res.data.annotations, res.data.white, res.data.black);
        } else {
          setAnalyzeError(res?.error || "Analysis failed");
        }
      } catch (err: any) {
        setAnalyzeError(err?.message || "Analysis failed");
      } finally {
        setAnalyzing(false);
      }
    };
    analyze();
  }, [moves, annotations.length, opponent, playerColor]);

  const handleSelectPly = (ply: number) => {
    setSelectedPly(ply);
    const chess = new Chess();
    for (let i = 0; i < ply && i < moves.length; i++) {
      try {
        const from = moves[i].slice(0, 2);
        const to = moves[i].slice(2, 4);
        const promo = moves[i].length > 4 ? moves[i][4] : undefined;
        chess.move({ from, to, promotion: promo });
      } catch {
        break;
      }
    }
    setFen(chess.fen());
  };

  const selectedAnnotation =
    selectedPly >= 0 ? annotations.find((a) => a.ply === selectedPly) : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Game Review</Text>
        <View style={{ width: 50 }} />
      </View>

      {isAnalyzing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold} />
          <Text style={styles.loadingText}>Analyzing game...</Text>
          <Text style={styles.loadingSub}>
            This takes about 30 seconds for a typical game.
          </Text>
        </View>
      ) : analyzeError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{analyzeError}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ChessBoard />

          {/* Accuracy cards */}
          {whiteAccuracy && blackAccuracy && (
            <View style={styles.accuracyRow}>
              <AccuracyCard
                label="White"
                data={whiteAccuracy}
                isPlayer={playerColor === "w"}
              />
              <AccuracyCard
                label="Black"
                data={blackAccuracy}
                isPlayer={playerColor === "b"}
              />
            </View>
          )}

          {/* Move list with classifications */}
          <View style={styles.moveList}>
            <Text style={styles.sectionTitle}>Moves</Text>
            {annotations.map((ann) => (
              <TouchableOpacity
                key={ann.ply}
                style={[
                  styles.moveRow,
                  selectedPly === ann.ply && styles.moveRowActive,
                ]}
                onPress={() => handleSelectPly(ann.ply)}
              >
                <Text style={styles.moveNum}>
                  {Math.ceil(ann.ply / 2)}.{ann.ply % 2 === 1 ? "" : ".."}
                </Text>
                <Text style={styles.moveSan}>{ann.move_san}</Text>
                <View
                  style={[
                    styles.classificationBadge,
                    {
                      backgroundColor:
                        CLASSIFICATION_COLORS[ann.classification] + "20",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.classificationText,
                      {
                        color:
                          CLASSIFICATION_COLORS[ann.classification],
                      },
                    ]}
                  >
                    {ann.classification}
                  </Text>
                </View>
                <Text style={styles.cplText}>
                  {ann.cpl > 0 ? `+${ann.cpl}` : "0"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Selected move detail */}
          {selectedAnnotation && (
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>
                Move {Math.ceil(selectedAnnotation.ply / 2)}: {selectedAnnotation.move_san}
              </Text>
              <Text style={styles.detailClass}>
                {selectedAnnotation.classification.toUpperCase()}
              </Text>
              {selectedAnnotation.classification !== "best" &&
                selectedAnnotation.classification !== "book" && (
                  <Text style={styles.detailBest}>
                    Best was: {selectedAnnotation.best_move_san}
                  </Text>
                )}
              {selectedAnnotation.clone_move_san && (
                <View style={styles.cloneBadge}>
                  <Text style={styles.cloneText}>
                    Clone would have played: {selectedAnnotation.clone_move_san}
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function AccuracyCard({
  label,
  data,
  isPlayer,
}: {
  label: string;
  data: any;
  isPlayer: boolean;
}) {
  return (
    <View
      style={[styles.accuracyCard, isPlayer && styles.accuracyCardHighlight]}
    >
      <Text style={styles.accuracyLabel}>
        {label} {isPlayer ? "(You)" : ""}
      </Text>
      <Text style={styles.accuracyValue}>{data.accuracy.toFixed(1)}%</Text>
      <Text style={styles.accuracyCpl}>
        {data.avg_cpl.toFixed(0)} avg CPL
      </Text>
      <View style={styles.classGrid}>
        <ClassCount label="Best" count={data.best} color={colors.human} />
        <ClassCount label="Blunder" count={data.blunder} color={colors.blunder} />
        <ClassCount label="Mistake" count={data.mistake} color={colors.mistake} />
      </View>
    </View>
  );
}

function ClassCount({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <View style={styles.classCountItem}>
      <Text style={[styles.classCountValue, { color }]}>{count}</Text>
      <Text style={styles.classCountLabel}>{label}</Text>
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
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 100 },
  loadingText: { fontSize: 15, color: colors.paper, marginTop: 16 },
  loadingSub: { fontSize: 12, color: colors.zinc500, marginTop: 4 },
  errorContainer: { padding: 20 },
  errorText: { fontSize: 13, color: colors.blunder },

  accuracyRow: { flexDirection: "row", padding: 12, gap: 8 },
  accuracyCard: {
    flex: 1,
    backgroundColor: colors.surface1,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.edge,
  },
  accuracyCardHighlight: { borderColor: colors.gold + "40" },
  accuracyLabel: { fontSize: 11, color: colors.zinc500, fontWeight: "600", marginBottom: 4 },
  accuracyValue: { fontSize: 24, fontWeight: "700", color: colors.paper, fontFamily: "monospace" },
  accuracyCpl: { fontSize: 10, color: colors.zinc500, marginBottom: 8 },
  classGrid: { flexDirection: "row", gap: 6 },
  classCountItem: { alignItems: "center" },
  classCountValue: { fontSize: 13, fontWeight: "700", fontFamily: "monospace" },
  classCountLabel: { fontSize: 8, color: colors.zinc600 },

  moveList: { paddingHorizontal: 12, marginTop: 8 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.zinc500,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  moveRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 8,
  },
  moveRowActive: { backgroundColor: "rgba(255,255,255,0.06)" },
  moveNum: { width: 32, fontSize: 11, color: colors.zinc600, fontFamily: "monospace" },
  moveSan: { width: 50, fontSize: 13, color: colors.zinc200, fontWeight: "600", fontFamily: "monospace" },
  classificationBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  classificationText: { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  cplText: { fontSize: 10, color: colors.zinc500, fontFamily: "monospace", marginLeft: "auto" },

  detailCard: {
    margin: 12,
    backgroundColor: colors.surface1,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.edge,
  },
  detailTitle: { fontSize: 14, fontWeight: "700", color: colors.paper, marginBottom: 4 },
  detailClass: { fontSize: 11, color: colors.zinc500, marginBottom: 6 },
  detailBest: { fontSize: 12, color: colors.zinc400, marginBottom: 4 },
  cloneBadge: {
    backgroundColor: "rgba(200, 168, 78, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(200, 168, 78, 0.15)",
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
  },
  cloneText: { fontSize: 11, color: colors.gold },
});
