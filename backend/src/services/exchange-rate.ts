import type { Env } from '../types';

export async function getExchangeRate(from: string, to: string, env: Env): Promise<number> {
  if (from === to) return 1;

  const cacheKey = `exchange_rate:${from}:${to}`;

  // Check KV cache first
  try {
    const cached = await env.CACHE.get(cacheKey);
    if (cached) return parseFloat(cached);
  } catch (err) {
    console.error('KV cache read error:', err);
  }

  // Fetch live rate
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`);

    const data = (await res.json()) as { rates: Record<string, number> };
    const rate = data.rates[to];

    if (!rate) throw new Error(`No rate found for ${to}`);

    // Cache for 1 hour
    try {
      await env.CACHE.put(cacheKey, rate.toString(), { expirationTtl: 3600 });
    } catch (err) {
      console.error('KV cache write error:', err);
    }

    return rate;
  } catch (err) {
    console.error('Exchange rate fetch error:', err);
    // Fallback rates for common pairs
    const fallbacks: Record<string, number> = {
      'USD:INR': 83.5,
      'EUR:INR': 90.0,
      'GBP:INR': 105.0,
      'INR:USD': 0.012,
    };
    return fallbacks[`${from}:${to}`] || 1;
  }
}
