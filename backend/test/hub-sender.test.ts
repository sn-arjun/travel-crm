import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import worker from '../src/index';
import { bumpCatalogueVersion } from '../src/services/plans/catalogue';
import { AllowanceExhausted } from '../src/services/metering/meter';
import { HubError, sendHubMessage } from '../src/services/messaging/hub';
import { withdrawMarketing } from '../src/services/privacy/consent';

/**
 * R154: the Communication Hub domain sender. POST /communications/send and sendHubMessage give the same result for a service
 * message; consent blocks marketing messages only; at the cap AllowanceExhausted is thrown and nothing is written or queued.
 */

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

let originalEmailAllowance = 2000;
const queued: any[] = [];
const queueEnv = { ...testEnv, SMS_QUEUE: { send: async (m: unknown) => { queued.push(m); } }, EMAIL_QUEUE: { send: async (m: unknown) => { queued.push(m); } }, CAMPAIGN_QUEUE: { send: async () => {} } };

let admin = '';
let adminId = '';
let contactId = '';
let optedOutId = '';

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    queueEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}
const rows = async <T = any>(sql: string, ...b: unknown[]): Promise<T[]> => ((await DB.prepare(sql).bind(...b).all()).results ?? []) as T[];

async function setEmailAllowance(amount: number) {
  await DB.prepare(`UPDATE plan_allowances SET monthly_amount = ? WHERE plan_key = 'pro' AND allowance_key = 'email'`).bind(amount).run();
  await bumpCatalogueVersion(testEnv);
}
async function resetUsage() {
  await DB.prepare('DELETE FROM tenant_usage_caps WHERE tenant_id = ?').bind(TENANT_ID).run();
  await DB.prepare('DELETE FROM usage_alerts WHERE tenant_id = ?').bind(TENANT_ID).run();
  queued.length = 0;
}

