import { log } from '../utils/logger';

/** Errors worth a queue retry: the database, network or queue was unavailable, not a bug in the job. */
export function isInfrastructureError(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /D1_|SQLITE_BUSY|network|timed? ?out|temporar|unavailable|overloaded|Durable Object|reset because/i.test(text);
}

/**
 * Run `fn` for each row. A failure for one recipient is logged and the loop continues, except for
 * infrastructure errors (database, queue or network down), which are rethrown so the job runner releases
 * the day's claim and the queue message is retried.
 */
export async function eachRecipient<T>(job: string, rows: readonly T[], fn: (row: T) => Promise<void>): Promise<void> {
  for (const row of rows) {
    try {
      await fn(row);
    } catch (err) {
      if (isInfrastructureError(err)) throw err;
      log('error', 'cron.recipient_failed', { job, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
