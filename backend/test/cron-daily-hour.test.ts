import { env, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { runTenantJobSet, getDailyJobHour, dispatchScheduled } from '../src/cron/dispatch';
import { handleTenantJobs } from '../src/queues/tenant-jobs-queue';

const testEnv = env as any;
const TENANT = '0197b117-0000-7000-8000-0000000000d1';
const CONTACT = '0197b117-1111-7000-8000-0000000000d1';
const db = () => testEnv.TENANT_DB_POOL_3 as D1Database;

function queueSpy(failWith?: Error) {
  const sent: any[] = [];
  return { sent, queue: { send: async (m: any) => { if (failWith) throw failWith; sent.push(m); } } };
}
const envWith = (extra: Record<string, unknown>) => ({ ...testEnv, TENANCY_MODE: 'multi', ...extra });
const setSetting = (key: string, value: string) => db().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, value).run();
const clearRuns = () => db().prepare('DELETE FROM cron_job_runs WHERE tenant_id = ?').bind(TENANT).run();
const claimed = async (job: string) =>
  (await db().prepare('SELECT COUNT(*) n FROM cron_job_runs WHERE tenant_id = ? AND job = ?').bind(TENANT, job).first<{ n: number }>())!.n;

// 2026-11-04 is standard time in New York (UTC-5): 09:00 local = 14:00 UTC.
const utc = (h: number, m = 0, day = 4) => new Date(Date.UTC(2026, 10, day, h, m)).toISOString();

describe('daily jobs fire at the agency-local send hour', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    await applyD1Migrations(db(), testEnv.TEST_MIGRATIONS);
    await setSetting('timezone', 'America/New_York');
    await db().prepare('DELETE FROM settings WHERE key = ?').bind('daily_job_hour').run();
    await db().prepare('DELETE FROM contacts WHERE id = ?').bind(CONTACT).run();
    await db()
      .prepare(`INSERT INTO contacts (id, name, type, phone, birthday) VALUES (?, 'Birthday Person', 'customer', '+12125550101', '1990-11-04')`)
      .bind(CONTACT)
      .run();
  });
  beforeEach(clearRuns);
  afterAll(async () => {
    await clearRuns();
    await db().prepare('DELETE FROM contacts WHERE id = ?').bind(CONTACT).run();
    await db().prepare("DELETE FROM settings WHERE key IN ('timezone', 'daily_job_hour')").run();
  });

  it('a New York agency gets its birthday message at 09:00 local, not at 00:30 UTC', async () => {
    const sms = queueSpy();
    const e = envWith({ SMS_QUEUE: sms.queue, EMAIL_QUEUE: queueSpy().queue, PUSH_NOTIFICATION_QUEUE: queueSpy().queue });

    // 00:30 UTC on Nov 4 is 19:30 on Nov 3 in New York: the old daily cron time. Nothing daily runs.
    const midnightUtc = await runTenantJobSet(e, TENANT, db(), 'hourly', utc(0, 30));
    expect(midnightUtc.ran).not.toContain('contacts.birthdays');
    expect(midnightUtc.notDue).toEqual(expect.arrayContaining(['contacts.birthdays', 'trips.reminders']));

    // 13:00 UTC is 08:00 local: still before the send hour.
    const early = await runTenantJobSet(e, TENANT, db(), 'hourly', utc(13));
    expect(early.ran).not.toContain('contacts.birthdays');
    expect(sms.sent.length).toBe(0);

    // 14:00 UTC is 09:00 local: the birthday job runs and the SMS is queued.
    const due = await runTenantJobSet(e, TENANT, db(), 'hourly', utc(14));
    expect(due.failed).toEqual([]);
    expect(due.ran).toEqual(expect.arrayContaining(['contacts.birthdays', 'visa.passport-expiry', 'visa.missing-documents', 'trips.reminders', 'housekeeping.prune-job-runs']));
    expect(sms.sent.filter((m) => m.data.templateId === 'birthday_wish').length).toBe(1);

    // later hours the same local day: claimed, so no second message
    const later = await runTenantJobSet(e, TENANT, db(), 'hourly', utc(15));
    expect(later.ran).not.toContain('contacts.birthdays');
    expect(later.skipped).toContain('contacts.birthdays');
    expect(sms.sent.filter((m) => m.data.templateId === 'birthday_wish').length).toBe(1);
  });

  it('a missed hourly firing is caught up later the same local day', async () => {
    const sms = queueSpy();
    const e = envWith({ SMS_QUEUE: sms.queue, EMAIL_QUEUE: queueSpy().queue, PUSH_NOTIFICATION_QUEUE: queueSpy().queue });
    const res = await runTenantJobSet(e, TENANT, db(), 'hourly', utc(18, 0)); // 13:00 local
    expect(res.ran).toContain('contacts.birthdays');
  });

  it('the send hour is configurable per agency (settings) and by DAILY_JOB_HOUR', async () => {
    expect(await getDailyJobHour(testEnv, db())).toBe(9);
    expect(await getDailyJobHour({ ...testEnv, DAILY_JOB_HOUR: '18' }, db())).toBe(18);
    expect(await getDailyJobHour({ ...testEnv, DAILY_JOB_HOUR: '99' }, db())).toBe(9);
    await setSetting('daily_job_hour', '7');
    try {
      expect(await getDailyJobHour({ ...testEnv, DAILY_JOB_HOUR: '18' }, db())).toBe(7);
      const e = envWith({ SMS_QUEUE: queueSpy().queue, EMAIL_QUEUE: queueSpy().queue, PUSH_NOTIFICATION_QUEUE: queueSpy().queue });
      expect((await runTenantJobSet(e, TENANT, db(), 'hourly', utc(11))).ran).not.toContain('contacts.birthdays'); // 06:00 local
      expect((await runTenantJobSet(e, TENANT, db(), 'hourly', utc(12))).ran).toContain('contacts.birthdays'); // 07:00 local
    } finally {
      await db().prepare('DELETE FROM settings WHERE key = ?').bind('daily_job_hour').run();
    }
  });

  it('the 00:30 UTC cron no longer fans agency jobs out (platform work only)', async () => {
    const sent: any[] = [];
    const e = envWith({ TENANT_JOBS_QUEUE: { sendBatch: async (m: any[]) => { sent.push(...m); } } });
    await dispatchScheduled({ cron: '30 0 * * *', scheduledTime: Date.parse(utc(0, 30)) }, e);
    expect(sent.length).toBe(0);
  });
});

