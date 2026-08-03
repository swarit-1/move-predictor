import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../db/prisma";

export interface AuthedUser {
  id: string;
  username: string;
  role: string;
}

// Augment Express's Request so `req.user` is typed everywhere.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export interface JwtPayload {
  sub: string;
  username: string;
  role: string;
  // PLAN.md §6: bumping the user's tokenVersion revokes every JWT minted
  // before the bump ("log out everywhere", forced on password reset).
  tv: number;
  // "full" = normal session; "2fa" = password accepted, waiting on TOTP.
  scope: "full" | "2fa";
}

export function signToken(
  user: { id: string; username: string; role: string; tokenVersion: number },
  scope: "full" | "2fa" = "full"
): string {
  const payload: JwtPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    tv: user.tokenVersion,
    scope,
  };
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: scope === "2fa" ? "5m" : config.jwtExpiresIn,
  });
}

export function decodeToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}

/**
 * Full-session auth: valid signature, "full" scope, tokenVersion current,
 * account not deleted. Hits the DB once per request — acceptable at our
 * scale, and it is what makes "log out everywhere" instant.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.header("authorization") || req.header("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ success: false, error: "Missing bearer token" });
    return;
  }
  const token = header.slice(7).trim();
  (async () => {
    let decoded: JwtPayload;
    try {
      decoded = decodeToken(token);
    } catch {
      res.status(401).json({ success: false, error: "Invalid or expired token" });
      return;
    }
    if (decoded.scope !== "full") {
      res.status(401).json({ success: false, error: "Two-factor step required" });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, username: true, role: true, tokenVersion: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.tokenVersion !== decoded.tv) {
      res.status(401).json({ success: false, error: "Session revoked" });
      return;
    }
    req.user = { id: user.id, username: user.username, role: user.role };
    next();
  })().catch(() => {
    res.status(401).json({ success: false, error: "Authentication failed" });
  });
}

/** Role gate — stack after requireAuth. */
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || req.user.role !== role) {
      // 404, not 403 — don't confirm the resource exists (PLAN.md §6.2)
      res.status(404).json({ success: false, error: "Not found" });
      return;
    }
    next();
  };
}
