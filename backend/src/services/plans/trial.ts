/**
 * Trial expiry. A trial agency has a subscription row with status 'trial' whose trial_ends_at is the end of the
 * trial (next_billing_date for rows created before that column was filled). The daily platform job flips the
 * agency to 'expired' once that moment has passed; login also checks the date, so an agency never gets in during
 * the hours between the end of the trial and the next daily run.
 */

import type { Context } from 'hono';
import type { Env } from '../../types';
import { invalidateTenantCache } from '../tenant-db';

export const TRIAL_EXPIRED_MESSAGE = 'Your free trial has ended. Contact us to choose a plan and keep your data.';

export async function trialEndsAt(db: D1Database, tenantId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT COALESCE(trial_ends_at, next_billing_date) AS ends_at FROM subscriptions
        WHERE tenant_id = ? AND status = 'trial' ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(tenantId)
    .first<{ ends_at: string | null }>();
  return row?.ends_at ?? null;
}

/** True when this agency is on a trial that has ended (status already 'expired', or the date has passed). */
export async function isTrialExpired(
  db: D1Database,
  tenantId: string,
  tenant: { plan?: string | null; status?: string | null },
  now: Date = new Date(),
): Promise<boolean> {
  if (tenant.plan !== 'trial') return false;
  if (tenant.status === 'expired') return true;
  if (tenant.status !== 'trial' && tenant.status !== 'active') return false;
  const ends = await trialEndsAt(db, tenantId);
  return !!ends && ends < now.toISOString();
}

/** Flip every trial agency past its end date to 'expired' and drop its cached registry entry. */
export async function expireTrials(env: Env, now: Date = new Date()): Promise<string[]> {
  const due = await env.MASTER_DB
    .prepare(
      `SELECT t.id FROM tenants t
         JOIN subscriptions s ON s.tenant_id = t.id AND s.status = 'trial'
        WHERE t.plan = 'trial' AND t.status IN ('trial', 'active')
          AND COALESCE(s.trial_ends_at, s.next_billing_date) < ?
        GROUP BY t.id`,
    )
    .bind(now.toISOString())
    .all<{ id: string }>();
  const ids = (due.results ?? []).map((r) => r.id);
  for (const id of ids) {
    await env.MASTER_DB
      .prepare(`UPDATE tenants SET status = 'expired', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND plan = 'trial'`)
      .bind(id)
      .run();
    await invalidateTenantCache(env, id);
  }
  return ids;
}

/** 402 TRIAL_EXPIRED, in both the flat and the nested error shape the clients read. */
export function trialExpiredResponse(c: Context): Response {
  return c.json(
    {
      success: false,
      code: 'TRIAL_EXPIRED',
      message: TRIAL_EXPIRED_MESSAGE,
      error: { code: 'TRIAL_EXPIRED', message: TRIAL_EXPIRED_MESSAGE },
    },
    402,
  );
}
