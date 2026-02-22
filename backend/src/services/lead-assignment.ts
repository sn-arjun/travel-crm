import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

interface RoundRobinState {
  lastIndex: number;
}

/**
 * Returns the next assignee ID using round-robin rotation.
 * Pool: all active salespersons + sales_managers ordered by name.
 * State is stored in KV: `round_robin:{tenantId}` → { lastIndex }
 */
export async function getNextAssignee(
  tenantDb: D1Database,
  kv: KVNamespace,
  tenantId: string
): Promise<string | null> {
  try {
    const result = await tenantDb
      .prepare("SELECT id FROM users WHERE role IN ('salesperson', 'sales_manager') AND is_active = 1 ORDER BY name ASC")
      .all<{ id: string }>();

    const users = result.results;
    if (users.length === 0) return null;

    const state = await kv.get<RoundRobinState>(`round_robin:${tenantId}`, 'json');
    const lastIndex = state?.lastIndex ?? -1;
    const nextIndex = (lastIndex + 1) % users.length;

    await kv.put(`round_robin:${tenantId}`, JSON.stringify({ lastIndex: nextIndex }));

    return users[nextIndex].id;
  } catch (err) {
    console.error('Round-robin assignment failed:', err);
    return null;
  }
}

/**
 * Returns the assignee ID configured for a specific lead source.
 * Routing rules stored in settings table as JSON: [{ source, assigned_to }]
 */
export async function getAssigneeBySourceRule(
  tenantDb: D1Database,
  source: string
): Promise<string | null> {
  try {
    const row = await tenantDb
      .prepare("SELECT value FROM settings WHERE key = 'routing_rules'")
      .first<{ value: string }>();

    if (!row?.value) return null;

    const rules = JSON.parse(row.value) as Array<{ source: string; assigned_to: string }>;
    const match = rules.find((r) => r.source === source);
    return match?.assigned_to ?? null;
  } catch (err) {
    console.error('Source-based routing failed:', err);
    return null;
  }
}

/**
 * Resolves the final assignee for a new lead.
 * Priority: explicit request → source rule → round-robin.
 */
export async function resolveAssignee(
  tenantDb: D1Database,
  kv: KVNamespace,
  tenantId: string,
  source: string,
  requestedAssignee?: string | null
): Promise<string | null> {
  if (requestedAssignee) return requestedAssignee;
  const bySource = await getAssigneeBySourceRule(tenantDb, source);
  if (bySource) return bySource;
  return getNextAssignee(tenantDb, kv, tenantId);
}
