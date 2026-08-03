import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { authenticator } from "otplib";
import { prisma } from "../db/prisma";
import { signToken, decodeToken, requireAuth } from "../middleware/auth";
import { sendMail } from "../services/mailer";
import { logger } from "../config";

export const authRouter = Router();

// Stricter rate limit on auth endpoints to slow brute force.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: "Too many auth requests, slow down." },
  standardHeaders: true,
});
if (process.env.NODE_ENV !== "test") {
  authRouter.use(authLimiter);
}

const BCRYPT_COST = 12;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const RESET_TTL_MS = 30 * 60 * 1000; // 30 min
const APP_URL = process.env.APP_URL || "http://localhost:5173";

// TOTP: accept the previous/next 30 s step (clock drift).
authenticator.options = { window: 1 };

const registerSchema = z.object({
  email: z.string().email().max(255),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username may only contain letters, numbers, _ and -"),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  identifier: z.string().min(1).max(255), // email or username
  password: z.string().min(1).max(128),
});

function publicUser(u: {
  id: string;
  email: string;
  username: string;
  createdAt: Date;
  linkedChessSource?: string | null;
  linkedChessUsername?: string | null;
  emailVerifiedAt?: Date | null;
  totpEnabledAt?: Date | null;
  role?: string;
}) {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    createdAt: u.createdAt,
    linkedChessSource: u.linkedChessSource ?? null,
    linkedChessUsername: u.linkedChessUsername ?? null,
    emailVerified: Boolean(u.emailVerifiedAt),
    totpEnabled: Boolean(u.totpEnabledAt),
    role: u.role ?? "user",
  };
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Create a single-use email token; returns the raw token for the link. */
async function createEmailToken(
  userId: string,
  purpose: "verify" | "reset",
  ttlMs: number
): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  await prisma.emailToken.create({
    data: {
      userId,
      purpose,
      tokenHash: sha256(raw),
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  return raw;
}

/** Consume a single-use email token; returns the userId or null. */
async function consumeEmailToken(
  raw: string,
  purpose: "verify" | "reset"
): Promise<string | null> {
  const record = await prisma.emailToken.findUnique({
    where: { tokenHash: sha256(raw) },
  });
  if (!record || record.purpose !== purpose) return null;
  if (record.usedAt || record.expiresAt < new Date()) return null;
  await prisma.emailToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  return record.userId;
}

async function sendVerificationEmail(user: { id: string; email: string }) {
  const raw = await createEmailToken(user.id, "verify", VERIFY_TTL_MS);
  await sendMail({
    to: user.email,
    subject: "Verify your Move Predictor email",
    text: `Welcome! Verify your email within 24 hours:\n\n${APP_URL}/verify-email?token=${raw}\n\nIf you didn't sign up, ignore this.`,
  });
}

// ── Registration & verification ───────────────────────────────────────

authRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const body = registerSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const username = body.username;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true, email: true, username: true },
    });
    if (existing) {
      const field = existing.email === email ? "email" : "username";
      res.status(409).json({ success: false, error: `That ${field} is already taken` });
      return;
    }

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);
    const user = await prisma.user.create({
      data: { email, username, passwordHash },
    });
    await sendVerificationEmail(user);

    const token = signToken(user);
    res.status(201).json({ success: true, data: { user: publicUser(user), token } });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      res.status(400).json({ success: false, error: error.errors?.[0]?.message || "Invalid input" });
      return;
    }
    logger.error("Register failed", { error: error.message });
    res.status(500).json({ success: false, error: "Registration failed" });
  }
});

authRouter.post("/verify-email", async (req: Request, res: Response) => {
  const token = String(req.body?.token ?? "");
  if (!token) {
    res.status(400).json({ success: false, error: "Missing token" });
    return;
  }
  const userId = await consumeEmailToken(token, "verify");
  if (!userId) {
    res.status(400).json({ success: false, error: "Invalid or expired verification link" });
    return;
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  });
  res.json({ success: true, data: { user: publicUser(user) } });
});

authRouter.post("/resend-verification", requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  if (user.emailVerifiedAt) {
    res.json({ success: true, data: { alreadyVerified: true } });
    return;
  }
  await sendVerificationEmail(user);
  res.json({ success: true, data: { sent: true } });
});

// ── Login & two-factor ────────────────────────────────────────────────

authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const body = loginSchema.parse(req.body);
    const identifier = body.identifier.toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: body.identifier }],
      },
    });
    // Constant-shape response for missing user vs bad password (no
    // enumeration); bcrypt.compare against a dummy hash keeps timing flat.
    const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZUbGGkQvVXnwXqUvZzYzQxQxQxQxQx";
    const ok = user
      ? await bcrypt.compare(body.password, user.passwordHash)
      : (await bcrypt.compare(body.password, DUMMY_HASH), false);
    if (!user || !ok || user.deletedAt) {
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }

    // PLAN.md §6.1: 2FA-enabled accounts get a short-lived pending token;
    // the full session is only minted after the TOTP step.
    if (user.totpEnabledAt) {
      const pending = signToken(user, "2fa");
      res.json({ success: true, data: { requires_2fa: true, pending_token: pending } });
      return;
    }

    const token = signToken(user);
    res.json({ success: true, data: { user: publicUser(user), token } });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      res.status(400).json({ success: false, error: "Invalid input" });
      return;
    }
    logger.error("Login failed", { error: error.message });
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

const twoFaVerifySchema = z.object({
  pending_token: z.string().min(10),
  code: z.string().min(6).max(16),
});

authRouter.post("/2fa/verify", async (req: Request, res: Response) => {
  try {
    const body = twoFaVerifySchema.parse(req.body);
    let decoded;
    try {
      decoded = decodeToken(body.pending_token);
    } catch {
      res.status(401).json({ success: false, error: "Invalid or expired 2FA session" });
      return;
    }
    if (decoded.scope !== "2fa") {
      res.status(401).json({ success: false, error: "Invalid 2FA session" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user || !user.totpSecret || !user.totpEnabledAt || user.tokenVersion !== decoded.tv) {
      res.status(401).json({ success: false, error: "Invalid 2FA session" });
      return;
    }

    const code = body.code.replace(/[\s-]/g, "");
    let valid = false;
    if (code.length === 6 && authenticator.verify({ token: code, secret: user.totpSecret })) {
      valid = true;
    } else {
      // Recovery code path — single use.
      const codes = await prisma.recoveryCode.findMany({
        where: { userId: user.id, usedAt: null },
      });
      const match = codes.find((c) => c.codeHash === sha256(code.toLowerCase()));
      if (match) {
        await prisma.recoveryCode.update({
          where: { id: match.id },
          data: { usedAt: new Date() },
        });
        valid = true;
      }
    }
    if (!valid) {
      res.status(401).json({ success: false, error: "Invalid code" });
      return;
    }
    const token = signToken(user);
    res.json({ success: true, data: { user: publicUser(user), token } });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      res.status(400).json({ success: false, error: "Invalid input" });
      return;
    }
    logger.error("2FA verify failed", { error: error.message });
    res.status(500).json({ success: false, error: "Verification failed" });
  }
});

// ── 2FA enrollment (authenticated) ────────────────────────────────────

authRouter.post("/2fa/setup", requireAuth, async (req: Request, res: Response) => {
  // Re-authenticate with password before touching 2FA settings.
  const password = String(req.body?.password ?? "");
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ success: false, error: "Password required" });
    return;
  }
  if (user.totpEnabledAt) {
    res.status(409).json({ success: false, error: "2FA is already enabled" });
    return;
  }
  const secret = authenticator.generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
  const otpauth = authenticator.keyuri(user.email, "Move Predictor", secret);
  res.json({ success: true, data: { secret, otpauth_url: otpauth } });
});

authRouter.post("/2fa/enable", requireAuth, async (req: Request, res: Response) => {
  const code = String(req.body?.code ?? "").replace(/\s/g, "");
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.totpSecret) {
    res.status(400).json({ success: false, error: "Run 2FA setup first" });
    return;
  }
  if (user.totpEnabledAt) {
    res.status(409).json({ success: false, error: "2FA is already enabled" });
    return;
  }
  if (!authenticator.verify({ token: code, secret: user.totpSecret })) {
    res.status(400).json({ success: false, error: "Invalid code — check your authenticator app" });
    return;
  }
  // Generate 10 single-use recovery codes; store hashes, show plaintext once.
  const plaintextCodes = Array.from({ length: 10 }, () =>
    crypto.randomBytes(5).toString("hex")
  );
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
    prisma.recoveryCode.createMany({
      data: plaintextCodes.map((c) => ({ userId: user.id, codeHash: sha256(c) })),
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { totpEnabledAt: new Date() },
    }),
  ]);
  await sendMail({
    to: user.email,
    subject: "Two-factor authentication enabled",
    text: "TOTP 2FA was just enabled on your Move Predictor account. If this wasn't you, reset your password immediately.",
  });
  res.json({ success: true, data: { recovery_codes: plaintextCodes } });
});

