/**
 * Exchange rates (R202).
 *
 * A daily job (cron/dispatch.ts, platform daily set) calls refreshExchangeRates(), which stores one row per
 * quote currency against a USD base in master `exchange_rates`. getExchangeRate() reads the stored rows and
 * only goes to the network when nothing usable is stored. Neither function throws to its caller: when a fetch
 * fails, the last stored value stays in use (and is reported with its date), and a pair that has never been
 * seen returns rate 1 with source 'none' so the caller can say the rate is unavailable.
 */
import type { Env } from '../types';

export const RATE_BASE = 'USD';
const RATE_SOURCE = 'open.er-api.com';
const RATE_URL = `https://open.er-api.com/v6/latest/${RATE_BASE}`;
const FETCH_TIMEOUT_MS = 8000;

export interface RateResult {
  rate: number;
  /** 'YYYY-MM-DD' the stored rate is dated, null when source is 'none'. */
  asOf: string | null;
  /** live = fetched just now, stored = read from exchange_rates, none = never seen (rate is 1). */
  source: 'same' | 'live' | 'stored' | 'none';
}

const code = (c: string) => c.trim().toUpperCase();

/** Fetch today's table and store it. Returns the number of rows written; 0 when the fetch or write failed. */
export async function refreshExchangeRates(env: Env, now: Date = new Date()): Promise<number> {
  try {
    const res = await fetch(RATE_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`);
    const data = (await res.json()) as { rates?: Record<string, number> };
    const entries = Object.entries(data.rates ?? {}).filter(
      ([quote, rate]) => /^[A-Z]{3}$/.test(quote) && quote !== RATE_BASE && typeof rate === 'number' && rate > 0 && Number.isFinite(rate),
    );
    if (entries.length === 0) throw new Error('Exchange rate API returned no rates');
    const asOf = now.toISOString().slice(0, 10);
    const stmts = entries.map(([quote, rate]) =>
      env.MASTER_DB
        .prepare(
          `INSERT INTO exchange_rates (base, quote, rate, as_of, source) VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(base, quote, as_of) DO UPDATE SET rate = excluded.rate, fetched_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
        )
        .bind(RATE_BASE, quote, rate, asOf, RATE_SOURCE),
    );
    for (let i = 0; i < stmts.length; i += 50) await env.MASTER_DB.batch(stmts.slice(i, i + 50));
    return entries.length;
  } catch (err) {
    console.error('Exchange rate refresh failed:', err instanceof Error ? err.message : err);
    return 0;
  }
}

/** Latest stored units of `quote` per one unit of the USD base. USD itself is 1. */
async function storedAgainstBase(env: Env, quote: string): Promise<{ rate: number; asOf: string } | null> {
  if (quote === RATE_BASE) return { rate: 1, asOf: '' };
  try {
    const row = await env.MASTER_DB
      .prepare('SELECT rate, as_of FROM exchange_rates WHERE base = ?1 AND quote = ?2 ORDER BY as_of DESC LIMIT 1')
      .bind(RATE_BASE, quote)
      .first<{ rate: number; as_of: string }>();
    return row && row.rate > 0 ? { rate: row.rate, asOf: row.as_of } : null;
  } catch {
    return null;
  }
}

async function fromStore(env: Env, from: string, to: string): Promise<RateResult | null> {
  const [a, b] = await Promise.all([storedAgainstBase(env, from), storedAgainstBase(env, to)]);
  if (!a || !b) return null;
  const dates = [a.asOf, b.asOf].filter(Boolean).sort();
  return { rate: b.rate / a.rate, asOf: dates[0] ?? null, source: 'stored' };
}

/**
 * Rate to convert one unit of `from` into `to`, with where it came from. Never throws.
 * Order: same currency, stored rows (the newest one, however old), a live refresh when nothing is stored.
 */
export async function getExchangeRateInfo(from: string, to: string, env: Env): Promise<RateResult> {
  const f = code(from);
  const t = code(to);
  if (f === t) return { rate: 1, asOf: null, source: 'same' };

  const stored = await fromStore(env, f, t);
  if (stored) return stored;

  if ((await refreshExchangeRates(env)) > 0) {
    const fresh = await fromStore(env, f, t);
    if (fresh) return { ...fresh, source: 'live' };
  }
  return { rate: 1, asOf: null, source: 'none' };
}

/** Rate only (1 when unknown). Prefer getExchangeRateInfo when the caller must tell "unknown" from "equal". */
export async function getExchangeRate(from: string, to: string, env: Env): Promise<number> {
  return (await getExchangeRateInfo(from, to, env)).rate;
}
