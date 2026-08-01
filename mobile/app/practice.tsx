import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { router } from "expo-router";
import { useGameStore } from "../src/store/gameStore";
import { colors } from "../src/theme/colors";

interface Opening {
  name: string;
  eco: string;
  moves: string[];
  category: string;
}

const OPENINGS: Opening[] = [
  { name: "Italian Game", eco: "C50", moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"], category: "Open" },
  { name: "Ruy Lopez", eco: "C60", moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"], category: "Open" },
  { name: "Sicilian Defense", eco: "B20", moves: ["e4", "c5"], category: "Semi-Open" },
  { name: "Sicilian Najdorf", eco: "B90", moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"], category: "Semi-Open" },
  { name: "French Defense", eco: "C00", moves: ["e4", "e6"], category: "Semi-Open" },
  { name: "Caro-Kann", eco: "B10", moves: ["e4", "c6"], category: "Semi-Open" },
  { name: "Queen's Gambit", eco: "D06", moves: ["d4", "d5", "c4"], category: "Closed" },
  { name: "Queen's Gambit Declined", eco: "D30", moves: ["d4", "d5", "c4", "e6"], category: "Closed" },
  { name: "King's Indian", eco: "E60", moves: ["d4", "Nf6", "c4", "g6"], category: "Indian" },
  { name: "Nimzo-Indian", eco: "E20", moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"], category: "Indian" },
  { name: "London System", eco: "D00", moves: ["d4", "d5", "Bf4"], category: "System" },
  { name: "English Opening", eco: "A10", moves: ["c4"], category: "Flank" },
  { name: "Scotch Game", eco: "C45", moves: ["e4", "e5", "Nf3", "Nc6", "d4"], category: "Open" },
  { name: "Pirc Defense", eco: "B07", moves: ["e4", "d6", "d4", "Nf6"], category: "Semi-Open" },
  { name: "Grünfeld Defense", eco: "D70", moves: ["d4", "Nf6", "c4", "g6", "Nc3", "d5"], category: "Indian" },
  { name: "Slav Defense", eco: "D10", moves: ["d4", "d5", "c4", "c6"], category: "Closed" },
];

const CATEGORIES = ["Open", "Semi-Open", "Closed", "Indian", "System", "Flank"];

export default function PracticeScreen() {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const resetGame = useGameStore((s) => s.resetGame);

  const filtered = selectedCat
    ? OPENINGS.filter((o) => o.category === selectedCat)
    : OPENINGS;

  const handleSelect = (opening: Opening) => {
    resetGame();
    // Set up the opening moves then navigate to game
    const g = useGameStore.getState();
    // Apply opening moves to game state
    for (const san of opening.moves) {
      try {
        const result = g.chess.move(san);
        if (result) {
          useGameStore.setState((s) => ({
            fen: s.chess.fen(),
            moveHistory: [...s.moveHistory, result.lan],
            pgn: s.chess.pgn(),
          }));
        }
      } catch {
        break;
      }
    }
    useGameStore.setState({ fen: g.chess.fen() });
    router.push("/game");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Practice Openings</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Category filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.catScroll}
        contentContainerStyle={styles.catRow}
      >
        <TouchableOpacity
          style={[styles.catBtn, !selectedCat && styles.catBtnActive]}
          onPress={() => setSelectedCat(null)}
        >
          <Text style={[styles.catText, !selectedCat && styles.catTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.catBtn, selectedCat === cat && styles.catBtnActive]}
            onPress={() => setSelectedCat(cat === selectedCat ? null : cat)}
          >
            <Text style={[styles.catText, selectedCat === cat && styles.catTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.listContent}>
        {filtered.map((opening) => (
          <TouchableOpacity
            key={opening.name}
            style={styles.openingCard}
            onPress={() => handleSelect(opening)}
          >
            <View style={styles.openingHeader}>
              <Text style={styles.openingName}>{opening.name}</Text>
              <Text style={styles.eco}>{opening.eco}</Text>
            </View>
            <Text style={styles.openingMoves}>
              {opening.moves.reduce((acc, m, i) => {
                if (i % 2 === 0) return acc + `${Math.floor(i / 2) + 1}. ${m} `;
                return acc + `${m} `;
              }, "").trim()}
            </Text>
            <Text style={styles.openingCat}>{opening.category}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.edge,
  },
  backText: { fontSize: 13, color: colors.zinc500, fontWeight: "600" },
  title: { fontSize: 15, fontWeight: "700", color: colors.paper },

  catScroll: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.edge },
  catRow: { paddingHorizontal: 16, gap: 6, alignItems: "center" },
  catBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surface1,
  },
  catBtnActive: { backgroundColor: colors.goldDim, borderWidth: 1, borderColor: "rgba(200,168,78,0.25)" },
  catText: { fontSize: 12, fontWeight: "600", color: colors.zinc500 },
  catTextActive: { color: colors.gold },

  listContent: { padding: 16, gap: 8 },
  openingCard: {
    backgroundColor: colors.surface1,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.edge,
  },
  openingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  openingName: { fontSize: 15, fontWeight: "700", color: colors.paper },
  eco: { fontSize: 11, color: colors.zinc600, fontFamily: "monospace" },
  openingMoves: { fontSize: 12, color: colors.zinc400, fontFamily: "monospace", marginBottom: 4 },
  openingCat: { fontSize: 10, color: colors.zinc600, textTransform: "uppercase", letterSpacing: 1 },
});
