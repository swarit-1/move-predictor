import { PrismaClient } from "@prisma/client";

// Singleton Prisma client. In dev with tsx-watch reloads, attach to globalThis
// to avoid spawning a new connection pool on every reload.
declare global {
  // eslint-disable-next-line no-var
  var __mp_prisma__: PrismaClient | undefined;
}

export const prisma =
  global.__mp_prisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__mp_prisma__ = prisma;
}
