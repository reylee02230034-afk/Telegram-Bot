import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import { Redis } from 'ioredis';

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    redisClient = new Redis(url, { maxRetriesPerRequest: 3 });
    redisClient.on('error', (err) => {
      console.warn('[Redis] 连接错误:', err.message);
    });
    return redisClient;
  } catch {
    return null;
  }
}

export interface RateLimitConfig {
  points: number;
  duration: number;
  keyPrefix?: string;
}

export function createRateLimiter(config: RateLimitConfig) {
  const redis = getRedis();
  if (redis) {
    return new RateLimiterRedis({
      storeClient: redis,
      points: config.points,
      duration: config.duration,
      keyPrefix: config.keyPrefix || 'rl:',
    });
  }
  return new RateLimiterMemory({
    points: config.points,
    duration: config.duration,
    keyPrefix: config.keyPrefix || 'rl:',
  });
}

export const rateLimiters = {
  auth: createRateLimiter({ points: 20, duration: 60, keyPrefix: 'rl:auth:' }),
  api: createRateLimiter({ points: 120, duration: 60, keyPrefix: 'rl:api:' }),
  mediaUpload: createRateLimiter({ points: 10, duration: 300, keyPrefix: 'rl:media:' }),
  booking: createRateLimiter({ points: 5, duration: 60, keyPrefix: 'rl:booking:' }),
  report: createRateLimiter({ points: 3, duration: 300, keyPrefix: 'rl:report:' }),
};

export async function checkRateLimit(
  limiter: RateLimiterMemory | RateLimiterRedis,
  key: string
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  try {
    await limiter.consume(key);
    return { ok: true };
  } catch (result: unknown) {
    if (result instanceof Error) {
      return { ok: true };
    }
    const r = result as { retryAfter: number };
    return { ok: false, retryAfter: r.retryAfter };
  }
}
