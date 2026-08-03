import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import { gamesRouter } from "./routes/games";
import { playersRouter } from "./routes/players";
import { predictRouter } from "./routes/predict";
import { simulateRouter } from "./routes/simulate";
import { authRouter } from "./routes/auth";
import { savedGamesRouter } from "./routes/savedGames";
import { errorHandler } from "./middleware/errorHandler";
import { config } from "./config";

const startTime = Date.now();

export function createApp() {
  const app = express();

  // Middleware
  app.use(helmet());
  // PLAN.md S7: allowlist origins when configured (required in prod);
  // permissive only for local dev tooling.
  app.use(
    config.corsOrigins.length > 0
      ? cors({ origin: config.corsOrigins })
      : cors()
  );
  app.use(express.json({ limit: "2mb" }));

  // PLAN.md S9: tiered rate limits — cheap reads get headroom, model
  // inference is bounded, expensive pipelines are scarce. Keyed by IP now;
  // keyed by user id once auth middleware lands (§6).
  const limiter = (windowMs: number, max: number) =>
    rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: "Too many requests, please slow down" },
    });
  // Expensive: profile builds, personalize, review, coach
  app.use("/api/players/build-profile", limiter(60 * 60 * 1000, 20));
  app.use("/api/predict/review", limiter(60 * 60 * 1000, 30));
  app.use("/api/predict/coach", limiter(60 * 60 * 1000, 10));
  // Inference
  app.use("/api/predict", limiter(60 * 1000, 60));
  app.use("/api/simulate", limiter(60 * 1000, 90));
  // Everything else
  app.use("/api/", limiter(60 * 1000, 300));

  // Routes
  app.use("/api/auth", authRouter);
  app.use("/api/saved-games", savedGamesRouter);
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

  return app;
}
