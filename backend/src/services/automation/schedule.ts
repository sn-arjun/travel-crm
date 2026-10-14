import type { Env } from '../../types';
import { automationsPaused } from './engine';
import { getTenantTimeZone, localDateString } from '../../utils/tz';
import { emitEvent } from './events';

/**
 * Time-based automations (quiet quotes, overdue invoices, ...) run once per workspace per
 * local day. Called from the per-agency job; the day's `schedule.tick` event is the marker
 * that it already ran, so calling this every few minutes is harmless. Returns 1 when it ran.
 * A paused workspace is skipped without writing the marker, so the day's tick still runs after resume.
 */
export async function runScheduledAutomationsForTenant(env: Env, tenantId: string, db: D1Database, now: Date = new Date()): Promise<number> {
  if (await automationsPaused(db)) return 0;
  const day = localDateString(await getTenantTimeZone(db), now);
  const done = await db
    .prepare(`SELECT id FROM domain_events WHERE type = 'schedule.tick' AND entity_id = ? LIMIT 1`)
    .bind(day)
    .first();
  if (done) return 0;
  await emitEvent(env, tenantId, db, { type: 'schedule.tick', entityType: 'schedule', entityId: day });
  return 1;
}
