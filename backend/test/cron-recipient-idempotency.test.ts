import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { runTenantJobSet } from '../src/cron/dispatch';
import {
  processBirthdaysForTenant,
  processInvoiceRemindersForTenant,
  processVisaPassportForTenant,
  processMissingVisaDocsForTenant,
  processTripRemindersForTenant,
} from '../src/cron/auto-reminders';
import { checkFollowUpReminders } from '../src/services/follow-up-reminders';
import { handleSmsJob } from '../src/queues/sms-queue';
import { handleEmailJob } from '../src/queues/email-queue';
import { bumpCatalogueVersion } from '../src/services/plans/catalogue';

/**
 * R124: scheduled reminders reach the queues in the shape the consumers read, carry the agency id (so the consumers
 * meter them) and never re-send to a recipient when the job is retried.
 */

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const db = testEnv.MASTER_DB as D1Database;
const NOW = new Date('2026-10-10T10:00:00Z'); // 10:00 UTC (kept before the real clock so fresh claims are never older than the 14-day prune cutoff), past the 09:00 send hour; the agency timezone is UTC
const FIRED_AT = NOW.toISOString();

const run = (sql: string, ...binds: unknown[]) => db.prepare(sql).bind(...binds).run();
async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  return ((await db.prepare(sql).bind(...binds).all()).results ?? []) as T[];
}
async function api(method: string, path: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: (await res.json()) as any };
}
async function usage(capKey: string): Promise<number> {
  const row = await db.prepare('SELECT current_usage FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = ?').bind(TENANT_ID, capKey).first<{ current_usage: number }>();
  return row?.current_usage ?? 0;
}
async function setAllowance(key: string, amount: number) {
  await run(`UPDATE plan_allowances SET monthly_amount = ? WHERE plan_key = 'pro' AND allowance_key = ?`, amount, key);
  await bumpCatalogueVersion(testEnv);
}
const claimCount = async (like: string) =>
  (await db.prepare('SELECT COUNT(*) n FROM cron_job_runs WHERE tenant_id = ? AND job LIKE ?').bind(TENANT_ID, like).first<{ n: number }>())!.n;

interface Spy { sms: any[]; email: any[]; push: any[] }
function spyEnv(opts: { smsFail?: (data: any, attempt: number) => Error | null } = {}): { e: any; spy: Spy } {
  const spy: Spy = { sms: [], email: [], push: [] };
  let attempt = 0;
  const e = {
    ...testEnv,
    TENANCY_MODE: 'multi',
    SMS_QUEUE: {
      send: async (m: any) => {
        attempt++;
        const err = opts.smsFail?.(m.data, attempt);
        if (err) throw err;
        spy.sms.push(m);
      },
    },
    EMAIL_QUEUE: { send: async (m: any) => { spy.email.push(m); } },
    PUSH_NOTIFICATION_QUEUE: { send: async (m: any) => { spy.push.push(m); } },
  };
  return { e, spy };
}

function mockProviders() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const url = String(typeof input === 'string' ? input : input.url ?? input);
    if (url.includes('sendgrid')) return new Response(null, { status: 202 });
    return new Response(JSON.stringify({ sid: 'SM124' }), { status: 201 });
  });
}

let admin = '';
let payerId = '';
let leadId = '';
const birthdayIds: string[] = [];

