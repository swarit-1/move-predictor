import { useState, useEffect, useRef } from "react";
import { verifyEmail } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../common/Button";

interface VerifyEmailScreenProps {
  token: string;
  onContinue: () => void;
}

type Status = "working" | "success" | "failure";

/**
 * PLAN.md §6.1: landing screen for the emailed verification link
 * (/verify-email?token=…). Consumes the single-use token immediately and
 * reports the outcome.
 */
export function VerifyEmailScreen({ token, onContinue }: VerifyEmailScreenProps) {
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState<string | null>(null);
  // Guard: the token is single-use — StrictMode's double-effect in dev must
  // not consume it twice.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const res = await verifyEmail(token);
        if (!res?.success) throw new Error(res?.error || "Verification failed");
        // If this browser is signed in as the verified user, refresh the
        // stored user so the account panel shows the new status.
        const { user, setUser } = useAuthStore.getState();
        if (user && res.data?.user?.id === user.id) {
          setUser(res.data.user);
        }
        setStatus("success");
      } catch (err: any) {
        setMessage(
          err?.response?.data?.error ||
            err?.message ||
            "Invalid or expired verification link"
        );
        setStatus("failure");
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-block">
      <div className="w-full max-w-[420px] animate-fade-in text-center">
        <div className="eyebrow mb-3">Email verification</div>

        {status === "working" && (
          <>
            <h1 className="font-serif text-h1 text-paper">Verifying…</h1>
            <p className="mt-3 text-[14px] text-walnut-300">
              Checking your verification link.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="font-serif text-h1 text-paper">Email verified</h1>
            <p className="mt-3 text-[14px] text-walnut-300">
              Your email address is confirmed. Saved games and personalization
              are now unlocked.
            </p>
          </>
        )}

        {status === "failure" && (
          <>
            <h1 className="font-serif text-h1 text-paper">Verification failed</h1>
            <p className="mt-3 text-[14px] text-walnut-300">{message}</p>
            <p className="mt-2 text-[13px] text-walnut-400">
              Links expire after 24 hours. You can request a fresh one from
              your account page.
            </p>
          </>
        )}

        {status !== "working" && (
          <div className="mt-block">
            <Button size="lg" onClick={onContinue}>
              Continue
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
