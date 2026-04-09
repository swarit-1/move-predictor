import { useState, useEffect } from "react";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../common/Button";

interface AuthScreenProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialMode?: "login" | "register";
}

export function AuthScreen({ onSuccess, onCancel, initialMode = "login" }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  useEffect(() => {
    clearError();
  }, [mode, clearError]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (mode === "login") {
        await login(identifier.trim(), password);
      } else {
        await register(email.trim(), username.trim(), password);
      }
      onSuccess();
    } catch {
      // Error already surfaced via authStore.
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-block">
      <div className="w-full max-w-[420px] animate-fade-in">
        <div className="mb-block text-center">
          <div className="eyebrow mb-3">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </div>
          <h1 className="font-serif text-h1 text-paper">
            {mode === "login" ? "Sign in to continue" : "Build your library"}
          </h1>
          <p className="mt-3 text-[14px] text-walnut-300">
            {mode === "login"
              ? "Access your saved games and history."
              : "Save games, revisit them, and build a personal study archive."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === "register" && (
            <>
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                autoComplete="email"
              />
              <Field
                label="Username"
                value={username}
                onChange={setUsername}
                placeholder="magnus_fan"
                autoComplete="username"
              />
            </>
          )}

          {mode === "login" && (
            <Field
              label="Email or username"
              value={identifier}
              onChange={setIdentifier}
              placeholder="you@example.com"
              autoComplete="username"
            />
          )}

          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {error && (
            <div className="text-[13px] text-danger border border-danger/30 bg-danger/[0.06] rounded-md px-4 py-2.5">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" fullWidth disabled={loading}>
            {loading ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="mt-block flex items-center justify-between text-[13px]">
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="text-walnut-300 hover:text-paper transition-colors"
          >
            {mode === "login" ? "Need an account? Register →" : "Already have an account? Sign in →"}
          </button>
          <button onClick={onCancel} className="text-walnut-300 hover:text-paper transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <div className="eyebrow mb-2">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full bg-transparent border border-edge focus:border-gold focus:outline-none rounded-md px-4 h-12 text-[15px] text-paper placeholder:text-walnut-400 transition-colors"
      />
    </label>
  );
}
