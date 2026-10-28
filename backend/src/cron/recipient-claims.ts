/**
 * Per-recipient send claims (R124).
 *
 * A daily reminder job is retried as a whole when an infrastructure error reaches the job runner, so the
 * recipients already messaged earlier in the loop must not be messaged again. Before each send the job writes a
 * claim row into the agency's cron_job_runs table with INSERT OR IGNORE:
 *   job        = 'recipient:<job>'            (e.g. recipient:invoices.reminders:due3)
 *   period_key = '<period>:<recipient key>'   (e.g. day:2026-11-04:<invoice id>:sms)
 * Whoever inserts the row owns the send; a retry finds the row and skips that recipient.
 *
 * - infrastructure error while sending: only that recipient's claim is released, then the error is rethrown
 *   (the job runner releases the day's job claim and the queue message is retried).
 * - any other failure: the claim stays (no automatic retry) and a 'recipient-failed:<job>' row records it.
 * - recipient claims older than 14 days are pruned by the daily housekeeping job (pruneRecipientClaims).
 */
import { isInfrastructureError } from './errors';
import { log } from '../utils/logger';

export const RECIPIENT_CLAIM_PREFIX = 'recipient:';
export const RECIPIENT_FAILED_PREFIX = 'recipient-failed:';
export const RECIPIENT_CLAIM_RETENTION_DAYS = 14;

export interface RecipientClaims {
  db: D1Database;
  tenantId: string;
  /** Reminder job label, e.g. 'contacts.birthdays'. */
  job: string;
  /** Period the send belongs to, e.g. 'day:2026-11-04'. */
  period: string;
}

export async function claimRecipient(c: RecipientClaims, key: string): Promise<boolean> {
  const res = await c.db
    .prepare('INSERT OR IGNORE INTO cron_job_runs (tenant_id, job, period_key) VALUES (?, ?, ?)')
    .bind(c.tenantId, RECIPIENT_CLAIM_PREFIX + c.job, `${c.period}:${key}`)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function releaseRecipient(c: RecipientClaims, key: string): Promise<void> {
  await c.db
    .prepare('DELETE FROM cron_job_runs WHERE tenant_id = ? AND job = ? AND period_key = ?')
    .bind(c.tenantId, RECIPIENT_CLAIM_PREFIX + c.job, `${c.period}:${key}`)
    .run();
}

/**
 * Run one send at most once per (job, period, key). Returns true when this call performed the send.
 * Infrastructure errors release the claim and propagate; other errors are logged, recorded and swallowed.
 */
export async function sendOnce(c: RecipientClaims, key: string, send: () => Promise<void>): Promise<boolean> {
  if (!(await claimRecipient(c, key))) return false;
  try {
    await send();
    return true;
  } catch (err) {
    if (isInfrastructureError(err)) {
      try { await releaseRecipient(c, key); } catch { /* the next attempt will see the claim; the job retry still runs */ }
      throw err;
    }
    log('error', 'cron.recipient_failed', { job: c.job, key, error: err instanceof Error ? err.message : String(err) });
    try {
      await c.db
        .prepare('INSERT OR IGNORE INTO cron_job_runs (tenant_id, job, period_key) VALUES (?, ?, ?)')
        .bind(c.tenantId, RECIPIENT_FAILED_PREFIX + c.job, `${c.period}:${key}`)
        .run();
    } catch { /* recording the failure is best effort */ }
    return false;
  }
}

/** Drops recipient claims (and failure marks) older than 14 days. Returns nothing; the job runner logs failures. */
export async function pruneRecipientClaims(db: D1Database, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - RECIPIENT_CLAIM_RETENTION_DAYS * 86400000).toISOString();
  await db
    .prepare(`DELETE FROM cron_job_runs WHERE (job LIKE 'recipient:%' OR job LIKE 'recipient-failed:%') AND claimed_at < ?`)
    .bind(cutoff)
    .run();
}
