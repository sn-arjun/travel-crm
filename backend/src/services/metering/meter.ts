/**
 * Communication metering (R110). SMS, WhatsApp, login codes (OTP), email and call minutes stay included in every
 * plan up to a monthly allowance (plan + add-on packs, R109). Every paid send calls meterUsage() BEFORE the provider.
 *
 *  - Atomic: one conditional UPDATE on tenant_usage_caps (current_usage + units <= allowance). Parallel sends can
 *    never take the counter past the allowance; there is no read-then-write.
 *  - Refund: a send the provider rejects calls refundUsage(), so a failed send does not consume allowance.
 *  - Month: the row is stamped with period_key (R105). A row of an older month is reset on first use of the new
 *    month; the daily cron's resetUsageCaps sees the matching key and never resets it a second time.
 *  - Refusal: AllowanceExhausted carries the 402 body (code ALLOWANCE_EXHAUSTED, used, allowance, options
 *    ['upgrade','top_up'], upgradeTo, purchasable add-on packs with prices). index.ts error handling drops custom
 *    bodies, so routes answer with allowanceExhaustedResponse(); queues just mark the recipient skipped.
 *
 * System emails (password reset, invites, usage alerts: sendTransactional) are not metered and are never blocked.
 */

import type { Context } from 'hono';
import type { AppContext, Env } from '../../types';
import { generateId } from '../../utils/uuid';
import {
  allowanceChannel,
  currentPeriodKey,
  getAllowance,
  getCatalogue,
  planAllowance,
  tenantMarket,
  tenantPlanKey,
  type Catalogue,
} from '../plans/catalogue';
import { packSalePriceFrom } from '../plans/pricing';
import { checkUsageAlerts } from './usage-alerts';

export type MeterChannel = 'sms' | 'whatsapp' | 'whatsapp_marketing' | 'otp' | 'call_minute' | 'email';

export interface ChannelSpec {
  channel: MeterChannel;
  allowanceKey: 'sms' | 'whatsapp' | 'whatsapp_marketing' | 'otp' | 'call_minutes' | 'email';
  capKey: string;
  label: string;
}

export const CHANNEL_SPECS: Record<MeterChannel, ChannelSpec> = {
  sms: { channel: 'sms', allowanceKey: 'sms', capKey: 'sms_per_month', label: 'SMS' },
  // R130 (pricing step B): utility / service templates and marketing templates are metered, and bought, separately.
  whatsapp: { channel: 'whatsapp', allowanceKey: 'whatsapp', capKey: 'whatsapp_per_month', label: 'WhatsApp utility messages' },
  whatsapp_marketing: { channel: 'whatsapp_marketing', allowanceKey: 'whatsapp_marketing', capKey: 'whatsapp_marketing_per_month', label: 'WhatsApp marketing messages' },
  otp: { channel: 'otp', allowanceKey: 'otp', capKey: 'otp_per_month', label: 'login codes' },
  call_minute: { channel: 'call_minute', allowanceKey: 'call_minutes', capKey: 'call_minutes_per_month', label: 'call minutes' },
  email: { channel: 'email', allowanceKey: 'email', capKey: 'email_per_month', label: 'emails' },
};

export const AI_CREDITS_SPEC = { allowanceKey: 'ai_credits', capKey: 'ai_credits_per_month', label: 'AI credits' } as const;

export interface MeterResult {
  allowed: boolean;
  used: number;
  allowance: number;
}

export interface PackOffer {
  key: string;
  name: string;
  units: number;
  price: number;
  currency: string;
}

export interface PlanOffer {
  key: string;
  name: string;
  allowance: number;
}

export interface AllowanceExhaustedBody {
  success: false;
  code: 'ALLOWANCE_EXHAUSTED';
  message: string;
  channel: MeterChannel;
  used: number;
  allowance: number;
  options: Array<'upgrade' | 'top_up'>;
  upgradeTo: PlanOffer | null;
  addons: PackOffer[];
  error: Record<string, unknown>;
}

export class AllowanceExhausted extends Error {
  readonly code = 'ALLOWANCE_EXHAUSTED';
  constructor(
    readonly channel: MeterChannel,
    readonly used: number,
    readonly allowance: number,
    readonly body: AllowanceExhaustedBody,
  ) {
    super(body.message);
    this.name = 'AllowanceExhausted';
  }
}

function nowStamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function readUsage(env: Env, tenantId: string, capKey: string): Promise<{ used: number; periodKey: string | null } | null> {
  const row = await env.MASTER_DB
    .prepare('SELECT current_usage, period_key FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = ?')
    .bind(tenantId, capKey)
    .first<{ current_usage: number | null; period_key: string | null }>();
  return row ? { used: Number(row.current_usage ?? 0), periodKey: row.period_key } : null;
}

/** Create the month's usage row if it is missing and bring a stale (earlier month) or unstamped row to this month. */
async function ensureRow(env: Env, tenantId: string, capKey: string, allowance: number, period: string): Promise<void> {
  const stamp = nowStamp();
  await env.MASTER_DB.batch([
    env.MASTER_DB
      .prepare(
        `INSERT OR IGNORE INTO tenant_usage_caps (id, tenant_id, cap_key, cap_value, current_usage, reset_period, last_reset_at, period_key)
         VALUES (?, ?, ?, ?, 0, 'monthly', ?, ?)`,
      )
      .bind(generateId(), tenantId, capKey, allowance, stamp, period),
    env.MASTER_DB
      .prepare(
        `UPDATE tenant_usage_caps SET current_usage = 0, period_key = ?, last_reset_at = ?, updated_at = ?
         WHERE tenant_id = ? AND cap_key = ? AND period_key IS NOT NULL AND period_key <> ?`,
      )
      .bind(period, stamp, stamp, tenantId, capKey, period),
    env.MASTER_DB
      .prepare('UPDATE tenant_usage_caps SET period_key = ? WHERE tenant_id = ? AND cap_key = ? AND period_key IS NULL')
      .bind(period, tenantId, capKey),
  ]);
}