describe('hub sender (R154)', () => {
  beforeAll(async () => {
    await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    originalEmailAllowance = (await DB.prepare("SELECT monthly_amount AS n FROM plan_allowances WHERE plan_key = 'pro' AND allowance_key = 'email'").first<{ n: number }>())?.n ?? 2000;
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    const body = (await login.json()) as any;
    admin = body.data.accessToken;
    adminId = body.data.user.id;
    contactId = ((await (await call('POST', '/contacts', admin, { name: 'Hub Contact', phone: '+31 6 1234 5601', email: 'hub-contact@example.com', type: 'customer' })).json()) as any).data.id;
    optedOutId = ((await (await call('POST', '/contacts', admin, { name: 'Hub Optout', phone: '+31 6 1234 5602', email: 'hub-optout@example.com', type: 'customer' })).json()) as any).data.id;
    await withdrawMarketing(DB, optedOutId, 'any', 'manual');
  });

  beforeEach(async () => {
    await resetUsage();
  });

  afterAll(async () => {
    await DB.prepare(`UPDATE plan_allowances SET monthly_amount = ? WHERE plan_key = 'pro' AND allowance_key = 'email'`).bind(originalEmailAllowance).run();
    await bumpCatalogueVersion(testEnv);
  });

  it('the route and the function queue the same job and write the same log row for a service message', async () => {
    const res = await call('POST', '/communications/send', admin, { channel: 'email', contact_id: contactId, message: 'Hello from the route' });
    expect(res.status).toBe(201);
    const viaRoute = ((await res.json()) as any).data;
    expect(viaRoute.status).toBe('queued');
    const routeJob = queued.pop();

    const sent = await sendHubMessage(queueEnv, TENANT_ID, DB, { contactId, channel: 'email', body: 'Hello from the route', purpose: 'service', actorId: adminId });
    const fnJob = queued.pop();

    expect(fnJob.type).toBe(routeJob.type);
    expect(fnJob.data).toMatchObject({ to: 'hub-contact@example.com', subject: 'Message', html: 'Hello from the route', channel: 'email', metered: true, refundOnFailure: true, meterChannel: 'email', contactId, tenantId: TENANT_ID });
    expect(Object.keys(fnJob.data).sort()).toEqual(Object.keys(routeJob.data).sort());

    const a = (await rows('SELECT * FROM message_log WHERE id = ?', viaRoute.message_id))[0];
    const b = (await rows('SELECT * FROM message_log WHERE id = ?', sent.messageId))[0];
    for (const key of ['contact_id', 'channel', 'subject', 'content', 'status', 'direction', 'sent_by']) expect(b[key], key).toEqual(a[key]);
  });

  it('keeps the route answers: unknown contact 404, no phone 400, no email 400', async () => {
    expect((await call('POST', '/communications/send', admin, { channel: 'sms', contact_id: 'nope', message: 'x' })).status).toBe(404);
    const bare = ((await (await call('POST', '/contacts', admin, { name: 'Hub Bare', type: 'customer' })).json()) as any).data.id;
    const noPhone = await call('POST', '/communications/send', admin, { channel: 'sms', contact_id: bare, message: 'x' });
    expect(noPhone.status).toBe(400);
    expect(((await noPhone.json()) as any).error.message).toBe('Contact has no phone number');
    const noEmail = await call('POST', '/communications/send', admin, { channel: 'email', contact_id: bare, message: 'x' });
    expect(noEmail.status).toBe(400);
    expect(((await noEmail.json()) as any).error.message).toBe('Contact has no email address');
    expect(queued).toHaveLength(0);
  });

  it('consent blocks a marketing message but not a service message', async () => {
    await expect(sendHubMessage(queueEnv, TENANT_ID, DB, { contactId: optedOutId, channel: 'email', body: 'Offer', purpose: 'marketing' })).rejects.toMatchObject({ code: 'opted_out' });
    await expect(sendHubMessage(queueEnv, TENANT_ID, DB, { contactId: optedOutId, channel: 'sms', body: 'Offer', purpose: 'marketing' })).rejects.toBeInstanceOf(HubError);
    expect(queued).toHaveLength(0);
    // the same person still gets a service message, through the function and through the route
    const sent = await sendHubMessage(queueEnv, TENANT_ID, DB, { contactId: optedOutId, channel: 'email', body: 'Your pickup is at 07:00', purpose: 'service' });
    expect(sent.to).toBe('hub-optout@example.com');
    expect((await call('POST', '/communications/send', admin, { channel: 'email', contact_id: optedOutId, message: 'Your pickup is at 07:00' })).status).toBe(201);
    // a granted contact receives marketing
    const ok = await sendHubMessage(queueEnv, TENANT_ID, DB, { contactId, channel: 'email', body: 'Offer', purpose: 'marketing' });
    expect(ok.messageId).toBeTruthy();
  });

  it('blocks an email to an address that bounced, only when asked to', async () => {
    await DB.prepare('UPDATE contacts SET email_undeliverable = 1 WHERE id = ?').bind(optedOutId).run();
    await expect(sendHubMessage(queueEnv, TENANT_ID, DB, { contactId: optedOutId, channel: 'email', body: 'x', blockUndeliverable: true })).rejects.toMatchObject({ code: 'email_undeliverable' });
    // staff sends keep their old behaviour: the queue suppresses it later
    await expect(sendHubMessage(queueEnv, TENANT_ID, DB, { contactId: optedOutId, channel: 'email', body: 'x' })).resolves.toBeTruthy();
    await DB.prepare('UPDATE contacts SET email_undeliverable = 0 WHERE id = ?').bind(optedOutId).run();
  });

  it('a recipient with an address of their own needs no contact; the template is filled with the variables', async () => {
    await DB.prepare(`INSERT OR REPLACE INTO message_templates (id, channel, name, subject, content) VALUES ('r154-hub-tpl', 'email', 'R154 hub', 'Hi {first_name}', 'Pickup at {pickup_time}')`).run();
    const sent = await sendHubMessage(queueEnv, TENANT_ID, DB, { channel: 'email', to: 'walk-in@example.com', templateId: 'r154-hub-tpl', variables: { first_name: 'Noor', pickup_time: '07:40' } });
    const job = queued.pop();
    expect(job.data).toMatchObject({ to: 'walk-in@example.com', subject: 'Hi Noor', html: 'Pickup at 07:40' });
    expect((await rows('SELECT contact_id, template_id FROM message_log WHERE id = ?', sent.messageId))[0]).toMatchObject({ contact_id: null, template_id: 'r154-hub-tpl' });
    await expect(sendHubMessage(queueEnv, TENANT_ID, DB, { channel: 'email', body: 'x' })).rejects.toMatchObject({ code: 'no_email' });
  });

  it('at the cap AllowanceExhausted is thrown, nothing is queued or logged, and the route answers 402', async () => {
    await setEmailAllowance(1);
    const before = (await rows('SELECT COUNT(*) AS n FROM message_log'))[0].n;
    await sendHubMessage(queueEnv, TENANT_ID, DB, { contactId, channel: 'email', body: 'first' });
    queued.length = 0;
    await expect(sendHubMessage(queueEnv, TENANT_ID, DB, { contactId, channel: 'email', body: 'second' })).rejects.toBeInstanceOf(AllowanceExhausted);
    expect(queued).toHaveLength(0);
    expect((await rows('SELECT COUNT(*) AS n FROM message_log'))[0].n).toBe(before + 1);
    const res = await call('POST', '/communications/send', admin, { channel: 'email', contact_id: contactId, message: 'third' });
    expect(res.status).toBe(402);
  });
});
