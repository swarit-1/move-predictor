import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
} from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "../src/store/authStore";
import { linkChessAccount } from "../src/api/client";
import { colors } from "../src/theme/colors";

interface ModeItem {
  num: string;
  title: string;
  body: string;
  cta: string;
  route: string;
  requiresAuth?: boolean;
}

const MODES: ModeItem[] = [
  {
    num: "01",
    title: "Play",
    body: "Set an opponent rating, search a real Lichess or Chess.com player, or fine-tune the style sliders.",
    cta: "Start a game",
    route: "/setup",
  },
  {
    num: "02",
    title: "Replay",
    body: "Step through a famous game move-by-move. Fork at any point and let the model play either side.",
    cta: "Open replay",
    route: "/replay",
  },
  {
    num: "03",
    title: "Practice",
    body: "Drill specific opening lines against opponents at any rating level.",
    cta: "Pick an opening",
    route: "/practice",
  },
  {
    num: "04",
    title: "Coach",
    body: "Discover recurring blunder patterns in your saved games.",
    cta: "Analyze my games",
    route: "/coach",
    requiresAuth: true,
  },
];

export default function WelcomeScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkSource, setLinkSource] = useState<"lichess" | "chesscom">("lichess");
  const [linkUsername, setLinkUsername] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const hasLinked = !!user?.linkedChessUsername;

  const handleNav = (item: ModeItem) => {
    if (item.requiresAuth && !user) {
      router.push("/auth");
      return;
    }
    router.push(item.route as any);
  };

  const handleLink = async () => {
    if (!linkUsername.trim()) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      const res = await linkChessAccount(linkSource, linkUsername.trim());
      if (res?.success) {
        setUser(res.data.user);
        setShowLinkForm(false);
        setLinkUsername("");
      } else {
        setLinkError(res?.error || "Failed to link account.");
      }
    } catch (err: any) {
      setLinkError(err?.response?.data?.error || err?.message || "Failed");
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>A human-aware chess engine</Text>
          <Text style={styles.heading}>
            Play the{"\n"}
            <Text style={styles.headingItalic}>player,</Text> not{"\n"}
            the engine.
          </Text>
          <Text style={styles.subheading}>
            Move Predictor trains on a single human's games and learns to
            think the way they do — same blunders, same blind spots, same
            instincts.
          </Text>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push("/setup")}
            >
              <Text style={styles.primaryBtnText}>Start a game</Text>
            </TouchableOpacity>

            {user && hasLinked && (
              <TouchableOpacity
                style={styles.outlineBtn}
                onPress={() => router.push("/setup")}
              >
                <Text style={styles.outlineBtnText}>
                  Play yourself ({user.linkedChessUsername})
                </Text>
              </TouchableOpacity>
            )}

            {user && !hasLinked && (
              <TouchableOpacity
                style={styles.outlineBtn}
                onPress={() => setShowLinkForm((v) => !v)}
              >
                <Text style={styles.outlineBtnText}>Link my chess account</Text>
              </TouchableOpacity>
            )}

            {!user && (
              <TouchableOpacity
                style={styles.outlineBtn}
                onPress={() => router.push("/auth")}
              >
                <Text style={styles.outlineBtnText}>Create account</Text>
              </TouchableOpacity>
            )}

            {user && (
              <TouchableOpacity
                style={styles.outlineBtn}
                onPress={() => router.push("/history")}
              >
                <Text style={styles.outlineBtnText}>My games</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Link form */}
          {showLinkForm && user && (
            <View style={styles.linkForm}>
              <View style={styles.sourceRow}>
                {(["lichess", "chesscom"] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setLinkSource(s)}
                    style={[
                      styles.sourceBtn,
                      linkSource === s && styles.sourceBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.sourceBtnText,
                        linkSource === s && styles.sourceBtnTextActive,
                      ]}
                    >
                      {s === "lichess" ? "Lichess" : "Chess.com"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.linkInputRow}>
                <TextInput
                  style={styles.linkInput}
                  value={linkUsername}
                  onChangeText={setLinkUsername}
                  placeholder="Username"
                  placeholderTextColor={colors.zinc600}
                  autoCapitalize="none"
                  returnKeyType="go"
                  onSubmitEditing={handleLink}
                />
                <TouchableOpacity
                  style={[styles.linkSubmit, linkBusy && styles.disabled]}
                  onPress={handleLink}
                  disabled={linkBusy || !linkUsername.trim()}
                >
                  <Text style={styles.linkSubmitText}>
                    {linkBusy ? "..." : "Save"}
                  </Text>
                </TouchableOpacity>
              </View>
              {linkError && <Text style={styles.linkError}>{linkError}</Text>}
            </View>
          )}
        </View>

        {/* Stats card */}
        <View style={styles.statsCard}>
          <Text style={styles.eyebrow}>Model</Text>
          <View style={styles.statsGrid}>
            <StatItem label="Encoder" value="ResNet-15" />
            <StatItem label="Sequence" value="Transformer-4L" />
            <StatItem label="Sources" value="Lichess · CC" />
            <StatItem label="Players" value="∞" />
          </View>
        </View>

        {/* Modes */}
        <View style={styles.modes}>
          <Text style={styles.eyebrow}>What you can do</Text>
          {MODES.map((mode) => (
            <TouchableOpacity
              key={mode.num}
              style={styles.modeCard}
              onPress={() => handleNav(mode)}
              activeOpacity={0.7}
            >
              <View style={styles.modeHeader}>
                <Text style={styles.modeNum}>{mode.num}</Text>
                <Text style={styles.modeTitle}>{mode.title}</Text>
              </View>
              <Text style={styles.modeBody}>{mode.body}</Text>
              <Text style={styles.modeCta}>{mode.cta} →</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* How it works */}
        <View style={styles.howSection}>
          <Text style={styles.eyebrow}>Method</Text>
          <Text style={styles.howTitle}>
            How a single human becomes a model.
          </Text>
          <View style={styles.stepsGrid}>
            <StepCard
              num="i"
              title="Fetch real games"
              body="Up to thousands of rated games pulled from Lichess or Chess.com."
            />
            <StepCard
              num="ii"
              title="Extract style"
              body="Aggression, risk, blunder rate — distilled into a 33-dim player vector."
            />
            <StepCard
              num="iii"
              title="Imitate at the board"
              body="The model samples moves humans like that one would actually play."
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function StepCard({
  num,
  title,
  body,
}: {
  num: string;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepHeader}>
        <Text style={styles.stepNum}>{num}.</Text>
        <Text style={styles.stepTitle}>{title}</Text>
      </View>
      <Text style={styles.stepBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface0 },
  scroll: { flex: 1 },
  content: { paddingBottom: 40 },

  hero: { paddingHorizontal: 20, paddingTop: 48, paddingBottom: 32 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.zinc500,
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 12,
  },
  heading: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.paper,
    lineHeight: 42,
  },
  headingItalic: {
    fontStyle: "italic",
    color: colors.walnut300,
  },
  subheading: {
    fontSize: 15,
    color: colors.walnut300,
    lineHeight: 22,
    marginTop: 16,
    maxWidth: 340,
  },
  actions: { marginTop: 24, gap: 10 },
  primaryBtn: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.surface0,
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  outlineBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.paper,
  },

  linkForm: { marginTop: 16, gap: 8 },
  sourceRow: { flexDirection: "row", gap: 8 },
  sourceBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.edge,
    alignItems: "center",
  },
  sourceBtnActive: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.edgeStrong,
  },
  sourceBtnText: { fontSize: 12, color: colors.zinc500 },
  sourceBtnTextActive: { color: colors.paper },
  linkInputRow: { flexDirection: "row", gap: 8 },
  linkInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.paper,
    fontSize: 13,
  },
  linkSubmit: {
    backgroundColor: colors.gold,
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  linkSubmitText: { fontSize: 12, fontWeight: "700", color: colors.surface0 },
  disabled: { opacity: 0.5 },
  linkError: { fontSize: 11, color: colors.blunder },

  statsCard: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: 14,
    padding: 16,
    marginBottom: 32,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  statItem: { width: "45%" },
  statLabel: {
    fontSize: 9,
    color: colors.zinc500,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  statValue: {
    fontSize: 12,
    color: colors.paper,
    fontFamily: "monospace",
    marginTop: 2,
  },

  modes: { paddingHorizontal: 20, marginBottom: 32 },
  modeCard: {
    borderTopWidth: 1,
    borderTopColor: colors.edge,
    paddingVertical: 20,
  },
  modeHeader: { flexDirection: "row", alignItems: "baseline", gap: 12, marginBottom: 8 },
  modeNum: {
    fontSize: 32,
    fontWeight: "300",
    color: colors.walnut400,
    fontFamily: "monospace",
  },
  modeTitle: { fontSize: 24, fontWeight: "700", color: colors.paper },
  modeBody: { fontSize: 14, color: colors.walnut300, lineHeight: 20, marginBottom: 12 },
  modeCta: { fontSize: 13, fontWeight: "600", color: colors.paper },

  howSection: { paddingHorizontal: 20, paddingTop: 20 },
  howTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.paper,
    marginBottom: 16,
    lineHeight: 28,
  },
  stepsGrid: { gap: 10 },
  stepCard: {
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: 14,
    padding: 16,
  },
  stepHeader: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 6 },
  stepNum: { fontSize: 16, fontStyle: "italic", color: colors.walnut300 },
  stepTitle: { fontSize: 17, fontWeight: "700", color: colors.paper },
  stepBody: { fontSize: 13, color: colors.walnut300, lineHeight: 19 },
});
