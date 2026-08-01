import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useGameStore } from "../store/gameStore";
import { useChessGame } from "../hooks/useChessGame";
import { colors } from "../theme/colors";
import * as Haptics from "expo-haptics";

const PIECE_SYMBOLS: Record<string, string> = {
  wk: "♔",
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
  bk: "♚",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

export function ChessBoard() {
  const { fen, legalMoves, onSquarePress } = useChessGame();
  const playerColor = useGameStore((s) => s.playerColor);
  const selectedSquare = useGameStore((s) => s.selectedSquare);
  const moveHistory = useGameStore((s) => s.moveHistory);
  const flagGameOver = useGameStore((s) => s.flagGameOver);
  const chess = useGameStore((s) => s.chess);

  const screenWidth = Dimensions.get("window").width;
  const boardSize = Math.min(screenWidth - 16, 400);
  const squareSize = boardSize / 8;

  const flipped = playerColor === "b";

  const board = useMemo(() => {
    const rows: Array<
      Array<{ square: string; piece: string | null; isLight: boolean }>
    > = [];
    const ranks = flipped ? [...RANKS].reverse() : RANKS;
    const files = flipped ? [...FILES].reverse() : FILES;

    for (const rank of ranks) {
      const row: Array<{
        square: string;
        piece: string | null;
        isLight: boolean;
      }> = [];
      for (const file of files) {
        const square = `${file}${rank}`;
        const fileIdx = FILES.indexOf(file);
        const rankIdx = RANKS.indexOf(rank);
        const isLight = (fileIdx + rankIdx) % 2 === 0;
        const p = chess.get(square as any);
        const piece = p ? `${p.color}${p.type}` : null;
        row.push({ square, piece, isLight });
      }
      rows.push(row);
    }
    return rows;
  }, [fen, flipped, chess]);

  const legalTargets = useMemo(() => {
    if (!selectedSquare) return new Set<string>();
    return new Set(
      legalMoves
        .filter((m: any) => m.from === selectedSquare)
        .map((m: any) => m.to),
    );
  }, [selectedSquare, legalMoves]);

  const lastMove = useMemo(() => {
    if (moveHistory.length === 0) return null;
    const last = moveHistory[moveHistory.length - 1];
    if (last && last.length >= 4) {
      return { from: last.slice(0, 2), to: last.slice(2, 4) };
    }
    return null;
  }, [moveHistory]);

  const handlePress = (square: string) => {
    if (flagGameOver || chess.isGameOver()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSquarePress(square);
  };

  return (
    <View style={[styles.container, { width: boardSize, height: boardSize }]}>
      {board.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map(({ square, piece, isLight }) => {
            const isSelected = selectedSquare === square;
            const isLegalTarget = legalTargets.has(square);
            const isLastMove =
              lastMove?.from === square || lastMove?.to === square;
            const hasPiece = !!piece;

            let bgColor = isLight ? colors.boardLight : colors.boardDark;
            if (isSelected) bgColor = colors.selectedSquare;
            else if (isLastMove)
              bgColor = isLight
                ? "rgba(155, 199, 0, 0.45)"
                : "rgba(130, 170, 0, 0.55)";

            return (
              <TouchableOpacity
                key={square}
                activeOpacity={0.7}
                onPress={() => handlePress(square)}
                style={[
                  styles.square,
                  {
                    width: squareSize,
                    height: squareSize,
                    backgroundColor: bgColor,
                  },
                ]}
              >
                {piece && (
                  <Text
                    style={[
                      styles.piece,
                      {
                        fontSize: squareSize * 0.75,
                        color: piece[0] === "w" ? "#FFF" : "#111",
                        textShadowColor:
                          piece[0] === "w"
                            ? "rgba(0,0,0,0.4)"
                            : "rgba(255,255,255,0.3)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                      },
                    ]}
                  >
                    {PIECE_SYMBOLS[piece]}
                  </Text>
                )}
                {isLegalTarget && !hasPiece && (
                  <View
                    style={[
                      styles.legalDot,
                      {
                        width: squareSize * 0.3,
                        height: squareSize * 0.3,
                        borderRadius: squareSize * 0.15,
                      },
                    ]}
                  />
                )}
                {isLegalTarget && hasPiece && (
                  <View
                    style={[
                      styles.captureRing,
                      {
                        width: squareSize * 0.9,
                        height: squareSize * 0.9,
                        borderRadius: squareSize * 0.45,
                      },
                    ]}
                  />
                )}
                {/* Rank label on leftmost file */}
                {(flipped
                  ? FILES.indexOf(square[0]) === 7
                  : FILES.indexOf(square[0]) === 0) && (
                  <Text
                    style={[
                      styles.coordLabel,
                      {
                        top: 2,
                        left: 2,
                        color: isLight ? colors.boardDark : colors.boardLight,
                      },
                    ]}
                  >
                    {square[1]}
                  </Text>
                )}
                {/* File label on bottom rank */}
                {(flipped
                  ? RANKS.indexOf(square[1]) === 0
                  : RANKS.indexOf(square[1]) === 7) && (
                  <Text
                    style={[
                      styles.coordLabel,
                      {
                        bottom: 1,
                        right: 3,
                        color: isLight ? colors.boardDark : colors.boardLight,
                      },
                    ]}
                  >
                    {square[0]}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 4,
    overflow: "hidden",
    alignSelf: "center",
  },
  row: {
    flexDirection: "row",
  },
  square: {
    alignItems: "center",
    justifyContent: "center",
  },
  piece: {
    fontWeight: "400",
  },
  legalDot: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    position: "absolute",
  },
  captureRing: {
    borderWidth: 3,
    borderColor: "rgba(0, 0, 0, 0.2)",
    position: "absolute",
  },
  coordLabel: {
    position: "absolute",
    fontSize: 9,
    fontWeight: "700",
    opacity: 0.7,
  },
});
