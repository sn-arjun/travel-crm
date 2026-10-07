/**
 * Small, non-sensitive workspace summary returned alongside the user on auth responses so clients can show the
 * workspace name and fill {{company_name}} without an extra call. Never add secrets or plan internals here.
 */

import { getTenantTimeZone } from './tz';

export interface TenantSummary {
  id: string;
  name: string;
  timezone: string;
  currency: string;
}

export async function getTenantSummary(
  tenantDb: D1Database,
  tenantId: string,
  fallbackName?: string | null,
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
  return {
    id: tenantId,
    name: name || (fallbackName ?? '').trim(),
    timezone: await getTenantTimeZone(tenantDb),
    currency: currency || 'INR',
  };
}
