import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../../store/authStore";
import { forgotPassword } from "../../api/client";
import { Button } from "../common/Button";

interface AuthScreenProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialMode?: "login" | "register";
}

type Mode = "login" | "register" | "2fa" | "forgot" | "forgot-sent";

export function AuthScreen({ onSuccess, onCancel, initialMode = "login" }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const cancel2fa = useAuthStore((s) => s.cancel2fa);

  useEffect(() => {
    clearError();
  }, [mode, clearError]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (mode === "login") {
        // PLAN.md §6.1: 2FA-enabled accounts require a code step before a
        // session exists.
        const needs2fa = await login(identifier.trim(), password);
        if (needs2fa) {
          setMode("2fa");
          return;
        }
      } else {
        await register(email.trim(), username.trim(), password);
      }
      onSuccess();
    } catch {
      // Error already surfaced via authStore.
    }
  }

  if (mode === "2fa") {
    return (
      <TwoFactorStep
        onSuccess={onSuccess}
        onBack={() => {
          cancel2fa();
          setMode("login");
        }}
      />
    );
  }

  if (mode === "forgot" || mode === "forgot-sent") {
    return (
      <ForgotPasswordStep
        sent={mode === "forgot-sent"}
        onSent={() => setMode("forgot-sent")}
        onBack={() => setMode("login")}
      />
    );
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

          {mode === "login" && (
            <div className="flex justify-end -mt-2">
              <button
                type="button"
                onClick={() => setMode("forgot")}
                className="text-[12px] text-walnut-300 hover:text-paper transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

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

/* ── 2FA code entry (PLAN.md §6.1) ───────────────────────────────── */

function TwoFactorStep({
  onSuccess,
  onBack,
}: {
  onSuccess: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const verify2fa = useAuthStore((s) => s.verify2fa);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  useEffect(() => {
    inputRef.current?.focus();
  }, [useRecovery]);

  async function submit(value: string) {
    if (useAuthStore.getState().loading) return;
    try {
      await verify2fa(value);
      onSuccess();
    } catch {
      // Error surfaced via authStore; clear for a fresh attempt.
      setCode("");
      inputRef.current?.focus();
    }
  }

  function handleChange(raw: string) {
    if (useRecovery) {
      // Recovery codes: 10-char hex, allow spaces/dashes up to 16 chars.
      setCode(raw.slice(0, 16));
      return;
    }
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    // Auto-submit the moment the 6th digit lands.
    if (digits.length === 6) submit(digits);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = code.trim();
    if (cleaned.length >= 6) submit(cleaned);
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-block">
      <div className="w-full max-w-[420px] animate-fade-in">
        <div className="mb-block text-center">
          <div className="eyebrow mb-3">Two-factor authentication</div>
          <h1 className="font-serif text-h1 text-paper">
            {useRecovery ? "Enter a recovery code" : "Enter your code"}
          </h1>
          <p className="mt-3 text-[14px] text-walnut-300">
            {useRecovery
              ? "Use one of the single-use recovery codes you saved when enabling 2FA."
              : "Open your authenticator app and enter the 6-digit code."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <input
            ref={inputRef}
            type="text"
            inputMode={useRecovery ? "text" : "numeric"}
            value={code}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={useRecovery ? "recovery code" : "000000"}
            autoComplete="one-time-code"
            disabled={loading}
            className={`w-full bg-transparent border border-edge focus:border-gold focus:outline-none rounded-md px-4 h-14 font-mono text-paper placeholder:text-walnut-400 transition-colors text-center ${
              useRecovery ? "text-[18px] tracking-[0.2em]" : "text-[24px] tracking-[0.5em]"
            }`}
          />

          {error && (
            <div className="text-[13px] text-danger border border-danger/30 bg-danger/[0.06] rounded-md px-4 py-2.5">
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            fullWidth
            disabled={loading || code.trim().length < 6}
          >
            {loading ? "Verifying…" : "Verify"}
          </Button>
        </form>

        <div className="mt-block flex items-center justify-between text-[13px]">
          <button
            onClick={() => {
              setUseRecovery((v) => !v);
              setCode("");
              clearError();
            }}
            className="text-walnut-300 hover:text-paper transition-colors"
          >
            {useRecovery ? "Use authenticator app →" : "Use a recovery code →"}
          </button>
          <button onClick={onBack} className="text-walnut-300 hover:text-paper transition-colors">
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Forgot password (PLAN.md §6.1, anti-enumeration copy) ───────── */

function ForgotPasswordStep({
  sent,
  onSent,
  onBack,
}: {
  sent: boolean;
  onSent: () => void;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      await forgotPassword(email.trim());
    } catch {
      // The endpoint always answers 200; even on network failure we show
      // the same neutral copy so nothing about the account leaks.
    } finally {
      setBusy(false);
      onSent();
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-block">
      <div className="w-full max-w-[420px] animate-fade-in">
        <div className="mb-block text-center">
          <div className="eyebrow mb-3">Password reset</div>
          <h1 className="font-serif text-h1 text-paper">
            {sent ? "Check your inbox" : "Forgot your password?"}
          </h1>
          <p className="mt-3 text-[14px] text-walnut-300">
            {sent
              ? "If an account exists for that email, we sent a reset link. It expires in 30 minutes."
              : "Enter the email you signed up with and we'll send a reset link."}
          </p>
        </div>

        {!sent && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <Button type="submit" size="lg" fullWidth disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}

        <div className="mt-block text-center text-[13px]">
          <button onClick={onBack} className="text-walnut-300 hover:text-paper transition-colors">
            ← Back to sign in
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
