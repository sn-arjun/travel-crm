import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const OTHER_TENANT = '01960000-0000-7000-8000-000000000001';

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function login(email: string): Promise<string> {
  const res = await call('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID });
  expect(res.status).toBe(200);
  return ((await res.json()) as any).data.accessToken;
}

async function data(res: Response): Promise<any> {
  return ((await res.json()) as any).data;
}

let admin = '';
let sales = '';

describe('Integrations settings', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    admin = await login('admin@e2e.test');
    sales = await login('sales@e2e.test');
  });

  it('is admin only', async () => {
    expect((await call('GET', '/integrations/channels', sales)).status).toBe(403);
    expect((await call('POST', '/integrations/api-keys', sales, {})).status).toBe(403);
    expect((await call('GET', '/integrations/channels', null)).status).toBe(401);
  });

  describe('receiving addresses', () => {
    it('stores a number in E.164 and a mailbox in lower case', async () => {
      const number = await call('POST', '/integrations/channels', admin, { channel: 'whatsapp', address: '080 4718 2290', provider: 'twilio', label: 'Main line' });
      expect(number.status).toBe(201);
      expect(await data(number)).toMatchObject({ channel: 'whatsapp', address: '+918047182290', provider: 'twilio', label: 'Main line', isActive: true });

      const mailbox = await call('POST', '/integrations/channels', admin, { channel: 'email', address: 'Hello@Inbound.Test' });
      expect((await data(mailbox)).address).toBe('hello@inbound.test');

      const list = await data(await call('GET', '/integrations/channels', admin));
      expect(list.map((r: any) => r.address).sort()).toEqual(['+918047182290', 'hello@inbound.test']);
    });

    it('rejects an address that is not a phone number or mailbox', async () => {
      expect((await call('POST', '/integrations/channels', admin, { channel: 'sms', address: 'abc' })).status).toBe(400);
      expect((await call('POST', '/integrations/channels', admin, { channel: 'email', address: 'not-an-email' })).status).toBe(400);
    });

    it('refuses a duplicate, and does not say who owns an address held elsewhere', async () => {
      const again = await call('POST', '/integrations/channels', admin, { channel: 'whatsapp', address: '+918047182290' });
      expect(again.status).toBe(409);

      await testEnv.MASTER_DB.prepare(
        `INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address) VALUES ('other-1', ?, 'sms', '+919000000001')`,
      ).bind(OTHER_TENANT).run();
      const taken = await call('POST', '/integrations/channels', admin, { channel: 'sms', address: '+919000000001' });
      expect(taken.status).toBe(409);
      expect(JSON.stringify(await taken.json())).not.toContain(OTHER_TENANT);
    });

    it('lists and deletes only the addresses of this workspace', async () => {
      const list = await data(await call('GET', '/integrations/channels', admin));
      expect(list.some((r: any) => r.id === 'other-1')).toBe(false);
      expect((await call('DELETE', '/integrations/channels/other-1', admin)).status).toBe(404);

      const own = list.find((r: any) => r.channel === 'email');
      expect((await call('DELETE', `/integrations/channels/${own.id}`, admin)).status).toBe(200);
      const after = await data(await call('GET', '/integrations/channels', admin));
      expect(after.some((r: any) => r.id === own.id)).toBe(false);
    });

    it('a registered number receives messages through the provider webhook', async () => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request('http://localhost/api/v1/webhooks/inbound/twilio/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: 'whatsapp:+919845000111', To: 'whatsapp:+918047182290', Body: 'Registered route', MessageSid: 'SM-int-1' }).toString(),
        }),
        testEnv,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(res.status).toBe(200);
      const row = await testEnv.MASTER_DB.prepare(`SELECT channel, to_address FROM message_log WHERE external_id = 'SM-int-1'`).first();
      expect(row).toEqual({ channel: 'whatsapp', to_address: '+918047182290' });
    });
  });

  describe('website-form API keys', () => {
    it('shows the full key once, then only masked, and the key works until revoked', async () => {
      const res = await call('POST', '/integrations/api-keys', admin, { label: 'Website' });
      expect(res.status).toBe(201);
      const issued = await data(res);
      expect(issued.apiKey).toMatch(/^tcrm_[0-9a-f]{48}$/);

      const list = await data(await call('GET', '/integrations/api-keys', admin));
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: issued.id, label: 'Website', maskedKey: issued.maskedKey });
      expect(JSON.stringify(list)).not.toContain(issued.apiKey);

      const form = await call('POST', '/webhooks/inbound/web-form', null, { api_key: issued.apiKey, name: 'Key Check', phone: '9811100022', destination: 'Goa' });
      expect(form.status).toBe(200);

      expect((await call('DELETE', `/integrations/api-keys/${issued.id}`, admin)).status).toBe(200);
      const revoked = await call('POST', '/webhooks/inbound/web-form', null, { api_key: issued.apiKey, name: 'Key Check', phone: '9811100022' });
      expect(revoked.status).toBe(401);
      expect(await data(await call('GET', '/integrations/api-keys', admin))).toHaveLength(0);
    });
  });
});
