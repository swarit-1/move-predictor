/**
 * Mail delivery abstraction (PLAN.md §6.1).
 *
 * Dev/test: messages are logged and kept in memory so flows are fully
 * testable without a provider. Production: set MAIL_PROVIDER and wire the
 * matching transport (Resend/Postmark/SES — decision tracked in PLAN.md;
 * an unset provider in production logs loudly rather than failing signup).
 */

import { config, logger } from "../config";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

// Ring buffer of recent messages — lets tests (and local dev) read the
// verification/reset links without a mailbox.
const recent: MailMessage[] = [];
const MAX_RECENT = 50;

export async function sendMail(msg: MailMessage): Promise<void> {
  recent.push(msg);
  if (recent.length > MAX_RECENT) recent.shift();

  const provider = process.env.MAIL_PROVIDER || "";
  if (!provider) {
    if (config.nodeEnv === "production") {
      logger.error("MAIL_PROVIDER unset in production — email NOT delivered", {
        to: msg.to,
        subject: msg.subject,
      });
    } else {
      logger.info(`[mail:dev] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    }
    return;
  }
  // Provider transports land here (Resend/Postmark/SES). Deliberately not
  // implemented until the provider decision is made — see PLAN.md §12.
  logger.warn(`MAIL_PROVIDER=${provider} has no transport wired yet`, {
    to: msg.to,
  });
}

/** Test/dev hook: most recent message sent to an address. */
export function lastMailTo(email: string): MailMessage | undefined {
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].to === email) return recent[i];
  }
  return undefined;
}
