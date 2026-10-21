/**
 * Scheduled work, fanned out per agency.
 *
 * Three cron expressions drive the job sets. The scheduled() handler only lists the active agencies and
 * puts one TENANT_JOBS_QUEUE message per agency on the queue ({ tenantId, jobSet, firedAt }); the queue
 * consumer (queues/tenant-jobs-queue.ts) resolves that agency's database and runs the job set there.
 * Platform-wide work (usage-cap resets, trial expiry) runs once in scheduled() itself, on the 00:30 UTC cron.
 *
 * Daily agency jobs (birthdays, visa/passport expiry, missing documents, trip reminders, housekeeping) are
 * part of the HOURLY set but gated: each fires on the first hourly run at or after the agency-local send hour
 * (settings key daily_job_hour, else env DAILY_JOB_HOUR, else 09:00) and is claimed once per local day. The
 * 'daily' set still exists for manual runs; the 00:30 UTC cron no longer fans it out.
 *
 * Every job is idempotent per agency per period: before running, the runner claims a row in the agency's
 * cron_job_runs table (INSERT OR IGNORE on job + period key). A retried or duplicated message finds the
 * claim and skips the job; a job that throws releases its claim so a later attempt can run it.
 */
import type { Env } from '../types';
import { resolveTenantDb } from '../services/tenant-db';
import { getTenantTimeZone, localClock } from '../utils/tz';
import { isInfrastructureError } from './errors';
import { pruneRecipientClaims } from './recipient-claims';
import { reportError } from '../services/error-reporter';
import { log } from '../utils/logger';
import { resetUsageCaps } from '../middleware/usage-cap';
import { expireTrials } from '../services/plans/trial';
import { refreshExchangeRates } from '../services/exchange-rate';
import { runBillingDaily } from '../services/billing/subscriptions';
import { runNumberLifecycle } from '../services/voip/numbers';
import { pollRegulatory } from '../services/voip/regulatory';
import { importTenantUsage } from '../services/voip/metering';
import { checkFollowUpReminders } from '../services/follow-up-reminders';
import { runScheduledAutomationsForTenant } from '../services/automation/schedule';
import { processCampaignScheduler } from './campaign-scheduler';
import { retryPendingRecordings, runRecordingRetention } from '../services/voip/recordings';
import { processOverdueTasks } from './overdue-tasks';
import { sweepWordpressSites } from '../services/wordpress/sites';
import { processFleetAlerts } from './fleet-alerts';
import { expireHoldsForTenant, runDepartureLifecycle } from '../services/departures/waitlist';
import { purgePlatformMailLog } from '../services/mail/platform-log';
import {
  processBirthdaysForTenant,
  processInvoiceRemindersForTenant,
  processVisaPassportForTenant,
  processMissingVisaDocsForTenant,
  processTripRemindersForTenant,
} from './auto-reminders';

export type JobSet = 'every5' | 'hourly' | 'daily';

export const CRON_EVERY_5_MIN = '*/5 * * * *';
export const CRON_HOURLY = '0 * * * *';
export const CRON_DAILY = '30 0 * * *';

/** Queue message body: one per agency per cron firing. */
export interface TenantJobMessage {
  tenantId: string;
  jobSet: JobSet;
  /** ISO time the cron fired; identical across redeliveries of the same message. */
  firedAt: string;
}

export function jobSetForCron(cron: string | undefined | null): JobSet | null {
  if (!cron) return 'every5';
  switch (cron.trim()) {
    case CRON_EVERY_5_MIN: return 'every5';
    case CRON_HOURLY: return 'hourly';
    case CRON_DAILY: return 'daily';
    default: return null;
  }
}

export { isInfrastructureError };

export const DEFAULT_DAILY_JOB_HOUR = 9;

interface TenantJob {
  name: string;
  /** Only run once the agency-local clock has reached the send hour. */
  atSendHour?: boolean;
  /** 'tick' = once per firing (5-minute bucket); 'local-day' = once per agency-local calendar day. */
  period: 'tick' | 'local-day';
  /** periodKey is the claim period of this run ('tick:...' or 'day:...'); retried deliveries get the same one. */
  run(env: Env, tenantId: string, db: D1Database, now: Date, periodKey: string): Promise<unknown>;
}

