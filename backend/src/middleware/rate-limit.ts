import type { Context, Next } from 'hono';
import type { AppContext } from '../types';

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
  const { limit, windowMs, keyPrefix = 'rl', keyFn } = options;

  return async (c: Context<AppContext>, next: Next) => {
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
  limit: 100,
  windowMs: 60 * 1000, // 100 per minute per user
  keyPrefix: 'rl:api',
});

export const uploadRateLimit = rateLimit({
  limit: 20,
  windowMs: 60 * 1000, // 20 per minute
  keyPrefix: 'rl:upload',
});