authRouter.post("/2fa/disable", requireAuth, async (req: Request, res: Response) => {
  const password = String(req.body?.password ?? "");
  const code = String(req.body?.code ?? "").replace(/\s/g, "");
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ success: false, error: "Password required" });
    return;
  }
  if (!user.totpEnabledAt || !user.totpSecret) {
    res.status(400).json({ success: false, error: "2FA is not enabled" });
    return;
  }
  if (!authenticator.verify({ token: code, secret: user.totpSecret })) {
    res.status(401).json({ success: false, error: "Invalid code" });
    return;
  }
  // Disabling 2FA is a security-sensitive event: revoke all sessions.
  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecret: null,
        totpEnabledAt: null,
        tokenVersion: { increment: 1 },
      },
    }),
  ]);
  await sendMail({
    to: user.email,
    subject: "Two-factor authentication disabled",
    text: "TOTP 2FA was just disabled on your account and all sessions were signed out. If this wasn't you, reset your password immediately.",
  });
  res.json({ success: true, data: { disabled: true } });
});

// ── Password reset ────────────────────────────────────────────────────

authRouter.post("/forgot-password", async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "").toLowerCase();
  // Always 200 — never reveal whether the email exists.
  res.json({ success: true, data: { sent: true } });
  if (!email) return;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) return;
  const raw = await createEmailToken(user.id, "reset", RESET_TTL_MS);
  await sendMail({
    to: user.email,
    subject: "Reset your Move Predictor password",
    text: `Reset your password within 30 minutes:\n\n${APP_URL}/reset-password?token=${raw}\n\nIf you didn't request this, ignore it — your password is unchanged.`,
  });
});

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
});

authRouter.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const body = resetSchema.parse(req.body);
    const userId = await consumeEmailToken(body.token, "reset");
    if (!userId) {
      res.status(400).json({ success: false, error: "Invalid or expired reset link" });
      return;
    }
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_COST);
    const user = await prisma.user.update({
      where: { id: userId },
      // Revoke every outstanding session on password change.
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await sendMail({
      to: user.email,
      subject: "Your password was changed",
      text: "Your Move Predictor password was just changed and all sessions were signed out. If this wasn't you, contact support immediately.",
    });
    res.json({ success: true, data: { reset: true } });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      res.status(400).json({ success: false, error: "Invalid input" });
      return;
    }
    logger.error("Reset failed", { error: error.message });
    res.status(500).json({ success: false, error: "Reset failed" });
  }
});

// ── Session & account management ──────────────────────────────────────

authRouter.post("/logout-all", requireAuth, async (req: Request, res: Response) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { tokenVersion: { increment: 1 } },
  });
  res.json({ success: true, data: { revoked: true } });
});

authRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || user.deletedAt) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.json({ success: true, data: { user: publicUser(user) } });
  } catch (error: any) {
    logger.error("Me failed", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to load user" });
  }
});

// PLAN.md §6.1: full data export.
authRouter.get("/export", requireAuth, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { games: true },
  });
  if (!user) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }
  res.setHeader("Content-Disposition", "attachment; filename=move-predictor-export.json");
  res.json({
    exported_at: new Date().toISOString(),
    user: publicUser(user),
    linked_account: {
      source: user.linkedChessSource,
      username: user.linkedChessUsername,
    },
    saved_games: user.games,
  });
});

// PLAN.md §6.1: soft delete (14-day grace, then purge — purge job tracked
// in PLAN.md §7.2 ops).
authRouter.post("/delete-account", requireAuth, async (req: Request, res: Response) => {
  const password = String(req.body?.password ?? "");
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ success: false, error: "Password required" });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { deletedAt: new Date(), tokenVersion: { increment: 1 } },
  });
  await sendMail({
    to: user.email,
    subject: "Your account is scheduled for deletion",
    text: "Your Move Predictor account was deleted. It will be permanently purged in 14 days — reply to this email before then to restore it.",
  });
  res.json({ success: true, data: { deleted: true } });
});

// ── Linked chess identity (PRD §5.6) ──────────────────────────────────

const linkSchema = z.object({
  source: z.enum(["lichess", "chesscom"]),
  username: z.string().regex(/^[A-Za-z0-9_-]{2,32}$/, "Invalid username"),
});

authRouter.post("/link-chess", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = linkSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        linkedChessSource: body.source,
        linkedChessUsername: body.username,
      },
    });
    res.json({ success: true, data: { user: publicUser(user) } });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      res.status(400).json({ success: false, error: error.errors?.[0]?.message || "Invalid input" });
      return;
    }
    logger.error("Link chess failed", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to link chess account" });
  }
});

authRouter.delete("/link-chess", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { linkedChessSource: null, linkedChessUsername: null },
    });
    res.json({ success: true, data: { user: publicUser(user) } });
  } catch (error: any) {
    logger.error("Unlink chess failed", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to unlink chess account" });
  }
});
