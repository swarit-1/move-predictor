/**
 * Redis caching layer for predictions and analysis results.
 */

import Redis from "ioredis";
import { config, logger } from "../config";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  try {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });
    redis.on("error", (err) => {
      logger.warn("Redis connection error", { error: err.message });
    });
    return redis;
  } catch {
    logger.warn("Redis unavailable, caching disabled");
    return null;
  }
}

const DEFAULT_TTL = 3600; // 1 hour

export async function getCached<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function setCache(
  key: string,
  value: any,
  ttl: number = DEFAULT_TTL
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await client.setex(key, ttl, JSON.stringify(value));
  } catch {
    // Caching is best-effort
  }
}

/**
 * Generate a cache key for a position prediction.
 */
export function predictionCacheKey(
  fen: string,
  playerId?: number,
  style?: Record<string, number>
): string {
  const parts = [`pred:${fen}`];
  if (playerId) parts.push(`p:${playerId}`);
  if (style) parts.push(`s:${JSON.stringify(style)}`);
  return parts.join(":");
}

/**
 * Generate a cache key for Stockfish analysis.
 */
export function analysisCacheKey(fen: string, depth: number): string {
  return `analysis:${fen}:d${depth}`;
}
