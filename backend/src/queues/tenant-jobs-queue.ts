import type { Env } from '../types';
import { resolveTenantDb } from '../services/tenant-db';
import { runTenantJobSet, type TenantJobMessage } from '../cron/dispatch';

const JOB_SETS = new Set(['every5', 'hourly', 'daily']);

/**
 * Consumer for the per-agency scheduled work queue (travelcrm-tenant-jobs).
 * Per message: resolve the agency's database (never MASTER_DB; null -> ack and log), then run the job
 * set. Jobs claim their (job, period) in the agency's own database first, so a redelivered message
 * skips work that already ran. message.retry() is used only when a job hit an infrastructure error.
 */
export async function handleTenantJobs(batch: MessageBatch<TenantJobMessage>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    const body = msg.body;
    try {
      if (!body || typeof body.tenantId !== 'string' || !JOB_SETS.has(body.jobSet)) {
        console.error('[tenant-jobs] malformed message dropped:', JSON.stringify(body));
        msg.ack();
        continue;
      }
      const db = await resolveTenantDb(env, body.tenantId);
      if (!db) {
        console.error(`[tenant-jobs] tenant ${body.tenantId} has no usable database; ${body.jobSet} skipped`);
        msg.ack();
        continue;
      }
      const result = await runTenantJobSet(env, body.tenantId, db, body.jobSet, body.firedAt);
      if (result.failed.some((f) => f.infrastructure)) msg.retry();
      else msg.ack();
    } catch (err) {
      console.error('[tenant-jobs] message failed:', err);
      msg.retry();
    }
  }
}
