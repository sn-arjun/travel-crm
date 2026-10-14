import type { Context } from 'hono';
import type { AppContext, Env } from '../../types';
import { generateId } from '../../utils/uuid';

/**
 * Super admin audit trail (R111). Every write under /admin/* ends in one row of super_admin_audit_log:
 * who (admin_id + email/name in details.actor), what (action), which agency (entity_id when the target is a
 * tenant), and details = { actor, before, after, ...extra }. Secrets are removed before anything is stored.
 */

export interface AdminActor {
  id: string | null;
  email: string | null;
  name?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const SECRET_KEY = /pass(word)?|secret|token|hash|api[_-]?key|authorization|credential/i;

/** Copy of a value with every secret-looking key replaced; safe to store and to show. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}...`;
  return value;
}

/**
 * Write one audit row. `targetTenantId` null means a platform-level action (catalogue, login, ...); then
 * pass `opts.entityType` / `opts.entityId` to say what was touched.
 */
export async function logAdminAction(
  env: Pick<Env, 'MASTER_DB'>,
  actor: AdminActor,
  action: string,
  targetTenantId: string | null,
  before: unknown = null,
  after: unknown = null,
  opts: { entityType?: string; entityId?: string | null; extra?: Record<string, unknown> } = {},
): Promise<void> {
  const details = redact({
    actor: actor.email ?? null,
    actorName: actor.name ?? null,
    before,
    after,
    ...(opts.extra ?? {}),
  });
  await env.MASTER_DB
    .prepare(
      `INSERT INTO super_admin_audit_log (id, admin_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      generateId(),
      actor.id,
      action,
      opts.entityType ?? (targetTenantId ? 'tenant' : 'system'),
      opts.entityId !== undefined ? opts.entityId : targetTenantId,
      JSON.stringify(details),
      actor.ip ?? null,
      actor.userAgent ?? null,
    )
    .run();
}

/** The acting super admin of a request (set by the auth middleware) plus network details. */
export function actorFrom(c: Context<AppContext>): AdminActor {
  const sa = c.get('superAdmin');
  return {
    id: sa?.id ?? null,
    email: sa?.email ?? null,
    name: sa?.name ?? null,
    ip: c.get('clientIp') ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  };
}
