/**
 * Call minutes metered from the provider's own records (R305).
 *
 * Every five minutes (tenant job `voip.usage-import`) the usage of each agency's sub-account is read with
 * fetchUsage and charged against the agency's call-minute allowance (plan + minute packs, R110) through recordUsage.
 * Nothing else counts minutes: the status callback and the agent's outcome no longer touch the counter.
 *
 * Rules
 *  - ONCE PER PROVIDER CALL: the metering key is the provider call id (metered_events.event_key = `call-minutes:<id>`)
 *    and call_usage.provider_call_id is UNIQUE. Overlapping import windows, a re-run after a crash, or two
 *    imports at once cannot charge a call twice. The counter is touched first and the call_usage row second, so a
 *    crash between the two is repaired by the next run (the counter claim is already taken, the row is inserted).
 *  - RESUMABLE: voip_usage_cursor holds, per agency, the start time of the newest record imported. The next window
 *    starts OVERLAP_MS before it (providers price and report calls late). A failed run keeps the cursor.
 *  - MINUTES: ceil(billed seconds / 60), the provider bills per started minute. Inbound minutes are counted but
 *    never block a caller; an outbound call is only ever refused BEFORE it starts (fraud.ts, assertAllowance).
 *  - WEIGHT (documented rule): a minute to a destination dearer than the agency's base minute counts as more than
 *    one. weight = unit cost of the destination / unit cost of the agency's market (both comm_unit_costs rows of
 *    channel call_minute, same currency), never below 1 and at most MAX_WEIGHT; counted = ceil(minutes x weight).
 *    No row for either side, or different currencies: weight 1. Setting every row to the same cost disables it.
 *  - LEGS: a bridged call is several provider calls. The leg to the agent is cost only (0 minutes); only the customer
 *    leg is counted. A 'dial' child is the agent leg when its parent is an inbound call, else the customer leg.
 *  - Provider cost is stored for the platform's own spend watch (fraud.ts), not shown to agencies. Costs the provider
 *    prices late (0 at first) are filled in when a later window returns the call again; minutes never change.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { getCatalogue, marketForCountry, type Catalogue, type UnitCost } from '../plans/catalogue';
import { recordUsage } from '../metering/meter';
import { loadTenant } from '../billing/subscriptions';
import { platformProvider } from './subaccounts';
import { classifyDestination, destinationType } from './destinations';
import type { VoipUsageRecord } from './contract';
import { checkSpend } from './fraud';

export const USAGE_IMPORT_OVERLAP_MS = 3 * 3600_000;
/** With nothing new to import, the cursor still moves forward to this far behind now (a call can last 2 hours and be reported late). */
export const USAGE_IDLE_LAG_MS = 6 * 3600_000;
export const MAX_WEIGHT = 20;

export interface ImportResult {
  tenantId: string;
  fetched: number;
  charged: number;
  alreadyCharged: number;
  minutes: number;
  cursor: string | null;
  skipped?: 'no_account' | 'no_sub_account';
  error?: string;
}

function unitCostFor(catalogue: Catalogue, market: string, now: Date): UnitCost | null {
  return (
    catalogue.unitCosts
      .filter((u) => u.channel === 'call_minute' && u.market === market && u.isActive && u.unitCost > 0 && u.effectiveFrom <= now.toISOString())
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0] ?? null
  );
}

/** The weight of one minute to `destination` for an agency in `agencyMarket` (see the header). 1 when it cannot be told. */
export function minuteWeight(catalogue: Catalogue, agencyMarket: string, destination: string | null, now: Date = new Date()): number {
  if (!destination) return 1;
  const base = unitCostFor(catalogue, agencyMarket, now);
  const dest = unitCostFor(catalogue, destination, now);
  if (!base || !dest || base.currency !== dest.currency) return 1;
  const w = dest.unitCost / base.unitCost;
  if (!Number.isFinite(w) || w <= 1) return 1;
  return Math.min(MAX_WEIGHT, Math.round(w * 100) / 100);
}

/** Minutes the provider billed: per started minute. */
export function billedMinutes(billedSeconds: number): number {
  return billedSeconds > 0 ? Math.ceil(billedSeconds / 60) : 0;
}

const nowStamp = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

async function legOf(env: Env, rec: VoipUsageRecord): Promise<'agent' | 'customer'> {
  const leg = rec.leg ?? 'customer';
  if (leg !== 'dial') return leg;
  if (!rec.parentCallId) return 'customer';
  const parent = await env.MASTER_DB
    .prepare('SELECT direction FROM call_usage WHERE provider_call_id = ?')
    .bind(rec.parentCallId)
    .first<{ direction: string }>();
  // A child of an inbound call is the call going out to the agent; a child of an outbound call is the customer.
  return parent?.direction === 'inbound' ? 'agent' : 'customer';
}

/**
 * Import one agency's usage. `provider` is injectable for tests; production uses the platform's credentials.
 * Never throws for a provider failure: the error is stored on the cursor row and the cursor stays.
 */
