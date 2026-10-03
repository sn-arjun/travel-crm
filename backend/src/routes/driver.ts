import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
import { SignJWT, jwtVerify } from 'jose';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, created, paginated, error, notFound, forbidden } from '../utils/response';
import { driverAuth } from '../middleware/driver-auth';
import { phoneLookupVariants, inPlaceholders } from '../utils/phone';
import { localDayWindowUtc, isValidTimeZone, DEFAULT_TIMEZONE } from '../utils/tz';
import {
  loginSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  tripListSchema,
  rejectTripSchema,
  updateTripStatusSchema,
  checkInOutSchema,
  updateProfileSchema,
  registerPushTokenSchema,
} from '../validators/driver';

const driver = new Hono<AppContext>();

// ============================================================================
// HELPER: JWT signing for driver tokens
// ============================================================================

/** Tenant calendar timezone from settings (key 'timezone' / 'company_timezone'); defaults to Asia/Kolkata. */
async function getTenantTimeZone(db: D1Database): Promise<string> {
  try {
    const row = await db.prepare(
      `SELECT value FROM settings WHERE key IN ('timezone', 'company_timezone') AND value IS NOT NULL AND value != ''
       ORDER BY CASE key WHEN 'timezone' THEN 0 ELSE 1 END LIMIT 1`
    ).first() as { value: string } | null;
    if (row && isValidTimeZone(row.value)) return row.value;
  } catch {
    // settings table unavailable — fall through to default
  }
  return DEFAULT_TIMEZONE;
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

async function signDriverAccessToken(
  payload: { driverId: string; tenantId: string; phone: string },
  secret: string
): Promise<string> {
  return new SignJWT({
    driverId: payload.driverId,
    tenantId: payload.tenantId,
    phone: payload.phone,
    type: 'driver',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .setSubject(payload.driverId)
    .sign(getSecretKey(secret));
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// HELPER: Tenant DB resolution for public endpoints (login, verify, refresh)
// ============================================================================

async function resolveTenantDb(c: any, tenantId: string): Promise<D1Database | null> {
  const cacheKey = `tenant:${tenantId}`;
  const cached = await c.env.CACHE.get(cacheKey, 'json') as { d1DatabaseId: string | null; status: string } | null;

  let tenantInfo: { d1DatabaseId: string | null; status: string };

  if (cached) {
    tenantInfo = cached;
  } else {
    // Inline master DB lookup (can't use drizzle here without importing schema)
    const tenant = await c.env.MASTER_DB.prepare(
      'SELECT d1_database_id, status FROM tenants WHERE id = ? LIMIT 1'
    ).bind(tenantId).first() as { d1_database_id: string | null; status: string } | null;

    if (!tenant) return null;

    tenantInfo = { d1DatabaseId: tenant.d1_database_id, status: tenant.status };
    await c.env.CACHE.put(cacheKey, JSON.stringify(tenantInfo), { expirationTtl: 300 });
  }

  if (tenantInfo.status === 'suspended' || tenantInfo.status === 'expired') return null;

  if (tenantInfo.d1DatabaseId) {
    const bindingKey = `TENANT_DB_${tenantInfo.d1DatabaseId}` as `TENANT_DB_${string}`;
    const binding = c.env[bindingKey];
    return binding ? binding : c.env.MASTER_DB;
  }
  return c.env.MASTER_DB;
}

// ============================================================================
// AUTH: OTP LOGIN (PUBLIC — no driverAuth middleware)
// ============================================================================

// Fixed OTP accepted ONLY when env TEST_MODE === 'true' (local / demo / e2e). Never echoed in responses.
const TEST_OTP = '123456';

function isTestMode(c: any): boolean {
  return c.env.TEST_MODE === 'true';
}

function twilioConfigured(c: any): boolean {
  return Boolean(c.env.TWILIO_ACCOUNT_SID && c.env.TWILIO_AUTH_TOKEN && c.env.TWILIO_VERIFY_SERVICE_SID);
}

// Send OTP
driver.post('/login', zValidator('json', loginSchema), async (c) => {
  const body = c.req.valid('json');
  const phone = body.phone;
  const tenantId = body.tenantId ?? c.req.header('X-Tenant-Id');
  if (!tenantId) return error(c, 'tenantId is required', 400);

  const db = await resolveTenantDb(c, tenantId);
  if (!db) return error(c, 'Tenant not found or inactive', 404);

  // Phones are stored as E.164 (from the app / fleet routes) or digits-only (older rows)
  const variants = phoneLookupVariants(phone);
  if (variants.length === 0) return error(c, 'Phone number is required', 400);
  const e164 = variants[0];
  const inList = inPlaceholders(variants);

  // Find driver by phone
  const driverRecord = await db.prepare(
    `SELECT id, name, phone, status FROM drivers WHERE phone IN (${inList}) AND is_deleted = 0`
  ).bind(...variants).first() as { id: string; name: string; phone: string; status: string } | null;

  if (!driverRecord) return notFound(c, 'Driver');
  if (driverRecord.status !== 'active' && driverRecord.status !== 'on_trip') {
    return forbidden(c, 'Account is inactive. Contact your company.');
  }

  // Rate limit: max 3 OTP requests per phone per 10 minutes (20 under TEST_MODE).
  // created_at is stored as an ISO string, so compare against an ISO cutoff.
  const testMode = isTestMode(c);
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const recentOtps = await db.prepare(
    `SELECT COUNT(*) as cnt FROM driver_otp_log
     WHERE phone IN (${inList}) AND created_at > ?`
  ).bind(...variants, cutoff).first() as { cnt: number } | null;

  if (recentOtps && recentOtps.cnt >= (testMode ? 20 : 3)) {
    return error(c, 'Too many OTP requests. Please wait 10 minutes.', 429);
  }

  if (!testMode) {
    if (!twilioConfigured(c)) return error(c, 'SMS provider not configured', 503);

    // Send OTP via Twilio Verify
    try {
      const resp = await fetch(
        `https://verify.twilio.com/v2/Services/${c.env.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${c.env.TWILIO_ACCOUNT_SID}:${c.env.TWILIO_AUTH_TOKEN}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: e164, Channel: 'sms' }),
        }
      );

      if (!resp.ok) {
        const err = await resp.text();
        console.error('Twilio Verify error:', err);
        return error(c, 'Failed to send OTP', 500);
      }
    } catch (e) {
      console.error('Twilio Verify error:', e);
      return error(c, 'Failed to send OTP', 500);
    }
  }

  // Log OTP request (E.164)
  const clientIp = c.req.header('CF-Connecting-IP')
    || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';

  await db.prepare(
    'INSERT INTO driver_otp_log (id, phone, tenant_id, status, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(generateId(), e164, tenantId, 'sent', clientIp, new Date().toISOString()).run();

  return success(c, {
    message: 'OTP sent',
    driverId: driverRecord.id,
    ...(testMode ? { testMode: true } : {}),
  });
});

// Verify OTP
driver.post('/login/verify', zValidator('json', verifyOtpSchema), async (c) => {
  const body = c.req.valid('json');
  const { phone, otp } = body;
  const tenantId = body.tenantId ?? c.req.header('X-Tenant-Id');
  if (!tenantId) return error(c, 'tenantId is required', 400);

  const db = await resolveTenantDb(c, tenantId);
  if (!db) return error(c, 'Tenant not found or inactive', 404);

  const variants = phoneLookupVariants(phone);
  if (variants.length === 0) return error(c, 'Phone number is required', 400);
  const e164 = variants[0];
  const inList = inPlaceholders(variants);

  if (isTestMode(c)) {
    // Local / demo: only the fixed test OTP is accepted; Twilio is never called.
    if (otp !== TEST_OTP) return error(c, 'Invalid or expired OTP', 401);
  } else {
    if (!twilioConfigured(c)) return error(c, 'SMS provider not configured', 503);

    // Verify OTP via Twilio
    try {
      const resp = await fetch(
        `https://verify.twilio.com/v2/Services/${c.env.TWILIO_VERIFY_SERVICE_SID}/VerificationChecks`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`${c.env.TWILIO_ACCOUNT_SID}:${c.env.TWILIO_AUTH_TOKEN}`)}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: e164, Code: otp }),
        }
      );

      const result = await resp.json<{ status: string }>();
      if (result.status !== 'approved') {
        return error(c, 'Invalid or expired OTP', 401);
      }
    } catch (e) {
      console.error('Twilio Verify check error:', e);
      return error(c, 'OTP verification failed', 500);
    }
  }

  // Fetch driver
  const driverRecord = await db.prepare(
    `SELECT id, name, phone, email, photo_url, rating, total_trips, status FROM drivers WHERE phone IN (${inList}) AND is_deleted = 0`
  ).bind(...variants).first();

  if (!driverRecord) return notFound(c, 'Driver');
  if (driverRecord.status !== 'active' && driverRecord.status !== 'on_trip') {
    return forbidden(c, 'Account is inactive');
  }

  // Update OTP log (UPDATE ... ORDER BY/LIMIT is unsupported in D1, so select the row id first)
  await db.prepare(
    `UPDATE driver_otp_log SET status = 'verified'
     WHERE id = (SELECT id FROM driver_otp_log WHERE phone IN (${inList}) AND status = 'sent'
                 ORDER BY created_at DESC LIMIT 1)`
  ).bind(...variants).run();

  // Generate tokens (token phone is the E.164 login phone)
  const phoneForToken = e164;
  const accessToken = await signDriverAccessToken(
    { driverId: driverRecord.id as string, tenantId, phone: phoneForToken },
    c.env.JWT_SECRET
  );

  // Secret token, not a DB id: the crypto.randomUUID() half supplies unpredictable randomness
  // (UUIDv7 is time-ordered), so it is intentionally kept.
  const refreshToken = generateId() + '-' + crypto.randomUUID();
  const refreshHash = await hashToken(refreshToken);

  // Store refresh token (30 day expiry)
  await db.prepare(
    `INSERT INTO driver_refresh_tokens (id, driver_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, datetime('now', '+30 days'), ?)`
  ).bind(generateId(), driverRecord.id, refreshHash, new Date().toISOString()).run();

  return success(c, {
    accessToken,
    refreshToken,
    driver: {
      id: driverRecord.id,
      name: driverRecord.name,
      phone: driverRecord.phone,
      email: driverRecord.email,
      photoUrl: driverRecord.photo_url,
      rating: driverRecord.rating,
      totalTrips: driverRecord.total_trips,
    },
  });
});

// Refresh token
driver.post('/refresh', zValidator('json', refreshTokenSchema), async (c) => {
  const { refreshToken } = c.req.valid('json');

  // Refresh token contains tenantId hint — we need to decode the JWT to get it
  // But refresh endpoint is public, so we need tenantId from somewhere
  // The client should include tenantId in the body
  // For now, we'll also accept it from a custom header
  const tenantId = c.req.header('X-Tenant-Id');
  if (!tenantId) return error(c, 'Tenant ID is required (X-Tenant-Id header)', 400);

  const db = await resolveTenantDb(c, tenantId);
  if (!db) return error(c, 'Tenant not found or inactive', 404);

  const tokenHash = await hashToken(refreshToken);

  const storedToken = await db.prepare(
    `SELECT rt.*, d.id as did, d.name, d.phone, d.status
     FROM driver_refresh_tokens rt
     JOIN drivers d ON d.id = rt.driver_id
     WHERE rt.token_hash = ? AND rt.expires_at > datetime('now')`
  ).bind(tokenHash).first();

  if (!storedToken) return error(c, 'Invalid or expired refresh token', 401);
  if (storedToken.status !== 'active' && storedToken.status !== 'on_trip') {
    return forbidden(c, 'Account is inactive');
  }

  // Delete old refresh token (rotation)
  await db.prepare('DELETE FROM driver_refresh_tokens WHERE token_hash = ?').bind(tokenHash).run();

  // Issue new tokens
  const newAccessToken = await signDriverAccessToken(
    { driverId: storedToken.did as string, tenantId, phone: storedToken.phone as string },
    c.env.JWT_SECRET
  );

  // Secret token, not a DB id: random half intentionally crypto.randomUUID() (see login).
  const newRefreshToken = generateId() + '-' + crypto.randomUUID();
  const newRefreshHash = await hashToken(newRefreshToken);

  await db.prepare(
    `INSERT INTO driver_refresh_tokens (id, driver_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, datetime('now', '+30 days'), ?)`
  ).bind(generateId(), storedToken.did, newRefreshHash, new Date().toISOString()).run();

  return success(c, { accessToken: newAccessToken, refreshToken: newRefreshToken });
});

// ============================================================================
// PROTECTED ROUTES — All below require driverAuth
// ============================================================================

driver.use('/*', driverAuth);

// Logout
driver.post('/logout', async (c) => {
  const driverId = c.get('userId'); // driverId stored in userId slot
  const db = c.get('tenantDb');

  // Delete all refresh tokens for this driver
  await db.prepare('DELETE FROM driver_refresh_tokens WHERE driver_id = ?').bind(driverId).run();

  // Deactivate all push tokens
  await db.prepare(
    'UPDATE driver_push_tokens SET is_active = 0, updated_at = ? WHERE driver_id = ?'
  ).bind(new Date().toISOString(), driverId).run();

  return success(c, { message: 'Logged out' });
});

// ============================================================================
// TRIPS: LIST, DETAIL, ACCEPT, REJECT (TICKET-329)
// ============================================================================

driver.get('/trips', zValidator('query', tripListSchema), async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.get('userId');
  const { tab, page, limit } = c.req.valid('query');
  const offset = (page - 1) * limit;

  // "Today" follows the tenant's calendar day (trips are stored as UTC ISO strings).
  const timeZone = await getTenantTimeZone(db);
  const { startIso, endIso } = localDayWindowUtc(timeZone);

  let dateFilter = '';
  const dateParams: string[] = [];
  let orderBy = 'ta.pickup_datetime ASC';

  switch (tab) {
    case 'today':
      dateFilter = 'AND ta.pickup_datetime >= ? AND ta.pickup_datetime < ?';
      dateParams.push(startIso, endIso);
      break;
    case 'upcoming':
      dateFilter = `AND ta.pickup_datetime >= ? AND ta.status IN ('assigned', 'accepted')`;
      dateParams.push(endIso);
      break;
    case 'past':
      dateFilter = `AND (ta.status IN ('completed', 'cancelled') OR ta.pickup_datetime < ?)`;
      dateParams.push(startIso);
      orderBy = 'ta.pickup_datetime DESC';
      break;
  }

  const countResult = await db.prepare(`
    SELECT COUNT(*) as count FROM trip_assignments ta
    WHERE ta.driver_id = ? AND ta.is_deleted = 0 ${dateFilter}
  `).bind(driverId, ...dateParams).first() as { count: number } | null;
  const total = countResult?.count ?? 0;

  const rows = await db.prepare(`
    SELECT ta.id, ta.pickup_location, ta.drop_location, ta.pickup_datetime, ta.drop_datetime,
           ta.status, ta.passenger_name, ta.passenger_phone, ta.special_instructions,
           ta.pickup_lat, ta.pickup_lng, ta.drop_lat, ta.drop_lng,
           ta.accepted_at, ta.en_route_at, ta.started_at, ta.completed_at, ta.created_at,
           v.registration_number as vehicle_registration, v.type as vehicle_type,
           v.make as vehicle_make, v.model as vehicle_model,
           l.title as lead_title
    FROM trip_assignments ta
    LEFT JOIN vehicles v ON v.id = ta.vehicle_id
    LEFT JOIN leads l ON l.id = ta.lead_id
    WHERE ta.driver_id = ? AND ta.is_deleted = 0 ${dateFilter}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(driverId, ...dateParams, limit, offset).all();

  const trips = (rows.results || []).map(formatTripForDriver);
  return paginated(c, trips, total, page, limit);
});

driver.get('/trips/:id', async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.get('userId');
  const tripId = c.req.param('id');

  const trip = await db.prepare(`
    SELECT ta.*,
           v.registration_number as vehicle_registration, v.type as vehicle_type,
           v.make as vehicle_make, v.model as vehicle_model, v.color as vehicle_color,
           v.seating_capacity as vehicle_capacity,
           l.title as lead_title
    FROM trip_assignments ta
    LEFT JOIN vehicles v ON v.id = ta.vehicle_id
    LEFT JOIN leads l ON l.id = ta.lead_id
    WHERE ta.id = ? AND ta.driver_id = ? AND ta.is_deleted = 0
  `).bind(tripId, driverId).first();

  if (!trip) return notFound(c, 'Trip');

  // Get timeline
  const timeline = await db.prepare(
    'SELECT * FROM trip_timeline WHERE trip_id = ? ORDER BY created_at ASC'
  ).bind(tripId).all();

  return success(c, {
    ...formatTripForDriver(trip),
    checkIn: trip.check_in_at ? {
      at: trip.check_in_at,
      lat: trip.check_in_lat,
      lng: trip.check_in_lng,
      photoUrl: trip.check_in_photo_url,
    } : null,
    checkOut: trip.check_out_at ? {
      at: trip.check_out_at,
      lat: trip.check_out_lat,
      lng: trip.check_out_lng,
      photoUrl: trip.check_out_photo_url,
    } : null,
    timeline: (timeline.results || []).map(t => ({
      id: t.id,
      status: t.status,
      notes: t.notes,
      latitude: t.latitude,
      longitude: t.longitude,
      createdAt: t.created_at,
    })),
  });
});

// Accept trip
driver.post('/trips/:id/accept', async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.get('userId');
  const tripId = c.req.param('id');
  const now = new Date().toISOString();

  const trip = await db.prepare(
    'SELECT id, status FROM trip_assignments WHERE id = ? AND driver_id = ? AND is_deleted = 0'
  ).bind(tripId, driverId).first();

  if (!trip) return notFound(c, 'Trip');
  if (trip.status !== 'assigned') return error(c, 'Trip can only be accepted when status is "assigned"', 400);

  await db.batch([
    db.prepare(
      'UPDATE trip_assignments SET status = ?, accepted_at = ?, updated_at = ? WHERE id = ?'
    ).bind('accepted', now, now, tripId),
    db.prepare(
      `INSERT INTO trip_timeline (id, trip_id, status, changed_by_driver, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(generateId(), tripId, 'accepted', driverId, 'Accepted by driver', now),
  ]);

  return success(c, { message: 'Trip accepted', status: 'accepted' });
});

// Reject trip
driver.post('/trips/:id/reject', zValidator('json', rejectTripSchema), async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.get('userId');
  const tripId = c.req.param('id');
  const { reason } = c.req.valid('json');
  const now = new Date().toISOString();

  const trip = await db.prepare(
    'SELECT id, status FROM trip_assignments WHERE id = ? AND driver_id = ? AND is_deleted = 0'
  ).bind(tripId, driverId).first();

  if (!trip) return notFound(c, 'Trip');
  if (trip.status !== 'assigned') return error(c, 'Trip can only be rejected when status is "assigned"', 400);

  await db.batch([
    db.prepare(
      'UPDATE trip_assignments SET status = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?'
    ).bind('cancelled', now, reason, now, tripId),
    db.prepare(
      `INSERT INTO trip_timeline (id, trip_id, status, changed_by_driver, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(generateId(), tripId, 'cancelled', driverId, `Rejected by driver: ${reason}`, now),
  ]);

  return success(c, { message: 'Trip rejected', status: 'cancelled' });
});

// ============================================================================
// TRIP STATUS UPDATE (TICKET-335)
// ============================================================================

const DRIVER_VALID_TRANSITIONS: Record<string, string[]> = {
  accepted: ['en_route'],
  en_route: ['started'],
  started: ['completed'],
};

driver.post('/trips/:id/status', zValidator('json', updateTripStatusSchema), async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.get('userId');
  const tripId = c.req.param('id');
  const { status: newStatus, latitude, longitude, notes } = c.req.valid('json');
  const now = new Date().toISOString();

  const trip = await db.prepare(
    'SELECT * FROM trip_assignments WHERE id = ? AND driver_id = ? AND is_deleted = 0'
  ).bind(tripId, driverId).first();

  if (!trip) return notFound(c, 'Trip');

  const currentStatus = trip.status as string;
  const allowed = DRIVER_VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    return error(c, `Cannot transition from '${currentStatus}' to '${newStatus}'`, 400);
  }

  // Build update
  const updateData: Record<string, any> = { status: newStatus, updated_at: now };
  switch (newStatus) {
    case 'en_route': updateData.en_route_at = now; break;
    case 'started': updateData.started_at = now; break;
    case 'completed': updateData.completed_at = now; break;
  }

  const sets = Object.keys(updateData).map(k => `${k} = ?`).join(', ');

  const batch = [
    db.prepare(`UPDATE trip_assignments SET ${sets} WHERE id = ?`)
      .bind(...Object.values(updateData), tripId),
    db.prepare(
      `INSERT INTO trip_timeline (id, trip_id, status, changed_by_driver, latitude, longitude, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(generateId(), tripId, newStatus, driverId, latitude ?? null, longitude ?? null, notes ?? null, now),
  ];

  // Update vehicle and driver statuses
  if (newStatus === 'started') {
    if (trip.vehicle_id) batch.push(
      db.prepare("UPDATE vehicles SET status = 'on_trip', updated_at = ? WHERE id = ?").bind(now, trip.vehicle_id)
    );
    batch.push(
      db.prepare("UPDATE drivers SET status = 'on_trip', updated_at = ? WHERE id = ?").bind(now, driverId)
    );
  } else if (newStatus === 'completed') {
    if (trip.vehicle_id) batch.push(
      db.prepare("UPDATE vehicles SET status = 'available', updated_at = ? WHERE id = ?").bind(now, trip.vehicle_id)
    );
    batch.push(
      db.prepare("UPDATE drivers SET status = 'active', total_trips = total_trips + 1, updated_at = ? WHERE id = ?").bind(now, driverId)
    );
  }

  await db.batch(batch);

  // M20: Auto-generate invoice on trip completion (non-blocking)
  if (newStatus === 'completed') {
    try {
      const completedTrip = await db.prepare('SELECT * FROM trip_assignments WHERE id = ?').bind(tripId).first();
      if (completedTrip && !completedTrip.invoice_id && completedTrip.contact_id) {
        const { generateTripInvoice } = await import('../services/trip-invoice-generator');
        await generateTripInvoice(db, completedTrip, (completedTrip.assigned_by as string) ?? driverId);
      }
    } catch {
      // Invoice generation failure should not block status update
    }
  }

  return success(c, { message: `Status updated to ${newStatus}`, status: newStatus });
});

// ============================================================================
// CHECK-IN / CHECK-OUT (TICKET-333)
// ============================================================================

driver.post('/trips/:id/check-in', zValidator('json', checkInOutSchema), async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.get('userId');
  const tenantId = c.get('tenantId');
  const tripId = c.req.param('id');
  const { latitude, longitude, photo } = c.req.valid('json');
  const now = new Date().toISOString();

  const trip = await db.prepare(
    'SELECT id, status, check_in_at FROM trip_assignments WHERE id = ? AND driver_id = ? AND is_deleted = 0'
  ).bind(tripId, driverId).first();

  if (!trip) return notFound(c, 'Trip');
  if (trip.check_in_at) return error(c, 'Already checked in', 400);
  if (!['accepted', 'en_route'].includes(trip.status as string)) {
    return error(c, 'Trip cannot be checked in at current status', 400);
  }

  let photoUrl: string | null = null;
  if (photo) {
    try {
      const photoBuffer = Uint8Array.from(atob(photo), ch => ch.charCodeAt(0));
      if (photoBuffer.length > 5 * 1024 * 1024) return error(c, 'Photo too large (max 5MB)', 400);

      const r2Key = `${tenantId}/fleet/trips/${tripId}/checkin.jpg`;
      await c.env.FILE_STORAGE.put(r2Key, photoBuffer, {
        httpMetadata: { contentType: 'image/jpeg' },
      });
      photoUrl = r2Key;
    } catch (e) {
      console.error('Photo upload error:', e);
      return error(c, 'Failed to upload photo', 500);
    }
  }

  await db.batch([
    db.prepare(`
      UPDATE trip_assignments SET check_in_at = ?, check_in_lat = ?, check_in_lng = ?,
        check_in_photo_url = ?, updated_at = ? WHERE id = ?
    `).bind(now, latitude, longitude, photoUrl, now, tripId),
    db.prepare(
      `INSERT INTO trip_timeline (id, trip_id, status, changed_by_driver, latitude, longitude, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(generateId(), tripId, 'check_in', driverId, latitude, longitude, 'Driver checked in', now),
  ]);

  return success(c, {
    message: 'Checked in',
    checkIn: { at: now, lat: latitude, lng: longitude, photoUrl },
  });
});

driver.post('/trips/:id/check-out', zValidator('json', checkInOutSchema), async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.get('userId');
  const tenantId = c.get('tenantId');
  const tripId = c.req.param('id');
  const { latitude, longitude, photo } = c.req.valid('json');
  const now = new Date().toISOString();

  const trip = await db.prepare(
    'SELECT id, status, check_out_at FROM trip_assignments WHERE id = ? AND driver_id = ? AND is_deleted = 0'
  ).bind(tripId, driverId).first();

  if (!trip) return notFound(c, 'Trip');
  if (trip.check_out_at) return error(c, 'Already checked out', 400);
  if (!['started'].includes(trip.status as string)) {
    return error(c, 'Trip cannot be checked out at current status', 400);
  }

  let photoUrl: string | null = null;
  if (photo) {
    try {
      const photoBuffer = Uint8Array.from(atob(photo), ch => ch.charCodeAt(0));
      if (photoBuffer.length > 5 * 1024 * 1024) return error(c, 'Photo too large (max 5MB)', 400);

      const r2Key = `${tenantId}/fleet/trips/${tripId}/checkout.jpg`;
      await c.env.FILE_STORAGE.put(r2Key, photoBuffer, {
        httpMetadata: { contentType: 'image/jpeg' },
      });
      photoUrl = r2Key;
    } catch (e) {
      console.error('Photo upload error:', e);
      return error(c, 'Failed to upload photo', 500);
    }
  }

  await db.batch([
    db.prepare(`
      UPDATE trip_assignments SET check_out_at = ?, check_out_lat = ?, check_out_lng = ?,
        check_out_photo_url = ?, updated_at = ? WHERE id = ?
    `).bind(now, latitude, longitude, photoUrl, now, tripId),
    db.prepare(
      `INSERT INTO trip_timeline (id, trip_id, status, changed_by_driver, latitude, longitude, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(generateId(), tripId, 'check_out', driverId, latitude, longitude, 'Driver checked out', now),
  ]);

  return success(c, {
    message: 'Checked out',
    checkOut: { at: now, lat: latitude, lng: longitude, photoUrl },
  });
});

// ============================================================================
// PROFILE (TICKET-338)
// ============================================================================

driver.get('/profile', async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.get('userId');

  const driverRecord = await db.prepare(`
    SELECT id, name, phone, email, photo_url, license_number, license_expiry,
           address, emergency_contact_name, emergency_contact_phone,
           status, rating, total_trips, date_of_joining, created_at
    FROM drivers WHERE id = ? AND is_deleted = 0
  `).bind(driverId).first();

  if (!driverRecord) return notFound(c, 'Driver');

  // Get documents
  const docs = await db.prepare(
    `SELECT id, type, document_number, file_url, file_name, expiry_date, issued_date, is_active, created_at
     FROM driver_documents WHERE driver_id = ? AND is_active = 1 ORDER BY created_at DESC`
  ).bind(driverId).all();

  // Check license expiry warning (30 days)
  let licenseExpiryWarning = false;
  if (driverRecord.license_expiry) {
    const expiry = new Date(driverRecord.license_expiry as string);
    const daysUntil = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    licenseExpiryWarning = daysUntil <= 30 && daysUntil > 0;
  }

  return success(c, {
    id: driverRecord.id,
    name: driverRecord.name,
    phone: driverRecord.phone,
    email: driverRecord.email,
    photoUrl: driverRecord.photo_url,
    licenseNumber: driverRecord.license_number,
    licenseExpiry: driverRecord.license_expiry,
    licenseExpiryWarning,
    address: driverRecord.address,
    emergencyContactName: driverRecord.emergency_contact_name,
    emergencyContactPhone: driverRecord.emergency_contact_phone,
    status: driverRecord.status,
    rating: driverRecord.rating,
    totalTrips: driverRecord.total_trips,
    dateOfJoining: driverRecord.date_of_joining,
    createdAt: driverRecord.created_at,
    documents: (docs.results || []).map(d => ({
      id: d.id,
      type: d.type,
      documentNumber: d.document_number,
      fileUrl: d.file_url,
      fileName: d.file_name,
      expiryDate: d.expiry_date,
      issuedDate: d.issued_date,
      createdAt: d.created_at,
    })),
  });
});

driver.put('/profile', zValidator('json', updateProfileSchema), async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.get('userId');
  const data = c.req.valid('json');
  const now = new Date().toISOString();

  const updates: Record<string, any> = { updated_at: now };
  if (data.email !== undefined) updates.email = data.email || null;
  if (data.address !== undefined) updates.address = data.address || null;
  if (data.emergencyContactName !== undefined) updates.emergency_contact_name = data.emergencyContactName || null;
  if (data.emergencyContactPhone !== undefined) updates.emergency_contact_phone = data.emergencyContactPhone || null;

  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  await db.prepare(`UPDATE drivers SET ${sets} WHERE id = ? AND is_deleted = 0`)
    .bind(...Object.values(updates), driverId).run();

  return success(c, { message: 'Profile updated' });
});

driver.post('/profile/photo', async (c) => {
  const db = c.get('tenantDb');
  const tenantId = c.get('tenantId');
  const driverId = c.get('userId');
  const r2 = c.env.FILE_STORAGE;

  const formData = await c.req.formData();
  const file = formData.get('photo') as File | null;
  if (!file) return error(c, 'No photo provided', 400);
  if (file.size > 5 * 1024 * 1024) return error(c, 'File too large (max 5MB)', 400);

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) return error(c, 'Invalid file type', 400);

  // Delete old photo
  const existing = await db.prepare('SELECT photo_url FROM drivers WHERE id = ?').bind(driverId).first();
  if (existing?.photo_url) {
    try { await r2.delete(existing.photo_url as string); } catch {}
  }

  const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const key = `${tenantId}/fleet/drivers/${driverId}/photo.${ext}`;
  await r2.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  await db.prepare('UPDATE drivers SET photo_url = ?, updated_at = ? WHERE id = ?')
    .bind(key, new Date().toISOString(), driverId).run();

  return success(c, { photoUrl: key });
});

driver.get('/profile/documents', async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.get('userId');

  const docs = await db.prepare(
    `SELECT id, type, document_number, file_url, file_name, expiry_date, issued_date, is_active, created_at
     FROM driver_documents WHERE driver_id = ? AND is_active = 1 ORDER BY created_at DESC`
  ).bind(driverId).all();

  return success(c, (docs.results || []).map(d => ({
    id: d.id,
    type: d.type,
    documentNumber: d.document_number,
    fileUrl: d.file_url,
    fileName: d.file_name,
    expiryDate: d.expiry_date,
    issuedDate: d.issued_date,
    createdAt: d.created_at,
  })));
});

driver.post('/profile/documents', async (c) => {
  const db = c.get('tenantDb');
  const tenantId = c.get('tenantId');
  const driverId = c.get('userId');
  const r2 = c.env.FILE_STORAGE;

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const docType = formData.get('type') as string;
  const docNumber = formData.get('documentNumber') as string || null;
  const expiryDate = formData.get('expiryDate') as string || null;
  const issuedDate = formData.get('issuedDate') as string || null;

  const validTypes = ['license', 'id_proof', 'police_verification'];
  if (!docType || !validTypes.includes(docType)) return error(c, 'Invalid document type', 400);
  if (!file) return error(c, 'No file provided', 400);
  if (file.size > 10 * 1024 * 1024) return error(c, 'File too large (max 10MB)', 400);

  // Deactivate previous docs of same type
  await db.prepare(
    "UPDATE driver_documents SET is_active = 0, updated_at = ? WHERE driver_id = ? AND type = ? AND is_active = 1"
  ).bind(new Date().toISOString(), driverId, docType).run();

  const docId = generateId();
  const ext = file.name.split('.').pop() || 'pdf';
  const key = `${tenantId}/fleet/drivers/${driverId}/documents/${docType}/${docId}.${ext}`;
  await r2.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO driver_documents (id, driver_id, type, document_number, file_url, file_name, expiry_date, issued_date, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(docId, driverId, docType, docNumber, key, file.name, expiryDate, issuedDate, now, now).run();

  return created(c, {
    id: docId,
    type: docType,
    documentNumber: docNumber,
    fileUrl: key,
    fileName: file.name,
    expiryDate,
    issuedDate,
  });
});

// ============================================================================
// PUSH TOKENS (TICKET-339)
// ============================================================================

driver.post('/push-tokens', zValidator('json', registerPushTokenSchema), async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.get('userId');
  const { token, platform } = c.req.valid('json');
  const now = new Date().toISOString();

  // Deactivate any existing token with same FCM token (could be from another device)
  await db.prepare(
    'UPDATE driver_push_tokens SET is_active = 0, updated_at = ? WHERE fcm_token = ?'
  ).bind(now, token).run();

  // Insert new active token
  await db.prepare(`
    INSERT INTO driver_push_tokens (id, driver_id, fcm_token, platform, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `).bind(generateId(), driverId, token, platform ?? null, now, now).run();

  return created(c, { message: 'Push token registered' });
});

driver.delete('/push-tokens/:token', async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.get('userId');
  const token = c.req.param('token');

  await db.prepare(
    'UPDATE driver_push_tokens SET is_active = 0, updated_at = ? WHERE fcm_token = ? AND driver_id = ?'
  ).bind(new Date().toISOString(), token, driverId).run();

  return success(c, { message: 'Push token deactivated' });
});

// ============================================================================
// HELPERS
// ============================================================================

function formatTripForDriver(row: any) {
  return {
    id: row.id,
    pickupLocation: row.pickup_location,
    dropLocation: row.drop_location,
    pickupDatetime: row.pickup_datetime,
    dropDatetime: row.drop_datetime,
    status: row.status,
    passengerName: row.passenger_name,
    passengerPhone: row.passenger_phone,
    specialInstructions: row.special_instructions,
    pickupLat: row.pickup_lat ?? null,
    pickupLng: row.pickup_lng ?? null,
    dropLat: row.drop_lat ?? null,
    dropLng: row.drop_lng ?? null,
    acceptedAt: row.accepted_at,
    enRouteAt: row.en_route_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    vehicle: row.vehicle_registration ? {
      registration: row.vehicle_registration,
      type: row.vehicle_type,
      make: row.vehicle_make,
      model: row.vehicle_model,
      color: row.vehicle_color,
      capacity: row.vehicle_capacity,
    } : null,
    leadTitle: row.lead_title,
    createdAt: row.created_at,
  };
}

export default driver;
