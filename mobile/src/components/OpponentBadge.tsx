import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { usePlayerStore } from "../store/playerStore";
import { colors } from "../theme/colors";

export function OpponentBadge() {
  const opponent = usePlayerStore((s) => s.opponent);
  if (!opponent) return null;

  const sourceLabel =
    opponent.source === "lichess"
      ? "Lichess"
      : opponent.source === "chesscom"
        ? "Chess.com"
        : "";

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {opponent.username[0].toUpperCase()}
        </Text>
      </View>
      <View>
        <Text style={styles.name} numberOfLines={1}>
          {opponent.username}
        </Text>
        <Text style={styles.detail}>
          {opponent.rating} {sourceLabel ? `· ${sourceLabel}` : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.edge,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.zinc300,
  },
  name: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.zinc200,
    maxWidth: 120,
  },
  detail: {
    fontSize: 10,
    color: colors.zinc500,
    fontFamily: "monospace",
  },
});
