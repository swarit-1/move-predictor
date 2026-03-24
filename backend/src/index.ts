import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { gamesRouter } from "./routes/games";
import { playersRouter } from "./routes/players";
import { predictRouter } from "./routes/predict";
import { simulateRouter } from "./routes/simulate";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./config";

const app = express();
const PORT = parseInt(process.env.BACKEND_PORT || "3000", 10);

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

// Health check
app.get("/api/health", async (_req, res) => {
  try {
    const { mlClient } = await import("./services/mlClient");
    const mlHealth = await mlClient.healthCheck();
    res.json({
      status: "healthy",
      ml_service: mlHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.json({
      status: "degraded",
      ml_service: "unavailable",
      timestamp: new Date().toISOString(),
    });
  }
});

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Backend API gateway running on port ${PORT}`);
});

export default app;
