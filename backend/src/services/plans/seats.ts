/**
 * Seat enforcement. Active users and pending invites (invited users are stored active until deactivated)
 * count against the limit from the plan catalogue: included users + extra-user add-ons.
 */

import type { Context } from 'hono';
import type { AppContext } from '../../types';
import { seatLimit } from './catalogue';

export async function countSeatsUsed(tenantDb: D1Database): Promise<number> {
  const row = await tenantDb.prepare('SELECT COUNT(*) AS c FROM users WHERE is_active = 1').first<{ c: number }>();
  return Number(row?.c ?? 0);
}

export interface SeatStatus {
  limit: number;
  used: number;
  available: number;
}

export async function getSeatStatus(env: AppContext['Bindings'], tenantDb: D1Database, tenantId: string): Promise<SeatStatus> {
  const [limit, used] = await Promise.all([seatLimit(env, tenantId), countSeatsUsed(tenantDb)]);
  return { limit, used, available: Math.max(0, limit - used) };
}

/** A 402 SEAT_LIMIT response when one more user does not fit; null when there is room. */
export async function seatLimitResponse(c: Context<AppContext>): Promise<Response | null> {
  const status = await getSeatStatus(c.env, c.get('tenantDb'), c.get('tenantId'));
  if (status.used + 1 <= status.limit) return null;
  const message = `Your plan includes ${status.limit} users and all of them are in use. Upgrade your plan or add extra users.`;
  return c.json(
    {
      success: false,
      code: 'SEAT_LIMIT',
      message,
      limit: status.limit,
      used: status.used,
      options: ['upgrade', 'extra_users'],
      error: { code: 'SEAT_LIMIT', message, limit: status.limit, used: status.used, options: ['upgrade', 'extra_users'] },
    },
    402,
  );
}
