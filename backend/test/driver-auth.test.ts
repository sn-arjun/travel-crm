import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { localDayWindowUtc } from '../src/utils/tz';
import { generateId } from '../src/utils/uuid';

const baseEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

// ── Helpers ────────────────────────────────────────────────────────

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; headers?: Record<string, string>; token?: string; bindings?: Record<string, unknown> } = {},
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const init: RequestInit = { method, headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  // `bindings` overrides env vars for this request only (e.g. TEST_MODE='false').
  const e = opts.bindings ? { ...baseEnv, ...opts.bindings } : baseEnv;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost${path}`, init), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const NO_TWILIO = { TEST_MODE: 'false', TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', TWILIO_VERIFY_SERVICE_SID: '' };

let adminToken = '';

async function createDriver(name: string, phone: string): Promise<string> {
  const res = await call('POST', '/api/v1/fleet/drivers', { token: adminToken, body: { name, phone } });
  expect(res.status).toBe(201);
  const body: any = await res.json();
  return body.data.id;
}

async function login(phone: string, otp = '123456', extra: Record<string, unknown> = { tenantId: TENANT_ID }) {
  const send = await call('POST', '/api/v1/driver/login', { body: { phone, ...extra } });
  if (send.status !== 200) return { send, verify: null as Response | null };
  const verify = await call('POST', '/api/v1/driver/login/verify', { body: { phone, otp, ...extra } });
  return { send, verify };
}

async function tokenFor(phone: string): Promise<string> {
  const { verify } = await login(phone);
  const body: any = await verify!.json();
  return body.data.accessToken;
}

// ── Setup ──────────────────────────────────────────────────────────

describe('Driver auth (TEST_MODE OTP bypass, phone formats, tenantId)', () => {
  beforeAll(async () => {
    await applyD1Migrations(baseEnv.MASTER_DB, baseEnv.TEST_MIGRATIONS);
    const reset = await call('POST', '/api/v1/test/reset');
    expect(reset.status).toBe(200);

    const loginRes = await call('POST', '/api/v1/auth/login', {
      body: { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID },
    });
    expect(loginRes.status).toBe(200);
    adminToken = ((await loginRes.json()) as any).data.accessToken;
  });

  describe('TEST_MODE bypass', () => {
    it('logs in with OTP 123456 for an E.164 phone and returns an access token', async () => {
      await createDriver('Ravi Kumar', '+919876543210');
      const { send, verify } = await login('+919876543210');
      expect(send.status).toBe(200);
      const sendBody: any = await send.json();
      expect(sendBody.data.message).toBe('OTP sent');
      expect(sendBody.data.testMode).toBe(true);
      expect(typeof sendBody.data.driverId).toBe('string');
      // The OTP itself must never be echoed.
      expect(JSON.stringify(sendBody)).not.toContain('123456');

      expect(verify!.status).toBe(200);
      const body: any = await verify!.json();
      expect(body.data.accessToken).toBeTruthy();
      expect(body.data.refreshToken).toBeTruthy();
      expect(body.data.driver.name).toBe('Ravi Kumar');
    });

    it('rejects a wrong OTP with 401', async () => {
      const { verify } = await login('+919876543210', '654321');
      expect(verify!.status).toBe(401);
      const body: any = await verify!.json();
      expect(body.error.message).toBe('Invalid or expired OTP');
    });

    it('refuses the bypass when TEST_MODE is not "true"', async () => {
      const res = await call('POST', '/api/v1/driver/login/verify', {
        body: { phone: '+919876543210', tenantId: TENANT_ID, otp: '123456' },
        bindings: { ...NO_TWILIO },
      });
      expect(res.status).not.toBe(200);
      const body: any = await res.json();
      expect(body.data?.accessToken).toBeUndefined();
    });

    it('answers 503 "SMS provider not configured" (not 500) when TEST_MODE is off and Twilio is missing', async () => {
      const send = await call('POST', '/api/v1/driver/login', {
        body: { phone: '+919876543210', tenantId: TENANT_ID },
        bindings: { ...NO_TWILIO },
      });
      expect(send.status).toBe(503);
      expect(((await send.json()) as any).error.message).toBe('SMS provider not configured');

      const verify = await call('POST', '/api/v1/driver/login/verify', {
        body: { phone: '+919876543210', tenantId: TENANT_ID, otp: '123456' },
        bindings: { ...NO_TWILIO },
      });
      expect(verify.status).toBe(503);
    });

    it('marks the latest OTP log row as verified (UPDATE with sub-select works on D1)', async () => {
      const { verify } = await login('+919876543210');
      expect(verify!.status).toBe(200);
      const row = await baseEnv.MASTER_DB
        .prepare(`SELECT status, phone FROM driver_otp_log WHERE phone = ? ORDER BY created_at DESC LIMIT 1`)
        .bind('+919876543210')
        .first();
      expect(row).toBeTruthy();
      expect(row.status).toBe('verified');
    });
  });

  describe('tenantId resolution', () => {
    it('accepts tenantId from the X-Tenant-Id header', async () => {
      const send = await call('POST', '/api/v1/driver/login', {
        body: { phone: '+919876543210' },
        headers: { 'X-Tenant-Id': TENANT_ID },
      });
      expect(send.status).toBe(200);
      const verify = await call('POST', '/api/v1/driver/login/verify', {
        body: { phone: '+919876543210', otp: '123456' },
        headers: { 'X-Tenant-Id': TENANT_ID },
      });
      expect(verify.status).toBe(200);
      expect(((await verify.json()) as any).data.accessToken).toBeTruthy();
    });

    it('returns 400 "tenantId is required" when neither body nor header has it', async () => {
      const send = await call('POST', '/api/v1/driver/login', { body: { phone: '+919876543210' } });
      expect(send.status).toBe(400);
      expect(((await send.json()) as any).error.message).toBe('tenantId is required');

      const verify = await call('POST', '/api/v1/driver/login/verify', {
        body: { phone: '+919876543210', otp: '123456' },
      });
      expect(verify.status).toBe(400);
      expect(((await verify.json()) as any).error.message).toBe('tenantId is required');
    });
  });

  describe('phone formats', () => {
    it('stores E.164 when a driver is created with a digits-only phone, and logs in with +91 and digits', async () => {
      const id = await createDriver('Suresh Nair', '9811064270');
      const row = await baseEnv.MASTER_DB.prepare('SELECT phone FROM drivers WHERE id = ?').bind(id).first();
      expect(row.phone).toBe('+919811064270');

      for (const phone of ['+919811064270', '9811064270', '09811064270', '919811064270']) {
        const { send, verify } = await login(phone);
        expect(send.status).toBe(200);
        expect(verify!.status).toBe(200);
      }
    });

    it('a driver stored digits-only (legacy row) logs in with +91 format, and vice versa', async () => {
      const now = new Date().toISOString();
      await baseEnv.MASTER_DB
        .prepare(`INSERT INTO drivers (id, tenant_id, name, phone, status, is_deleted, created_at, updated_at)
                  VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`)
        .bind(generateId(), TENANT_ID, 'Legacy Digits', '9820144562', now, now)
        .run();

      const a = await login('+919820144562');
      expect(a.send.status).toBe(200);
      expect(a.verify!.status).toBe(200);

      // vice versa: stored with + , logging in with digits only
      const b = await login('9876543210');
      expect(b.send.status).toBe(200);
      expect(b.verify!.status).toBe(200);
    });

    it('rejects a duplicate phone written in a different format', async () => {
      const res = await call('POST', '/api/v1/fleet/drivers', {
        token: adminToken,
        body: { name: 'Duplicate', phone: '98765 43210' },
      });
      expect(res.status).toBe(409);
    });

    it('returns 404 for an unknown driver', async () => {
      const send = await call('POST', '/api/v1/driver/login', {
        body: { phone: '+919000000000', tenantId: TENANT_ID },
      });
      expect(send.status).toBe(404);
    });
  });

  describe('OTP rate limit', () => {
    it('counts only requests newer than 10 minutes (ISO cutoff) and limits to 3 outside TEST_MODE', async () => {
      await createDriver('Rate Limited', '+919000011111');
      const insert = (iso: string) =>
        baseEnv.MASTER_DB
          .prepare(`INSERT INTO driver_otp_log (id, phone, tenant_id, status, ip_address, created_at) VALUES (?, ?, ?, 'sent', 'test', ?)`)
          .bind(generateId(), '+919000011111', TENANT_ID, iso)
          .run();

      // 5 old requests from earlier today (ISO "T" format) must not count.
      for (let i = 0; i < 5; i++) await insert(new Date(Date.now() - (30 + i) * 60_000).toISOString());
      const notLimited = await call('POST', '/api/v1/driver/login', {
        body: { phone: '+919000011111', tenantId: TENANT_ID },
        bindings: { ...NO_TWILIO },
      });
      expect(notLimited.status).toBe(503); // got past the rate limit; Twilio missing

      // 3 recent requests -> 429
      for (let i = 0; i < 3; i++) await insert(new Date(Date.now() - i * 1000).toISOString());
      const limited = await call('POST', '/api/v1/driver/login', {
        body: { phone: '+919000011111', tenantId: TENANT_ID },
        bindings: { ...NO_TWILIO },
      });
      expect(limited.status).toBe(429);

      // TEST_MODE allows up to 20 per window
      const testMode = await call('POST', '/api/v1/driver/login', {
        body: { phone: '+919000011111', tenantId: TENANT_ID },
      });
      expect(testMode.status).toBe(200);
    });
  });

  describe('GET /driver/trips tabs and coordinates', () => {
    const PHONE = '+919000022222';
    let driverToken = '';
    let driverId = '';
    const tripIds: Record<string, string> = {};

    async function addTrip(key: string, pickupIso: string, status: string, extra: Record<string, unknown> = {}) {
      const id = generateId();
      tripIds[key] = id;
      const now = new Date().toISOString();
      await baseEnv.MASTER_DB
        .prepare(`INSERT INTO trip_assignments
          (id, tenant_id, driver_id, pickup_location, drop_location, pickup_datetime, status, passenger_name,
           pickup_lat, pickup_lng, drop_lat, drop_lng, is_deleted, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
        .bind(
          id, TENANT_ID, driverId, 'Kochi Airport', 'Fort Kochi', pickupIso, status, 'Arjun Mehta',
          extra.pickupLat ?? null, extra.pickupLng ?? null, extra.dropLat ?? null, extra.dropLng ?? null,
          now, now,
        )
        .run();
      return id;
    }

    async function listTab(tab: string): Promise<any> {
      const res = await call('GET', `/api/v1/driver/trips?tab=${tab}`, { token: driverToken });
      expect(res.status).toBe(200);
      return res.json();
    }

    beforeAll(async () => {
      driverId = await createDriver('Trip Driver', PHONE);
      driverToken = await tokenFor(PHONE);

      const { startIso, endIso } = localDayWindowUtc('Asia/Kolkata');
      const start = new Date(startIso).getTime();
      const end = new Date(endIso).getTime();
      await addTrip('early', new Date(start + 60 * 60_000).toISOString(), 'assigned', {
        pickupLat: 9.9312, pickupLng: 76.2673, dropLat: 9.9658, dropLng: 76.2421,
      }); // 01:00 IST today
      await addTrip('late', new Date(end - 30 * 60_000).toISOString(), 'accepted'); // 23:30 IST today
      await addTrip('yesterday', new Date(start - 60_000).toISOString(), 'assigned'); // 23:59 IST yesterday
      await addTrip('tomorrow', new Date(end + 60_000).toISOString(), 'assigned'); // 00:01 IST tomorrow
      await addTrip('tomorrowEnRoute', new Date(end + 2 * 3600_000).toISOString(), 'en_route');
      await addTrip('doneToday', new Date(start + 5 * 3600_000).toISOString(), 'completed');
    });

    it('today tab includes a trip at 01:00 IST and 23:30 IST, but not yesterday 23:59 or tomorrow 00:01', async () => {
      const body = await listTab('today');
      const ids = body.data.map((t: any) => t.id);
      expect(ids).toContain(tripIds.early);
      expect(ids).toContain(tripIds.late);
      expect(ids).not.toContain(tripIds.yesterday);
      expect(ids).not.toContain(tripIds.tomorrow);
    });

    it('upcoming tab only has assigned/accepted trips after today', async () => {
      const body = await listTab('upcoming');
      const ids = body.data.map((t: any) => t.id);
      expect(ids).toContain(tripIds.tomorrow);
      expect(ids).not.toContain(tripIds.early);
      expect(ids).not.toContain(tripIds.tomorrowEnRoute);
    });

    it('today and upcoming never list cancelled or rejected trips (they stay in past)', async () => {
      const { startIso, endIso } = localDayWindowUtc('Asia/Kolkata');
      const start = new Date(startIso).getTime();
      const end = new Date(endIso).getTime();
      const cancelledToday = await addTrip('cancelledToday', new Date(start + 8 * 3600_000).toISOString(), 'cancelled');
      const rejectedToday = await addTrip('rejectedToday', new Date(start + 9 * 3600_000).toISOString(), 'rejected');
      const cancelledTomorrow = await addTrip('cancelledTomorrow', new Date(end + 3 * 3600_000).toISOString(), 'cancelled');

      const today = (await listTab('today')).data.map((t: any) => t.id);
      expect(today).not.toContain(cancelledToday);
      expect(today).not.toContain(rejectedToday);
      expect(today).toContain(tripIds.early);

      const upcoming = (await listTab('upcoming')).data.map((t: any) => t.id);
      expect(upcoming).not.toContain(cancelledTomorrow);
      expect(upcoming).toContain(tripIds.tomorrow);

      const past = (await listTab('past')).data.map((t: any) => t.id);
      expect(past).toContain(cancelledToday);
    });

    it('past tab has earlier-than-today trips and completed/cancelled trips', async () => {
      const body = await listTab('past');
      const ids = body.data.map((t: any) => t.id);
      expect(ids).toContain(tripIds.yesterday);
      expect(ids).toContain(tripIds.doneToday);
      expect(ids).not.toContain(tripIds.tomorrow);
    });

    it('keeps the paginated {page, limit, total, hasMore} shape', async () => {
      const res = await call('GET', '/api/v1/driver/trips?tab=today&page=1&limit=1', { token: driverToken });
      const body: any = await res.json();
      expect(body.pagination).toMatchObject({ page: 1, limit: 1 });
      expect(body.pagination.total).toBeGreaterThanOrEqual(3);
      expect(body.pagination.hasMore).toBe(true);
    });

    it('list and detail responses include pickup/drop coordinates (null when unset)', async () => {
      const list = await listTab('today');
      const early = list.data.find((t: any) => t.id === tripIds.early);
      expect(early).toMatchObject({ pickupLat: 9.9312, pickupLng: 76.2673, dropLat: 9.9658, dropLng: 76.2421 });
      const late = list.data.find((t: any) => t.id === tripIds.late);
      expect(late).toMatchObject({ pickupLat: null, pickupLng: null, dropLat: null, dropLng: null });

      const detail = await call('GET', `/api/v1/driver/trips/${tripIds.early}`, { token: driverToken });
      expect(detail.status).toBe(200);
      const d: any = await detail.json();
      expect(d.data).toMatchObject({ pickupLat: 9.9312, pickupLng: 76.2673, dropLat: 9.9658, dropLng: 76.2421 });

      const detailNull = await call('GET', `/api/v1/driver/trips/${tripIds.late}`, { token: driverToken });
      const dn: any = await detailNull.json();
      expect(dn.data.pickupLat).toBeNull();
      expect(dn.data.dropLng).toBeNull();
    });

    it('honours the tenant timezone setting', async () => {
      // Pacific/Auckland is ~+12/13h from UTC; pick a trip that is "today" there but not in IST.
      const tz = 'Pacific/Auckland';
      await baseEnv.MASTER_DB
        .prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('timezone', ?, ?)`)
        .bind(tz, new Date().toISOString())
        .run();
      try {
        const win = localDayWindowUtc(tz);
        const probe = await addTrip('nz', new Date(new Date(win.startIso).getTime() + 30 * 60_000).toISOString(), 'assigned');
        const body = await listTab('today');
        expect(body.data.map((t: any) => t.id)).toContain(probe);
      } finally {
        await baseEnv.MASTER_DB.prepare(`DELETE FROM settings WHERE key = 'timezone'`).run();
      }
    });
  });
});

describe('localDayWindowUtc', () => {
  it('Asia/Kolkata at 00:30 IST uses the new local day', () => {
    // 2026-10-03T19:00Z = 2026-10-04 00:30 IST
    const w = localDayWindowUtc('Asia/Kolkata', new Date('2026-10-03T19:00:00Z'));
    expect(w).toEqual({ startIso: '2026-10-03T18:30:00.000Z', endIso: '2026-10-04T18:30:00.000Z' });
  });

  it('Asia/Kolkata at 23:30 IST still uses the same local day', () => {
    // 2026-10-03T18:00Z = 2026-10-03 23:30 IST
    const w = localDayWindowUtc('Asia/Kolkata', new Date('2026-10-03T18:00:00Z'));
    expect(w).toEqual({ startIso: '2026-10-02T18:30:00.000Z', endIso: '2026-10-03T18:30:00.000Z' });
  });

  it('handles DST days (23-hour day in New York)', () => {
    const w = localDayWindowUtc('America/New_York', new Date('2026-03-08T12:00:00Z'));
    expect(w).toEqual({ startIso: '2026-03-08T05:00:00.000Z', endIso: '2026-03-09T04:00:00.000Z' });
  });

  it('falls back to Asia/Kolkata for an invalid zone', () => {
    const w = localDayWindowUtc('Not/AZone', new Date('2026-10-03T19:00:00Z'));
    expect(w.startIso).toBe('2026-10-03T18:30:00.000Z');
  });
});

describe('CORS', () => {
  it('allows a preflight from http://localhost:3110 with X-Tenant-Id', async () => {
    const res = await call('OPTIONS', '/api/v1/driver/login', {
      headers: {
        Origin: 'http://localhost:3110',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-tenant-id',
      },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3110');
    expect((res.headers.get('access-control-allow-headers') ?? '').toLowerCase()).toContain('x-tenant-id');
  });

  it('refuses arbitrary ports outside dev/test mode and unknown origins always', async () => {
    const prod = await call('OPTIONS', '/api/v1/driver/login', {
      headers: { Origin: 'http://localhost:3110', 'Access-Control-Request-Method': 'POST' },
      bindings: { TEST_MODE: 'false', ENVIRONMENT: 'production' },
    });
    expect(prod.headers.get('access-control-allow-origin')).toBeNull();

    const evil = await call('OPTIONS', '/api/v1/driver/login', {
      headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' },
    });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('still allows the fixed origins and *.pages.dev', async () => {
    for (const origin of ['http://localhost:3100', 'https://travelcrm.pages.dev']) {
      const res = await call('OPTIONS', '/api/v1/driver/login', {
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
        bindings: { TEST_MODE: 'false' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    }
  });
});
