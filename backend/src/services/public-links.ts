/**
 * Public links (R148, design section 7): random-token links to pages a customer opens without signing in.
 *
 * The token is the primary key of the master table `public_links` and is 128 random bits (base64url of
 * crypto.getRandomValues), never a UUIDv7: a UUIDv7 carries a timestamp prefix and is easier to guess. The tenant is found here,
 * in the master database, before any agency database is opened. An unknown token, a revoked token and a token of another kind
 * all look the same to the caller (`null`), so nothing reveals which agencies or bookings exist.
 */

export type PublicLinkKind = 'departure_booking' | 'booking_self_service' | 'passenger_self_service';

/** 16 random bytes in base64url are exactly 22 characters. */
export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{22}$/;

const TOUCH_EVERY_MS = 60_000;

/** Master database access only: both `Env` and a bare `{ MASTER_DB }` fit. */
type MasterEnv = { MASTER_DB: D1Database };

export function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface PublicLinkRef {
  tenantId: string;
  entityId: string;
}

/**
 * The link for this entity, created when there is none. An existing active link is returned as it is, so enabling a page twice
 * (or two staff members clicking at once) keeps one address.
 */
export async function createLink(
  env: MasterEnv,
  kind: PublicLinkKind,
  entityId: string,
  tenantId: string,
  opts: { expiresAt?: string | null } = {},
): Promise<string> {
  const existing = await env.MASTER_DB
    .prepare(
      `SELECT token FROM public_links
       WHERE tenant_id = ? AND kind = ? AND entity_id = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(tenantId, kind, entityId, new Date().toISOString())
    .first<{ token: string }>();
  if (existing) return existing.token;
  const token = newToken();
  await env.MASTER_DB
    .prepare('INSERT INTO public_links (token, tenant_id, kind, entity_id, is_active, expires_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .bind(token, tenantId, kind, entityId, opts.expiresAt ?? null, new Date().toISOString())
    .run();
  return token;
}

/** The active link of an entity, or null. Used by the staff card to show the address. */
export async function activeLinkFor(env: MasterEnv, kind: PublicLinkKind, entityId: string, tenantId: string): Promise<string | null> {
  const row = await env.MASTER_DB
    .prepare(
      `SELECT token FROM public_links WHERE tenant_id = ? AND kind = ? AND entity_id = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(tenantId, kind, entityId, new Date().toISOString())
    .first<{ token: string }>();
  return row?.token ?? null;
}

export type ResolvedLink = ({ status: 'ok' } & PublicLinkRef) | { status: 'expired' } | null;

/**
 * Finds the tenant and entity behind a token of this kind. `null` for anything that is not an active link of the kind (unknown,
 * revoked, wrong kind, malformed); `expired` only for a link that was valid and has run out, which callers answer with 410.
 * `last_used_at` is touched at most once a minute, off the request path when a waiter is given.
 */
export async function resolve(
  env: MasterEnv,
  token: string,
  kind: PublicLinkKind,
  waiter?: { waitUntil(promise: Promise<unknown>): void },
): Promise<ResolvedLink> {
  if (!TOKEN_SHAPE.test(token)) return null;
  const row = await env.MASTER_DB
    .prepare('SELECT tenant_id, entity_id, kind, is_active, expires_at, last_used_at FROM public_links WHERE token = ?')
    .bind(token)
    .first<{ tenant_id: string; entity_id: string; kind: string; is_active: number; expires_at: string | null; last_used_at: string | null }>();
  if (!row || row.kind !== kind || !row.is_active) return null;
  const now = Date.now();
  if (row.expires_at && Date.parse(row.expires_at) <= now) return { status: 'expired' };

  if (!row.last_used_at || now - Date.parse(row.last_used_at) >= TOUCH_EVERY_MS) {
    const touch = env.MASTER_DB
      .prepare('UPDATE public_links SET last_used_at = ? WHERE token = ? AND (last_used_at IS NULL OR last_used_at <= ?)')
      .bind(new Date(now).toISOString(), token, new Date(now - TOUCH_EVERY_MS).toISOString())
      .run()
      .catch(() => undefined);
    if (waiter) waiter.waitUntil(touch);
    else await touch;
  }
  return { status: 'ok', tenantId: row.tenant_id, entityId: row.entity_id };
}

/** Stops every active link of this entity (the token stays known but answers like any unknown token). Returns how many were stopped. */
export async function revoke(env: MasterEnv, kind: PublicLinkKind, entityId: string, tenantId: string): Promise<number> {
  const res = await env.MASTER_DB
    .prepare('UPDATE public_links SET is_active = 0 WHERE tenant_id = ? AND kind = ? AND entity_id = ? AND is_active = 1')
    .bind(tenantId, kind, entityId)
    .run();
  return res.meta?.changes ?? 0;
}

/** Stops the self-service links of the given seat bookings and passengers (contact erasure). Returns how many were stopped. */
export async function revokeSelfServiceFor(
  env: MasterEnv,
  tenantId: string,
  ids: { seatBookingIds: string[]; passengerIds: string[] },
): Promise<number> {
  let stopped = 0;
  const run = async (kind: PublicLinkKind, list: string[]) => {
    for (let i = 0; i < list.length; i += 50) {
      const part = list.slice(i, i + 50);
      const res = await env.MASTER_DB
        .prepare(`UPDATE public_links SET is_active = 0 WHERE tenant_id = ? AND kind = ? AND is_active = 1 AND entity_id IN (${part.map(() => '?').join(',')})`)
        .bind(tenantId, kind, ...part)
        .run();
      stopped += res.meta?.changes ?? 0;
    }
  };
  await run('booking_self_service', ids.seatBookingIds);
  await run('passenger_self_service', ids.passengerIds);
  return stopped;
}
