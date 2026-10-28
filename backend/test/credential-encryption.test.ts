import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import worker from '../src/index';
import { twilioSignature } from '../src/middleware/provider-signature';
import { hashApiKey, encryptSecret, keyIdOf } from '../src/utils/crypto-box';
import { voipSecretAad } from '../src/services/voip-provider';
import { superAdminToken } from './utils/super-admin';

/**
 * R108: VoIP credentials are encrypted at rest (AES-GCM, enc:v1) and website API keys are stored as SHA-256
 * hashes. The tenant and master databases are one shared database in the test setup, so cleanup is explicit.
 */

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const SA_ID = '0196a108-0000-7000-8000-0000000000a1';
const ACCOUNT_SID = 'AC' + 'a'.repeat(32);
const AUTH_TOKEN = 'k'.repeat(28) + '0123';
const API_SECRET = 'api-key-secret-value-9876';
const CALLBACK_NUMBER = '+918047188108';

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = testEnv): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

const data = async (res: Response) => ((await res.json()) as any).data;
const raw = (sql: string, ...binds: unknown[]) => (testEnv.MASTER_DB as D1Database).prepare(sql).bind(...binds);
const voipRow = async () => (await raw('SELECT * FROM voip_settings LIMIT 1').first()) as Record<string, any>;
const SECRET_COLUMNS = ['provider_auth_token', 'provider_api_key_secret', 'twilio_auth_token', 'twilio_api_key_secret'];

