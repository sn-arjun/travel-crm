#!/usr/bin/env node
// Seeds the data the driver app smoke / demo flow needs, through the public
// API. No dependencies (Node 18+ fetch).
//
//   API_URL=http://localhost:8817/api/v1 node tool/seed_smoke.mjs
//
// Idempotent: re-running reuses the vehicle and driver, and creates a fresh
// trip only when the driver has no open one. Prints `TRIP_ID=<id>` last.

const API_URL = (process.env.API_URL ?? 'http://localhost:8787/api/v1').replace(/\/$/, '');
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@demo.com';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin@123';
// The agency is found the way the app finds it: by its agency code (the agency slug).
const AGENCY_CODE = process.env.AGENCY_CODE ?? 'demo';
let tenantId = '';

const VEHICLE = {
  registrationNumber: 'KA 05 MN 4521',
  type: 'sedan',
  make: 'Toyota',
  model: 'Camry',
  seatingCapacity: 4,
};
const DRIVER = {
  name: 'Ravi Kumar',
  phone: '9876543210',
  licenseNumber: 'KL-0720190012345',
};

let token = '';

async function call(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON body
  }
  return { status: res.status, json };
}

function must(res, what) {
  if (res.status >= 400 || res.json?.success === false) {
    throw new Error(`${what} failed (${res.status}): ${JSON.stringify(res.json)}`);
  }
  return res.json?.data ?? res.json;
}

function rows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

const digits = (s) => String(s ?? '').replace(/\D/g, '');

async function resolveAgency() {
  const res = await call('GET', `/driver/agency/${encodeURIComponent(AGENCY_CODE)}`);
  tenantId = must(res, `agency code ${AGENCY_CODE}`).tenantId;
}

async function login() {
  await resolveAgency();
  const res = await call('POST', '/auth/login', {
    email: EMAIL,
    password: PASSWORD,
    tenantId,
  });
  token = must(res, 'admin login').accessToken;
  if (!token) throw new Error('admin login returned no accessToken');
}

async function ensureVehicle() {
  const found = rows(
    must(await call('GET', `/fleet/vehicles?search=${encodeURIComponent(VEHICLE.registrationNumber)}&limit=50`), 'list vehicles'),
  ).find((v) => (v.registrationNumber ?? v.registration_number) === VEHICLE.registrationNumber);
  if (found) return found;
  return must(await call('POST', '/fleet/vehicles', VEHICLE), 'create vehicle');
}

async function ensureDriver() {
  const found = rows(
    must(await call('GET', `/fleet/drivers?search=${DRIVER.phone}&limit=50`), 'list drivers'),
  ).find((d) => digits(d.phone).endsWith(DRIVER.phone));
  if (found) {
    if (found.status && found.status !== 'active' && found.status !== 'on_trip') {
      await call('PUT', `/fleet/drivers/${found.id}/status`, { status: 'active' });
    }
    return found;
  }
  const created = must(await call('POST', '/fleet/drivers', DRIVER), 'create driver');
  // New drivers may start as inactive; make sure the app can log in.
  await call('PUT', `/fleet/drivers/${created.id}/status`, { status: 'active' });
  return created;
}

async function setSchedule(tripId, pickup) {
  const drop = new Date(pickup.getTime() + 60 * 60 * 1000);
  must(
    await call('PUT', `/fleet/trips/${tripId}`, {
      pickupDatetime: pickup.toISOString(),
      dropDatetime: drop.toISOString(),
    }),
    'reschedule trip',
  );
}

/** True when the driver app's "today" tab lists the trip (needs TEST_MODE for the OTP). */
async function listedToday(tripId) {
  const saved = token;
  try {
    const phone = '+91' + DRIVER.phone;
    await call('POST', '/driver/login', { tenantId, phone });
    token = '';
    const res = await call('POST', '/driver/login/verify', { tenantId, phone, otp: '123456' });
    const driverToken = res.json?.data?.accessToken;
    if (!driverToken) return true; // cannot check (not TEST_MODE); assume fine
    token = driverToken;
    const list = await call('GET', '/driver/trips?tab=today&limit=50');
    return rows(list.json?.data ?? list.json).some((t) => t.id === tripId);
  } finally {
    token = saved;
  }
}

async function ensureTrip(vehicle, driver) {
  const open = rows(
    must(await call('GET', `/fleet/trips?driverId=${driver.id}&limit=50`), 'list trips'),
  ).find((t) => t.status === 'assigned');
  const pickup = new Date(Date.now() + 60 * 60 * 1000);
  const drop = new Date(pickup.getTime() + 60 * 60 * 1000);
  if (open) {
    // Move a leftover assigned trip to ~1h from now so it shows under "today".
    await setSchedule(open.id, pickup);
    return open;
  }
  const res = await call('POST', '/fleet/trips', {
    vehicleId: vehicle.id,
    driverId: driver.id,
    pickupLocation: 'Cochin International Airport',
    dropLocation: 'Vembanad Lake Resort, Kumarakom',
    pickupDatetime: pickup.toISOString(),
    dropDatetime: drop.toISOString(),
    passengerName: 'Arjun Mehta',
    passengerPhone: '+919820144562',
    specialInstructions: 'Flight 6E 6171 lands at 10:20. Name board please.',
    pickupLat: 10.152,
    pickupLng: 76.4019,
    dropLat: 9.6177,
    dropLng: 76.43,
  });
  return must(res, 'create trip');
}

/** now + 60 min can fall after the tenant's midnight; then use a closer pickup. */
async function ensureToday(trip) {
  if (await listedToday(trip.id)) return;
  await setSchedule(trip.id, new Date(Date.now() + 2 * 60 * 1000));
  if (!(await listedToday(trip.id))) {
    throw new Error('seeded trip is not listed under the drivers today tab');
  }
  console.error('note: pickup moved to now+2min because now+60min is past the tenant midnight');
}

try {
  await login();
  const vehicle = await ensureVehicle();
  const driver = await ensureDriver();
  const trip = await ensureTrip(vehicle, driver);
  await ensureToday(trip);
  console.log(`VEHICLE_ID=${vehicle.id}`);
  console.log(`DRIVER_ID=${driver.id}`);
  console.log(`TRIP_ID=${trip.id}`);
} catch (e) {
  console.error(String(e?.message ?? e));
  process.exit(1);
}
