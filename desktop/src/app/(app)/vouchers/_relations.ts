import { leadsApi } from '@/lib/api/leads';
import { unwrapList } from '@/lib/api/envelope';
import type { Lead, Supplier } from '@travelcrm/shared';

/** Suppliers come back with a `category` that the shared type does not declare yet. */
export function supplierCategory(s: Supplier): string | undefined {
  return (s as Supplier & { category?: string }).category;
}

/** One page of lead options for the relation combobox. */
export async function fetchLeadOptions(query: string, page: number): Promise<{ items: Lead[]; total: number }> {
  const res = unwrapList<Lead>(await leadsApi.list({ search: query || undefined, page, limit: 20 }), { page, limit: 20 });
  return { items: res.data, total: res.pagination.total };
}
