/**
 * One alert mechanism for AI credits and every communication channel (R110).
 *
 * When usage reaches 80% or 100% of the month's allowance, the agency's admins get an in-app notification and an
 * email (template usage_alert, sent with sendTransactional). Each (agency, cap, month, threshold) alerts once:
 * the primary key of usage_alerts makes the claim a single atomic INSERT OR IGNORE, so parallel sends and repeated
 * sends above a threshold never alert twice. When one use jumps over both thresholds only the 100% alert is sent.
 *
 * Alerts never throw: a failed alert must not fail the send it follows.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { resolveTenantDb } from '../tenant-db';
import { sendTransactional } from '../mail/transactional';
import { appUrl } from '../../utils/app-urls';

export const ALERT_THRESHOLDS = [80, 100] as const;

export interface UsageAlertInput {
  capKey: string;
  label: string;
  used: number;
  allowance: number;
  /** True when a send was just refused: the 100% alert is due even if the allowance is 0. */
  refused?: boolean;
}

function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function endOfMonthLabel(now: Date): string {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return end.toISOString().slice(0, 10);
}

/** The thresholds this usage has reached (80 and/or 100). */
export function reachedThresholds(used: number, allowance: number, refused = false): number[] {
  const reached: number[] = [];
  if (allowance > 0 && used * 100 >= allowance * 80) reached.push(80);
  if ((allowance > 0 && used >= allowance) || (refused && used >= allowance)) reached.push(100);
  return reached;
}

export async function checkUsageAlerts(env: Env, tenantId: string, input: UsageAlertInput, now: Date = new Date()): Promise<void> {
  try {
    const reached = reachedThresholds(input.used, input.allowance, input.refused);
    if (reached.length === 0) return;
    const period = monthKey(now);

    let newest: number | null = null;
    for (const threshold of reached) {
      const res = await env.MASTER_DB
        .prepare('INSERT OR IGNORE INTO usage_alerts (tenant_id, cap_key, period_key, threshold) VALUES (?, ?, ?, ?)')
        .bind(tenantId, input.capKey, period, threshold)
        .run();
      if ((res.meta.changes ?? 0) > 0) newest = threshold;
    }
    if (newest === null) return;

    await deliverAlert(env, tenantId, input, newest, now);
  } catch (err) {
    console.error('[usage-alerts] failed:', err);
  }
}

async function deliverAlert(env: Env, tenantId: string, input: UsageAlertInput, threshold: number, now: Date): Promise<void> {
  const db = await resolveTenantDb(env, tenantId);
  if (!db) return;
  const admins = await db
    .prepare("SELECT id, email FROM users WHERE role = 'admin' AND is_active = 1")
    .all<{ id: string; email: string | null }>();

  const title = threshold >= 100
    ? `${input.label}: monthly allowance used up`
    : `${input.label}: 80% of the monthly allowance used`;
  const message = threshold >= 100
    ? `You have used ${input.used} of ${input.allowance} ${input.label} this month. New sends are refused until the allowance renews (${endOfMonthLabel(now)}). Request an upgrade or extra credits under Settings > Usage and limits.`
    : `You have used ${input.used} of ${input.allowance} ${input.label} this month.`;

  for (const admin of admins.results ?? []) {
    try {
      await db
        .prepare(
          `INSERT INTO notifications (id, user_id, title, message, type, reference_type, reference_id)
           VALUES (?, ?, ?, ?, 'usage_alert', 'usage', ?)`,
        )
        .bind(generateId(), admin.id, title, message, input.capKey)
        .run();
    } catch (err) {
      console.error('[usage-alerts] notification failed:', err);
    }
    if (admin.email) {
      await sendTransactional(env, {
        to: admin.email,
        template: 'usage_alert',
        tenantId,
        data: {
          label: input.label,
          used: input.used,
          allowance: input.allowance,
          threshold,
          usageUrl: `${appUrl(env)}/settings/ai-usage`,
        },
      });
    }
  }
}
