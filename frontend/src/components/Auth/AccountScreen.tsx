import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../../store/authStore";
import {
  fetchMe,
  resendVerification,
  twoFaSetup,
  twoFaEnable,
  twoFaDisable,
  logoutAll,
  deleteAccount,
  exportData,
} from "../../api/client";
import { Button } from "../common/Button";

interface AccountScreenProps {
  onBack: () => void;
  /** Called after any action that revokes the current session. */
  onSignedOut: () => void;
}

function errMsg(err: any, fallback: string): string {
  return err?.response?.data?.error || err?.message || fallback;
}

/**
 * PLAN.md §6.1: account & security panel — email verification status,
 * TOTP 2FA enrollment (with one-time recovery codes), sign out everywhere,
 * data export, and account deletion.
 */
export function AccountScreen({ onBack, onSignedOut }: AccountScreenProps) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const refreshedRef = useRef(false);

  // Refresh on mount: emailVerified / totpEnabled may have changed in
  // another tab (e.g. the verification link was just clicked).
  useEffect(() => {
    if (!user || refreshedRef.current) return;
    refreshedRef.current = true;
    fetchMe()
      .then((res) => {
        if (res?.success) setUser(res.data.user);
      })
      .catch(() => {
        // Stale view is acceptable; the session may simply be offline.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="eyebrow mb-3">Restricted</div>
          <h1 className="font-serif text-h1 text-paper mb-4">Sign in to manage your account</h1>
          <p className="text-walnut-300 mb-block">
            Security settings appear here once you're signed in.
          </p>
          <Button onClick={onBack} variant="outline">
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  const handleRevoked = () => {
    logout();
    onSignedOut();
  };

  return (
    <div className="ed-shell pt-block pb-section animate-fade-in">
      <div className="flex items-end justify-between mb-block border-b border-edge pb-6">
        <div>
          <div className="eyebrow mb-3">Settings</div>
          <h1 className="font-serif text-hero text-paper">Account &amp; Security</h1>
          <p className="mt-3 text-walnut-300 text-[15px]">
            Signed in as <span className="text-paper">{user.username}</span>
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          Home
        </Button>
      </div>

      <div className="max-w-2xl space-y-6">
        <EmailSection />
        <TwoFactorSection onSessionsRevoked={handleRevoked} />
        <SessionsSection onSessionsRevoked={handleRevoked} />
        <ExportSection />
        <DeleteSection onDeleted={handleRevoked} />
      </div>
    </div>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────── */

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-edge rounded-xl p-7">
      <div className="eyebrow mb-2">{eyebrow}</div>
      <h2 className="font-serif text-[22px] text-paper mb-4">{title}</h2>
      {children}
    </section>
  );
}

function StatusChip({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] tracking-[0.1em] uppercase border ${
        ok
          ? "text-success border-success/30 bg-success/[0.08]"
          : "text-warn border-warn/30 bg-warn/[0.08]"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-success" : "bg-warn"}`} />
      {ok ? okLabel : badLabel}
    </span>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="text-[13px] text-danger border border-danger/30 bg-danger/[0.06] rounded-md px-4 py-2.5">
      {text}
    </div>
  );
}

const inputCls =
  "w-full bg-transparent border border-edge focus:border-gold focus:outline-none rounded-md px-4 h-11 text-[14px] text-paper placeholder:text-walnut-400 transition-colors";

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable — the text is selectable below.
    }
  }
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 font-mono text-[12px] text-paper bg-walnut-800 border border-edge rounded-md px-3 py-2.5 break-all select-all">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 px-3 rounded-md border border-edge hover:border-edgeStrong text-[11px] tracking-[0.1em] uppercase text-walnut-300 hover:text-paper transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/* ── Email verification (PLAN.md §6.1) ───────────────────────────── */

function EmailSection() {
  const user = useAuthStore((s) => s.user)!;
  const setUser = useAuthStore((s) => s.setUser);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await resendVerification();
      if (!res?.success) throw new Error(res?.error || "Failed to send");
      if (res.data?.alreadyVerified) {
        setNote("Your email is already verified.");
        setUser({ ...user, emailVerified: true });
      } else {
        setNote("Verification email sent — check your inbox. The link expires in 24 hours.");
      }
    } catch (err: any) {
      setError(errMsg(err, "Failed to send verification email"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section eyebrow="Email" title="Email verification">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] text-paper truncate">{user.email}</p>
          <p className="mt-1 text-[12px] text-walnut-300">
            {user.emailVerified
              ? "Saved games and personalization are unlocked."
              : "Unverified accounts can play, but can't save games or personalize."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip ok={!!user.emailVerified} okLabel="Verified" badLabel="Unverified" />
          {!user.emailVerified && (
            <Button size="sm" variant="outline" onClick={resend} disabled={busy}>
              {busy ? "Sending…" : "Resend email"}
            </Button>
          )}
        </div>
      </div>
      {note && <p className="mt-3 text-[13px] text-success">{note}</p>}
      {error && <div className="mt-3"><ErrorNote text={error} /></div>}
    </Section>
  );
}

/* ── Two-factor authentication (PLAN.md §6.1) ────────────────────── */

type EnrollStep = "idle" | "password" | "confirm" | "recovery";

function TwoFactorSection({ onSessionsRevoked }: { onSessionsRevoked: () => void }) {
  const user = useAuthStore((s) => s.user)!;
  const setUser = useAuthStore((s) => s.setUser);

  const [step, setStep] = useState<EnrollStep>("idle");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);

  const [showDisable, setShowDisable] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Disable-form fields kept separate from the enroll flow.
  const [dPassword, setDPassword] = useState("");
  const [dCode, setDCode] = useState("");

  function resetEnroll() {
    setStep("idle");
    setPassword("");
    setSecret("");
    setOtpauthUrl("");
    setCode("");
    setRecoveryCodes([]);
    setCopiedAll(false);
    setError(null);
  }

  async function startSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await twoFaSetup(password);
      if (!res?.success) throw new Error(res?.error || "Setup failed");
      setSecret(res.data.secret);
      setOtpauthUrl(res.data.otpauth_url);
      setPassword("");
      setStep("confirm");
    } catch (err: any) {
      setError(errMsg(err, "Setup failed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await twoFaEnable(code.replace(/\D/g, ""));
      if (!res?.success) throw new Error(res?.error || "Invalid code");
      setRecoveryCodes(res.data.recovery_codes);
      setCode("");
      setStep("recovery");
    } catch (err: any) {
      setError(errMsg(err, "Invalid code"));
    } finally {
      setBusy(false);
    }
  }

  async function copyAllCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1600);
    } catch {
      // Codes remain selectable in the grid.
    }
  }

  function finishEnroll() {
    setUser({ ...user, totpEnabled: true });
    resetEnroll();
  }

  async function submitDisable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await twoFaDisable(dPassword, dCode.replace(/\D/g, ""));
      if (!res?.success) throw new Error(res?.error || "Failed to disable 2FA");
      // Disabling 2FA revokes every session server-side (tokenVersion bump)
      // — including this one. Sign out locally.
      onSessionsRevoked();
    } catch (err: any) {
      setError(errMsg(err, "Failed to disable 2FA"));
      setBusy(false);
    }
  }

  return (
    <Section eyebrow="Two-factor" title="Two-factor authentication">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-walnut-300 max-w-sm">
          Adds an authenticator-app code to every sign-in. Recovery codes keep
          you out of trouble if you lose the device.
        </p>
        <StatusChip ok={!!user.totpEnabled} okLabel="Enabled" badLabel="Off" />
      </div>

      {/* ── Enable flow ── */}
      {!user.totpEnabled && step === "idle" && (
        <div className="mt-5">
          <Button variant="outline" onClick={() => setStep("password")}>
            Enable 2FA
          </Button>
        </div>
      )}

      {step === "password" && (
        <form onSubmit={startSetup} className="mt-5 space-y-4 animate-fade-in">
          <p className="text-[13px] text-walnut-300">
            Confirm your password to begin enrollment.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
            className={inputCls}
          />
          {error && <ErrorNote text={error} />}
          <div className="flex gap-3">
            <Button type="submit" disabled={busy || !password}>
              {busy ? "Working…" : "Continue"}
            </Button>
            <Button type="button" variant="ghost" onClick={resetEnroll}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step === "confirm" && (
        <div className="mt-5 space-y-4 animate-fade-in">
          <p className="text-[13px] text-walnut-300">
            Add the account to your authenticator app (Aegis, 1Password, Google
            Authenticator…). Paste the setup link into the app, or enter the
            secret key manually.
          </p>
          <CopyBox label="Setup link (otpauth)" value={otpauthUrl} />
          <CopyBox label="Secret key (manual entry)" value={secret} />
          <form onSubmit={confirmEnable} className="space-y-4">
            <label className="block">
              <div className="eyebrow mb-2">6-digit code from the app</div>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                autoComplete="one-time-code"
                className={`${inputCls} font-mono text-center tracking-[0.4em] text-[18px] max-w-[220px]`}
              />
            </label>
            {error && <ErrorNote text={error} />}
            <div className="flex gap-3">
              <Button type="submit" disabled={busy || code.length !== 6}>
                {busy ? "Verifying…" : "Turn on 2FA"}
              </Button>
              <Button type="button" variant="ghost" onClick={resetEnroll}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {step === "recovery" && (
        <div className="mt-5 space-y-4 animate-fade-in">
          <div className="border border-warn/30 bg-warn/[0.06] rounded-md px-4 py-3">
            <p className="text-[13px] text-warn">
              Save these recovery codes now — they are shown once and never
              again. Each works exactly one time if you lose your
              authenticator.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((c) => (
              <code
                key={c}
                className="font-mono text-[13px] text-paper bg-walnut-800 border border-edge rounded-md px-3 py-2 text-center select-all"
              >
                {c}
              </code>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={copyAllCodes}>
              {copiedAll ? "Copied" : "Copy all"}
            </Button>
            <Button onClick={finishEnroll}>I saved them</Button>
          </div>
        </div>
      )}

      {/* ── Disable flow ── */}
      {user.totpEnabled && !showDisable && (
        <div className="mt-5">
          <Button variant="danger" onClick={() => setShowDisable(true)}>
            Disable 2FA
          </Button>
        </div>
      )}

      {user.totpEnabled && showDisable && (
        <form onSubmit={submitDisable} className="mt-5 space-y-4 animate-fade-in">
          <p className="text-[13px] text-walnut-300">
            Confirm your password and a current authenticator code. Disabling
            2FA signs out every session, including this one.
          </p>
          <input
            type="password"
            value={dPassword}
            onChange={(e) => setDPassword(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
            className={inputCls}
          />
          <input
            type="text"
            inputMode="numeric"
            value={dCode}
            onChange={(e) => setDCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            autoComplete="one-time-code"
            className={`${inputCls} font-mono text-center tracking-[0.4em] text-[16px] max-w-[220px]`}
          />
          {error && <ErrorNote text={error} />}
          <div className="flex gap-3">
            <Button type="submit" variant="danger" disabled={busy || !dPassword || dCode.length !== 6}>
              {busy ? "Working…" : "Disable 2FA"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowDisable(false);
                setDPassword("");
                setDCode("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}

/* ── Sessions (PLAN.md §6.1: "log out everywhere") ───────────────── */

function SessionsSection({ onSessionsRevoked }: { onSessionsRevoked: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revokeAll() {
    setBusy(true);
    setError(null);
    try {
      await logoutAll();
      // Every token is now revoked, including this one.
      onSessionsRevoked();
    } catch (err: any) {
      setError(errMsg(err, "Failed to sign out everywhere"));
      setBusy(false);
    }
  }

  return (
    <Section eyebrow="Sessions" title="Sign out everywhere">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-walnut-300 max-w-sm">
          Revokes every signed-in session on every device — including this one.
          Use it if you suspect someone else has access.
        </p>
        <Button variant="outline" onClick={revokeAll} disabled={busy}>
          {busy ? "Working…" : "Sign out everywhere"}
        </Button>
      </div>
      {error && <div className="mt-3"><ErrorNote text={error} /></div>}
    </Section>
  );
}

/* ── Data export (PLAN.md §6.1) ──────────────────────────────────── */

function ExportSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const blob = await exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "move-predictor-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(errMsg(err, "Export failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section eyebrow="Your data" title="Export my data">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-walnut-300 max-w-sm">
          Download everything we store about you — profile, linked accounts,
          and saved games — as a single JSON file.
        </p>
        <Button variant="outline" onClick={download} disabled={busy}>
          {busy ? "Preparing…" : "Download JSON"}
        </Button>
      </div>
      {error && <div className="mt-3"><ErrorNote text={error} /></div>}
    </Section>
  );
}

/* ── Delete account (PLAN.md §6.1: soft 14-day, then hard) ───────── */

function DeleteSection({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = confirm === "DELETE" && password.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!armed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await deleteAccount(password);
      if (!res?.success) throw new Error(res?.error || "Deletion failed");
      onDeleted();
    } catch (err: any) {
      setError(errMsg(err, "Deletion failed"));
      setBusy(false);
    }
  }

  return (
    <section className="border border-danger/30 rounded-xl p-7">
      <div className="eyebrow mb-2 !text-danger">Danger zone</div>
      <h2 className="font-serif text-[22px] text-paper mb-4">Delete account</h2>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[13px] text-walnut-300 max-w-sm">
          Your account is deactivated immediately and permanently purged after
          14 days — including saved games, built profiles, and
          personalizations.
        </p>
        {!open && (
          <Button variant="danger" onClick={() => setOpen(true)}>
            Delete my account
          </Button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="mt-5 space-y-4 animate-fade-in">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
            className={inputCls}
          />
          <label className="block">
            <div className="eyebrow mb-2">
              Type <span className="font-mono text-danger">DELETE</span> to confirm
            </div>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              className={`${inputCls} font-mono`}
            />
          </label>
          {error && <ErrorNote text={error} />}
          <div className="flex gap-3">
            <Button type="submit" variant="danger" disabled={busy || !armed}>
              {busy ? "Deleting…" : "Permanently delete"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setPassword("");
                setConfirm("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