async function clearRuns() {
  await run('DELETE FROM cron_job_runs WHERE tenant_id = ?', TENANT_ID);
}
async function resetUsage() {
  await run('DELETE FROM tenant_usage_caps WHERE tenant_id = ?', TENANT_ID);
  await run('DELETE FROM usage_alerts WHERE tenant_id = ?', TENANT_ID);
  await run('DELETE FROM metered_events WHERE tenant_id = ?', TENANT_ID);
}

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  expect((await api('POST', '/test/reset', null)).status).toBe(200);
  const login = await api('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
  admin = login.body.data.accessToken;
  await run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('timezone', 'UTC')`);
  await run(`DELETE FROM settings WHERE key = 'daily_job_hour'`);
  await setAllowance('sms', 100);
  await setAllowance('email', 100);

  // One customer who owns every kind of reminder.
  const payer = await api('POST', '/contacts', admin, {
    name: 'R124 Payer', phone: '+919800012401', email: 'r124-payer@example.com', type: 'customer', source: 'manual', birthday: '1985-10-10',
  });
  expect(payer.status, JSON.stringify(payer.body)).toBe(201);
  payerId = payer.body.data.id;
  await run(`UPDATE contacts SET anniversary = '2012-10-10' WHERE id = ?`, payerId);

  const lead = await api('POST', '/leads', admin, {
    contactId: payerId, title: 'R124 Departing', destinations: ['Goa'], travelDate: '2026-10-11', returnDate: '2026-10-18',
    budget: 100000, source: 'manual', priority: 'warm', tripType: 'domestic',
  });
  expect(lead.status, JSON.stringify(lead.body)).toBe(201);
  leadId = lead.body.data.id;
  await run(`UPDATE leads SET assigned_to = ? WHERE id = ?`, ADMIN_ID, leadId);
  const done = await api('POST', '/leads', admin, {
    contactId: payerId, title: 'R124 Finished', destinations: ['Goa'], travelDate: '2026-10-02', returnDate: '2026-10-09',
    budget: 100000, source: 'manual', priority: 'warm', tripType: 'domestic',
  });
  expect(done.status, JSON.stringify(done.body)).toBe(201);
  await run(`UPDATE leads SET status = 'completed', return_date = '2026-10-09' WHERE id = ?`, done.body.data.id);

  await run(
    `INSERT INTO invoices (id, contact_id, invoice_number, type, total, status, due_date, balance_due, created_by) VALUES ('r124-inv', ?, 'R124-INV-1', 'tax_invoice', 500, 'sent', '2026-10-13', 500, ?)`,
    payerId, ADMIN_ID,
  );
  await run(`INSERT INTO travellers (id, contact_id, first_name, last_name, passport_expiry_date) VALUES ('r124-trav', ?, 'Pat', 'Traveller', '2027-01-15')`, payerId);
  await run(
    `INSERT INTO visa_applications (id, traveller_id, lead_id, country, destination_country, status, tenant_id, is_deleted, visa_expiry_date) VALUES ('r124-visa-ok', 'r124-trav', ?, 'France', 'France', 'approved', ?, 0, '2026-10-25')`,
    leadId, TENANT_ID,
  );
  await run(
    `INSERT INTO visa_applications (id, traveller_id, country, destination_country, status, tenant_id, is_deleted, created_at) VALUES ('r124-visa-docs', 'r124-trav', 'Spain', 'Spain', 'documents_collecting', ?, 0, '2026-09-25T00:00:00Z')`,
    TENANT_ID,
  );
});

afterAll(async () => {
  await clearRuns();
  await resetUsage();
  for (const [key, amount] of [['sms', 15], ['email', 2000]] as const) {
    await run(`UPDATE plan_allowances SET monthly_amount = ? WHERE plan_key = 'pro' AND allowance_key = ?`, amount, key);
  }
  await bumpCatalogueVersion(testEnv);
});
afterEach(() => vi.restoreAllMocks());

describe('reminder jobs have the shape the queue consumers read, with the agency id', () => {
  beforeEach(async () => { await clearRuns(); await resetUsage(); });

  it('every reminder type produces a job the SMS/email consumer sends, metered once each', async () => {
    const { e, spy } = spyEnv();
    await processBirthdaysForTenant(e, db, TENANT_ID, NOW);
    await processInvoiceRemindersForTenant(e, db, TENANT_ID, NOW);
    await processVisaPassportForTenant(e, db, TENANT_ID, NOW);
    await processMissingVisaDocsForTenant(e, db, TENANT_ID, NOW);
    await processTripRemindersForTenant(e, db, TENANT_ID, NOW);

    const smsTemplates = spy.sms.map((m) => m.data.templateId).sort();
    expect(smsTemplates).toEqual(['anniversary_wish', 'birthday_wish', 'invoice_due_reminder', 'trip_departure_reminder']);
    const emailTemplates = spy.email.map((m) => m.data.templateId).sort();
    expect(emailTemplates).toEqual([
      'invoice_due_reminder_email', 'passport_expiry_reminder', 'trip_departure_email', 'trip_feedback_request', 'visa_missing_docs_reminder',
    ]);

    for (const m of spy.sms) {
      expect(m.type).toBe('sms');
      expect(m.data).toMatchObject({ to: '+919800012401', channel: 'sms', tenantId: TENANT_ID, contactId: payerId });
      expect(typeof m.data.body).toBe('string');
      expect(m.data.body.length).toBeGreaterThan(10);
    }
    for (const m of spy.email) {
      expect(m.type).toBe('email');
      expect(m.data.to).toBe('r124-payer@example.com');
      expect(m.data.tenantId).toBe(TENANT_ID);
      expect(m.data.subject.length).toBeGreaterThan(3);
      expect(m.data.html).toContain('<p>');
    }
    // the visa-expiry push goes to the lead's owner, scoped to the agency
    expect(spy.push.length).toBe(1);
    expect(spy.push[0].data).toMatchObject({ tenantId: TENANT_ID, userId: ADMIN_ID });
    expect(spy.push[0].data.data.type).toBe('visa_expiry');

    // The consumers actually send them: Twilio / SendGrid are called, and each message takes one unit of allowance.
    const fetchSpy = mockProviders();
    for (const m of spy.sms) await handleSmsJob(m.data, testEnv);
    for (const m of spy.email) await handleEmailJob(m.data, testEnv);
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes('api.twilio.com')).length).toBe(spy.sms.length);
    expect(urls.filter((u) => u.includes('sendgrid')).length).toBe(spy.email.length);
    expect(await usage('sms_per_month')).toBe(spy.sms.length);
    expect(await usage('email_per_month')).toBe(spy.email.length);
  });

  it('the follow-up reminder push carries the agency id and is claimed once', async () => {
    const at = new Date('2026-10-10T10:00:00Z');
    const soon = new Date(at.getTime() + 10 * 60 * 1000).toISOString();
    await run(`INSERT INTO follow_ups (id, lead_id, type, scheduled_at, status, created_by) VALUES ('r124-fu', ?, 'call', ?, 'pending', ?)`, leadId, soon, ADMIN_ID);
    try {
      const { e, spy } = spyEnv();
      const cache = new Map<string, string>();
      e.CACHE = { get: async (k: string) => cache.get(k) ?? null, put: async (k: string, v: string) => { cache.set(k, v); } };
      await checkFollowUpReminders(e, TENANT_ID, db, at);
      expect(spy.push.length).toBe(1);
      expect(spy.push[0].data.tenantId).toBe(TENANT_ID);
      // KV forgot the key (eventual consistency, eviction): the recipient claim still stops a duplicate push
      cache.clear();
      await checkFollowUpReminders(e, TENANT_ID, db, at);
      expect(spy.push.length).toBe(1);
    } finally {
      await run(`DELETE FROM follow_ups WHERE id = 'r124-fu'`);
    }
  });
});

describe('a retried job messages each recipient exactly once', () => {
  beforeAll(async () => {
    // five birthday contacts, and nobody else with a birthday today
    await run(`UPDATE contacts SET birthday = NULL, anniversary = NULL`);
    for (let i = 1; i <= 5; i++) {
      const c = await api('POST', '/contacts', admin, { name: `R124 Birthday ${i}`, phone: `+91980001250${i}`, type: 'customer', source: 'manual', birthday: '1990-10-10' });
      expect(c.status, JSON.stringify(c.body)).toBe(201);
      birthdayIds.push(c.body.data.id);
    }
  });
  beforeEach(async () => { await clearRuns(); await resetUsage(); });

  const birthdaySms = (spy: Spy) => spy.sms.filter((m) => m.data.templateId === 'birthday_wish');
  const infra = () => new Error('Queue unavailable: network connection lost');

  it('a job failing on recipient 3 of 5 and retried sends one message to each of the 5, one unit each', async () => {
    const fetchSpy = mockProviders();
    const delivered: string[] = [];
    const deliver = async (spy: Spy) => {
      for (const m of spy.sms.splice(0)) { delivered.push(m.data.to); await handleSmsJob(m.data, testEnv); }
    };

    let birthdayAttempts = 0;
    const first = spyEnv({ smsFail: (d) => (d.templateId === 'birthday_wish' && ++birthdayAttempts === 3 ? infra() : null) });
    const r1 = await runTenantJobSet(first.e, TENANT_ID, db, 'hourly', FIRED_AT);
    expect(r1.failed.find((f) => f.job === 'contacts.birthdays')?.infrastructure).toBe(true);
    await deliver(first.spy);
    expect(delivered.length).toBeGreaterThanOrEqual(2);

    const second = spyEnv();
    const r2 = await runTenantJobSet(second.e, TENANT_ID, db, 'hourly', FIRED_AT);
    expect(r2.ran).toContain('contacts.birthdays');
    await deliver(second.spy);

    const birthdayRecipients = delivered.filter((to) => /^\+91980001250\d$/.test(to));
    expect([...birthdayRecipients].sort()).toEqual(['+919800012501', '+919800012502', '+919800012503', '+919800012504', '+919800012505']);
    const twilioForBirthdays = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.twilio.com') && /Body=Happy\+Birthday\+R124\+Birthday/.test(String((c[1] as any)?.body))).length;
    expect(twilioForBirthdays).toBe(5);
    expect(await usage('sms_per_month')).toBe(delivered.length); // every delivered message took exactly one unit
  });

  it('a recipient failing for its own reason is marked failed and never retried', async () => {
    const bad = '+919800012502';
    const first = spyEnv({ smsFail: (d) => (d.to === bad ? new Error('invalid destination number') : null) });
    const r1 = await runTenantJobSet(first.e, TENANT_ID, db, 'hourly', FIRED_AT);
    expect(r1.ran).toContain('contacts.birthdays'); // the job itself did not fail
    expect(birthdaySms(first.spy).map((m) => m.data.to).sort()).toEqual(['+919800012501', '+919800012503', '+919800012504', '+919800012505']);
    expect(await claimCount('recipient-failed:contacts.birthdays')).toBe(1);

    // the day claim is lost (e.g. a manual re-run): nobody is messaged again, including the failed one
    await run(`DELETE FROM cron_job_runs WHERE tenant_id = ? AND job = 'contacts.birthdays'`, TENANT_ID);
    const second = spyEnv();
    await runTenantJobSet(second.e, TENANT_ID, db, 'hourly', FIRED_AT);
    expect(birthdaySms(second.spy).length).toBe(0);
  });

  it('an already-claimed recipient consumes no allowance', async () => {
    mockProviders();
    const a = spyEnv();
    await processBirthdaysForTenant(a.e, db, TENANT_ID, NOW);
    for (const m of birthdaySms(a.spy)) await handleSmsJob(m.data, testEnv);
    expect(await usage('sms_per_month')).toBe(5);
    const b = spyEnv();
    await processBirthdaysForTenant(b.e, db, TENANT_ID, NOW);
    expect(b.spy.sms.length).toBe(0);
    expect(await usage('sms_per_month')).toBe(5);
  });

  it('at the monthly cap the consumer skips the send and takes no allowance', async () => {
    await setAllowance('sms', 3);
    try {
      const fetchSpy = mockProviders();
      const a = spyEnv();
      await processBirthdaysForTenant(a.e, db, TENANT_ID, NOW);
      for (const m of birthdaySms(a.spy)) await handleSmsJob(m.data, testEnv);
      expect(fetchSpy.mock.calls.filter((c) => String(c[0]).includes('api.twilio.com')).length).toBe(3);
      expect(await usage('sms_per_month')).toBe(3);
    } finally {
      await setAllowance('sms', 100);
    }
  });
});

describe('recipient claims are pruned after 14 days', () => {
  beforeEach(clearRuns);

  it('the daily housekeeping job removes claims and failure marks older than 14 days and keeps newer ones', async () => {
    const iso = (days: number) => new Date(NOW.getTime() - days * 86400000).toISOString();
    const ins = (job: string, key: string, at: string) =>
      run('INSERT INTO cron_job_runs (tenant_id, job, period_key, claimed_at) VALUES (?, ?, ?, ?)', TENANT_ID, job, key, at);
    await ins('recipient:contacts.birthdays', 'day:2026-10-01:old', iso(20));
    await ins('recipient-failed:contacts.birthdays', 'day:2026-10-01:old', iso(20));
    await ins('recipient:contacts.birthdays', 'day:2026-10-28:recent', iso(7));
    // a normal job claim that is 20 days old stays (those keep 45 days)
    await ins('invoices.reminders', 'day:2026-10-15', iso(20));

    const { e } = spyEnv();
    const res = await runTenantJobSet(e, TENANT_ID, db, 'hourly', FIRED_AT);
    expect(res.ran).toContain('housekeeping.prune-job-runs');

    const left = await rows<{ job: string; period_key: string }>(`SELECT job, period_key FROM cron_job_runs WHERE tenant_id = ? AND (period_key LIKE '%:old' OR period_key LIKE '%:recent' OR job = 'invoices.reminders')`, TENANT_ID);
    const keys = left.map((r) => `${r.job}|${r.period_key}`);
    expect(keys).not.toContain('recipient:contacts.birthdays|day:2026-10-01:old');
    expect(keys).not.toContain('recipient-failed:contacts.birthdays|day:2026-10-01:old');
    expect(keys).toContain('recipient:contacts.birthdays|day:2026-10-28:recent');
    expect(keys).toContain('invoices.reminders|day:2026-10-15');
  });
});
