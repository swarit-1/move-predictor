import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "../src/store/authStore";
import { colors } from "../src/theme/colors";

export default function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const { loading, error, login, register, clearError } = useAuthStore();

  const handleSubmit = async () => {
    try {
      if (mode === "login") {
        await login(email || username, password);
      } else {
        await register(email, username, password);
      }
      router.back();
    } catch {}
  };

  const toggleMode = () => {
    clearError();
    setMode(mode === "login" ? "register" : "login");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          {/* Back button */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>
            {mode === "login" ? "Welcome back" : "Create account"}
          </Text>
          <Text style={styles.subtitle}>
            {mode === "login"
              ? "Sign in to save games and access coach mode."
              : "Join to save games and track your progress."}
          </Text>

          <View style={styles.form}>
            {mode === "register" && (
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={colors.zinc600}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            )}
            <TextInput
              style={styles.input}
              placeholder={mode === "login" ? "Email or username" : "Email"}
              placeholderTextColor={colors.zinc600}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.zinc600}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.disabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitText}>
                {loading
                  ? "Loading..."
                  : mode === "login"
                    ? "Sign In"
                    : "Create Account"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={toggleMode} style={styles.toggleBtn}>
              <Text style={styles.toggleText}>
                {mode === "login"
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface0 },
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  backBtn: { position: "absolute", top: 16, left: 24 },
  backText: { fontSize: 14, color: colors.zinc500 },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.paper,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.zinc500,
    marginBottom: 28,
  },
  form: { gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.paper,
    fontSize: 14,
    backgroundColor: colors.surface1,
  },
  error: {
    fontSize: 12,
    color: colors.blunder,
    paddingHorizontal: 4,
  },
  submitBtn: {
    backgroundColor: colors.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.surface0,
  },
  disabled: { opacity: 0.5 },
  toggleBtn: { alignItems: "center", marginTop: 12 },
  toggleText: { fontSize: 13, color: colors.zinc500 },
});
