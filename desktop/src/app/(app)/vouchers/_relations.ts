import { leadsApi } from '@/lib/api/leads';
import type { Lead } from '@travelcrm/shared';

/**
 * One page of lead options for the relation combobox. The leads endpoint returns
 * `{ data: Lead[], pagination }` while the client types it as a nested paginated body,
 * so accept both shapes.
 */
export async function fetchLeadOptions(query: string, page: number): Promise<{ items: Lead[]; total: number }> {
  const res = (await leadsApi.list({ search: query || undefined, page, limit: 20 })) as unknown as {
    data?: Lead[] | { data?: Lead[]; pagination?: { total?: number } };
    pagination?: { total?: number };
  };
  const body = res?.data;
  const items = Array.isArray(body) ? body : (body?.data ?? []);
  const total = res?.pagination?.total ?? (Array.isArray(body) ? undefined : body?.pagination?.total) ?? items.length;
  return { items, total };
}
