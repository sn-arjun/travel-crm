interface RateLimitEntry {
  count: number;
  firstAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSecs?: number;
}

/**
 * Rate limiter using KV store with sliding window.
 *
 * @param kv - KV namespace (CACHE)
 * @param key - Rate limit key (e.g., "rate:login:127.0.0.1:user@email.com")
 * @param max - Maximum requests allowed in the window
 * @param windowSecs - Window duration in seconds
 */
export async function rateLimit(
  kv: KVNamespace,
  key: string,
  max: number,
  windowSecs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const entry = await kv.get(key, 'json') as RateLimitEntry | null;

  if (!entry) {
    // First request in window
    await kv.put(key, JSON.stringify({ count: 1, firstAt: now }), {
      expirationTtl: windowSecs,
    });
    return { allowed: true, remaining: max - 1 };
  }

  const elapsed = (now - entry.firstAt) / 1000;

  if (elapsed > windowSecs) {
    // Window expired — reset
    await kv.put(key, JSON.stringify({ count: 1, firstAt: now }), {
      expirationTtl: windowSecs,
    });
    return { allowed: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    const retryAfterSecs = Math.ceil(windowSecs - elapsed);
    return { allowed: false, remaining: 0, retryAfterSecs };
  }

  // Increment counter
  await kv.put(
    key,
    JSON.stringify({ count: entry.count + 1, firstAt: entry.firstAt }),
    { expirationTtl: Math.ceil(windowSecs - elapsed) }
  );

  return { allowed: true, remaining: max - entry.count - 1 };
}
