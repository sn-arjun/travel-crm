import { env, applyD1Migrations, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import { handleTenantJobs } from '../src/queues/tenant-jobs-queue';
import { handleQueue } from '../src/queues';
import { jobSetForCron, runTenantJobSet, tickKey } from '../src/cron/dispatch';
import { processCampaignScheduler } from '../src/cron/campaign-scheduler';

const testEnv = env as any;

const TENANT = {
  A: '0196a105-0000-7000-8000-0000000000a1',
  B: '0196a105-0000-7000-8000-0000000000a2',
  TRIAL: '0196a105-0000-7000-8000-0000000000a3',
  SUSPENDED: '0196a105-0000-7000-8000-0000000000a4',
  PROVISIONING: '0196a105-0000-7000-8000-0000000000a5',
  GHOST: '0196a105-0000-7000-8000-0000000000a6', // active, but its binding does not exist
  UNKNOWN: '0196a105-0000-7000-8000-0000000000a7', // not in the registry at all
};
const POOL = { A: 'TENANT_DB_POOL_1', B: 'TENANT_DB_POOL_2' } as const;

type Msg = { body: any; ack: () => void; retry: () => void; acked: number; retried: number };
function message(body: any): Msg {
  const m: Msg = { body, acked: 0, retried: 0, ack: () => { m.acked++; }, retry: () => { m.retried++; } };
  return m;
}
const batchOf = (...messages: Msg[]) => ({ queue: 'travelcrm-tenant-jobs', messages }) as any;

function pushSpy() {
  const sent: any[] = [];
  return { sent, queue: { send: async (m: any) => { sent.push(m); } } };
}

const multi = (extra: Record<string, unknown> = {}) => ({ ...testEnv, TENANCY_MODE: 'multi', ...extra });

async function insertTenant(id: string, status: string, binding: string | null) {
  await testEnv.MASTER_DB
    .prepare(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, db_binding) VALUES (?, ?, ?, 'pro', ?, ?)`)
    .bind(id, `Cron ${id.slice(-2)}`, `cron-${id.slice(-2)}`, status, binding)
    .run();
}

async function seedFollowUps(db: D1Database, tag: string) {
  const user = `0196a105-1111-7000-8000-0000000000${tag}`;
  const contact = `0196a105-2222-7000-8000-0000000000${tag}`;
  const lead = `0196a105-3333-7000-8000-0000000000${tag}`;
  const soonId = `0196a105-4444-7000-8000-0000000000${tag}`;
  const pastId = `0196a105-5555-7000-8000-0000000000${tag}`;
  await db.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, role, name, is_active) VALUES (?, ?, 'x', 'admin', ?, 1)`).bind(user, `cron-${tag}@fanout.test`, `U${tag}`).run();
  await db.prepare(`INSERT OR REPLACE INTO contacts (id, name, type) VALUES (?, ?, 'customer')`).bind(contact, `C${tag}`).run();
  await db.prepare(`INSERT OR REPLACE INTO leads (id, contact_id, title, status) VALUES (?, ?, ?, 'new')`).bind(lead, contact, `L${tag}`).run();
  // one reminder due within 15 minutes, one already past due (pending -> missed)
  const soon = new Date(Date.now() + 8 * 60000).toISOString();
  const past = new Date(Date.now() - 60 * 60000).toISOString();
  await db.prepare(`DELETE FROM follow_ups WHERE id IN (?, ?)`).bind(soonId, pastId).run();
  await db.prepare(`INSERT INTO follow_ups (id, lead_id, scheduled_at, type, status, created_by) VALUES (?, ?, ?, 'call', 'pending', ?)`).bind(soonId, lead, soon, user).run();
  await db.prepare(`INSERT INTO follow_ups (id, lead_id, scheduled_at, type, status, created_by) VALUES (?, ?, ?, 'call', 'pending', ?)`).bind(pastId, lead, past, user).run();
  return { soonId, pastId };
}

const count = async (db: D1Database, sql: string, ...args: unknown[]) =>
  ((await db.prepare(sql).bind(...args).first()) as any).n as number;

