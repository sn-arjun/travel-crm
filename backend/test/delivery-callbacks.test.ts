import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

async function send(path: string, init: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function json(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return send(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function twilioStatus(fields: Record<string, string>, query = ''): Promise<Response> {
  return send(`/webhooks/twilio/status${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

async function statusOf(messageId: string) {
  return testEnv.MASTER_DB.prepare('SELECT status, delivered_at, read_at, error_message FROM message_log WHERE id = ?').bind(messageId).first();
}

let messageId = '';

describe('Delivery status callbacks', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await json('POST', '/test/reset')).status).toBe(200);
    const login = await json('POST', '/auth/login', { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    const token = ((await login.json()) as any).data.accessToken;

    const contact = await json('POST', '/contacts', { name: 'Receipt Check', phone: '9000002001', type: 'customer' }, token);
    const contactId = ((await contact.json()) as any).data.id;
    const sent = await json('POST', '/communications/send', { contact_id: contactId, channel: 'whatsapp', message: 'Your plan is ready' }, token);
    expect(sent.status).toBe(201);
    messageId = ((await sent.json()) as any).data.message_id;
    await testEnv.MASTER_DB.prepare(`UPDATE message_log SET external_id = 'SM-receipt-1' WHERE id = ?`).bind(messageId).run();
  });

  it('a delivery receipt updates the message without any session', async () => {
    const res = await twilioStatus({ MessageSid: 'SM-receipt-1', MessageStatus: 'delivered' });
    expect(res.status).toBe(200);
    const row = await statusOf(messageId);
    expect(row.status).toBe('delivered');
    expect(row.delivered_at).toBeTruthy();
  });

  it('a read receipt and a failure are recorded too', async () => {
    await twilioStatus({ MessageSid: 'SM-receipt-1', MessageStatus: 'read' });
    expect((await statusOf(messageId)).read_at).toBeTruthy();

    await twilioStatus({ MessageSid: 'SM-receipt-1', MessageStatus: 'undelivered', ErrorCode: '63016' });
    expect(await statusOf(messageId)).toMatchObject({ status: 'failed', error_message: '63016' });
  });

  it('accepts the workspace in the callback URL, and ignores a receipt for an unknown message', async () => {
    const scoped = await twilioStatus({ MessageSid: 'SM-receipt-1', MessageStatus: 'delivered' }, `?tenant=${TENANT_ID}`);
    expect(scoped.status).toBe(200);
    expect((await statusOf(messageId)).status).toBe('delivered');

    const unknown = await twilioStatus({ MessageSid: 'SM-nobody', MessageStatus: 'delivered' });
    expect(unknown.status).toBe(200);
    const wrongTenant = await twilioStatus({ MessageSid: 'SM-receipt-1', MessageStatus: 'read' }, '?tenant=no-such-workspace');
    expect(wrongTenant.status).toBe(200);
    expect((await statusOf(messageId)).status).toBe('delivered');
  });

  it('still rejects a callback with no message id', async () => {
    expect((await twilioStatus({ MessageStatus: 'delivered' })).status).toBe(400);
  });
});
