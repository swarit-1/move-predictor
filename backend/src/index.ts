import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { gamesRouter } from "./routes/games";
import { playersRouter } from "./routes/players";
import { predictRouter } from "./routes/predict";
import { simulateRouter } from "./routes/simulate";
import { errorHandler } from "./middleware/errorHandler";
import { config, logger } from "./config";

const app = express();
const PORT = parseInt(process.env.BACKEND_PORT || "3001", 10);
const startTime = Date.now();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Rate limiting
app.use(
  "/api/",
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: { error: "Too many requests, please try again later" },
  })
);

// Routes
app.use("/api/games", gamesRouter);
app.use("/api/players", playersRouter);
app.use("/api/predict", predictRouter);
app.use("/api/simulate", simulateRouter);

// Structured health check
app.get("/api/health", async (_req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  // Check ML service
  let mlStatus: { status: string; latency_ms?: number } = {
    status: "unhealthy",
  };
  try {
    const mlStart = Date.now();
    const { mlClient } = await import("./services/mlClient");
    await mlClient.healthCheck();
    mlStatus = {
      status: "healthy",
      latency_ms: Date.now() - mlStart,
    };
  } catch {
    mlStatus = { status: "unhealthy" };
  }

  // Check Redis
  let redisStatus: { status: string } = { status: "unhealthy" };
  try {
    const redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    redisStatus = { status: "healthy" };
    await redis.quit();
  } catch {
    redisStatus = { status: "unhealthy" };
  }

  const allHealthy =
    mlStatus.status === "healthy" && redisStatus.status === "healthy";
  const allUnhealthy =
    mlStatus.status === "unhealthy" && redisStatus.status === "unhealthy";

  let overallStatus: "healthy" | "degraded" | "unhealthy";
  if (allHealthy) {
    overallStatus = "healthy";
  } else if (allUnhealthy) {
    overallStatus = "unhealthy";
  } else {
    overallStatus = "degraded";
  }

  res.json({
    status: overallStatus,
    services: {
      ml: mlStatus,
      redis: redisStatus,
    },
    uptime_seconds: uptimeSeconds,
  });
});

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Backend API gateway running on port ${PORT}`);
});

export default app;
