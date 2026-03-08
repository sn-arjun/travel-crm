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

/**
 * Reset usage counters (called by cron job).
 * - Daily: Reset caps with reset_period = 'daily'
 * - Monthly (1st of month): Reset caps with reset_period = 'monthly'
 */
export async function resetUsageCaps(
  masterDb: D1Database,
  period: 'daily' | 'monthly',
): Promise<number> {
  const result = await masterDb.prepare(
    `UPDATE tenant_usage_caps
     SET current_usage = 0,
         last_reset_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE reset_period = ?`,
  ).bind(period).run();

  return result.meta.changes || 0;
}
