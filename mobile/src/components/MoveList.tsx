import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useGameStore } from "../store/gameStore";
import { colors } from "../theme/colors";
import { Chess } from "chess.js";

export function MoveList() {
  const chess = useGameStore((s) => s.chess);
  const viewIndex = useGameStore((s) => s.viewIndex);
  const goToMove = useGameStore((s) => s.goToMove);

  const sanMoves = chess.history();
  if (sanMoves.length === 0) return null;

  const pairs: Array<{ num: number; white: string; black?: string }> = [];
  for (let i = 0; i < sanMoves.length; i += 2) {
    pairs.push({
      num: Math.floor(i / 2) + 1,
      white: sanMoves[i],
      black: sanMoves[i + 1],
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Moves</Text>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {pairs.map((pair) => (
          <View key={pair.num} style={styles.row}>
            <Text style={styles.moveNum}>{pair.num}.</Text>
            <TouchableOpacity
              onPress={() => goToMove((pair.num - 1) * 2)}
              style={[
                styles.move,
                viewIndex === (pair.num - 1) * 2 && styles.activeMove,
              ]}
            >
              <Text
                style={[
                  styles.moveText,
                  viewIndex === (pair.num - 1) * 2 && styles.activeMoveText,
                ]}
              >
                {pair.white}
              </Text>
            </TouchableOpacity>
            {pair.black && (
              <TouchableOpacity
                onPress={() => goToMove((pair.num - 1) * 2 + 1)}
                style={[
                  styles.move,
                  viewIndex === (pair.num - 1) * 2 + 1 && styles.activeMove,
                ]}
              >
                <Text
                  style={[
                    styles.moveText,
                    viewIndex === (pair.num - 1) * 2 + 1 &&
                      styles.activeMoveText,
                  ]}
                >
                  {pair.black}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface1,
    borderRadius: 12,
    padding: 12,
    maxHeight: 200,
  },
  title: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.zinc500,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scroll: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  moveNum: {
    width: 28,
    fontSize: 11,
    color: colors.zinc600,
    fontFamily: "monospace",
  },
  move: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    minWidth: 52,
  },
  activeMove: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  moveText: {
    fontSize: 13,
    color: colors.zinc300,
    fontFamily: "monospace",
    fontWeight: "500",
  },
  activeMoveText: {
    color: colors.white,
    fontWeight: "700",
  },
});
