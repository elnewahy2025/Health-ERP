import Redis from 'ioredis';
import { getEnv } from '@healthcare/shared/config';

const env = getEnv();

// Redis is optional for boot: rate limiting falls back to an in-memory store,
// and queue-dependent features retry. Never let a missing Redis crash the API.
redis.on('error', (err: Error) => {
  console.warn('[redis] connection error (continuing):', err.message);
});

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

export const CACHE_TTL = {
  SHORT: 60,         // 1 minute
  MEDIUM: 300,       // 5 minutes
  LONG: 3600,        // 1 hour
  DAY: 86400,        // 24 hours
} as const;

export async function getOrSet<T>(
  key: string,
  fetch: () => Promise<T>,
  ttl: number = CACHE_TTL.MEDIUM,
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;

  const data = await fetch();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
}
