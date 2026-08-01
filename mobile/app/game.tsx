import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { router } from "expo-router";
import { ChessBoard } from "../src/components/ChessBoard";
import { EvalBar } from "../src/components/EvalBar";
import { GameClock } from "../src/components/GameClock";
import { MoveList } from "../src/components/MoveList";
import { PredictionPanel } from "../src/components/PredictionPanel";
import { StyleSliders } from "../src/components/StyleSliders";
import { OpponentBadge } from "../src/components/OpponentBadge";
import { GameOverModal } from "../src/components/GameOverModal";
import { useGameStore } from "../src/store/gameStore";
import { usePlayerStore } from "../src/store/playerStore";
import { usePrediction } from "../src/hooks/usePrediction";
import { useReviewStore } from "../src/store/reviewStore";
import { colors } from "../src/theme/colors";
import * as Haptics from "expo-haptics";

export default function GameScreen() {
  const moveHistory = useGameStore((s) => s.moveHistory);
  const chess = useGameStore((s) => s.chess);
  const playerColor = useGameStore((s) => s.playerColor);
  const applyPredictedMove = useGameStore((s) => s.applyPredictedMove);
  const prediction = useGameStore((s) => s.prediction);
  const timeControl = useGameStore((s) => s.timeControl);
  const opponentTimeLeft = useGameStore((s) => s.opponentTimeLeft);
  const addIncrement = useGameStore((s) => s.addIncrement);
  const flagGameOver = useGameStore((s) => s.flagGameOver);
  const showEvalBar = useGameStore((s) => s.showEvalBar);
  const setShowEvalBar = useGameStore((s) => s.setShowEvalBar);
  const opponent = usePlayerStore((s) => s.opponent);
  const { fetchPrediction, predictionError, retryPrediction } = usePrediction();
  const resetReview = useReviewStore((s) => s.resetReview);
  const setGameData = useReviewStore((s) => s.setGameData);

  const prevMoveCountRef = useRef(moveHistory.length);
  const hasTriggeredFirstMove = useRef(false);
  const opponentTimeLeftRef = useRef(opponentTimeLeft);
  const [showStyle, setShowStyle] = useState(false);

  useEffect(() => {
    opponentTimeLeftRef.current = opponentTimeLeft;
  }, [opponentTimeLeft]);

  // When playing black, trigger AI's first move
  useEffect(() => {
    if (
      playerColor === "b" &&
      moveHistory.length === 0 &&
      !hasTriggeredFirstMove.current
    ) {
      hasTriggeredFirstMove.current = true;
      fetchPrediction();
    }
  }, [playerColor, moveHistory.length, fetchPrediction]);

  // Apply prediction with realistic delay
  useEffect(() => {
    if (prediction?.move && !flagGameOver) {
      const currentTurn = chess.turn();
      const isOpponentTurn = currentTurn !== playerColor;
      if (isOpponentTurn) {
        const numMoves = moveHistory.length;
        const legalMoves = chess.moves().length;
        const opponentRating = opponent?.rating ?? 1500;
        const timeLeft = opponentTimeLeftRef.current;

        let delay = 1000 + (legalMoves / 40) * 3000;
        if (numMoves < 20) delay *= 0.4;
        else if (numMoves > 60) delay *= 0.7;
        delay *= 0.7 + opponentRating / 4000;

        if (timeControl && timeControl.initial > 0) {
          const tcFactor = Math.min(1.5, Math.max(0.3, timeControl.initial / 600));
          delay *= tcFactor;
          if (timeLeft < 10) delay = Math.min(delay, 150 + Math.random() * 250);
          else if (timeLeft < 30) delay = Math.min(delay, 400 + Math.random() * 600);
          else if (timeLeft < 60) delay *= 0.5;
        }

        delay *= 0.7 + Math.random() * 0.6;
        delay = Math.max(400, Math.min(12000, delay));

        const timer = setTimeout(() => {
          applyPredictedMove(prediction.move);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          if (timeControl) addIncrement("opponent");
        }, delay);
        return () => clearTimeout(timer);
      }
    }
  }, [prediction, flagGameOver, chess, playerColor, applyPredictedMove, timeControl, addIncrement, opponent, moveHistory]);

  // Auto-predict after player moves
  useEffect(() => {
    const currentCount = moveHistory.length;
    if (currentCount > prevMoveCountRef.current && currentCount > 0) {
      const currentTurn = chess.turn();
      const isOpponentTurn = currentTurn !== playerColor;
      if (isOpponentTurn && !chess.isGameOver() && !flagGameOver) {
        if (timeControl) addIncrement("player");
        fetchPrediction();
      }
    }
    prevMoveCountRef.current = currentCount;
  }, [moveHistory.length, chess, playerColor, fetchPrediction, timeControl, addIncrement, flagGameOver]);

  // Watchdog: retry prediction if stuck
  useEffect(() => {
    if (flagGameOver || chess.isGameOver()) return;
    const isOpponentTurn = chess.turn() !== playerColor;
    if (!isOpponentTurn) return;
    if (prediction?.move) return;

    const id = setTimeout(() => {
      const g = useGameStore.getState();
      if (g.flagGameOver || g.chess.isGameOver()) return;
      if (g.chess.turn() === playerColor) return;
      if (g.prediction?.move) return;
      if (g.isLoading) return;
      fetchPrediction();
    }, 3000);
    return () => clearTimeout(id);
  }, [prediction, chess, playerColor, flagGameOver, fetchPrediction]);

  const handleBack = () => {
    router.back();
  };

  const handleReview = () => {
    const { moveHistory: moves, playerColor: pc } = useGameStore.getState();
    resetReview();
    setGameData(moves, pc);
    router.push("/review");
  };

  const isOpponentThinking =
    chess.turn() !== playerColor &&
    !chess.isGameOver() &&
    !flagGameOver;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <Text style={styles.headerBtn}>← New</Text>
        </TouchableOpacity>
        <OpponentBadge />
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setShowStyle(!showStyle)}>
            <Text style={[styles.headerIcon, showStyle && styles.headerIconActive]}>
              ⚙
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowEvalBar(!showEvalBar)}>
            <Text style={[styles.headerIcon, showEvalBar && styles.headerIconActive]}>
              ≡
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Error banner */}
      {predictionError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{predictionError}</Text>
          <TouchableOpacity onPress={retryPrediction}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Opponent thinking indicator */}
        {isOpponentThinking && (
          <View style={styles.thinkingBar}>
            <Text style={styles.thinkingText}>Opponent thinking...</Text>
          </View>
        )}

        {/* Board area */}
        <View style={styles.boardArea}>
          {showEvalBar && <EvalBar />}
          <ChessBoard />
        </View>

        <GameClock />

        {/* Style panel */}
        {showStyle && (
          <View style={styles.panelSection}>
            <StyleSliders />
          </View>
        )}

        <View style={styles.panelSection}>
          <PredictionPanel />
        </View>

        <View style={styles.panelSection}>
          <MoveList />
        </View>
      </ScrollView>

      <GameOverModal
        onNewGame={handleBack}
        onReview={handleReview}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface0 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.edge,
  },
  headerBtn: { fontSize: 13, color: colors.zinc500, fontWeight: "600" },
  headerActions: { flexDirection: "row", gap: 14 },
  headerIcon: { fontSize: 18, color: colors.zinc500 },
  headerIconActive: { color: colors.gold },

  errorBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(200, 168, 78, 0.06)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(200, 168, 78, 0.1)",
  },
  errorText: { fontSize: 11, color: colors.inaccuracy, flex: 1 },
  retryText: { fontSize: 11, fontWeight: "700", color: colors.inaccuracy, marginLeft: 12 },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },

  thinkingBar: {
    alignItems: "center",
    paddingVertical: 6,
  },
  thinkingText: {
    fontSize: 11,
    color: colors.zinc500,
    fontStyle: "italic",
  },

  boardArea: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 4,
  },

  panelSection: {
    paddingHorizontal: 12,
    marginTop: 12,
  },
});
