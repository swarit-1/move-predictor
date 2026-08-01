import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSavedGamesStore, SavedGame } from "../src/store/savedGamesStore";
import { useGameStore } from "../src/store/gameStore";
import { useReviewStore } from "../src/store/reviewStore";
import { colors } from "../src/theme/colors";

export default function HistoryScreen() {
  const { games, loading, error, fetchGames, deleteOne } = useSavedGamesStore();
  const loadPgn = useGameStore((s) => s.loadPgn);
  const resetReview = useReviewStore((s) => s.resetReview);
  const setGameData = useReviewStore((s) => s.setGameData);

  useEffect(() => {
    fetchGames();
  }, []);

  const handleOpenGame = (game: SavedGame) => {
    loadPgn(game.pgn);
    const moves = useGameStore.getState().moveHistory;
    resetReview();
    setGameData(moves, game.playerColor);
    router.push("/review");
  };

  const handleDelete = (game: SavedGame) => {
    Alert.alert("Delete Game", "Are you sure you want to delete this game?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteOne(game.id),
      },
    ]);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const resultDisplay = (result: string | null) => {
    if (result === "1-0") return { text: "1-0", color: colors.human };
    if (result === "0-1") return { text: "0-1", color: colors.blunder };
    if (result === "1/2-1/2") return { text: "½-½", color: colors.zinc400 };
    return { text: "?", color: colors.zinc600 };
  };

  const renderItem = ({ item }: { item: SavedGame }) => {
    const rd = resultDisplay(item.result);
    return (
      <TouchableOpacity
        style={styles.gameCard}
        onPress={() => handleOpenGame(item)}
        onLongPress={() => handleDelete(item)}
      >
        <View style={styles.gameHeader}>
          <View style={styles.gameInfo}>
            <Text style={styles.opponentName}>
              {item.opponentName || "Unknown opponent"}
            </Text>
            {item.opponentRating && (
              <Text style={styles.rating}>{item.opponentRating}</Text>
            )}
          </View>
          <Text style={[styles.result, { color: rd.color }]}>{rd.text}</Text>
        </View>
        <View style={styles.gameMeta}>
          <Text style={styles.metaText}>
            {item.numMoves} moves
            {item.timeControl ? ` · ${item.timeControl}` : ""}
            {item.endReason ? ` · ${item.endReason}` : ""}
          </Text>
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
        </View>
        {item.opponentSource && (
          <Text style={styles.source}>
            {item.opponentSource === "lichess" ? "Lichess" : "Chess.com"}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>My Games</Text>
        <View style={{ width: 50 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchGames}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : games.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No games yet</Text>
          <Text style={styles.emptyText}>
            Play a game and save it to see it here.
          </Text>
          <TouchableOpacity
            style={styles.playBtn}
            onPress={() => router.push("/setup")}
          >
            <Text style={styles.playBtnText}>Start a game</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={games}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
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

  listContent: { padding: 16, gap: 8 },
  gameCard: {
    backgroundColor: colors.surface1,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.edge,
  },
  gameHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  gameInfo: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  opponentName: { fontSize: 15, fontWeight: "700", color: colors.paper },
  rating: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.zinc400,
    fontFamily: "monospace",
  },
  result: { fontSize: 16, fontWeight: "700", fontFamily: "monospace" },
  gameMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaText: { fontSize: 11, color: colors.zinc500 },
  date: { fontSize: 10, color: colors.zinc600 },
  source: {
    fontSize: 9,
    color: colors.zinc600,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  errorText: { fontSize: 13, color: colors.blunder, marginBottom: 12 },
  retryBtn: {
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: { fontSize: 13, color: colors.paper },

  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.paper, marginBottom: 6 },
  emptyText: { fontSize: 13, color: colors.zinc500, marginBottom: 20, textAlign: "center" },
  playBtn: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  playBtnText: { fontSize: 14, fontWeight: "700", color: colors.surface0 },
});
