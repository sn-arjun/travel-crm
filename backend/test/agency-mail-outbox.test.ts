import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { handleQueue } from '../src/queues/index';
import { sendMail } from '../src/services/mail/provider';
import { clearOutbox, listOutbox } from '../src/services/mail/transactional';

/**
 * R142: in TEST_MODE agency mail (Communication Hub, invoices, vouchers, campaigns) is written to the local outbox with its
 * tenant id and SendGrid is never called. With TEST_MODE off and a key, SendGrid is still called (production unchanged).
 */

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

let admin = '';
const queued: Array<{ type: string; data: any }> = [];
const queueEnv = {
  ...testEnv,
  EMAIL_QUEUE: { send: async (m: any) => { queued.push(m); } },
  SMS_QUEUE: { send: async (m: any) => { queued.push(m); } },
  CAMPAIGN_QUEUE: { send: async () => {} },
};

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = queueEnv): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function drain(e: any): Promise<void> {
  const jobs = queued.splice(0);
  for (const body of jobs) {
    await handleQueue({ queue: 'travelcrm-email-queue', messages: [{ body, ack() {}, retry() { throw new Error('queue retried'); } }] } as any, e);
  }
}

/** Every fetch is recorded; SendGrid answers 202. Anything else is a failure: nothing real is contacted. */
function spyFetch() {
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    urls.push(String(url));
    if (String(url).includes('api.sendgrid.com/v3/mail/send')) return new Response('', { status: 202, headers: { 'x-message-id': 'r142-msg' } });
    throw new Error(`unexpected network call in test: ${url}`);
  });
  return urls;
}

describe('agency mail in the local outbox (R142)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = login.body.data.accessToken;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    queued.length = 0;
    await clearOutbox(testEnv);
  });

  it('a hub email sent through the queue lands in the outbox with the tenant id, and SendGrid is not called', async () => {
    const urls = spyFetch();
    const contact = await call('POST', '/contacts', admin, { name: 'Outbox Receiver', email: 'outbox-r142@example.com', type: 'customer' });
    const hub = await call('POST', '/communications/send', admin, { channel: 'email', contact_id: contact.body.data.id, message: 'Your deposit link is ready' });
    expect(hub.status, JSON.stringify(hub.body)).toBe(201);
    await drain(testEnv);

    expect(urls.filter((u) => u.includes('sendgrid'))).toHaveLength(0);
    const mails = await listOutbox(testEnv, { to: 'outbox-r142@example.com', kind: 'agency' });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ kind: 'agency', tenantId: TENANT_ID, to: 'outbox-r142@example.com' });
    expect(mails[0].html).toContain('Your deposit link is ready');
    // the hub marks it sent: the outbox answers success
    const row = await (testEnv.MASTER_DB as D1Database).prepare('SELECT status, external_id FROM message_log WHERE id = ?').bind(hub.body.data.message_id).first<any>();
    expect(row.status).toBe('sent');
    expect(row.external_id).toBe(mails[0].id);
  });

  it('sendMail for agency mail (transactional and marketing) is captured with the attachment names', async () => {
    const urls = spyFetch();
    const a = await sendMail(testEnv, 'agency_transactional', {
      to: ['one@example.com', 'two@example.com'], subject: 'Invoice', html: '<p>See attached</p>', tenantId: TENANT_ID,
      attachments: [{ content: 'AAAA', filename: 'invoice.pdf', type: 'application/pdf', disposition: 'attachment' } as any],
    });
    const b = await sendMail(testEnv, 'agency_marketing', { to: 'three@example.com', subject: 'Offer', html: '<p>Offer</p>', unsubscribeUrl: 'https://example.test/u' });
    expect(a).toMatchObject({ success: true, provider: 'outbox' });
    expect(b).toMatchObject({ success: true, provider: 'outbox' });
    expect(urls).toHaveLength(0);
    const mails = await listOutbox(testEnv, { kind: 'agency' });
    expect(mails).toHaveLength(2);
    const invoice = mails.find((m) => m.subject === 'Invoice')!;
    expect(invoice).toMatchObject({ to: 'one@example.com, two@example.com', tenantId: TENANT_ID, attachmentNames: ['invoice.pdf'], mailKind: 'agency_transactional' });
    expect(mails.find((m) => m.subject === 'Offer')).toMatchObject({ tenantId: null, mailKind: 'agency_marketing' });
  });

  it('GET /test/outbox filters by tenantId and by kind (system mail unchanged)', async () => {
    spyFetch();
    await sendMail(testEnv, 'agency_transactional', { to: 'a@example.com', subject: 'A', html: 'a', tenantId: TENANT_ID });
    await sendMail(testEnv, 'agency_transactional', { to: 'b@example.com', subject: 'B', html: 'b', tenantId: 'other-tenant' });
    await testEnv.CACHE.put('outbox:system-1', JSON.stringify({ id: 'system-1', to: 'sys@example.com', subject: 'Welcome', html: '', text: '', template: 'welcome', tenantId: TENANT_ID, createdAt: new Date().toISOString() }));

    const byTenant = (await call('GET', `/test/outbox?tenantId=${TENANT_ID}`, null)).body.data;
    expect(byTenant.map((m: any) => m.subject).sort()).toEqual(['A', 'Welcome']);
    const agency = (await call('GET', '/test/outbox?kind=agency', null)).body.data;
    expect(agency.map((m: any) => m.subject).sort()).toEqual(['A', 'B']);
    const system = (await call('GET', '/test/outbox?kind=system', null)).body.data;
    expect(system.map((m: any) => m.subject)).toEqual(['Welcome']);
    const both = (await call('GET', `/test/outbox?kind=agency&tenantId=${TENANT_ID}`, null)).body.data;
    expect(both.map((m: any) => m.subject)).toEqual(['A']);
    // no filter: everything, as before
    expect((await call('GET', '/test/outbox', null)).body.data).toHaveLength(3);
  });

  it('with TEST_MODE off and a key, the mail goes to SendGrid and nothing is written to the outbox', async () => {
    const urls = spyFetch();
    const prod = { ...testEnv, TEST_MODE: 'false', SENDGRID_API_KEY: 'SG.test-key-r142' };
    const res = await sendMail(prod, 'agency_transactional', { to: 'real@example.com', subject: 'Live', html: '<p>Live</p>', tenantId: TENANT_ID });
    expect(res).toMatchObject({ success: true, provider: 'sendgrid', messageId: 'r142-msg' });
    expect(urls.filter((u) => u.includes('api.sendgrid.com/v3/mail/send'))).toHaveLength(1);
    expect(await listOutbox(testEnv, { kind: 'agency' })).toHaveLength(0);
  });

  it('the production environment ignores a leaked TEST_MODE and still uses SendGrid', async () => {
    const urls = spyFetch();
    const prod = { ...testEnv, TEST_MODE: 'true', ENVIRONMENT: 'production', SENDGRID_API_KEY: 'SG.test-key-r142' };
    const res = await sendMail(prod, 'agency_marketing', { to: 'real@example.com', subject: 'Live', html: '<p>Live</p>' });
    expect(res.provider).toBe('sendgrid');
    expect(urls.filter((u) => u.includes('api.sendgrid.com'))).toHaveLength(1);
    expect(await listOutbox(testEnv, { kind: 'agency' })).toHaveLength(0);
  });
});
