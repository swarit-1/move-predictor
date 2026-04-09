import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../db/prisma";
import { signToken, requireAuth } from "../middleware/auth";
import { logger } from "../config";

export const authRouter = Router();

// Stricter rate limit on auth endpoints to slow brute force.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: "Too many auth requests, slow down." },
  standardHeaders: true,
});
authRouter.use(authLimiter);

const BCRYPT_COST = 12;

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

function publicUser(u: { id: string; email: string; username: string; createdAt: Date }) {
  return { id: u.id, email: u.email, username: u.username, createdAt: u.createdAt };
}

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

    const token = signToken({ id: user.id, username: user.username });
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

authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const body = loginSchema.parse(req.body);
    const identifier = body.identifier.toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: body.identifier }],
      },
    });
    if (!user) {
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }

    const token = signToken({ id: user.id, username: user.username });
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

authRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }
    res.json({ success: true, data: { user: publicUser(user) } });
  } catch (error: any) {
    logger.error("Me failed", { error: error.message });
    res.status(500).json({ success: false, error: "Failed to load user" });
  }
});
