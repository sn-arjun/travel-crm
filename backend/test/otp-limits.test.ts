import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { bumpCatalogueVersion } from '../src/services/plans/catalogue';
import { checkMobileNumber } from '../src/services/metering/otp-limits';

/**
 * R110: login-code abuse limits and the agency's monthly login-code cap. Twilio Verify is never reached for real:
 * fetch is mocked, and TEST_MODE is switched off per request so the real limits (not the 20x test limits) apply.
 */

const testEnv = env as any;
const STRICT = { ...testEnv, TEST_MODE: 'false' };
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const REGISTERED = '+919811100001';

const db = (sql: string, ...binds: unknown[]) => (testEnv.MASTER_DB as D1Database).prepare(sql).bind(...binds);

async function post(path: string, body: unknown, ip: string, e: any = STRICT): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify(body),
    }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

const sendOtp = (phone: string, ip: string, e: any = STRICT) => post('/auth/send-otp', { phone, tenantId: TENANT_ID }, ip, e);
const driverLogin = (phone: string, ip: string, e: any = STRICT) => post('/driver/login', { phone, tenantId: TENANT_ID }, ip, e);

async function setOtpAllowance(n: number) {
  await db(`UPDATE plan_allowances SET monthly_amount = ? WHERE plan_key = 'pro' AND allowance_key = 'otp'`, n).run();
  await bumpCatalogueVersion(testEnv);
}

let ipCounter = 0;
const freshIp = () => `198.51.100.${(++ipCounter % 250) + 1}`;

