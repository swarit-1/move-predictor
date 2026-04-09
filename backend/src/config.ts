import winston from "winston";

const nodeEnv = process.env.NODE_ENV || "development";

// In production, fail fast if auth/db env is missing.
if (nodeEnv === "production") {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be set in production");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in production");
  }
}

export const config = {
  mlServiceUrl: process.env.ML_SERVICE_URL || "http://localhost:8000",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  port: parseInt(process.env.BACKEND_PORT || "3001", 10),
  nodeEnv,
  jwtSecret: process.env.JWT_SECRET || "dev-only-insecure-secret-do-not-use-in-prod",
  jwtExpiresIn: "7d" as const,
  databaseUrl: process.env.DATABASE_URL || "",
};

export const logger = winston.createLogger({
  level: config.nodeEnv === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});