export async function importTenantUsage(env: Env, tenantId: string, now: Date = new Date()): Promise<ImportResult> {
  const result: ImportResult = { tenantId, fetched: 0, charged: 0, alreadyCharged: 0, minutes: 0, cursor: null };
  const account = await env.MASTER_DB
    .prepare('SELECT sub_account_id, status, created_at FROM voip_accounts WHERE tenant_id = ?')
    .bind(tenantId)
    .first<{ sub_account_id: string | null; status: string; created_at: string }>();
  if (!account) return { ...result, skipped: 'no_account' };
  if (!account.sub_account_id || account.status === 'pending') return { ...result, skipped: 'no_sub_account' };

  const cursorRow = await env.MASTER_DB
    .prepare('SELECT cursor_at FROM voip_usage_cursor WHERE tenant_id = ?')
    .bind(tenantId)
    .first<{ cursor_at: string }>();
  const baseCursor = cursorRow?.cursor_at ?? account.created_at;
  const since = new Date(Date.parse(baseCursor) - USAGE_IMPORT_OVERLAP_MS).toISOString();

  let records: VoipUsageRecord[];
  try {
    records = await platformProvider(env).fetchUsage({ subAccountId: account.sub_account_id, since });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'usage fetch failed';
    await env.MASTER_DB
      .prepare(
        `INSERT INTO voip_usage_cursor (tenant_id, cursor_at, last_run_at, last_error) VALUES (?, ?, ?, ?)
         ON CONFLICT(tenant_id) DO UPDATE SET last_run_at = excluded.last_run_at, last_error = excluded.last_error`,
      )
      .bind(tenantId, baseCursor, nowStamp(now), message.slice(0, 300))
      .run();
    return { ...result, cursor: baseCursor, error: message };
  }
  result.fetched = records.length;

  const tenant = await loadTenant(env, tenantId);
  const catalogue = await getCatalogue(env);
  const market = marketForCountry(tenant?.country);

  // Parents first, so a child leg finds its parent.
  records.sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
  let newest = baseCursor;

  for (const rec of records) {
    if (!rec.providerCallId) continue;
    if (rec.startedAt > newest) newest = rec.startedAt;

    const existing = await env.MASTER_DB
      .prepare('SELECT id, provider_cost FROM call_usage WHERE provider_call_id = ?')
      .bind(rec.providerCallId)
      .first<{ id: string; provider_cost: number }>();
    if (existing) {
      result.alreadyCharged++;
      // Late pricing: fill the cost in, never the minutes.
      if (!(existing.provider_cost > 0) && rec.cost > 0) {
        await env.MASTER_DB.prepare('UPDATE call_usage SET provider_cost = ? WHERE id = ?').bind(rec.cost, existing.id).run();
      }
      continue;
    }

    const leg = await legOf(env, rec);
    const remote = rec.direction === 'outbound' ? rec.to : rec.from;
    const info = classifyDestination(remote);
    const raw = billedMinutes(rec.billedSeconds);
    // The destination's price class matters for outbound; an inbound caller is not a destination we choose.
    const weight = rec.direction === 'outbound' ? minuteWeight(catalogue, market, info.country, now) : 1;
    const counted = leg === 'customer' ? Math.ceil(raw * weight) : 0;

    if (counted > 0) {
      await recordUsage(env, tenantId, 'call_minute', counted, `call-minutes:${rec.providerCallId}`);
    }
    const ins = await env.MASTER_DB
      .prepare(
        `INSERT OR IGNORE INTO call_usage
           (id, tenant_id, provider_call_id, sub_account_id, direction, leg, parent_call_id, remote_number, destination_country,
            destination_type, billed_seconds, provider_cost, currency, weight, minutes_counted, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        generateId(), tenantId, rec.providerCallId, account.sub_account_id, rec.direction, leg, rec.parentCallId ?? null, remote || null,
        info.country, destinationType(info), rec.billedSeconds, rec.cost, rec.currency, weight, counted, rec.startedAt,
      )
      .run();
    if ((ins.meta.changes ?? 0) > 0) {
      result.charged++;
      result.minutes += counted;
    } else {
      result.alreadyCharged++;
    }
  }

  // Advance: to the newest record seen, or (nothing new) to a safe lag behind now. Never backwards.
  const idle = new Date(now.getTime() - USAGE_IDLE_LAG_MS).toISOString();
  const next = records.length > 0 ? newest : idle > baseCursor ? idle : baseCursor;
  await env.MASTER_DB
    .prepare(
      `INSERT INTO voip_usage_cursor (tenant_id, cursor_at, last_run_at, last_error, imported_total) VALUES (?, ?, ?, NULL, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET cursor_at = MAX(cursor_at, excluded.cursor_at), last_run_at = excluded.last_run_at,
         last_error = NULL, imported_total = imported_total + excluded.imported_total`,
    )
    .bind(tenantId, next, nowStamp(now), result.charged)
    .run();
  result.cursor = next;

  if (result.charged > 0 || result.alreadyCharged > 0) {
    try {
      await checkSpend(env, tenantId, now);
    } catch (err) {
      console.error('[voip-metering] spend check failed:', err instanceof Error ? err.message : 'error');
    }
  }
  return result;
}