describe('Credential encryption at rest', () => {
  let admin = '';
  let superToken = '';
  const issuedKeyIds: string[] = [];

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    // R301: calling is offered only in some countries; these agencies are in the UK.
    await testEnv.MASTER_DB.prepare("INSERT INTO settings (key, value) VALUES ('country', 'GB') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = (await data(login)).accessToken;
    superToken = await superAdminToken(testEnv, { id: SA_ID, email: 'owner-r108@platform.test' });
    await raw('DELETE FROM voip_settings').run();
  });

  afterAll(async () => {
    await raw('DELETE FROM voip_settings').run();
    for (const id of issuedKeyIds) await raw('DELETE FROM tenant_api_keys WHERE id = ?', id).run();
    await raw(`DELETE FROM tenant_api_keys WHERE id LIKE 'r108-%'`).run();
    await raw(`DELETE FROM tenant_channel_addresses WHERE id = 'r108-addr'`).run();
  });

  describe('VoIP settings', () => {
    it('saving stores enc:v1 values in the database and the masked GET still shows the last four characters', async () => {
      const save = await call('PUT', '/voip/settings', admin, {
        providerAccountId: ACCOUNT_SID,
        providerAuthToken: AUTH_TOKEN,
        providerApiKeySecret: API_SECRET,
        twilioAuthToken: 'z'.repeat(28) + 'LEG1',
        twilioApiKeySecret: 'legacy-api-secret-5555',
        defaultCallerId: CALLBACK_NUMBER,
      });
      expect(save.status).toBe(200);

      const row = await voipRow();
      for (const column of SECRET_COLUMNS) {
        expect(row[column], column).toMatch(/^enc:v1:t1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
      }
      const everything = JSON.stringify(row);
      for (const secret of [AUTH_TOKEN, API_SECRET, 'LEG1', 'legacy-api-secret-5555']) expect(everything).not.toContain(secret);
      // non-secret fields stay readable
      expect(row.provider_account_id).toBe(ACCOUNT_SID);

      const settings = await data(await call('GET', '/voip/settings', admin));
      expect(settings).toMatchObject({
        providerAccountId: ACCOUNT_SID,
        providerAuthToken: '****0123',
        providerApiKeySecret: '****9876',
        twilioAuthToken: '****LEG1',
        twilioApiKeySecret: '****5555',
      });
      expect(JSON.stringify(settings)).not.toContain(AUTH_TOKEN);
    });

    it('a second save of one field re-seals only that column with a fresh IV', async () => {
      const before = await voipRow();
      await call('PUT', '/voip/settings', admin, { providerApiKeySecret: 'rotated-secret-0001' });
      const after = await voipRow();
      expect(after.provider_auth_token).toBe(before.provider_auth_token);
      expect(after.provider_api_key_secret).not.toBe(before.provider_api_key_secret);
      expect((await data(await call('GET', '/voip/settings', admin))).providerApiKeySecret).toBe('****0001');
    });

    it('a provider call decrypts the token: Twilio gets the real credentials in its Basic auth header', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ friendly_name: 'R108 Travels' }), { status: 200 }));
      try {
        const res = await call('GET', '/voip/test-connection', admin);
        expect(await data(res)).toMatchObject({ connected: true, accountName: 'R108 Travels' });
        const twilioCall = fetchSpy.mock.calls.find(([url]) => String(url).includes('api.twilio.com'));
        expect(twilioCall).toBeTruthy();
        expect(String(twilioCall![0])).toContain(ACCOUNT_SID);
        const headers = new Headers((twilioCall![1] as RequestInit).headers);
        expect(headers.get('Authorization')).toBe('Basic ' + btoa(`${ACCOUNT_SID}:${AUTH_TOKEN}`));
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('the callback signature check uses the workspace token after decrypting it', async () => {
      const path = '/voip/status-callback';
      const fields = { CallSid: 'CA-r108-1', CallStatus: 'completed', CallDuration: '12', To: CALLBACK_NUMBER, From: '+919000108001' };
      await raw(
        `INSERT OR REPLACE INTO tenant_channel_addresses (id, tenant_id, channel, address, provider) VALUES ('r108-addr', ?, 'voice', ?, 'twilio')`,
        TENANT_ID,
        CALLBACK_NUMBER,
      ).run();
      const send = async (token: string) => {
        const ctx = createExecutionContext();
        const res = await worker.fetch(
          new Request(`http://localhost/api/v1${path}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Twilio-Signature': await twilioSignature(`http://localhost/api/v1${path}`, fields, token),
            },
            body: new URLSearchParams(fields).toString(),
          }),
          testEnv,
          ctx,
        );
        await waitOnExecutionContext(ctx);
        return res.status;
      };
      expect(await send(AUTH_TOKEN)).toBe(200);
      expect(await send('not-the-workspace-token-at-all-1')).toBe(403);
      // the ciphertext itself is not a usable token
      expect(await send((await voipRow()).provider_auth_token)).toBe(403);
    });

    it('with the active key missing, saving fails closed (503) and reading stored credentials is refused', async () => {
      // Keys configured but the active one missing (test mode itself would fall back to the derived key when nothing is set; that case is in crypto-box.test.ts).
      const noKeys = { ...testEnv, CREDENTIALS_KEYS: '{}', CREDENTIALS_ACTIVE_KEY_ID: 'gone' };
      const before = await voipRow();
      const save = await call('PUT', '/voip/settings', admin, { providerAuthToken: 'must-never-be-stored-plain-1' }, noKeys);
      expect(save.status).toBe(503);
      expect(JSON.stringify(await save.json())).toContain('CREDENTIALS_UNAVAILABLE');
      expect((await voipRow()).provider_auth_token).toBe(before.provider_auth_token);
      expect(JSON.stringify(await voipRow())).not.toContain('must-never-be-stored-plain-1');

      const read = await call('GET', '/voip/test-connection', admin, undefined, noKeys);
      expect(read.status).toBe(503);
    });

    it('reencrypt turns a planted plaintext row into enc:v1 and is idempotent', async () => {
      const row = await voipRow();
      await raw('UPDATE voip_settings SET twilio_auth_token = ?, provider_api_key_secret = ? WHERE id = ?', 'planted-plaintext-token-LEG2', 'planted-plain-secret-7777', row.id).run();
      expect((await voipRow()).twilio_auth_token).toBe('planted-plaintext-token-LEG2');
      // legacy values stay readable while they wait
      expect((await data(await call('GET', '/voip/settings', admin))).twilioAuthToken).toBe('****LEG2');

      const run = await call('POST', '/admin/maintenance/reencrypt', superToken);
      expect(run.status).toBe(200);
      const first = await data(run);
      expect(first).toMatchObject({ encrypted: 2, rotated: 0, failed: 0 });

      const after = await voipRow();
      for (const column of SECRET_COLUMNS) expect(after[column], column).toMatch(/^enc:v1:t1:/);
      expect(JSON.stringify(after)).not.toContain('planted-plain');
      expect((await data(await call('GET', '/voip/settings', admin))).twilioAuthToken).toBe('****LEG2');

      const again = await data(await call('POST', '/admin/maintenance/reencrypt', superToken));
      expect(again).toMatchObject({ encrypted: 0, rotated: 0, failed: 0 });
      expect((await voipRow()).twilio_auth_token).toBe(after.twilio_auth_token);
    });

    it('reencrypt moves values sealed with a retired key to the active key and needs a super admin', async () => {
      const row = await voipRow();
      const oldEnv = { ...testEnv, CREDENTIALS_ACTIVE_KEY_ID: 't0' };
      const sealedOld = await encryptSecret(oldEnv, 'sealed-with-old-key-OLD1', voipSecretAad(row.id, 'twilio_auth_token'));
      expect(keyIdOf(sealedOld)).toBe('t0');
      await raw('UPDATE voip_settings SET twilio_auth_token = ? WHERE id = ?', sealedOld, row.id).run();
      expect((await data(await call('GET', '/voip/settings', admin))).twilioAuthToken).toBe('****OLD1');

      expect((await call('POST', '/admin/maintenance/reencrypt', admin)).status).toBeGreaterThanOrEqual(401);
      expect((await call('POST', '/admin/maintenance/reencrypt', null)).status).toBe(401);

      const run = await data(await call('POST', '/admin/maintenance/reencrypt', superToken));
      expect(run).toMatchObject({ encrypted: 0, rotated: 1, failed: 0 });
      expect(keyIdOf((await voipRow()).twilio_auth_token)).toBe('t1');
      expect((await data(await call('GET', '/voip/settings', admin))).twilioAuthToken).toBe('****OLD1');
    });

    it('a ciphertext copied to another column does not open', async () => {
      const row = await voipRow();
      await raw('UPDATE voip_settings SET provider_auth_token = twilio_auth_token WHERE id = ?', row.id).run();
      const res = await call('GET', '/voip/settings', admin);
      expect(res.status).toBe(503);
    });
  });

  describe('website API keys', () => {
    it('are shown once, stored as a SHA-256 hash with a prefix, and never written to the request log', async () => {
      const res = await call('POST', '/integrations/api-keys', admin, { label: 'R108 site' });
      expect(res.status).toBe(201);
      const issued = await data(res);
      issuedKeyIds.push(issued.id);
      expect(issued.apiKey).toMatch(/^tcrm_[0-9a-f]{48}$/);

      const stored = (await raw('SELECT * FROM tenant_api_keys WHERE id = ?', issued.id).first()) as Record<string, any>;
      expect(stored.api_key).toBe('');
      expect(stored.key_hash).toBe(await hashApiKey(issued.apiKey));
      expect(stored.key_prefix).toBe(issued.apiKey.slice(0, 8));
      expect(JSON.stringify(stored)).not.toContain(issued.apiKey);

      const list = await data(await call('GET', '/integrations/api-keys', admin));
      const mine = list.find((k: any) => k.id === issued.id);
      expect(mine.maskedKey).toBe(`${issued.apiKey.slice(0, 8)}…`);
      expect(JSON.stringify(list)).not.toContain(issued.apiKey);

      const form = await call('POST', '/webhooks/inbound/web-form', null, { api_key: issued.apiKey, name: 'Hash Lookup', phone: '9811100108', destination: 'Goa' });
      expect(form.status).toBe(200);

      const logs = await raw('SELECT api_key, payload FROM webhook_log WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 5', TENANT_ID).all<any>();
      expect(logs.results.length).toBeGreaterThan(0);
      expect(logs.results[0].api_key).toBe(issued.apiKey.slice(0, 8));
      expect(JSON.stringify(logs.results)).not.toContain(issued.apiKey);

      expect((await call('POST', '/webhooks/inbound/web-form', null, { api_key: issued.apiKey.slice(0, 20), name: 'x', phone: '9811100109' })).status).toBe(401);
    });

    it('a key issued before R108 (plaintext) still works once and is hashed in place', async () => {
      const legacyKey = 'tcrm_' + '0123456789abcdef'.repeat(3);
      await raw(`INSERT INTO tenant_api_keys (id, tenant_id, api_key, label, is_active) VALUES ('r108-legacy', ?, ?, 'Legacy', 1)`, TENANT_ID, legacyKey).run();
      const form = await call('POST', '/webhooks/inbound/web-form', null, { api_key: legacyKey, name: 'Legacy Key', phone: '9811100110' });
      expect(form.status).toBe(200);
      const stored = (await raw(`SELECT * FROM tenant_api_keys WHERE id = 'r108-legacy'`).first()) as Record<string, any>;
      expect(stored).toMatchObject({ api_key: '', key_hash: await hashApiKey(legacyKey), key_prefix: legacyKey.slice(0, 8) });
      expect((await call('POST', '/webhooks/inbound/web-form', null, { api_key: legacyKey, name: 'Legacy Again', phone: '9811100111' })).status).toBe(200);
    });

    it('hash-api-keys converts every remaining plaintext key, once', async () => {
      await raw(
        `INSERT INTO tenant_api_keys (id, tenant_id, api_key, label, is_active) VALUES ('r108-sweep-1', ?, 'tcrm_sweepkey000000000000000000000000000000000001', 'A', 1), ('r108-sweep-2', ?, 'tcrm_sweepkey000000000000000000000000000000000002', 'B', 1)`,
        TENANT_ID,
        TENANT_ID,
      ).run();
      expect((await call('POST', '/admin/maintenance/hash-api-keys', admin)).status).toBeGreaterThanOrEqual(401);
      const first = await data(await call('POST', '/admin/maintenance/hash-api-keys', superToken));
      expect(first.hashed).toBe(2);
      const rows = await raw(`SELECT api_key, key_hash FROM tenant_api_keys WHERE id LIKE 'r108-sweep-%'`).all<any>();
      expect(rows.results.every((r) => r.api_key === '' && /^[0-9a-f]{64}$/.test(r.key_hash))).toBe(true);
      expect((await data(await call('POST', '/admin/maintenance/hash-api-keys', superToken))).hashed).toBe(0);
      const audit = await raw(`SELECT details FROM super_admin_audit_log WHERE action = 'maintenance.hash_api_keys' ORDER BY created_at DESC LIMIT 1`).first<any>();
      expect(audit?.details ?? '').not.toContain('tcrm_');
    });
  });
});
