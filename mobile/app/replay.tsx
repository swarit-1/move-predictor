import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { Chess } from "chess.js";
import { useGameStore } from "../src/store/gameStore";
import { colors } from "../src/theme/colors";

const PIECE_SYMBOLS: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

interface FamousGame {
  name: string;
  white: string;
  black: string;
  year: number;
  pgn: string;
}

const FAMOUS_GAMES: FamousGame[] = [
  {
    name: "Immortal Game",
    white: "Anderssen",
    black: "Kieseritzky",
    year: 1851,
    pgn: "1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7#",
  },
  {
    name: "Opera Game",
    white: "Morphy",
    black: "Allies",
    year: 1858,
    pgn: "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#",
  },
  {
    name: "Kasparov vs Topalov",
    white: "Kasparov",
    black: "Topalov",
    year: 1999,
    pgn: "1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O 14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Re1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 24. Rxd4 cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 Qxd5 29. Ra7 Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 36. Bf1 Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7",
  },
];

export default function ReplayScreen() {
  const [selectedGame, setSelectedGame] = useState<FamousGame | null>(null);
  const [chess] = useState(new Chess());
  const [moves, setMoves] = useState<string[]>([]);
  const [moveIndex, setMoveIndex] = useState(0);
  const [fen, setFen] = useState(new Chess().fen());

  const screenWidth = Dimensions.get("window").width;
  const squareSize = (Math.min(screenWidth - 32, 400)) / 8;

  const loadGame = (game: FamousGame) => {
    setSelectedGame(game);
    const c = new Chess();
    c.loadPgn(game.pgn);
    const m = c.history();
    setMoves(m);
    setMoveIndex(0);
    chess.reset();
    setFen(chess.fen());
  };

  const step = (dir: number) => {
    const newIdx = moveIndex + dir;
    if (newIdx < 0 || newIdx > moves.length) return;
    const c = new Chess();
    for (let i = 0; i < newIdx; i++) c.move(moves[i]);
    setMoveIndex(newIdx);
    setFen(c.fen());
  };

  const board = (() => {
    const c = new Chess(fen);
    const rows: Array<Array<{ sq: string; piece: string | null; isLight: boolean }>> = [];
    for (const rank of RANKS) {
      const row: typeof rows[0] = [];
      for (const file of FILES) {
        const sq = `${file}${rank}`;
        const fi = FILES.indexOf(file);
        const ri = RANKS.indexOf(rank);
        const p = c.get(sq as any);
        row.push({ sq, piece: p ? `${p.color}${p.type}` : null, isLight: (fi + ri) % 2 === 0 });
      }
      rows.push(row);
    }
    return rows;
  })();

  if (!selectedGame) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Replay</Text>
          <View style={{ width: 50 }} />
        </View>
        <ScrollView contentContainerStyle={styles.listContent}>
          <Text style={styles.listSubtitle}>Famous games</Text>
          {FAMOUS_GAMES.map((game) => (
            <TouchableOpacity
              key={game.name}
              style={styles.gameCard}
              onPress={() => loadGame(game)}
            >
              <Text style={styles.gameName}>{game.name}</Text>
              <Text style={styles.gamePlayers}>
                {game.white} vs {game.black}, {game.year}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setSelectedGame(null)}>
          <Text style={styles.backText}>← Games</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {selectedGame.name}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.replayContent}>
        {/* Board */}
        <View style={[styles.boardContainer, { width: squareSize * 8, alignSelf: "center" }]}>
          {board.map((row, ri) => (
            <View key={ri} style={{ flexDirection: "row" }}>
              {row.map(({ sq, piece, isLight }) => (
                <View
                  key={sq}
                  style={{
                    width: squareSize,
                    height: squareSize,
                    backgroundColor: isLight ? colors.boardLight : colors.boardDark,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {piece && (
                    <Text
                      style={{
                        fontSize: squareSize * 0.75,
                        color: piece[0] === "w" ? "#FFF" : "#111",
                        textShadowColor: piece[0] === "w" ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.3)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                      }}
                    >
                      {PIECE_SYMBOLS[piece]}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity style={styles.ctrlBtn} onPress={() => { setMoveIndex(0); chess.reset(); setFen(chess.fen()); }}>
            <Text style={styles.ctrlText}>⏮</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPress={() => step(-1)}>
            <Text style={styles.ctrlText}>◀</Text>
          </TouchableOpacity>
          <Text style={styles.moveCounter}>
            {moveIndex} / {moves.length}
          </Text>
          <TouchableOpacity style={styles.ctrlBtn} onPress={() => step(1)}>
            <Text style={styles.ctrlText}>▶</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPress={() => {
            const c = new Chess();
            for (const m of moves) c.move(m);
            setMoveIndex(moves.length);
            setFen(c.fen());
          }}>
            <Text style={styles.ctrlText}>⏭</Text>
          </TouchableOpacity>
        </View>

        {/* Move list */}
        <View style={styles.replayMoveList}>
          {moves.map((m, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => {
                const c = new Chess();
                for (let j = 0; j <= i; j++) c.move(moves[j]);
                setMoveIndex(i + 1);
                setFen(c.fen());
              }}
              style={[styles.replayMove, moveIndex === i + 1 && styles.replayMoveActive]}
            >
              {i % 2 === 0 && (
                <Text style={styles.replayMoveNum}>{Math.floor(i / 2) + 1}.</Text>
              )}
              <Text style={[styles.replayMoveText, moveIndex === i + 1 && styles.replayMoveTextActive]}>
                {m}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
  title: { fontSize: 15, fontWeight: "700", color: colors.paper, maxWidth: 200 },

  listContent: { padding: 20 },
  listSubtitle: { fontSize: 12, color: colors.zinc500, marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 },
  gameCard: {
    backgroundColor: colors.surface1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.edge,
  },
  gameName: { fontSize: 16, fontWeight: "700", color: colors.paper, marginBottom: 4 },
  gamePlayers: { fontSize: 12, color: colors.zinc500 },

  replayContent: { paddingBottom: 40 },
  boardContainer: { borderRadius: 4, overflow: "hidden", marginTop: 12 },

  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 16,
  },
  ctrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlText: { fontSize: 16, color: colors.zinc300 },
  moveCounter: { fontSize: 13, color: colors.zinc500, fontFamily: "monospace", minWidth: 60, textAlign: "center" },

  replayMoveList: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 2,
  },
  replayMove: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  replayMoveActive: { backgroundColor: "rgba(255,255,255,0.08)" },
  replayMoveNum: { fontSize: 11, color: colors.zinc600, fontFamily: "monospace", marginRight: 2 },
  replayMoveText: { fontSize: 12, color: colors.zinc400, fontFamily: "monospace" },
  replayMoveTextActive: { color: colors.white, fontWeight: "700" },
});