describe('infrastructure errors reach the runner', () => {
  beforeEach(clearRuns);
  afterAll(clearRuns);

  const e = (sms: unknown) => envWith({ SMS_QUEUE: sms, EMAIL_QUEUE: queueSpy().queue, PUSH_NOTIFICATION_QUEUE: queueSpy().queue });

  it('an unavailable queue releases the day claim and the retry sends the message', async () => {
    await setSetting('timezone', 'America/New_York');
    await db().prepare('DELETE FROM contacts WHERE id = ?').bind(CONTACT).run();
    await db()
      .prepare(`INSERT INTO contacts (id, name, type, phone, birthday) VALUES (?, 'Birthday Person', 'customer', '+12125550101', '1990-11-04')`)
      .bind(CONTACT)
      .run();
    try {
      const failing = queueSpy(new Error('Queue unavailable: network connection lost'));
      const first = await runTenantJobSet(e(failing.queue), TENANT, db(), 'hourly', utc(14));
      const failure = first.failed.find((f) => f.job === 'contacts.birthdays');
      expect(failure?.infrastructure).toBe(true);
      expect(first.ran).not.toContain('contacts.birthdays');
      expect(await claimed('contacts.birthdays')).toBe(0); // released

      const healthy = queueSpy();
      const retry = await runTenantJobSet(e(healthy.queue), TENANT, db(), 'hourly', utc(15));
      expect(retry.ran).toContain('contacts.birthdays');
      expect(healthy.sent.filter((m) => m.data.templateId === 'birthday_wish').length).toBe(1);
      expect(await claimed('contacts.birthdays')).toBe(1);
    } finally {
      await db().prepare('DELETE FROM contacts WHERE id = ?').bind(CONTACT).run();
      await db().prepare("DELETE FROM settings WHERE key = 'timezone'").run();
    }
  });

  it('the queue consumer retries the message when a daily job hit an infrastructure error', async () => {
    await setSetting('timezone', 'America/New_York');
    await db().prepare('DELETE FROM contacts WHERE id = ?').bind(CONTACT).run();
    await db()
      .prepare(`INSERT INTO contacts (id, name, type, phone, birthday) VALUES (?, 'Birthday Person', 'customer', '+12125550101', '1990-11-04')`)
      .bind(CONTACT)
      .run();
    try {
      // register the agency so handleTenantJobs can resolve its database
      await testEnv.MASTER_DB
        .prepare(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, db_binding) VALUES (?, 'Daily Hour', 'daily-hour', 'pro', 'active', 'TENANT_DB_POOL_3')`)
        .bind(TENANT)
        .run();
      const m = { body: { tenantId: TENANT, jobSet: 'hourly', firedAt: utc(14) }, acked: 0, retried: 0, ack() { this.acked++; }, retry() { this.retried++; } };
      await handleTenantJobs({ queue: 'travelcrm-tenant-jobs', messages: [m] } as any, e(queueSpy(new Error('D1_ERROR: network connection lost')).queue));
      expect(m.retried).toBe(1);
      expect(m.acked).toBe(0);
    } finally {
      await testEnv.MASTER_DB.prepare('DELETE FROM tenants WHERE id = ?').bind(TENANT).run();
      await db().prepare('DELETE FROM contacts WHERE id = ?').bind(CONTACT).run();
      await db().prepare("DELETE FROM settings WHERE key = 'timezone'").run();
    }
  });

  it('an error confined to one recipient is logged and the job still completes', async () => {
    await setSetting('timezone', 'America/New_York');
    await db().prepare('DELETE FROM contacts WHERE id = ?').bind(CONTACT).run();
    await db()
      .prepare(`INSERT INTO contacts (id, name, type, phone, birthday) VALUES (?, 'Birthday Person', 'customer', '+12125550101', '1990-11-04')`)
      .bind(CONTACT)
      .run();
    try {
      const res = await runTenantJobSet(e(queueSpy(new Error('invalid destination number')).queue), TENANT, db(), 'hourly', utc(14));
      expect(res.failed).toEqual([]);
      expect(res.ran).toContain('contacts.birthdays');
      expect(await claimed('contacts.birthdays')).toBe(1);
    } finally {
      await db().prepare('DELETE FROM contacts WHERE id = ?').bind(CONTACT).run();
      await db().prepare("DELETE FROM settings WHERE key = 'timezone'").run();
    }
  });
});
