import "dotenv/config";
import winston from "winston";

const nodeEnv = process.env.NODE_ENV || "development";

// PLAN.md S1: JWT_SECRET is required in EVERY environment — a forgeable
// fallback secret means forgeable sessions. start-dev.sh generates one
// into backend/.env for local dev; production must set it explicitly.
if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET must be set (generate one: openssl rand -hex 32). " +
      "Local dev: run ./start-dev.sh once or add it to backend/.env."
  );
}
if (nodeEnv === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set in production");
}

export const config = {
  mlServiceUrl: process.env.ML_SERVICE_URL || "http://localhost:8000",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  port: parseInt(process.env.BACKEND_PORT || "3001", 10),
  nodeEnv,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: "7d" as const,
  databaseUrl: process.env.DATABASE_URL || "",
  // PLAN.md S7: comma-separated CORS origin allowlist. Empty in dev =
  // permissive (localhost tooling); required in production.
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
  // PLAN.md S2: shared secret the gateway sends to the ML service.
  mlInternalKey: process.env.ML_INTERNAL_KEY || "",
};

if (nodeEnv === "production" && config.corsOrigins.length === 0) {
  throw new Error("CORS_ORIGINS must be set in production (comma-separated)");
}

export const logger = winston.createLogger({
  level: config.nodeEnv === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});
