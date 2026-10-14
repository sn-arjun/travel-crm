import type { Context, Next } from 'hono';
import type { AppContext } from '../types';
import { isTestMode } from '../utils/test-mode';

/**
 * Test runs (isTestMode only; never production) raise every limit so the suites, which share one
 * IP and one KV, do not trip them. RATE_LIMIT_MULTIPLIER overrides the default of 1000; set it to '1'
 * to exercise the real limits.
 */
export function limitMultiplier(env: AppContext['Bindings']): number {
  if (!isTestMode(env)) return 1;
  if (env.RATE_LIMIT_MULTIPLIER === undefined || env.RATE_LIMIT_MULTIPLIER === '') return 1000;
  const n = Number(env.RATE_LIMIT_MULTIPLIER);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}


/**
 * Rate limiting middleware using KV for distributed counting.
 * Falls back to in-memory if KV is unavailable.
 */
export function rateLimit(options: {
  limit: number;
  windowMs: number;
  keyPrefix?: string;
  keyFn?: (c: Context<AppContext>) => string;
}) {
  const { limit: baseLimit, windowMs, keyPrefix = 'rl', keyFn } = options;

  return async (c: Context<AppContext>, next: Next) => {
    const limit = Math.ceil(baseLimit * limitMultiplier(c.env));
    const key = keyFn
      ? keyFn(c)
      : `${keyPrefix}:${c.get('userId' as never) || c.req.header('cf-connecting-ip') || 'unknown'}`;

    const windowKey = `${key}:${Math.floor(Date.now() / windowMs)}`;

    try {
      const cache = c.env.CACHE;
      const current = await cache.get(windowKey);
      const count = current ? parseInt(current, 10) : 0;

      if (count >= limit) {
        const resetTime = Math.ceil((Math.floor(Date.now() / windowMs) + 1) * windowMs / 1000);
        c.header('X-RateLimit-Remaining', '0');
        c.header('X-RateLimit-Reset', String(resetTime));
        return c.json({ error: 'Rate limit exceeded', retry_after: resetTime }, 429);
      }

      await cache.put(windowKey, String(count + 1), { expirationTtl: Math.ceil(windowMs / 1000) });

      c.header('X-RateLimit-Remaining', String(limit - count - 1));
      c.header('X-RateLimit-Reset', String(Math.ceil((Math.floor(Date.now() / windowMs) + 1) * windowMs / 1000)));
    } catch {
      // If KV fails, allow the request through
    }

    await next();
  };
}

// Pre-configured rate limiters
export const authRateLimit = rateLimit({
  limit: 10,
  windowMs: 60 * 1000, // 10 per minute
  keyPrefix: 'rl:auth',
  keyFn: (c) => `rl:auth:${c.req.header('cf-connecting-ip') || 'unknown'}`,
});

export const apiRateLimit = rateLimit({
  limit: 600,
  windowMs: 60 * 1000, // 600 per minute per user (keyed by userId; falls back to IP)
  keyPrefix: 'rl:api',
});

export const uploadRateLimit = rateLimit({
  limit: 20,
  windowMs: 60 * 1000, // 20 uploads per minute per user
  keyPrefix: 'rl:upload',
});