describe('login-code abuse limits and cap (R110)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    const ctx = createExecutionContext();
    const reset = await worker.fetch(new Request('http://localhost/api/v1/test/reset', { method: 'POST' }), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(reset.status).toBe(200);
    await db(
      `INSERT OR REPLACE INTO tenant_users (id, tenant_id, email, phone, user_id, role, is_active) VALUES ('r110-tu', ?, 'otp-user@r110.test', ?, 'r110-user', 'salesperson', 1)`,
      TENANT_ID, REGISTERED,
    ).run();
    const now = new Date().toISOString();
    await db(
      `INSERT OR REPLACE INTO drivers (id, tenant_id, name, phone, status, is_deleted, created_at, updated_at) VALUES ('r110-driver', ?, 'R110 Driver', '+919811100002', 'active', 0, ?, ?)`,
      TENANT_ID, now, now,
    ).run();
  });

  beforeEach(async () => {
    await db('DELETE FROM otp_requests').run();
    await db('DELETE FROM driver_otp_log').run();
    await db('DELETE FROM tenant_usage_caps WHERE tenant_id = ?', TENANT_ID).run();
    await db('DELETE FROM usage_alerts WHERE tenant_id = ?', TENANT_ID).run();
    await setOtpAllowance(500);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await setOtpAllowance(12);
    await db('DELETE FROM otp_requests').run();
  });

  const verifyCalls = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter((c) => String(c[0]).includes('verify.twilio.com')).length;

  const verifyOk = () => new Response(JSON.stringify({ status: 'pending' }), { status: 201 });

  describe('abuse limits', () => {
    it('the 4th code request in 10 minutes for one phone is a 429, whatever the IP', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => verifyOk());
      for (let i = 0; i < 3; i++) expect((await sendOtp(REGISTERED, freshIp())).status).toBe(200);
      const fourth = await sendOtp(REGISTERED, freshIp());
      expect(fourth.status).toBe(429);
      expect(Number(fourth.headers.get('Retry-After'))).toBeGreaterThan(0);
    });

    it('the 11th request in a day for one phone is a 429 even when the 10 minute window is clear', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => verifyOk());
      const earlier = new Date(Date.now() - 3 * 3600_000).toISOString();
      const { hashDestination } = await import('../src/services/metering/otp-limits');
      const hash = await hashDestination(REGISTERED);
      for (let i = 0; i < 10; i++) {
        await db(`INSERT INTO otp_requests (id, tenant_id, destination_hash, ip, purpose, created_at) VALUES (?, ?, ?, '203.0.113.9', 'login', ?)`, `r110-day-${i}`, TENANT_ID, hash, earlier).run();
      }
      expect((await sendOtp(REGISTERED, freshIp())).status).toBe(429);
    });

    it('the 21st request from one IP in an hour is a 429', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => verifyOk());
      const ip = '203.0.113.77';
      for (let i = 0; i < 20; i++) expect((await sendOtp(`+9198111${String(10000 + i)}`, ip)).status).toBe(200);
      const twentyFirst = await sendOtp('+919811199999', ip);
      expect(twentyFirst.status).toBe(429);
      // a different network is not affected
      expect((await sendOtp('+919811188888', freshIp())).status).toBe(200);
    });

    it('rejects premium-rate and landline-range numbers before anything is sent', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      for (const phone of ['+19005551234', '+4491234567', '+911123456789', '+910000000001', '+4915']) {
        expect((await sendOtp(phone, freshIp())).status).toBe(400);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(checkMobileNumber('+919811100001')).toEqual({ ok: true, e164: '+919811100001' });
      expect(checkMobileNumber('09811100001').ok).toBe(true);
      expect(checkMobileNumber('+14155550100').ok).toBe(true);
    });

    it('never reveals whether a phone exists: a registered and an unknown number get the same answer', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => verifyOk());
      const known = await sendOtp(REGISTERED, freshIp());
      const unknown = await sendOtp('+919811177777', freshIp());
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(await unknown.json()).toEqual(await known.json());
      // only the registered number caused a provider call
      expect(verifyCalls(fetchSpy)).toBe(1);
      // an unknown driver is answered like a known one
      const driver = await driverLogin('+919811166666', freshIp());
      expect(driver.status).toBe(200);
      expect(((await driver.json()) as any).data.driverId).toBeUndefined();
    });

    it('stores only a hash of the number', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => verifyOk());
      await sendOtp(REGISTERED, freshIp());
      const row = await db('SELECT destination_hash FROM otp_requests LIMIT 1').first<{ destination_hash: string }>();
      expect(row?.destination_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain('9811100001');
    });
  });

  describe('agency cap', () => {
    it('an agency at its login-code cap gets a 402 that points to the password, and the provider is not called', async () => {
      await setOtpAllowance(1);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => verifyOk());
      expect((await sendOtp(REGISTERED, freshIp())).status).toBe(200);
      expect(verifyCalls(fetchSpy)).toBe(1);

      const second = await sendOtp(REGISTERED, freshIp());
      expect(second.status).toBe(402);
      const body = (await second.json()) as any;
      expect(body).toMatchObject({ success: false, code: 'ALLOWANCE_EXHAUSTED', channel: 'otp', passwordLogin: true });
      expect(body.message.toLowerCase()).toContain('password');
      expect(verifyCalls(fetchSpy)).toBe(1);
      // an unknown number gets the same refusal, so the cap does not leak which numbers exist
      expect((await sendOtp('+919811155555', freshIp())).status).toBe(402);
      // the agency admins were alerted (100%)
      const alert = await db(`SELECT COUNT(*) AS n FROM usage_alerts WHERE tenant_id = ? AND cap_key = 'otp_per_month' AND threshold = 100`, TENANT_ID).first<{ n: number }>();
      expect(alert?.n).toBe(1);
    });

    it('a code the provider failed to send does not use the allowance', async () => {
      await setOtpAllowance(1);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ message: 'bad' }), { status: 400 }));
      expect((await sendOtp(REGISTERED, freshIp())).status).toBe(500);
      const row = await db(`SELECT current_usage FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = 'otp_per_month'`, TENANT_ID).first<{ current_usage: number }>();
      expect(row?.current_usage).toBe(0);
    });

    it('driver login: the cap answers 402 with a clear message, and the 4th request in 10 minutes is a 429', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => verifyOk());
      await setOtpAllowance(1);
      expect((await driverLogin('+919811100002', freshIp())).status).toBe(200);
      const capped = await driverLogin('+919811100002', freshIp());
      expect(capped.status).toBe(402);
      expect(((await capped.json()) as any).message).toContain('password');

      await setOtpAllowance(500);
      await db('DELETE FROM otp_requests').run();
      await db('DELETE FROM driver_otp_log').run();
      for (let i = 0; i < 3; i++) expect((await driverLogin('+919811100002', freshIp())).status).toBe(200);
      expect((await driverLogin('+919811100002', freshIp())).status).toBe(429);
    });
  });

  describe('logs', () => {
    it('codes never appear in logs', async () => {
      const lines: string[] = [];
      for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(' ')); });
      }
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ status: 'approved' }), { status: 200 }));
      // the code a person types, and the fixed code accepted in TEST_MODE
      await post('/auth/verify-otp', { phone: REGISTERED, otp: '654321', tenantId: TENANT_ID }, freshIp());
      await post('/driver/login/verify', { phone: '+919811100002', otp: '123456', tenantId: TENANT_ID }, freshIp(), testEnv);
      await driverLogin('+919811100002', freshIp(), testEnv);
      const everything = lines.join('\n');
      expect(everything).not.toContain('654321');
      expect(everything).not.toContain('123456');
    });
  });
});
