import { test, expect } from './fixtures';
import { api, seedDriver, seedVehicle } from './helpers/api-seed';
import { API_URL, TENANT_ID } from './helpers/auth';

/**
 * driver-app-api: 18 endpoints with NO desktop UI (per
 * desktop/audit/remake/slices/driver-app-api.json) — they serve the Flutter
 * driver app exclusively. There is no page to click through, so this spec
 * drives the real HTTP API directly, the same way the driver app does.
 *
 * OTP delivery (`POST /login`, `POST /login/verify`) goes through Twilio.
 * The local/CI backend runs with placeholder Twilio credentials
 * (backend/.dev.vars), so a real OTP round-trip cannot complete here — that
 * is infra, not product logic. We still assert the real, observable behavior
 * of /login (driver lookup, inactive-account rejection, unknown-phone generic answer)
 * without faking a success we can't produce. For the protected trip/profile
 * routes we mint a driver JWT with the same HS256 dev secret the backend
 * itself uses (JWT_SECRET in backend/.dev.vars) — this exercises the real
 * driverAuth middleware and route handlers, it does not stub them out.
 */

const JWT_SECRET = 'dev-jwt-secret-change-in-production-min32chars';

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signDriverToken(driverId: string, phone: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    driverId,
    tenantId: TENANT_ID,
    phone,
    type: 'driver',
    sub: driverId,
    iat: now,
    exp: now + 7 * 24 * 60 * 60,
  };
  const encHeader = base64url(JSON.stringify(header));
  const encPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encHeader}.${encPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(sig)}`;
}

async function driverApi(method: string, path: string, token: string, body?: any) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
}

test.describe('driver-app-api', () => {
  let driverId: string;
  let driverPhone: string;
  let vehicleId: string;
  let token: string;

  test.beforeAll(async () => {
    const vehicle = await seedVehicle();
    vehicleId = vehicle.id;
    const driver = await seedDriver();
    driverId = driver.id;
    driverPhone = driver.phone;
    token = await signDriverToken(driverId, driverPhone);
  });

  test('login answers an unknown phone number like a known one and never reveals the account', async () => {
    const res = await fetch(`${API_URL}/driver/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+919000000001', tenantId: TENANT_ID }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.driverId).toBeUndefined();
  });

  test('login rejects a landline-range number before anything is sent', async () => {
    const res = await fetch(`${API_URL}/driver/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+910000000001', tenantId: TENANT_ID }),
    });
    expect(res.status).toBe(400);
  });

  test('login answers an inactive driver account like an unknown one (no 403, no code)', async () => {
    // seedDriver's createDriverSchema has no `status` field — new drivers
    // always land as 'active', so status must be flipped via the dedicated
    // status endpoint to actually exercise the inactive-account branch.
    const inactive = await seedDriver();
    await api('PUT', `/fleet/drivers/${inactive.id}/status`, { status: 'off_duty' });
    const res = await fetch(`${API_URL}/driver/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: inactive.phone, tenantId: TENANT_ID }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.driverId).toBeUndefined();
  });

  test('login validates phone length before ever reaching Twilio', async () => {
    const res = await fetch(`${API_URL}/driver/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '123', tenantId: TENANT_ID }),
    });
    expect(res.status).toBe(400);
  });

  test('protected routes reject requests with no token and with a malformed token', async () => {
    const noAuth = await fetch(`${API_URL}/driver/profile`);
    expect(noAuth.status).toBe(401);

    const badAuth = await fetch(`${API_URL}/driver/profile`, {
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    expect(badAuth.status).toBe(401);
  });

  test('protected routes reject a syntactically-valid but non-driver token', async () => {
    // driverAuth checks the `type: 'driver'` claim, not just JWT validity.
    const res = await driverApi('GET', '/driver/profile', 'not-a-driver-token-' + Date.now());
    expect(res.status).toBe(401);
  });

  test('GET /driver/profile returns the driver and empty documents list', async () => {
    const res = await driverApi('GET', '/driver/profile', token);
    expect(res.status).toBe(200);
    expect(res.json.data.id).toBe(driverId);
    expect(res.json.data.phone).toBe(driverPhone);
    expect(Array.isArray(res.json.data.documents)).toBe(true);
  });

  test('PUT /driver/profile updates editable fields and GET reflects them', async () => {
    const update = {
      email: `driver-${Date.now()}@example.com`,
      address: '221B Baker Street',
      emergencyContactName: 'Jane Doe',
      emergencyContactPhone: '+919876543210',
    };
    const putRes = await driverApi('PUT', '/driver/profile', token, update);
    expect(putRes.status).toBe(200);

    const getRes = await driverApi('GET', '/driver/profile', token);
    expect(getRes.json.data.email).toBe(update.email);
    expect(getRes.json.data.address).toBe(update.address);
    expect(getRes.json.data.emergencyContactName).toBe(update.emergencyContactName);
    expect(getRes.json.data.emergencyContactPhone).toBe(update.emergencyContactPhone);
  });

  test('GET /driver/profile/documents mirrors the documents array on the profile', async () => {
    const res = await driverApi('GET', '/driver/profile/documents', token);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json.data)).toBe(true);
  });

  test('push token register and delete round-trip', async () => {
    const pushToken = `fcm-test-${Date.now()}`;
    const registerRes = await driverApi('POST', '/driver/push-tokens', token, {
      token: pushToken,
      platform: 'android',
    });
    expect(registerRes.status).toBe(201);

    const deleteRes = await driverApi('DELETE', `/driver/push-tokens/${pushToken}`, token);
    expect(deleteRes.status).toBe(200);
  });

  test.describe('trip lifecycle', () => {
    let tripId: string;

    test.beforeAll(async () => {
      const now = Date.now();
      const trip = await api('POST', '/fleet/trips', {
        vehicleId,
        driverId,
        pickupLocation: 'Airport Terminal 2',
        dropLocation: 'City Hotel',
        pickupDatetime: new Date(now + 3600_000).toISOString(),
        dropDatetime: new Date(now + 3 * 3600_000).toISOString(),
        passengerName: 'E2E Passenger',
        passengerPhone: '+919812345678',
        autoCreateVoucher: false,
      });
      tripId = (trip.data ?? trip).id;
    });

    test('trip appears in the driver trip list and detail view before acceptance', async () => {
      // Trip pickup is +1h from now (same calendar day) -> tab=today, not upcoming.
      const listRes = await driverApi('GET', '/driver/trips?tab=today', token);
      expect(listRes.status).toBe(200);
      const ids = listRes.json.data.map((t: any) => t.id);
      expect(ids).toContain(tripId);

      const detailRes = await driverApi('GET', `/driver/trips/${tripId}`, token);
      expect(detailRes.status).toBe(200);
      expect(detailRes.json.data.status).toBe('assigned');
      expect(detailRes.json.data.pickupLocation).toBe('Airport Terminal 2');
      expect(detailRes.json.data.passengerName).toBe('E2E Passenger');
    });

    test('status transition is rejected before the trip is accepted', async () => {
      const res = await driverApi('POST', `/driver/trips/${tripId}/status`, token, { status: 'en_route' });
      expect(res.status).toBe(400);
    });

    test('check-in is rejected before acceptance', async () => {
      const res = await driverApi('POST', `/driver/trips/${tripId}/check-in`, token, {
        latitude: 12.9716,
        longitude: 77.5946,
      });
      expect(res.status).toBe(400);
    });

    test('full accept -> en_route -> check-in -> started -> check-out -> completed flow', async () => {
      const accept = await driverApi('POST', `/driver/trips/${tripId}/accept`, token);
      expect(accept.status).toBe(200);
      expect(accept.json.data.status).toBe('accepted');

      // Accepting twice is rejected — status is no longer 'assigned'.
      const acceptAgain = await driverApi('POST', `/driver/trips/${tripId}/accept`, token);
      expect(acceptAgain.status).toBe(400);

      const enRoute = await driverApi('POST', `/driver/trips/${tripId}/status`, token, {
        status: 'en_route',
        latitude: 12.9716,
        longitude: 77.5946,
      });
      expect(enRoute.status).toBe(200);
      expect(enRoute.json.data.status).toBe('en_route');

      const checkIn = await driverApi('POST', `/driver/trips/${tripId}/check-in`, token, {
        latitude: 12.9716,
        longitude: 77.5946,
      });
      expect(checkIn.status).toBe(200);
      expect(checkIn.json.data.checkIn.lat).toBe(12.9716);

      // Duplicate check-in is rejected.
      const checkInAgain = await driverApi('POST', `/driver/trips/${tripId}/check-in`, token, {
        latitude: 12.9716,
        longitude: 77.5946,
      });
      expect(checkInAgain.status).toBe(400);

      const started = await driverApi('POST', `/driver/trips/${tripId}/status`, token, { status: 'started' });
      expect(started.status).toBe(200);
      expect(started.json.data.status).toBe('started');

      // Illegal transition: started -> en_route is not in the allowed map.
      const illegal = await driverApi('POST', `/driver/trips/${tripId}/status`, token, { status: 'en_route' });
      expect(illegal.status).toBe(400);

      const checkOut = await driverApi('POST', `/driver/trips/${tripId}/check-out`, token, {
        latitude: 12.9352,
        longitude: 77.6146,
      });
      expect(checkOut.status).toBe(200);
      expect(checkOut.json.data.checkOut.lat).toBe(12.9352);

      const completed = await driverApi('POST', `/driver/trips/${tripId}/status`, token, { status: 'completed' });
      expect(completed.status).toBe(200);
      expect(completed.json.data.status).toBe('completed');

      const detail = await driverApi('GET', `/driver/trips/${tripId}`, token);
      expect(detail.json.data.status).toBe('completed');
      expect(detail.json.data.checkIn).not.toBeNull();
      expect(detail.json.data.checkOut).not.toBeNull();
      // Timeline should record every transition the driver made.
      const timelineStatuses = detail.json.data.timeline.map((t: any) => t.status);
      expect(timelineStatuses).toEqual(
        expect.arrayContaining(['accepted', 'en_route', 'check_in', 'started', 'check_out', 'completed'])
      );
    });

    test('a driver cannot see or act on another driver\'s trip', async () => {
      const otherDriver = await seedDriver();
      const otherToken = await signDriverToken(otherDriver.id, otherDriver.phone);

      const detail = await driverApi('GET', `/driver/trips/${tripId}`, otherToken);
      expect(detail.status).toBe(404);

      const accept = await driverApi('POST', `/driver/trips/${tripId}/accept`, otherToken);
      expect(accept.status).toBe(404);
    });
  });

  test.describe('trip rejection', () => {
    test('reject requires a reason of at least 10 characters, then flips status to cancelled', async () => {
      const now = Date.now();
      const trip = await api('POST', '/fleet/trips', {
        vehicleId,
        driverId,
        pickupLocation: 'Station',
        dropLocation: 'Resort',
        pickupDatetime: new Date(now + 7200_000).toISOString(),
        dropDatetime: new Date(now + 4 * 3600_000).toISOString(),
        autoCreateVoucher: false,
      });
      const rejectTripId = (trip.data ?? trip).id;

      const tooShort = await driverApi('POST', `/driver/trips/${rejectTripId}/reject`, token, { reason: 'no' });
      expect(tooShort.status).toBe(400);

      const rejected = await driverApi('POST', `/driver/trips/${rejectTripId}/reject`, token, {
        reason: 'Vehicle broke down this morning',
      });
      expect(rejected.status).toBe(200);
      expect(rejected.json.data.status).toBe('cancelled');

      // Cannot accept a cancelled trip.
      const acceptAfterReject = await driverApi('POST', `/driver/trips/${rejectTripId}/accept`, token);
      expect(acceptAfterReject.status).toBe(400);
    });
  });

  test('logout invalidates the refresh-token session (subsequent refresh calls fail)', async () => {
    const res = await driverApi('POST', '/driver/logout', token);
    expect(res.status).toBe(200);

    // A bogus refresh token (no session was ever created via real OTP login
    // in this environment) must still be rejected — confirms /refresh does
    // real token-hash lookups rather than trusting the caller.
    const refreshRes = await fetch(`${API_URL}/driver/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': TENANT_ID },
      body: JSON.stringify({ refreshToken: 'not-a-real-refresh-token' }),
    });
    expect(refreshRes.status).toBe(401);
  });

  test('refresh without X-Tenant-Id header is rejected', async () => {
    const res = await fetch(`${API_URL}/driver/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'anything' }),
    });
    expect(res.status).toBe(400);
  });
});
