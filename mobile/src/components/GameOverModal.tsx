import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from "react-native";
import { useGameStore } from "../store/gameStore";
import { colors } from "../theme/colors";

interface Props {
  onNewGame: () => void;
  onReview: () => void;
  onSave?: () => void;
}

export function GameOverModal({ onNewGame, onReview, onSave }: Props) {
  const chess = useGameStore((s) => s.chess);
  const flagGameOver = useGameStore((s) => s.flagGameOver);
  const playerColor = useGameStore((s) => s.playerColor);

  const isOver = chess.isGameOver() || !!flagGameOver;
  if (!isOver) return null;

  let title = "Game Over";
  let subtitle = "";

  if (flagGameOver) {
    title =
      flagGameOver.winner === "player"
        ? "You Win!"
        : flagGameOver.winner === "opponent"
          ? "You Lost"
          : "Draw";
    subtitle = flagGameOver.description;
  } else if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "b" : "w";
    title = winner === playerColor ? "You Win!" : "You Lost";
    subtitle = "Checkmate";
  } else if (chess.isStalemate()) {
    title = "Draw";
    subtitle = "Stalemate";
  } else if (chess.isDraw()) {
    title = "Draw";
    subtitle = "Draw by repetition or insufficient material";
  }

  return (
    <Modal transparent animationType="fade" visible={true}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.primaryBtn} onPress={onReview}>
              <Text style={styles.primaryText}>Review</Text>
            </TouchableOpacity>
            {onSave && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={onSave}>
                <Text style={styles.secondaryText}>Save Game</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.secondaryBtn} onPress={onNewGame}>
              <Text style={styles.secondaryText}>New Game</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  card: {
    backgroundColor: colors.surface1,
    borderRadius: 16,
    padding: 28,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.edge,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.paper,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.zinc400,
    marginBottom: 24,
  },
  actions: {
    width: "100%",
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.surface0,
  },
  secondaryBtn: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.edge,
  },
  secondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.zinc300,
  },
});