describe('cron fan-out through TENANT_JOBS_QUEUE', () => {
  let seedA: { soonId: string; pastId: string };
  let seedB: { soonId: string; pastId: string };

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    for (const pool of Object.values(POOL)) await applyD1Migrations(testEnv[pool], testEnv.TEST_MIGRATIONS);
    await insertTenant(TENANT.A, 'active', POOL.A);
    await insertTenant(TENANT.B, 'active', POOL.B);
    await insertTenant(TENANT.TRIAL, 'trial', 'TENANT_DB_POOL_TRIAL');
    await insertTenant(TENANT.SUSPENDED, 'suspended', 'TENANT_DB_POOL_SUSPENDED');
    await insertTenant(TENANT.PROVISIONING, 'provisioning', null);
    await insertTenant(TENANT.GHOST, 'active', 'TENANT_DB_POOL_DOES_NOT_EXIST');
    seedA = await seedFollowUps(testEnv[POOL.A], 'a1');
    seedB = await seedFollowUps(testEnv[POOL.B], 'b1');
    await testEnv.CACHE.delete(`reminder_sent:${seedA.soonId}:15min:${TENANT.A}`);
  });

  afterAll(async () => {
    await testEnv.MASTER_DB.prepare("DELETE FROM tenants WHERE id LIKE '0196a105-0000-7000-8000-0000000000a%'").run();
  });

  it('maps each cron expression to a job set', () => {
    expect(jobSetForCron('*/5 * * * *')).toBe('every5');
    expect(jobSetForCron('0 * * * *')).toBe('hourly');
    expect(jobSetForCron('30 0 * * *')).toBe('daily');
    expect(jobSetForCron('1 2 3 4 5')).toBeNull();
    expect(tickKey('2026-10-14T12:37:41.000Z')).toBe('2026-10-14T12:35Z');
  });

  it('scheduled(*/5) enqueues one message per active or trial agency and none for the others', async () => {
    const batches: any[][] = [];
    const queue = { sendBatch: async (b: any[]) => { batches.push(b); } };
    const ctx = createExecutionContext();
    const scheduledTime = Date.UTC(2026, 9, 14, 12, 35);
    await (worker as any).scheduled({ cron: '*/5 * * * *', scheduledTime }, multi({ TENANT_JOBS_QUEUE: queue }), ctx);
    await waitOnExecutionContext(ctx);

    const bodies = batches.flat().map((m) => m.body);
    const mine = bodies.filter((b) => Object.values(TENANT).includes(b.tenantId));
    expect(mine.map((b) => b.tenantId).sort()).toEqual([TENANT.A, TENANT.B, TENANT.TRIAL, TENANT.GHOST].sort());
    for (const b of mine) {
      expect(b.jobSet).toBe('every5');
      expect(b.firedAt).toBe(new Date(scheduledTime).toISOString());
    }
    // one message per tenant, never a duplicate
    const ids = bodies.map((b) => b.tenantId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of batches) expect(b.length).toBeLessThanOrEqual(100);
  });

  it('sends in chunks of at most 100', async () => {
    const extra = Array.from({ length: 230 }, (_, i) => `0196a105-9999-7000-8000-${String(i).padStart(12, '0')}`);
    try {
      for (const id of extra) {
        await testEnv.MASTER_DB
          .prepare(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status) VALUES (?, 'bulk', ?, 'pro', 'active')`)
          .bind(id, `bulk-${id.slice(-6)}`)
          .run();
      }
      const batches: any[][] = [];
      const ctx = createExecutionContext();
      const queue = { sendBatch: async (b: any[]) => { batches.push(b); } };
      await (worker as any).scheduled({ cron: '0 * * * *', scheduledTime: Date.UTC(2026, 9, 14, 13, 0) }, multi({ TENANT_JOBS_QUEUE: queue }), ctx);
      await waitOnExecutionContext(ctx);
      expect(batches.length).toBeGreaterThanOrEqual(3);
      expect(Math.max(...batches.map((b) => b.length))).toBe(100);
      expect(batches.flat().filter((m) => extra.includes(m.body.tenantId)).length).toBe(230);
      expect(batches.flat().every((m) => m.body.jobSet === 'hourly')).toBe(true);
    } finally {
      await testEnv.MASTER_DB.prepare(`DELETE FROM tenants WHERE id LIKE '0196a105-9999-%'`).run();
    }
  });

  it('a message for tenant A runs the follow-up handler against the database of A only', async () => {
    const push = pushSpy();
    const e = multi({ PUSH_NOTIFICATION_QUEUE: push.queue });
    const m = message({ tenantId: TENANT.A, jobSet: 'every5', firedAt: new Date().toISOString() });
    await handleTenantJobs(batchOf(m), e);

    expect(m.acked).toBe(1);
    expect(m.retried).toBe(0);
    // A: the reminder was pushed and the past-due follow-up was marked missed
    expect(push.sent.map((p) => p.data.data.followUpId)).toEqual([seedA.soonId]);
    expect(push.sent[0].data.tenantId).toBe(TENANT.A);
    expect(await count(testEnv[POOL.A], `SELECT COUNT(*) n FROM follow_ups WHERE id = ? AND status = 'missed'`, seedA.pastId)).toBe(1);
    // B was not touched: still pending, and A's job claims live only in A's database
    expect(await count(testEnv[POOL.B], `SELECT COUNT(*) n FROM follow_ups WHERE id = ? AND status = 'pending'`, seedB.pastId)).toBe(1);
    expect(await count(testEnv[POOL.B], `SELECT COUNT(*) n FROM cron_job_runs WHERE tenant_id = ?`, TENANT.A)).toBe(0);
    expect(await count(testEnv[POOL.A], `SELECT COUNT(*) n FROM cron_job_runs WHERE tenant_id = ?`, TENANT.A)).toBeGreaterThanOrEqual(3);
  });

  it('a retried message does not repeat the work', async () => {
    const push = pushSpy();
    const e = multi({ PUSH_NOTIFICATION_QUEUE: push.queue });
    const firedAt = new Date().toISOString();
    await testEnv.CACHE.delete(`reminder_sent:${seedB.soonId}:15min:${TENANT.B}`);
    const first = message({ tenantId: TENANT.B, jobSet: 'every5', firedAt });
    await handleTenantJobs(batchOf(first), e);
    expect(push.sent.length).toBe(1);

    // same message redelivered, even with the dedupe cache gone
    await testEnv.CACHE.delete(`reminder_sent:${seedB.soonId}:15min:${TENANT.B}`);
    const again = message({ tenantId: TENANT.B, jobSet: 'every5', firedAt });
    await handleTenantJobs(batchOf(again), e);
    expect(again.acked).toBe(1);
    expect(push.sent.length).toBe(1);

    // the next tick (new firedAt) is a new period and does run
    await testEnv.CACHE.delete(`reminder_sent:${seedB.soonId}:15min:${TENANT.B}`);
    const nextTick = message({ tenantId: TENANT.B, jobSet: 'every5', firedAt: new Date(Date.parse(firedAt) + 5 * 60000).toISOString() });
    await handleTenantJobs(batchOf(nextTick), e);
    expect(push.sent.length).toBe(2);
  });

  it('hourly jobs run once per agency-local day however many hours fire', async () => {
    const e = multi({ PUSH_NOTIFICATION_QUEUE: pushSpy().queue });
    const db = testEnv[POOL.A] as D1Database;
    const t0 = Date.UTC(2026, 10, 3, 6, 0);
    const first = await runTenantJobSet(e, TENANT.A, db, 'hourly', new Date(t0).toISOString());
    expect(first.failed).toEqual([]);
    expect([...first.ran].sort()).toEqual(['fleet.alerts', 'invoices.reminders', 'tasks.overdue']);
    const second = await runTenantJobSet(e, TENANT.A, db, 'hourly', new Date(t0 + 3600000).toISOString());
    expect(second.ran).toEqual([]);
    expect(second.skipped.length).toBe(3);
    const nextDay = await runTenantJobSet(e, TENANT.A, db, 'hourly', new Date(t0 + 24 * 3600000).toISOString());
    expect(nextDay.ran.length).toBe(3);
  });

  it('the daily set runs the reminder jobs against the agency database', async () => {
    const e = multi({ PUSH_NOTIFICATION_QUEUE: pushSpy().queue, SMS_QUEUE: pushSpy().queue, EMAIL_QUEUE: pushSpy().queue });
    const res = await runTenantJobSet(e, TENANT.B, testEnv[POOL.B], 'daily', new Date(Date.UTC(2026, 10, 4, 0, 30)).toISOString());
    expect(res.failed).toEqual([]);
    expect(res.ran).toEqual(expect.arrayContaining(['contacts.birthdays', 'visa.passport-expiry', 'visa.missing-documents', 'trips.reminders']));
  });

  it('a tenant whose database is missing is acked and skipped without touching MASTER_DB', async () => {
    const masterBefore = await count(testEnv.MASTER_DB, `SELECT COUNT(*) n FROM cron_job_runs`);
    const push = pushSpy();
    const e = multi({ PUSH_NOTIFICATION_QUEUE: push.queue });
    const messages = [TENANT.GHOST, TENANT.UNKNOWN, TENANT.SUSPENDED, TENANT.PROVISIONING].map((tenantId) =>
      message({ tenantId, jobSet: 'every5', firedAt: new Date().toISOString() }));
    await handleTenantJobs(batchOf(...messages), e);
    for (const m of messages) {
      expect(m.acked).toBe(1);
      expect(m.retried).toBe(0);
    }
    expect(push.sent.length).toBe(0);
    // nothing was run or claimed in the shared database as a fallback
    expect(await count(testEnv.MASTER_DB, `SELECT COUNT(*) n FROM cron_job_runs`)).toBe(masterBefore);
  });

  it('malformed messages are acked and dropped', async () => {
    const m = message({ nope: true });
    await handleTenantJobs(batchOf(m), multi());
    expect(m.acked).toBe(1);
  });

  it('one failing job does not stop the others; infrastructure errors retry and release the claim', async () => {
    const failing = { send: async () => { throw new Error('Queue unavailable: network connection lost'); } };
    await testEnv.CACHE.delete(`reminder_sent:${seedA.soonId}:15min:${TENANT.A}`);
    const firedAt = new Date(Date.now() + 3 * 3600000).toISOString();
    const m = message({ tenantId: TENANT.A, jobSet: 'every5', firedAt });
    await handleTenantJobs(batchOf(m), multi({ PUSH_NOTIFICATION_QUEUE: failing }));
    expect(m.retried).toBe(1);
    expect(m.acked).toBe(0);
    const runs = await testEnv[POOL.A]
      .prepare(`SELECT job FROM cron_job_runs WHERE tenant_id = ? AND period_key = ?`)
      .bind(TENANT.A, `tick:${tickKey(firedAt)}`)
      .all();
    const jobs = (runs.results as any[]).map((r) => r.job);
    expect(jobs).not.toContain('followups.reminders'); // released so the retry can run it
    expect(jobs).toContain('marketing.campaign-scheduler'); // the other jobs still ran

    // the retry, with the queue healthy again, completes the failed job
    const push = pushSpy();
    const retry = message({ tenantId: TENANT.A, jobSet: 'every5', firedAt });
    await handleTenantJobs(batchOf(retry), multi({ PUSH_NOTIFICATION_QUEUE: push.queue }));
    expect(retry.acked).toBe(1);
    expect(push.sent.length).toBe(1);
  });

  it('handleQueue routes travelcrm-tenant-jobs to the consumer', async () => {
    const m = message({ tenantId: TENANT.UNKNOWN, jobSet: 'daily', firedAt: new Date().toISOString() });
    await handleQueue(batchOf(m), multi());
    expect(m.acked).toBe(1);
  });

  it('without a bound queue scheduled() runs agencies inline (single-tenant dev)', async () => {
    const e = { ...testEnv, TENANT_JOBS_QUEUE: undefined, PUSH_NOTIFICATION_QUEUE: pushSpy().queue };
    const ctx = createExecutionContext();
    await (worker as any).scheduled({ cron: '*/5 * * * *', scheduledTime: Date.UTC(2026, 9, 20, 9, 5) }, e, ctx);
    await waitOnExecutionContext(ctx);
    expect(await count(testEnv.MASTER_DB, `SELECT COUNT(*) n FROM cron_job_runs WHERE period_key = ?`, 'tick:2026-10-20T09:05Z')).toBeGreaterThanOrEqual(3);
  });

  it('a scheduled campaign becomes pending recipients plus one CAMPAIGN_QUEUE message, once', async () => {
    const db = testEnv[POOL.A] as D1Database;
    const campaignId = '0196a105-6666-7000-8000-0000000000a1';
    await db.prepare(`DELETE FROM campaign_recipients WHERE campaign_id = ?`).bind(campaignId).run();
    await db.prepare(`DELETE FROM marketing_campaigns WHERE id = ?`).bind(campaignId).run();
    await db.prepare(`INSERT OR REPLACE INTO contacts (id, name, type, email) VALUES ('0196a105-2222-7000-8000-0000000000a1', 'Ca1', 'customer', 'ca1@fanout.test')`).run();
    await db
      .prepare(`INSERT INTO marketing_campaigns (id, name, type, status, scheduled_at, email_subject, message_body) VALUES (?, 'Scheduled', 'email', 'scheduled', ?, 'Hi', 'Body')`)
      .bind(campaignId, new Date(Date.now() - 60000).toISOString())
      .run();
    const sent: any[] = [];
    const e = multi({ CAMPAIGN_QUEUE: { send: async (m: any) => { sent.push(m); } } });
    await processCampaignScheduler(e, TENANT.A, db);
    await processCampaignScheduler(e, TENANT.A, db);
    expect(sent).toEqual([{ type: 'email_campaign', data: { campaignId, tenantId: TENANT.A, campaignType: 'email' } }]);
    expect(await count(db, `SELECT COUNT(*) n FROM campaign_recipients WHERE campaign_id = ? AND status = 'pending'`, campaignId)).toBeGreaterThanOrEqual(1);
  });
});
