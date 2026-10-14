/**
 * Small, non-sensitive workspace summary returned alongside the user on auth responses so clients can show the
 * workspace name and fill {{company_name}} without an extra call. Never add secrets or provider costs here.
 * The plan key and name and the seat limit and seats used come from the plan catalogue (R109).
 */

import { getTenantTimeZone } from './tz';
import type { Env } from '../types';
import { getCatalogue, tenantPlanKey } from '../services/plans/catalogue';
import { getSeatStatus } from '../services/plans/seats';

export interface TenantSummary {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  plan?: { key: string; name: string };
  seats?: { limit: number; used: number };
}

export async function getTenantSummary(
  tenantDb: D1Database,
  tenantId: string,
  fallbackName?: string | null,
  env?: Env,
): Promise<TenantSummary> {
  let name = '';
  let currency = '';
  try {
    // same source as GET /settings/company (tenant settings key/value table)
    const { results } = await tenantDb
      .prepare(`SELECT key, value FROM settings WHERE key IN ('company_name', 'currency')`)
      .all<{ key: string; value: string | null }>();
    for (const row of results ?? []) {
      const v = (row.value ?? '').trim();
      if (row.key === 'company_name') name = v;
      if (row.key === 'currency') currency = v;
    }
  } catch {
    // settings unavailable - fall back to defaults below
  }
  const summary: TenantSummary = {
    id: tenantId,
    name: name || (fallbackName ?? '').trim(),
    timezone: await getTenantTimeZone(tenantDb),
    currency: currency || 'INR',
  };
  if (env) {
    try {
      const planKey = await tenantPlanKey(env, tenantId);
      const plan = (await getCatalogue(env)).plans.find((p) => p.key === planKey);
      summary.plan = { key: planKey, name: plan?.name ?? planKey };
      const seats = await getSeatStatus(env, tenantDb, tenantId);
      summary.seats = { limit: seats.limit, used: seats.used };
    } catch {
      // the plan block is informational; never fail a login over it
    }
  }
  return summary;
}
