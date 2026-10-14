/**
 * Usage Cap Middleware — Enforce per-tenant usage limits.
 *
 * Reads from tenant_usage_caps in MASTER_DB.
 * If current_usage >= cap_value → 429.
 * If no cap row exists → uncapped (allow).
 */

import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';

export function checkUsageCap(capKey: string): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const tenantId = c.get('tenantId');
    if (!tenantId) return next();

    const masterDb = c.env.MASTER_DB;

    const cap = await masterDb.prepare(
      'SELECT cap_value, current_usage FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = ?',
    ).bind(tenantId, capKey).first<{ cap_value: number; current_usage: number }>();

    // No cap set → uncapped
    if (!cap) return next();

    if (cap.current_usage >= cap.cap_value) {
      return c.json({
        error: `Usage limit reached for ${capKey}. Current: ${cap.current_usage}, Limit: ${cap.cap_value}. Please contact your administrator.`,
      }, 429);
    }

    return next();
  };
}

/**
 * Increment usage counter for a tenant's cap.
 * Call this after a successful action (e.g., AI request, call).
 */
export async function incrementUsage(
  masterDb: D1Database,
  tenantId: string,
  capKey: string,
  amount: number = 1,
): Promise<void> {
  try {
    await masterDb.prepare(
      `UPDATE tenant_usage_caps
       SET current_usage = current_usage + ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
       WHERE tenant_id = ? AND cap_key = ?`,
    ).bind(amount, tenantId, capKey).run();
  } catch {
    // Non-critical — don't fail the request if cap tracking fails
  }
}

/** The period a moment falls in: UTC yyyy-mm-dd for daily caps, UTC yyyy-mm for monthly caps. */
export function usageCapPeriodKey(period: 'daily' | 'monthly', now: Date = new Date()): string {
  const iso = now.toISOString();
  return period === 'daily' ? iso.slice(0, 10) : iso.slice(0, 7);
}

/**
 * Reset usage counters once per period (called by the daily cron).
 * A cap is reset only when its stored period_key differs from the current period's key, so calling this
 * any number of times within a UTC day (daily caps) or UTC month (monthly caps) resets each cap exactly
 * once and never wipes usage recorded after that reset. Returns the number of caps reset.
 */
export async function resetUsageCaps(
  masterDb: D1Database,
  period: 'daily' | 'monthly',
  now: Date = new Date(),
): Promise<number> {
  const key = usageCapPeriodKey(period, now);
  const stamp = now.toISOString().replace(/.d{3}Z$/, 'Z');
  const result = await masterDb.prepare(
    `UPDATE tenant_usage_caps
     SET current_usage = 0,
         period_key = ?,
         last_reset_at = ?,
         updated_at = ?
     WHERE reset_period = ?
       AND (period_key IS NULL OR period_key <> ?)`,
  ).bind(key, stamp, stamp, period, key).run();

  return result.meta.changes || 0;
}
