import { useEffect, useState } from "react";
import { CloneStatus, getCloneStatus } from "../api/client";

const POLL_MS = 5000;

/**
 * Polls the clone-fidelity stage for the given opponent while it is still
 * upgrading (generic → repertoire → personalized). Polling stops once the
 * clone is personalized, the personalize attempt failed permanently, or
 * there is no player key (rating/custom-style opponents).
 */
export function useCloneStatus(playerKey: string | null | undefined) {
  const [status, setStatus] = useState<CloneStatus | null>(null);

  useEffect(() => {
    setStatus(null);
    if (!playerKey) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await getCloneStatus(playerKey);
        if (cancelled) return;
        if (res.success) {
          setStatus(res.data);
          const p = res.data.personalization.status;
          if (res.data.stage === "personalized" || p === "failed") {
            return; // terminal — stop polling
          }
        }
      } catch {
        // Backend/ML briefly unreachable — keep polling quietly.
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [playerKey]);

  return status;
}
