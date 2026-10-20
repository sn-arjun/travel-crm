/**
 * Telephone fraud limits (R305, ADR-001 section 7). A stolen login or a rogue agent can run up a large bill in hours,
 * so before an outbound call is placed it passes the checks below, in this order. Inbound calls are never checked.
 *
 *   1. BLOCK       a blocking fraud event is active for the agency (the daily minute ceiling fired and nobody lifted it)
 *   2. PREMIUM     premium-rate, satellite and international-network prefixes are refused outright (destinations.ts)
 *   3. COUNTRY     the destination country must be the agency's own or one the platform switched on for it
 *                  (voip_allowed_countries; only a super admin changes the list)
 *   4. VELOCITY    one agent: 10 calls a minute and 3 calls at once
 *   5. CEILING     the agency's minutes today (outbound, from the call log, live calls count as one) against the daily
 *                  ceiling; reaching it raises a BLOCKING event that a super admin sees and can lift
 *
 * The minute cap itself (plan + packs) is checked by the route just before this, with assertAllowance, and answers
 * 402 ALLOWANCE_EXHAUSTED with the upgrade / buy-a-pack options. A call that is already running is never cut: every
 * check here happens before the provider is asked to dial. The provider also ends any call after MAX_CALL_SECONDS.
 *
 * Every limit that fires is written to voip_fraud_events (one row per agency, kind and day, with a counter) so the
 * super admin console shows it, and a block or alert is audited (super_admin_audit_log, actor "system"). Lifting a
 * block is a super admin action and is audited with the admin's name.
 *
 * Spend alerts (checkSpend) run after every usage import: an agency whose provider cost today is more than 3 times
 * its 14-day daily average (with a small floor so a quiet agency's first calls do not alert), or a whole-platform day
 * above the ceiling, raises a flag and one email to SUPER_ADMIN_EMAIL.
 *
 * Platform settings (platform_settings; the super admin edits them) and their defaults:
 *   voip_daily_minutes_per_agency        600       outbound minutes an agency may use in a day (per-agency override:
 *                                                  voip_daily_minutes:<tenant id>)
 *   voip_platform_daily_cost_ceiling     150       provider cost, all agencies, in a day (USD)
 *   voip_spike_min_cost                  5         an agency's day below this provider cost never alerts as a spike (USD)
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { loadTenant } from '../billing/subscriptions';
import { logAdminAction, type AdminActor } from '../admin/audit';
import { sendTransactional } from '../mail/transactional';
import { agencyCountry } from './subaccounts';
import { getPlatformSetting } from './country-policy';
import { allowListMatches, classifyDestination } from './destinations';

export const MAX_CALLS_PER_MINUTE = 10;
export const MAX_CONCURRENT_CALLS = 3;
export const MAX_CALL_SECONDS = 2 * 3600;
export const SPIKE_MULTIPLIER = 3;
export const DEFAULT_DAILY_MINUTES = 600;
export const DEFAULT_PLATFORM_DAILY_COST = 150;
export const DEFAULT_SPIKE_MIN_COST = 5;
/** The tenant id used by events about the whole platform. */
export const PLATFORM_TENANT = '*';

export const SETTING_DAILY_MINUTES = 'voip_daily_minutes_per_agency';
export const SETTING_PLATFORM_COST = 'voip_platform_daily_cost_ceiling';
export const SETTING_SPIKE_MIN = 'voip_spike_min_cost';
export const tenantDailyMinutesKey = (tenantId: string) => `voip_daily_minutes:${tenantId}`;

export type FraudKind = 'daily_minutes' | 'spend_spike' | 'platform_ceiling' | 'velocity' | 'blocked_destination';

