import winston from "winston";

export const config = {
  mlServiceUrl: process.env.ML_SERVICE_URL || "http://localhost:8000",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  port: parseInt(process.env.BACKEND_PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
};

export const logger = winston.createLogger({
  level: config.nodeEnv === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});