const EVERY5_JOBS: TenantJob[] = [
  { name: 'automations.schedule-tick', period: 'local-day', run: (env, id, db, now) => runScheduledAutomationsForTenant(env, id, db, now) },
  { name: 'marketing.campaign-scheduler', period: 'tick', run: (env, id, db, now) => processCampaignScheduler(env, id, db, now) },
  { name: 'followups.reminders', period: 'tick', run: (env, id, db, now, period) => checkFollowUpReminders(env, id, db, now, period) },
  // R305: call minutes are charged from the provider's usage records for the agency's sub-account (cursor per agency, once per provider call id). Not paused by automations_paused.
  { name: 'voip.usage-import', period: 'tick', run: (env, id, _db, now) => importTenantUsage(env, id, now) },
  // R306: copies that failed (or never ran) are retried, and a provider copy that could not be deleted is deleted. Not paused by automations_paused.
  { name: 'calls.recordings-retry', period: 'tick', run: (env, id, db, now) => retryPendingRecordings(env, id, db, now) },
  // R137: the backup for the provider's regulatory bundle status callback: a tick job that asks at most once an hour per agency.
  { name: 'voip.regulatory-poll', period: 'tick', run: (env, id, db, now) => runRegulatoryPoll(env, id, db, now) },
  // R143: held seats past their hold expire, and the waitlist gets the freed seats. Not paused by automations_paused (seats are not an automation).
  { name: 'departures.expire-holds', period: 'tick', run: (env, id, db, now) => expireHoldsForTenant(env, id, db, now) },
  // R143: departures close at their booking cut-off date, depart on their start date and complete the day after they end.
  { name: 'departures.lifecycle', period: 'local-day', run: (env, id, db, now) => runDepartureLifecycle(env, id, db, now) },
];

const HOURLY_JOBS: TenantJob[] = [
  { name: 'invoices.reminders', period: 'local-day', run: (env, id, db, now) => processInvoiceRemindersForTenant(env, db, id, now) },
  { name: 'tasks.overdue', period: 'local-day', run: (env, id, db, now) => processOverdueTasks(env, id, db, now) },
  { name: 'fleet.alerts', period: 'local-day', run: (env, id, db, now) => processFleetAlerts(env, id, db, now) },
];

const DAILY_JOBS: TenantJob[] = [
  { name: 'contacts.birthdays', period: 'local-day', run: (env, id, db, now) => processBirthdaysForTenant(env, db, id, now) },
  { name: 'visa.passport-expiry', period: 'local-day', run: (env, id, db, now) => processVisaPassportForTenant(env, db, id, now) },
  { name: 'visa.missing-documents', period: 'local-day', run: (env, id, db, now) => processMissingVisaDocsForTenant(env, db, id, now) },
  { name: 'trips.reminders', period: 'local-day', run: (env, id, db, now) => processTripRemindersForTenant(env, db, id, now) },
  // R306: audio and transcripts older than the agency's retention period are deleted; the call record and the summary stay.
  { name: 'calls.recording-retention', period: 'local-day', run: (env, id, db, now) => runRecordingRetention(env, id, db, now) },
  { name: 'housekeeping.prune-job-runs', period: 'local-day', run: (_env, _id, db, now) => pruneJobRuns(db, now) },
];

export const JOB_SETS: Record<JobSet, TenantJob[]> = {
  every5: EVERY5_JOBS,
  hourly: [...HOURLY_JOBS, ...DAILY_JOBS.map((j) => ({ ...j, atSendHour: true }))],
  daily: DAILY_JOBS,
};

/** Agency-local hour (0-23) from which daily jobs may run. */
export async function getDailyJobHour(env: Env, db: D1Database): Promise<number> {
  const valid = (v: unknown): number | null => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
  };
  try {
    const row = await db.prepare(`SELECT value FROM settings WHERE key = 'daily_job_hour'`).first<{ value: string }>();
    const fromSettings = valid(row?.value);
    if (fromSettings !== null) return fromSettings;
  } catch {
    /* settings unavailable: fall through to env/default */
  }
  return valid(env.DAILY_JOB_HOUR) ?? DEFAULT_DAILY_JOB_HOUR;
}

async function pruneJobRuns(db: D1Database, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - 45 * 86400000).toISOString();
  await db.prepare('DELETE FROM cron_job_runs WHERE claimed_at < ?').bind(cutoff).run();
  await pruneRecipientClaims(db, now); // per-recipient send claims keep 14 days
}