export interface FraudRefusal {
  status: 403 | 429;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const SYSTEM_ACTOR: AdminActor = { id: null, email: 'system', name: 'Fraud limits' };
const dayKeyOf = (d: Date) => d.toISOString().slice(0, 10);

async function numberSetting(env: Env, key: string, fallback: number): Promise<number> {
  const raw = await getPlatformSetting(env, key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function dailyMinuteCeiling(env: Env, tenantId: string): Promise<number> {
  const own = await getPlatformSetting(env, tenantDailyMinutesKey(tenantId));
  if (own !== null && Number.isFinite(Number(own)) && Number(own) > 0) return Number(own);
  return numberSetting(env, SETTING_DAILY_MINUTES, DEFAULT_DAILY_MINUTES);
}

export interface FraudEventRow {
  id: string;
  tenant_id: string;
  kind: FraudKind;
  day_key: string;
  blocking: number;
  status: 'active' | 'lifted';
  detail: string | null;
  occurrences: number;
  created_at: string;
  updated_at: string;
  lifted_at: string | null;
  lifted_by: string | null;
  notified_at: string | null;
}

/**
 * Write (or count again) one fraud event. Returns whether this call created it. A lifted event is not reopened the
 * same day: lifting is the super admin saying "this is fine today".
 */
export async function recordFraudEvent(
  env: Env,
  tenantId: string,
  kind: FraudKind,
  input: { blocking?: boolean; detail?: Record<string, unknown>; now?: Date },
): Promise<{ created: boolean; event: FraudEventRow }> {
  const now = input.now ?? new Date();
  const day = dayKeyOf(now);
  const detail = JSON.stringify(input.detail ?? {});
  const ins = await env.MASTER_DB
    .prepare(
      `INSERT OR IGNORE INTO voip_fraud_events (id, tenant_id, kind, day_key, blocking, status, detail) VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    )
    .bind(generateId(), tenantId, kind, day, input.blocking ? 1 : 0, detail)
    .run();
  const created = (ins.meta.changes ?? 0) > 0;
  if (!created) {
    await env.MASTER_DB
      .prepare(`UPDATE voip_fraud_events SET occurrences = occurrences + 1, detail = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE tenant_id = ? AND kind = ? AND day_key = ?`)
      .bind(detail, tenantId, kind, day)
      .run();
  }
  const event = (await env.MASTER_DB
    .prepare('SELECT * FROM voip_fraud_events WHERE tenant_id = ? AND kind = ? AND day_key = ?')
    .bind(tenantId, kind, day)
    .first<FraudEventRow>())!;
  if (created) {
    try {
      await logAdminAction(env, SYSTEM_ACTOR, `voip.fraud.${kind}`, tenantId === PLATFORM_TENANT ? null : tenantId, null, { blocking: !!input.blocking, ...(input.detail ?? {}) }, {
        entityType: 'voip_fraud_event',
        entityId: event.id,
      });
    } catch (err) {
      console.error('[fraud] audit failed:', err instanceof Error ? err.message : 'error');
    }
  }
  return { created, event };
}

/** The blocking event that stops this agency's new outbound calls right now, if any. */
export async function activeBlock(env: Env, tenantId: string, now: Date = new Date()): Promise<FraudEventRow | null> {
  return env.MASTER_DB
    .prepare(
      `SELECT * FROM voip_fraud_events WHERE tenant_id = ? AND blocking = 1 AND status = 'active'
         AND (kind <> 'daily_minutes' OR day_key = ?) ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(tenantId, dayKeyOf(now))
    .first<FraudEventRow>();
}

/** Super admin lifts an event (a block stops blocking; a flag is dismissed). Audited with the admin's name. */
export async function liftFraudEvent(env: Env, eventId: string, actor: AdminActor): Promise<FraudEventRow | null> {
  const before = await env.MASTER_DB.prepare('SELECT * FROM voip_fraud_events WHERE id = ?').bind(eventId).first<FraudEventRow>();
  if (!before) return null;
  if (before.status === 'active') {
    await env.MASTER_DB
      .prepare(`UPDATE voip_fraud_events SET status = 'lifted', lifted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), lifted_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`)
      .bind(actor.email ?? actor.id ?? 'unknown', eventId)
      .run();
    await logAdminAction(env, actor, 'voip.fraud.lift', before.tenant_id === PLATFORM_TENANT ? null : before.tenant_id, { kind: before.kind, status: before.status }, { status: 'lifted' }, {
      entityType: 'voip_fraud_event',
      entityId: eventId,
    });
  }
  return env.MASTER_DB.prepare('SELECT * FROM voip_fraud_events WHERE id = ?').bind(eventId).first<FraudEventRow>();
}

export function fraudEventView(row: FraudEventRow & { company_name?: string | null }) {
  let detail: unknown = null;
  try {
    detail = row.detail ? JSON.parse(row.detail) : null;
  } catch {
    detail = null;
  }
  return {
    id: row.id,
    tenantId: row.tenant_id === PLATFORM_TENANT ? null : row.tenant_id,
    companyName: row.company_name ?? null,
    kind: row.kind,
    day: row.day_key,
    blocking: !!row.blocking && row.status === 'active',
    status: row.status,
    detail,
    occurrences: row.occurrences,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    liftedAt: row.lifted_at,
    liftedBy: row.lifted_by,
  };
}

// ── Country allow-list ───────────────────────────────────────

export async function allowedExtraCountries(env: Env, tenantId: string): Promise<string[]> {
  const res = await env.MASTER_DB.prepare('SELECT country FROM voip_allowed_countries WHERE tenant_id = ? ORDER BY country').bind(tenantId).all<{ country: string }>();
  return (res.results ?? []).map((r) => r.country);
}

// ── The preflight ────────────────────────────────────────────

export interface PreflightInput {
  tenantId: string;
  db: D1Database;
  userId: string;
  toNumber: string;
  now?: Date;
}

/** Null = go ahead. Otherwise the refusal to answer with (nothing has been dialled and no call row exists yet). */
export async function preflightOutbound(env: Env, input: PreflightInput): Promise<FraudRefusal | null> {
  const now = input.now ?? new Date();
  const { tenantId, db, userId } = input;

  const block = await activeBlock(env, tenantId, now);
  if (block) {
    return {
      status: 403,
      code: 'CALLING_BLOCKED',
      message: 'Outbound calling is paused for your agency because a safety limit was reached. Contact support to have it lifted.',
      details: { reason: block.kind },
    };
  }

  const dest = classifyDestination(input.toNumber);
  if (dest.blocked) {
    await recordFraudEvent(env, tenantId, 'blocked_destination', { detail: { reason: dest.blocked.why, prefix: dest.blocked.prefix, userId }, now });
    return {
      status: 403,
      code: 'DESTINATION_BLOCKED',
      message: 'This number is a premium-rate or satellite number and cannot be called.',
      details: { reason: dest.blocked.why },
    };
  }

  const tenant = await loadTenant(env, tenantId);
  const own = tenant ? await agencyCountry(env, tenant, db) : '';
  const allowed = new Set<string>([...(own ? [own.toUpperCase()] : []), ...(await allowedExtraCountries(env, tenantId))]);
  if (!dest.country || !allowListMatches(allowed, dest.country)) {
    await recordFraudEvent(env, tenantId, 'blocked_destination', { detail: { reason: 'country_not_allowed', country: dest.country, userId }, now });
    return {
      status: 403,
      code: 'DESTINATION_NOT_ALLOWED',
      message: dest.country
        ? `Your agency may not call ${dest.country} yet. Ask support to switch that country on.`
        : 'This number is not in a country your agency may call. Ask support to switch it on.',
      details: { country: dest.country, allowed: [...allowed] },
    };
  }

  const since = new Date(now.getTime() - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const recent = await db
    .prepare(`SELECT COUNT(*) AS n FROM call_logs WHERE created_by = ? AND direction = 'outbound' AND created_at >= ?`)
    .bind(userId, since)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_CALLS_PER_MINUTE) {
    await recordFraudEvent(env, tenantId, 'velocity', { detail: { reason: 'calls_per_minute', userId, limit: MAX_CALLS_PER_MINUTE }, now });
    return { status: 429, code: 'CALL_RATE_LIMITED', message: `Too many calls in a minute (the limit is ${MAX_CALLS_PER_MINUTE}). Wait a moment and try again.`, details: { limit: MAX_CALLS_PER_MINUTE } };
  }
  const liveSince = new Date(now.getTime() - MAX_CALL_SECONDS * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const live = await db
    .prepare(`SELECT COUNT(*) AS n FROM call_logs WHERE created_by = ? AND direction = 'outbound' AND status IN ('initiated', 'queued', 'ringing', 'in-progress') AND created_at >= ?`)
    .bind(userId, liveSince)
    .first<{ n: number }>();
  if ((live?.n ?? 0) >= MAX_CONCURRENT_CALLS) {
    await recordFraudEvent(env, tenantId, 'velocity', { detail: { reason: 'concurrent_calls', userId, limit: MAX_CONCURRENT_CALLS }, now });
    return { status: 429, code: 'TOO_MANY_CONCURRENT_CALLS', message: `You already have ${MAX_CONCURRENT_CALLS} calls in progress. End one before starting another.`, details: { limit: MAX_CONCURRENT_CALLS } };
  }

  const ceiling = await dailyMinuteCeiling(env, tenantId);
  const todayStart = `${dayKeyOf(now)}T00:00:00Z`;
  const day = await db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN status IN ('initiated', 'queued', 'ringing', 'in-progress') AND COALESCE(duration_seconds, 0) = 0 THEN 1
                                ELSE (COALESCE(duration_seconds, 0) + 59) / 60 END), 0) AS minutes
         FROM call_logs WHERE direction = 'outbound' AND created_at >= ?`,
    )
    .bind(todayStart)
    .first<{ minutes: number }>();
  const used = Number(day?.minutes ?? 0);
  if (used >= ceiling) {
    const lifted = await env.MASTER_DB
      .prepare(`SELECT 1 AS hit FROM voip_fraud_events WHERE tenant_id = ? AND kind = 'daily_minutes' AND day_key = ? AND status = 'lifted'`)
      .bind(tenantId, dayKeyOf(now))
      .first();
    if (!lifted) {
      await recordFraudEvent(env, tenantId, 'daily_minutes', { blocking: true, detail: { minutesToday: used, ceiling }, now });
      return {
        status: 403,
        code: 'DAILY_LIMIT_REACHED',
        message: 'Your agency reached its daily calling limit. Calling is paused until support lifts it or tomorrow.',
        details: { minutesToday: used, ceiling },
      };
    }
  }
  return null;
}

// ── Spend alerts ─────────────────────────────────────────────

async function notifyOwner(env: Env, event: FraudEventRow, subject: string, lines: string[]): Promise<void> {
  const to = env.SUPER_ADMIN_EMAIL?.trim();
  if (!to) return;
  const res = await sendTransactional(env, { to, template: 'voip_spend_alert', data: { subject, lines, tenantId: event.tenant_id === PLATFORM_TENANT ? '' : event.tenant_id } });
  if (res.delivered || res.via === 'outbox') {
    await env.MASTER_DB.prepare(`UPDATE voip_fraud_events SET notified_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`).bind(event.id).run();
  }
}

/** Provider cost of one agency (or all, tenantId null) between two instants. */
async function costBetween(env: Env, tenantId: string | null, from: string, to: string): Promise<number> {
  const row = await env.MASTER_DB
    .prepare(`SELECT COALESCE(SUM(provider_cost), 0) AS cost FROM call_usage WHERE started_at >= ? AND started_at < ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(...(tenantId ? [from, to, tenantId] : [from, to]))
    .first<{ cost: number }>();
  return Number(row?.cost ?? 0);
}

/** The agency's day against its own history, and the whole platform's day against the ceiling. Both raise flags + one email. */
export async function checkSpend(env: Env, tenantId: string, now: Date = new Date()): Promise<{ spike: boolean; platform: boolean }> {
  const dayStart = `${dayKeyOf(now)}T00:00:00.000Z`;
  const dayEnd = new Date(Date.parse(dayStart) + 86_400_000).toISOString();
  const histStart = new Date(Date.parse(dayStart) - 14 * 86_400_000).toISOString();
  const out = { spike: false, platform: false };

  const today = await costBetween(env, tenantId, dayStart, dayEnd);
  const avg = (await costBetween(env, tenantId, histStart, dayStart)) / 14;
  const floor = await numberSetting(env, SETTING_SPIKE_MIN, DEFAULT_SPIKE_MIN_COST);
  if (today > SPIKE_MULTIPLIER * avg && today >= floor) {
    out.spike = true;
    const { created, event } = await recordFraudEvent(env, tenantId, 'spend_spike', { detail: { costToday: round(today), dailyAverage14d: round(avg), multiplier: SPIKE_MULTIPLIER }, now });
    if (created) {
      const tenant = await loadTenant(env, tenantId);
      await notifyOwner(env, event, `Call spend spike: ${tenant?.company_name ?? tenantId}`, [
        `Provider cost today is ${round(today)} against a 14-day daily average of ${round(avg)} (more than ${SPIKE_MULTIPLIER} times).`,
        'Check the agency in the super admin console (Calling tab); suspend its calling account if this is not expected.',
      ]);
    }
  }

  const ceiling = await numberSetting(env, SETTING_PLATFORM_COST, DEFAULT_PLATFORM_DAILY_COST);
  const total = await costBetween(env, null, dayStart, dayEnd);
  if (total > ceiling) {
    out.platform = true;
    const { created, event } = await recordFraudEvent(env, PLATFORM_TENANT, 'platform_ceiling', { detail: { costToday: round(total), ceiling }, now });
    if (created) {
      await notifyOwner(env, event, 'Call spend above the platform ceiling', [
        `Provider cost across all agencies today is ${round(total)}, above the ceiling of ${ceiling}.`,
      ]);
    }
  }
  return out;
}

const round = (n: number) => Math.round(n * 10000) / 10000;
