import type { Env } from '../../types';
import { resolveTenantDb } from '../tenant-db';
import { getTenantTimeZone, localDateString } from '../../utils/tz';
import { emitEvent } from './events';

/**
 * Time-based automations (quiet quotes, overdue invoices, ...) run once per workspace per
 * local day. Called from the cron trigger; the day's `schedule.tick` event is the marker
 * that it already ran, so calling this every few minutes is harmless.
 */
export async function runScheduledAutomations(env: Env, now: Date = new Date()): Promise<number> {
  let ran = 0;
  try {
    const tenants = await env.MASTER_DB.prepare(`SELECT id FROM tenants WHERE status = 'active'`).all<{ id: string }>();
    for (const tenant of tenants.results) {
      try {
        const db = await resolveTenantDb(env, tenant.id);
        if (!db) continue;
        const day = localDateString(await getTenantTimeZone(db), now);
        const done = await db
          .prepare(`SELECT id FROM domain_events WHERE type = 'schedule.tick' AND entity_id = ? LIMIT 1`)
          .bind(day)
          .first();
        if (done) continue;
        await emitEvent(env, tenant.id, db, { type: 'schedule.tick', entityType: 'schedule', entityId: day });
        ran++;
      } catch (err) {
        console.error(`[automation] scheduled run failed for tenant ${tenant.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[automation] scheduled run failed:', err);
  }
  return ran;
}