/** Floors the firing time to its 5-minute bucket: 2026-10-14T12:35Z. */
export function tickKey(firedAt: string): string {
  const t = new Date(firedAt).getTime();
  return new Date(Math.floor(t / 300000) * 300000).toISOString().slice(0, 16) + 'Z';
}

/** R137: poll the provider about regulatory bundles in review, once per agency per UTC hour (the claim is the hour key). */
export async function runRegulatoryPoll(env: Env, tenantId: string, db: D1Database, now: Date): Promise<unknown> {
  const hourKey = `hour:${now.toISOString().slice(0, 13)}`;
  if (!(await claimJob(db, tenantId, 'voip.regulatory-poll.hourly', hourKey))) return { skipped: true };
  return pollRegulatory(env, tenantId);
}

/** True when this run owns (job, period); false when an earlier delivery already did. */
export async function claimJob(db: D1Database, tenantId: string, job: string, periodKey: string): Promise<boolean> {
  const res = await db
    .prepare('INSERT OR IGNORE INTO cron_job_runs (tenant_id, job, period_key) VALUES (?, ?, ?)')
    .bind(tenantId, job, periodKey)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function releaseJob(db: D1Database, tenantId: string, job: string, periodKey: string): Promise<void> {
  await db.prepare('DELETE FROM cron_job_runs WHERE tenant_id = ? AND job = ? AND period_key = ?').bind(tenantId, job, periodKey).run();
}

export interface JobSetResult {
  ran: string[];
  skipped: string[];
  /** Daily jobs whose agency-local send hour has not been reached yet. */
  notDue: string[];
  failed: Array<{ job: string; error: string; infrastructure: boolean }>;
}

/** Run one agency's job set. One job failing never stops the others. */
export async function runTenantJobSet(
  env: Env,
  tenantId: string,
  db: D1Database,
  jobSet: JobSet,
  firedAt: string,
): Promise<JobSetResult> {
  const result: JobSetResult = { ran: [], skipped: [], notDue: [], failed: [] };
  const firedIso = Number.isNaN(new Date(firedAt).getTime()) ? new Date().toISOString() : firedAt;
  let clock: ReturnType<typeof localClock> | null = null;
  let sendHour: number | null = null;

  for (const job of JOB_SETS[jobSet]) {
    let periodKey = '';
    let claimed = false;
    try {
      if (job.period === 'tick') {
        periodKey = `tick:${tickKey(firedIso)}`;
      } else {
        clock ??= localClock(await getTenantTimeZone(db), new Date(firedIso));
        if (job.atSendHour) {
          sendHour ??= await getDailyJobHour(env, db);
          if (clock.hour < sendHour) {
            result.notDue.push(job.name);
            continue;
          }
        }
        periodKey = `day:${clock.date}`;
      }
      claimed = await claimJob(db, tenantId, job.name, periodKey);
      if (!claimed) {
        result.skipped.push(job.name);
        continue;
      }
      // Tick jobs look at "now" (reminder windows); daily jobs use the moment the cron fired.
      await job.run(env, tenantId, db, job.period === 'tick' ? new Date() : new Date(firedIso), periodKey);
      result.ran.push(job.name);
    } catch (err) {
      const infrastructure = isInfrastructureError(err);
      log('error', 'cron.job_failed', { job: job.name, tenantId, infrastructure, error: err instanceof Error ? err.message : String(err) });
      reportError(env, err, { source: 'cron-job', tenantId });
      if (claimed) {
        try { await releaseJob(db, tenantId, job.name, periodKey); } catch { /* the next claim attempt will see the row */ }
      }
      result.failed.push({
        job: job.name,
        error: err instanceof Error ? err.message : String(err),
        infrastructure,
      });
    }
  }
  return result;
}

/** Agencies that get scheduled work. Provisioning, failed, suspended, cancelled and expired agencies do not. */
export async function listScheduledTenantIds(env: Env): Promise<string[]> {
  const res = await env.MASTER_DB
    .prepare(`SELECT id FROM tenants WHERE status IN ('active', 'trial') ORDER BY id`)
    .all<{ id: string }>();
  return (res.results ?? []).map((row) => row.id);
}

/**
 * Run one agency's job set in this invocation (no queue). Used when TENANT_JOBS_QUEUE is not bound
 * (single-tenant dev) and by the manual tick route. Null when the agency has no usable database.
 */
export async function runTenantJobSetInline(
  env: Env,
  tenantId: string,
  jobSet: JobSet,
  firedAt: string = new Date().toISOString(),
): Promise<JobSetResult | null> {
  const db = await resolveTenantDb(env, tenantId);
  if (!db) return null;
  return runTenantJobSet(env, tenantId, db, jobSet, firedAt);
}

/** Trial agencies past their end date become 'expired' (R109); their cached registry entry is dropped. Returns the agency ids. */
export async function checkTrialExpiry(env: Env, now: Date): Promise<string[]> {
  return expireTrials(env, now);
}

/** Platform-wide daily work: allowance resets (each is a no-op after the first call in a period) and trial expiry. */
export async function runPlatformDailyJobs(env: Env, now: Date): Promise<{ dailyCapsReset: number; monthlyCapsReset: number }> {
  const dailyCapsReset = await resetUsageCaps(env.MASTER_DB, 'daily', now);
  const monthlyCapsReset = await resetUsageCaps(env.MASTER_DB, 'monthly', now);
  await checkTrialExpiry(env, now);
  // Subscription billing (R205): failed renewals past the grace period turn read-only, ended subscriptions expire, trial-ending mail.
  try {
    await runBillingDaily(env, now);
  } catch (err) {
    log('error', 'cron.billing_daily_failed', { error: err instanceof Error ? err.message : String(err) });
    reportError(env, err, { source: 'scheduled' });
  }
  // Number rental (R304): renew rent from the month's add-on, schedule release of unpaid or cancelled agencies' numbers, release those whose grace ended.
  try {
    await runNumberLifecycle(env, now);
  } catch (err) {
    log('error', 'cron.number_lifecycle_failed', { error: err instanceof Error ? err.message : String(err) });
    reportError(env, err, { source: 'scheduled' });
  }
  // Platform email delivery log (R132): rows older than 90 days go.
  try {
    await purgePlatformMailLog(env, now);
  } catch (err) {
    log('error', 'cron.platform_email_log_purge_failed', { error: err instanceof Error ? err.message : String(err) });
  }
  // Daily exchange rates (R202); never throws, the last stored rates stay in use when the fetch fails.
  await refreshExchangeRates(env, now);
  return { dailyCapsReset, monthlyCapsReset };
}

const SEND_BATCH_SIZE = 100;

/**
 * The scheduled() body: enqueue one message per active agency for this cron's job set.
 * Falls back to running agencies inline, one after another, when no queue is bound.
 */
export async function dispatchScheduled(event: { cron?: string; scheduledTime?: number }, env: Env): Promise<void> {
  const jobSet = jobSetForCron(event.cron);
  if (!jobSet) {
    console.warn(`[cron] no job set for cron expression "${event.cron}"`);
    return;
  }
  const fired = new Date(event.scheduledTime ?? Date.now());
  const firedAt = fired.toISOString();

  if (jobSet === 'daily') {
    try {
      await runPlatformDailyJobs(env, fired);
    } catch (err) {
      log('error', 'cron.platform_daily_failed', { error: err instanceof Error ? err.message : String(err) });
      reportError(env, err, { source: 'scheduled' });
    }
  }

  // R309: WordPress sites that made no progress for 10 minutes (lost queue message) are queued again.
  if (jobSet === 'every5') {
    try {
      await sweepWordpressSites(env, fired);
    } catch (err) {
      log('error', 'cron.wordpress_sweep_failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // The 00:30 UTC cron only does the platform work above. Agency daily jobs run from the hourly set at
  // each agency's local send hour.
  if (jobSet === 'daily') return;

  const tenantIds = await listScheduledTenantIds(env);
  const queue = env.TENANT_JOBS_QUEUE;
  if (!queue) {
    for (const tenantId of tenantIds) {
      try {
        await runTenantJobSetInline(env, tenantId, jobSet, firedAt);
      } catch (err) {
        console.error(`[cron] inline ${jobSet} run failed for tenant ${tenantId}:`, err);
      }
    }
    return;
  }

  for (let i = 0; i < tenantIds.length; i += SEND_BATCH_SIZE) {
    const chunk = tenantIds.slice(i, i + SEND_BATCH_SIZE);
    await queue.sendBatch(chunk.map((tenantId) => ({ body: { tenantId, jobSet, firedAt } satisfies TenantJobMessage })));
  }
}
