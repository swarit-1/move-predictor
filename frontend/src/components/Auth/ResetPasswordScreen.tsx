import { useState } from "react";
import { resetPassword } from "../../api/client";
import { Button } from "../common/Button";

interface ResetPasswordScreenProps {
  token: string;
  /** Reset done — take the user to the sign-in screen. */
  onDone: () => void;
  onCancel: () => void;
}

/**
 * PLAN.md §6.1: landing screen for the emailed reset link
 * (/reset-password?token=…). On success every session is revoked
 * server-side, so the only path forward is a fresh sign-in.
 */
export function ResetPasswordScreen({ token, onDone, onCancel }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await resetPassword(token, password);
      if (!res?.success) throw new Error(res?.error || "Reset failed");
      setDone(true);
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          err?.message ||
          "Invalid or expired reset link"
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-block">
        <div className="w-full max-w-[420px] animate-fade-in text-center">
          <div className="eyebrow mb-3">Password reset</div>
          <h1 className="font-serif text-h1 text-paper">Password changed</h1>
          <p className="mt-3 text-[14px] text-walnut-300">
            All sessions were signed out for safety. Sign in with your new
            password to continue.
          </p>
          <div className="mt-block">
            <Button size="lg" onClick={onDone}>
              Sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-block">
      <div className="w-full max-w-[420px] animate-fade-in">
        <div className="mb-block text-center">
          <div className="eyebrow mb-3">Password reset</div>
          <h1 className="font-serif text-h1 text-paper">Choose a new password</h1>
          <p className="mt-3 text-[14px] text-walnut-300">
            Reset links are single-use and expire after 30 minutes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block">
            <div className="eyebrow mb-2">New password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              className="w-full bg-transparent border border-edge focus:border-gold focus:outline-none rounded-md px-4 h-12 text-[15px] text-paper placeholder:text-walnut-400 transition-colors"
            />
          </label>

          <label className="block">
            <div className="eyebrow mb-2">Confirm password</div>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat the new password"
              autoComplete="new-password"
              className={`w-full bg-transparent border focus:outline-none rounded-md px-4 h-12 text-[15px] text-paper placeholder:text-walnut-400 transition-colors ${
                mismatch
                  ? "border-danger/50 focus:border-danger"
                  : "border-edge focus:border-gold"
              }`}
            />
            {mismatch && (
              <p className="mt-1.5 text-[12px] text-danger">Passwords don't match.</p>
            )}
          </label>

          {error && (
            <div className="text-[13px] text-danger border border-danger/30 bg-danger/[0.06] rounded-md px-4 py-2.5">
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            fullWidth
            disabled={busy || password.length < 8 || password !== confirm}
          >
            {busy ? "Saving…" : "Set new password"}
          </Button>
        </form>

        <div className="mt-block text-center text-[13px]">
          <button onClick={onCancel} className="text-walnut-300 hover:text-paper transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