async function conditionalIncrement(env: Env, tenantId: string, capKey: string, units: number, allowance: number, period: string): Promise<boolean> {
  const res = await env.MASTER_DB
    .prepare(
      `UPDATE tenant_usage_caps
       SET current_usage = current_usage + ?, cap_value = ?, updated_at = ?
       WHERE tenant_id = ? AND cap_key = ? AND period_key = ? AND current_usage + ? <= ?`,
    )
    .bind(units, allowance, nowStamp(), tenantId, capKey, period, units, allowance)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/** The cheapest public plan with a larger allowance for this key than the tenant's current plan. */
export function nextPlanUp(catalogue: Catalogue, planKey: string, allowanceKey: string, market?: string): PlanOffer | null {
  const current = catalogue.plans.find((p) => p.key === planKey);
  const have = planAllowance(current, allowanceKey, market);
  const higher = catalogue.plans
    .filter((p) => p.isActive && p.isPublic && planAllowance(p, allowanceKey, market) > have)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return higher ? { key: higher.key, name: higher.name, allowance: planAllowance(higher, allowanceKey, market) } : null;
}

/**
 * The packs on sale for one allowance key IN ONE MARKET, with the price computed from the provider unit cost + margin
 * (never below the margin floor). A pack of another market is never offered: a UK agency at its limit sees GBP packs only.
 */
export function packOffers(catalogue: Catalogue, allowanceKey: string, market: string, now: Date = new Date()): PackOffer[] {
  const channel = allowanceChannel(allowanceKey);
  return catalogue.addons
    .filter(
      (a) =>
        a.isActive &&
        a.market === market &&
        (allowanceKey === 'ai_credits' ? a.kind === 'ai_credit_pack' : a.kind === 'comm_pack' && a.channel === channel),
    )
    .map((a) => ({ a, priced: packSalePriceFrom(catalogue, a, now) }))
    .filter((x) => x.priced !== null)
    .map(({ a, priced }) => ({ key: a.key, name: a.name, units: a.units, price: priced!.price, currency: priced!.currency }));
}

/** Build the 402 body: the numbers, the next plan up, and the packs the agency can buy for this channel. */
export async function buildExhaustedBody(env: Env, tenantId: string, spec: ChannelSpec, used: number, allowance: number): Promise<AllowanceExhaustedBody> {
  const [catalogue, planKey, market] = await Promise.all([getCatalogue(env), tenantPlanKey(env, tenantId), tenantMarket(env, tenantId)]);
  const message =
    allowance > 0
      ? `Your plan includes ${allowance} ${spec.label} per month and all of them are used. Upgrade your plan or buy credits to keep sending.`
      : `Your plan does not include ${spec.label}. Upgrade your plan or buy credits to use them.`;
  const options: Array<'upgrade' | 'top_up'> = ['upgrade', 'top_up'];
  return {
    success: false,
    code: 'ALLOWANCE_EXHAUSTED',
    message,
    channel: spec.channel,
    used,
    allowance,
    options,
    upgradeTo: nextPlanUp(catalogue, planKey, spec.allowanceKey, market),
    addons: packOffers(catalogue, spec.allowanceKey, market),
    error: { code: 'ALLOWANCE_EXHAUSTED', message, channel: spec.channel, used, allowance, options },
  };
}

async function refuse(env: Env, tenantId: string, spec: ChannelSpec, used: number, allowance: number): Promise<never> {
  const body = await buildExhaustedBody(env, tenantId, spec, used, allowance);
  await checkUsageAlerts(env, tenantId, { capKey: spec.capKey, label: spec.label, used, allowance, refused: true });
  throw new AllowanceExhausted(spec.channel, used, allowance, body);
}

/**
 * Take `units` from the agency's allowance for this channel, or throw AllowanceExhausted. Call before the provider.
 * Returns the usage after the take. Reaching 80% / 100% raises the (deduplicated) alerts.
 */
export async function meterUsage(env: Env, tenantId: string, channel: MeterChannel, units = 1): Promise<MeterResult> {
  const spec = CHANNEL_SPECS[channel];
  const period = currentPeriodKey();
  const allowance = await getAllowance(env, tenantId, spec.allowanceKey, period);

  let taken = await conditionalIncrement(env, tenantId, spec.capKey, units, allowance, period);
  if (!taken) {
    await ensureRow(env, tenantId, spec.capKey, allowance, period);
    taken = await conditionalIncrement(env, tenantId, spec.capKey, units, allowance, period);
  }
  const usage = await readUsage(env, tenantId, spec.capKey);
  const used = usage?.used ?? 0;
  if (!taken) return refuse(env, tenantId, spec, used, allowance);

  await checkUsageAlerts(env, tenantId, { capKey: spec.capKey, label: spec.label, used, allowance });
  return { allowed: true, used, allowance };
}

/** meterUsage that answers with a result instead of throwing (queues). Other errors still throw. */
export async function tryMeter(env: Env, tenantId: string, channel: MeterChannel, units = 1): Promise<MeterResult> {
  try {
    return await meterUsage(env, tenantId, channel, units);
  } catch (err) {
    if (err instanceof AllowanceExhausted) return { allowed: false, used: err.used, allowance: err.allowance };
    throw err;
  }
}

/** Give units back after the provider rejected the send. Never throws. */
export async function refundUsage(env: Env, tenantId: string, channel: MeterChannel, units = 1): Promise<void> {
  try {
    await env.MASTER_DB
      .prepare(
        `UPDATE tenant_usage_caps SET current_usage = MAX(0, current_usage - ?), updated_at = ?
         WHERE tenant_id = ? AND cap_key = ?`,
      )
      .bind(units, nowStamp(), tenantId, CHANNEL_SPECS[channel].capKey)
      .run();
  } catch (err) {
    console.error('[meter] refund failed:', err);
  }
}

/**
 * Non-consuming check: is at least `units` still available? Used before work that is expensive to undo
 * (placing a call) and by the login-code route before it looks the account up. Throws AllowanceExhausted.
 */
export async function assertAllowance(env: Env, tenantId: string, channel: MeterChannel, units = 1): Promise<void> {
  const spec = CHANNEL_SPECS[channel];
  const period = currentPeriodKey();
  const allowance = await getAllowance(env, tenantId, spec.allowanceKey, period);
  const usage = await readUsage(env, tenantId, spec.capKey);
  const used = usage && (usage.periodKey === period || usage.periodKey === null) ? usage.used : 0;
  if (used + units > allowance) return refuse(env, tenantId, spec, used, allowance);
}

/**
 * Add usage that already happened (a finished call): unlike meterUsage it can take the counter past the allowance,
 * because a live call is never cut. Idempotent per eventKey (provider callbacks repeat). Returns false for a repeat.
 */
export async function recordUsage(env: Env, tenantId: string, channel: MeterChannel, units: number, eventKey: string): Promise<boolean> {
  if (units <= 0) return false;
  const spec = CHANNEL_SPECS[channel];
  const claim = await env.MASTER_DB
    .prepare('INSERT OR IGNORE INTO metered_events (event_key, tenant_id, channel, units) VALUES (?, ?, ?, ?)')
    .bind(eventKey, tenantId, channel, units)
    .run();
  if ((claim.meta.changes ?? 0) === 0) return false;

  const period = currentPeriodKey();
  const allowance = await getAllowance(env, tenantId, spec.allowanceKey, period);
  await ensureRow(env, tenantId, spec.capKey, allowance, period);
  await env.MASTER_DB
    .prepare('UPDATE tenant_usage_caps SET current_usage = current_usage + ?, cap_value = ?, updated_at = ? WHERE tenant_id = ? AND cap_key = ?')
    .bind(units, allowance, nowStamp(), tenantId, spec.capKey)
    .run();
  const usage = await readUsage(env, tenantId, spec.capKey);
  await checkUsageAlerts(env, tenantId, { capKey: spec.capKey, label: spec.label, used: usage?.used ?? units, allowance });
  return true;
}

/** The 402 JSON response for a refused send. */
export function allowanceExhaustedResponse(c: Context<AppContext>, err: AllowanceExhausted): Response {
  return c.json(err.body, 402);
}

/**
 * WhatsApp: only messages that cost money count. A free-form reply inside the 24 hour window that opens when the
 * contact writes to the agency is free; templates and business-initiated messages are paid.
 */
export async function insideFreeWhatsAppWindow(tenantDb: D1Database, contactId: string, now: Date = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const row = await tenantDb
    .prepare(
      `SELECT 1 AS hit FROM message_log
       WHERE contact_id = ? AND channel = 'whatsapp' AND direction = 'incoming' AND created_at >= ? LIMIT 1`,
    )
    .bind(contactId, since)
    .first();
  return !!row;
}

/**
 * R130: which WhatsApp allowance a paid message takes. A marketing message (a campaign, or a template whose category
 * metaCategoryForTemplate treats as promotional) counts against `whatsapp_marketing`; everything else that is paid
 * (utility templates, documents, free-form text sent outside the free window) against `whatsapp`. The same rule holds
 * for Meta and Twilio: Twilio has no category of its own, so the CRM template category decides.
 */
export function whatsappMeterChannel(category: string | null | undefined): 'whatsapp' | 'whatsapp_marketing' {
  return category === 'marketing' ? 'whatsapp_marketing' : 'whatsapp';
}

export interface UsageLine {
  key: string;
  channel: MeterChannel | 'ai';
  label: string;
  used: number;
  allowance: number;
  percent: number;
  exhausted: boolean;
  state: 'ok' | 'warning' | 'exhausted';
  periodEnd: string;
  addons: PackOffer[];
  upgradeTo: PlanOffer | null;
}

/** Per channel and AI credits: used, allowance (plan + packs), percent, period end and the packs on sale. */
export async function getUsageOverview(env: Env, tenantId: string): Promise<{ periodKey: string; periodEnd: string; plan: string; lines: UsageLine[] }> {
  const period = currentPeriodKey();
  const [catalogue, plan, market] = await Promise.all([getCatalogue(env), tenantPlanKey(env, tenantId), tenantMarket(env, tenantId)]);
  const periodEnd = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1)).toISOString().slice(0, 10);

  const defs: Array<{ key: string; channel: MeterChannel | 'ai'; label: string; allowanceKey: string; capKey: string }> = [
    { key: 'ai_credits', channel: 'ai', label: AI_CREDITS_SPEC.label, allowanceKey: AI_CREDITS_SPEC.allowanceKey, capKey: AI_CREDITS_SPEC.capKey },
    ...Object.values(CHANNEL_SPECS).map((s) => ({ key: s.channel, channel: s.channel, label: s.label, allowanceKey: s.allowanceKey, capKey: s.capKey })),
  ];

  const lines: UsageLine[] = [];
  for (const d of defs) {
    const allowance = await getAllowance(env, tenantId, d.allowanceKey, period);
    const usage = await readUsage(env, tenantId, d.capKey);
    const used = usage && (usage.periodKey === period || usage.periodKey === null) ? usage.used : 0;
    const percent = allowance > 0 ? Math.min(100, Math.round((used / allowance) * 100)) : 0;
    const exhausted = used >= allowance && !(allowance === 0 && d.channel === 'ai');
    lines.push({
      key: d.key,
      channel: d.channel,
      label: d.label,
      used,
      allowance,
      percent: exhausted ? 100 : percent,
      exhausted,
      state: exhausted ? 'exhausted' : percent >= 80 ? 'warning' : 'ok',
      periodEnd,
      addons: packOffers(catalogue, d.allowanceKey, market),
      upgradeTo: nextPlanUp(catalogue, plan, d.allowanceKey, market),
    });
  }
  return { periodKey: period, periodEnd, plan, lines };
}
