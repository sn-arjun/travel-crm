/**
 * Small, non-sensitive workspace summary returned alongside the user on auth responses so clients can show the
 * workspace name and fill {{company_name}} without an extra call. Never add secrets or provider costs here.
 * The plan key and name and the seat limit and seats used come from the plan catalogue (R109).
 */

import { loadLocaleContext } from './money';
import type { Env } from '../types';
import { getCatalogue, tenantPlanKey } from '../services/plans/catalogue';
import { getSeatStatus } from '../services/plans/seats';

export interface TenantSummary {
  id: string;
  name: string;
  /** IANA zone: the user's own when set, else the agency's. */
  timezone: string;
  currency: string;
  /** BCP 47 tag: the user's own when set, else the agency's. */
  locale: string;
  country: string;
  phoneDefaultCountry: string;
  plan?: { key: string; name: string };
  seats?: { limit: number; used: number };
}

export async function getTenantSummary(
  tenantDb: D1Database,
  tenantId: string,
  fallbackName?: string | null,
  env?: Env,
  userId?: string | null,
): Promise<TenantSummary> {
  let name = '';
  try {
    // same source as GET /settings/company (tenant settings key/value table)
    const { results } = await tenantDb
      .prepare(`SELECT key, value FROM settings WHERE key IN ('company_name')`)
      .all<{ key: string; value: string | null }>();
    for (const row of results ?? []) {
      const v = (row.value ?? '').trim();
      if (row.key === 'company_name') name = v;
    }
  } catch {
    // settings unavailable - fall back to defaults below
  }
  const loc = await loadLocaleContext(tenantDb, userId);
  const summary: TenantSummary = {
    id: tenantId,
    name: name || (fallbackName ?? '').trim(),
    timezone: loc.timezone,
    currency: loc.currency,
    locale: loc.locale,
    country: loc.country,
    phoneDefaultCountry: loc.phoneDefaultCountry,
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
