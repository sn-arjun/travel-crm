import type { Context, Next } from 'hono';
import type { AppContext } from '../types';
import { isTestMode } from '../utils/test-mode';

/**
 * Test runs (isTestMode only; never production) raise every limit so the suites, which share one
 * IP, do not trip them. RATE_LIMIT_MULTIPLIER overrides the default of 1000; set it to '1'
 * to exercise the real limits.
 */
export function limitMultiplier(env: AppContext['Bindings']): number {
  if (!isTestMode(env)) return 1;
  if (env.RATE_LIMIT_MULTIPLIER === undefined || env.RATE_LIMIT_MULTIPLIER === '') return 1000;
  const n = Number(env.RATE_LIMIT_MULTIPLIER);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Shape of the Workers Rate Limiting binding (env.API_RATE_LIMITER and friends). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type LimiterName = 'API_RATE_LIMITER' | 'UPLOAD_RATE_LIMITER';

// In-memory fixed-window counters, used only when the binding is absent (tests, plain wrangler dev).
const memoryCounters = new Map<string, { count: number; windowStart: number }>();

/** Test hook: seed (or with null clear) the in-memory counter for a key. */
export function seedMemoryRateLimit(key: string, count: number | null): void {
  if (count === null) memoryCounters.delete(key);
  else memoryCounters.set(key, { count, windowStart: Date.now() });
}

function memoryAllow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (memoryCounters.size > 5000) {
    for (const [k, v] of memoryCounters) if (now - v.windowStart >= windowMs) memoryCounters.delete(k);
  }
  let entry = memoryCounters.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { count: 0, windowStart: now };
    memoryCounters.set(key, entry);
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

/** KV fixed window (read + write per call): only for low-volume endpoints. */
async function kvAllow(cache: KVNamespace, key: string, limit: number, windowMs: number): Promise<boolean> {
  const windowKey = `${key}:${Math.floor(Date.now() / windowMs)}`;
  const current = await cache.get(windowKey);
  const count = current ? parseInt(current, 10) : 0;
  if (count >= limit) return false;
  await cache.put(windowKey, String(count + 1), { expirationTtl: Math.max(60, Math.ceil(windowMs / 1000)) });
  return true;
}

/**
 * Rate limiting middleware on the Cloudflare Workers Rate Limiting binding: no KV read or write per
 * request. The real limit and window live in the generated wrangler config ([[ratelimits]] in
 * wrangler.base.toml: simple.limit / simple.period, period 10 or 60 seconds). When the binding is not
 * bound (tests, plain wrangler dev) an in-memory fixed window with the numbers below is used. Fail-open.
 * Without `binding` (low-volume public endpoints: chatbot, public quotation) the counter stays in KV, and
 * the login lockout also stays on KV (middleware/rate-limiter.ts).
 */
export function rateLimit(options: {
  limit: number;
  windowMs: number;
  binding?: LimiterName;
  keyPrefix?: string;
  keyFn?: (c: Context<AppContext>) => string;
}) {
  const { limit: baseLimit, windowMs, binding, keyPrefix = 'rl', keyFn } = options;

  return async (c: Context<AppContext>, next: Next) => {
    const key = keyFn
      ? keyFn(c)
      : `${keyPrefix}:${c.get('userId' as never) || c.req.header('cf-connecting-ip') || 'unknown'}`;

    let allowed = true;
    try {
      const limiter = binding ? (c.env as unknown as Record<string, RateLimitBinding | undefined>)[binding] : undefined;
      if (!binding) {
        allowed = await kvAllow(c.env.CACHE, key, Math.ceil(baseLimit * limitMultiplier(c.env)), windowMs);
      } else if (limiter && typeof limiter.limit === 'function' && limitMultiplier(c.env) === 1) {
        // Test runs with raised limits (the default) use the scaled in-memory window below: the binding's limit is
        // fixed in the config and local stacks (fix-stack) bind it too, so long e2e runs would trip it.
        allowed = (await limiter.limit({ key })).success;
      } else {
        allowed = memoryAllow(key, Math.ceil(baseLimit * limitMultiplier(c.env)), windowMs);
      }
    } catch {
      allowed = true; // a failing limiter must never block traffic
    }

    if (!allowed) {
      const resetTime = Math.ceil((Math.floor(Date.now() / windowMs) + 1) * windowMs / 1000);
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(resetTime));
      c.header('Retry-After', String(Math.max(1, resetTime - Math.floor(Date.now() / 1000))));
      return c.json({ error: 'Rate limit exceeded', retry_after: resetTime }, 429);
    }

    await next();
  };
}

// Pre-configured rate limiters (limits mirror wrangler.base.toml [[ratelimits]])
export const apiRateLimit = rateLimit({
  limit: 600,
  windowMs: 60 * 1000, // 600 per minute per user (keyed by userId; falls back to IP)
  binding: 'API_RATE_LIMITER',
  keyPrefix: 'rl:api',
});

export const uploadRateLimit = rateLimit({
  limit: 20,
  windowMs: 60 * 1000, // 20 uploads per minute per user
  binding: 'UPLOAD_RATE_LIMITER',
  keyPrefix: 'rl:upload',
});
