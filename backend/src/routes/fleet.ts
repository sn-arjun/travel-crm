import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, created, paginated, error, notFound } from '../utils/response';
import { generateId } from '../utils/uuid';
import { normalizePhone, phoneLookupVariants, inPlaceholders, tenantPhoneCountry } from '../utils/phone';
import { logActivity } from '../utils/activity-logger';
import { loadLocaleContext } from '../utils/money';
import { tenantToday, tenantTimeZone, addDaysLocal, daysBetweenLocal, localMonthWindow } from '../utils/tz';
import {
  createVehicleSchema, updateVehicleSchema, vehicleStatusSchema, vehicleListSchema,
  createDriverSchema, updateDriverSchema, driverStatusSchema, driverListSchema, rateDriverSchema,
  createTripSchema, updateTripSchema, tripStatusSchema, tripListSchema,
  createTripCostSchema, createMaintenanceSchema,
  availabilitySchema, scheduleSchema,
  createRateCardSchema, updateRateCardSchema, rateCardListSchema, rateCardLookupSchema,
  costEstimateSchema, calculateDistanceSchema,
  tripStopsBodySchema, stopWhereSchema, addTripPassengerSchema, tickPassengerSchema,
} from '../validators/fleet';
import { requireFeature } from '../middleware/feature-gate';
import { resolveFeature } from '../services/features/resolve';
import { DepartureError, departureErrorResponse, guarded } from '../services/departures/common';
import {
  addPassenger, headcountOf, listPassengersGrouped, listStops, removePassenger, replaceStops, setStopStatus, tickPassenger,
  type CoachCtx,
} from '../services/fleet/coach-trips';
import { calculateTripCost, calculateDistance, type RateCard } from '../services/trip-cost-calculator';

const fleet = new Hono<AppContext>();

// ============================================================================
// VEHICLE CRUD (TICKET-307)
// ============================================================================

// List vehicles
fleet.get('/vehicles', zValidator('query', vehicleListSchema), async (c) => {
  const db = c.get('tenantDb');
  const { page, limit, status, type, search, availableFrom, availableTo, sortBy, sortOrder } = c.req.valid('query');
  const offset = (page - 1) * limit;

  const conditions: string[] = ['v.is_deleted = 0'];
  const params: any[] = [];

  if (status) { conditions.push('v.status = ?'); params.push(status); }
  if (type) { conditions.push('v.type = ?'); params.push(type); }
  if (search) {
    conditions.push('(v.registration_number LIKE ? OR v.make LIKE ? OR v.model LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Availability filter: exclude vehicles with overlapping trips
  if (availableFrom && availableTo) {
    conditions.push(`v.id NOT IN (
      SELECT ta.vehicle_id FROM trip_assignments ta
      WHERE ta.is_deleted = 0 AND ta.status NOT IN ('completed', 'cancelled')
        AND ta.pickup_datetime <= ? AND ta.drop_datetime >= ?
        AND ta.vehicle_id IS NOT NULL
    )`);
    params.push(availableTo, availableFrom);
  }

  const whereClause = conditions.join(' AND ');
  const orderCol = sortBy || 'created_at';
  const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const countResult = await db.prepare(
    `SELECT COUNT(*) as count FROM vehicles v WHERE ${whereClause}`
  ).bind(...params).first<{ count: number }>();
  const total = countResult?.count ?? 0;

  const rows = await db.prepare(`
    SELECT v.* FROM vehicles v
    WHERE ${whereClause}
    ORDER BY v.${orderCol} ${orderDir}
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return paginated(c, (rows.results || []).map(parseVehicle), total, page, limit);
});

// ============================================================================
// VEHICLE AVAILABILITY CALENDAR (TICKET-312)
// ============================================================================

fleet.get('/vehicles/availability', zValidator('query', availabilitySchema), async (c) => {
  const db = c.get('tenantDb');
  const { from, to, type } = c.req.valid('query');

  // Validate max 90 days
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if ((toDate.getTime() - fromDate.getTime()) / 86400000 > 90) {
    return error(c, 'Date range cannot exceed 90 days', 400);
  }

  const vehicleConditions = ['v.is_deleted = 0'];
  const vehicleParams: any[] = [];
  if (type) { vehicleConditions.push('v.type = ?'); vehicleParams.push(type); }

  const allVehicles = await db.prepare(
    `SELECT v.id, v.registration_number, v.type, v.status, v.seating_capacity
     FROM vehicles v WHERE ${vehicleConditions.join(' AND ')}
     ORDER BY v.registration_number`
  ).bind(...vehicleParams).all();

  // Get overlapping trips
  const trips = await db.prepare(`
    SELECT ta.vehicle_id, ta.pickup_datetime, ta.drop_datetime, ta.passenger_name, ta.status as trip_status, ta.id as trip_id
    FROM trip_assignments ta
    WHERE ta.is_deleted = 0 AND ta.status NOT IN ('completed', 'cancelled')
      AND ta.pickup_datetime <= ? AND ta.drop_datetime >= ?
      AND ta.vehicle_id IS NOT NULL
  `).bind(to, from).all();

  const tripsByVehicle = new Map<string, any[]>();
  for (const trip of (trips.results || [])) {
    const arr = tripsByVehicle.get(trip.vehicle_id as string) || [];
    arr.push(trip);
    tripsByVehicle.set(trip.vehicle_id as string, arr);
  }

  const result = (allVehicles.results || []).map((v: any) => ({
    vehicleId: v.id,
    registrationNumber: v.registration_number,
    type: v.type,
    status: v.status,
    seatingCapacity: v.seating_capacity,
    trips: (tripsByVehicle.get(v.id) || []).map((t: any) => ({
      tripId: t.trip_id,
      pickupDatetime: t.pickup_datetime,
      dropDatetime: t.drop_datetime,
      passengerName: t.passenger_name,
      status: t.trip_status,
    })),
  }));

  return success(c, result);
});

// Get vehicle by ID
fleet.get('/vehicles/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const vehicle = await db.prepare(
    'SELECT * FROM vehicles WHERE id = ? AND is_deleted = 0'
  ).bind(id).first();
  if (!vehicle) return notFound(c, 'Vehicle');

  // Get active documents
  const docs = await db.prepare(
    'SELECT * FROM vehicle_documents WHERE vehicle_id = ? AND is_active = 1 ORDER BY type'
  ).bind(id).all();

  // Get upcoming trips
  const trips = await db.prepare(`
    SELECT ta.*, d.name as driver_name, d.phone as driver_phone
    FROM trip_assignments ta
    LEFT JOIN drivers d ON d.id = ta.driver_id
    WHERE ta.vehicle_id = ? AND ta.is_deleted = 0
      AND ta.status NOT IN ('completed', 'cancelled')
    ORDER BY ta.pickup_datetime ASC LIMIT 5
  `).bind(id).all();

  // Active trip
  const activeTrip = await db.prepare(`
    SELECT ta.*, d.name as driver_name, d.phone as driver_phone
    FROM trip_assignments ta
    LEFT JOIN drivers d ON d.id = ta.driver_id
    WHERE ta.vehicle_id = ? AND ta.status IN ('accepted', 'en_route', 'started')
    LIMIT 1
  `).bind(id).all();

  // Documents expiring within 30 days
  const { today: now } = await tenantToday(c);
  const thirtyDays = addDaysLocal(now, 30);
  const expiringDocs = await db.prepare(`
    SELECT * FROM vehicle_documents
    WHERE vehicle_id = ? AND is_active = 1 AND expiry_date <= ? AND expiry_date >= ?
  `).bind(id, thirtyDays, now).all();

  return success(c, {
    ...parseVehicle(vehicle),
    documents: (docs.results || []).map((r: any) => parseVehicleDocument(r, now)),
    upcomingTrips: (trips.results || []).map(parseTripRow),
    activeTrip: activeTrip.results?.[0] ? parseTripRow(activeTrip.results[0]) : null,
    documentsExpiringSoon: (expiringDocs.results || []).map((r: any) => parseVehicleDocument(r, now)),
  });
});

// Create vehicle
fleet.post('/vehicles', zValidator('json', createVehicleSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');
  const id = generateId();
  const now = new Date().toISOString();

  // Check unique registration number
  const existing = await db.prepare(
    'SELECT id FROM vehicles WHERE registration_number = ? AND is_deleted = 0'
  ).bind(data.registrationNumber).first();
  if (existing) return error(c, 'Vehicle with this registration number already exists', 409);

  await db.prepare(`
    INSERT INTO vehicles (id, tenant_id, registration_number, type, make, model, year, seating_capacity, color, notes, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, tenantId, data.registrationNumber, data.type,
    data.make ?? null, data.model ?? null, data.year ?? null,
    data.seatingCapacity ?? null, data.color ?? null, data.notes ?? null,
    userId, now, now,
  ).run();

  await logActivity(db as any, {
    userId, action: 'create', entityType: 'vehicle', entityId: id,
    details: JSON.stringify({ registrationNumber: data.registrationNumber }),
    ipAddress: c.get('clientIp'),
  });

  const row = await db.prepare('SELECT * FROM vehicles WHERE id = ?').bind(id).first();
  return created(c, parseVehicle(row!));
});

// Update vehicle
fleet.put('/vehicles/:id', zValidator('json', updateVehicleSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const now = new Date().toISOString();

  const existing = await db.prepare(
    'SELECT * FROM vehicles WHERE id = ? AND is_deleted = 0'
  ).bind(id).first();
  if (!existing) return notFound(c, 'Vehicle');

  // Check unique reg if changing
  if (data.registrationNumber && data.registrationNumber !== existing.registration_number) {
    const dup = await db.prepare(
      'SELECT id FROM vehicles WHERE registration_number = ? AND is_deleted = 0 AND id != ?'
    ).bind(data.registrationNumber, id).first();
    if (dup) return error(c, 'Vehicle with this registration number already exists', 409);
  }

  const sets: string[] = ['updated_at = ?'];
  const params: any[] = [now];

  if (data.registrationNumber !== undefined) { sets.push('registration_number = ?'); params.push(data.registrationNumber); }
  if (data.type !== undefined) { sets.push('type = ?'); params.push(data.type); }
  if (data.make !== undefined) { sets.push('make = ?'); params.push(data.make); }
  if (data.model !== undefined) { sets.push('model = ?'); params.push(data.model); }
  if (data.year !== undefined) { sets.push('year = ?'); params.push(data.year); }
  if (data.seatingCapacity !== undefined) { sets.push('seating_capacity = ?'); params.push(data.seatingCapacity); }
  if (data.color !== undefined) { sets.push('color = ?'); params.push(data.color); }
  if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes); }

  params.push(id);
  await db.prepare(`UPDATE vehicles SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  const row = await db.prepare('SELECT * FROM vehicles WHERE id = ?').bind(id).first();
  return success(c, parseVehicle(row!));
});

// Delete vehicle (soft)
fleet.delete('/vehicles/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const userId = c.get('userId');

  // Check no active trips
  const activeTrip = await db.prepare(
    "SELECT id FROM trip_assignments WHERE vehicle_id = ? AND status NOT IN ('completed', 'cancelled') AND is_deleted = 0"
  ).bind(id).first();
  if (activeTrip) return error(c, 'Cannot delete vehicle with active trips', 400);

  await db.prepare(
    "UPDATE vehicles SET is_deleted = 1, updated_at = ? WHERE id = ?"
  ).bind(new Date().toISOString(), id).run();

  await logActivity(db as any, {
    userId, action: 'delete', entityType: 'vehicle', entityId: id,
    ipAddress: c.get('clientIp'),
  });

  return success(c, { message: 'Vehicle deleted' });
});

// Change vehicle status
fleet.put('/vehicles/:id/status', zValidator('json', vehicleStatusSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const { status: newStatus } = c.req.valid('json');
  const now = new Date().toISOString();

  const vehicle = await db.prepare(
    'SELECT * FROM vehicles WHERE id = ? AND is_deleted = 0'
  ).bind(id).first();
  if (!vehicle) return notFound(c, 'Vehicle');

  // Cannot set available if active trip exists
  if (newStatus === 'available') {
    const activeTrip = await db.prepare(
      "SELECT id FROM trip_assignments WHERE vehicle_id = ? AND status IN ('accepted', 'en_route', 'started') AND is_deleted = 0"
    ).bind(id).first();
    if (activeTrip) return error(c, 'Cannot set available while vehicle has an active trip', 400);
  }

  await db.prepare('UPDATE vehicles SET status = ?, updated_at = ? WHERE id = ?').bind(newStatus, now, id).run();

  const row = await db.prepare('SELECT * FROM vehicles WHERE id = ?').bind(id).first();
  return success(c, parseVehicle(row!));
});

// Vehicle trips
fleet.get('/vehicles/:id/trips', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const url = new URL(c.req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  const countResult = await db.prepare(
    'SELECT COUNT(*) as count FROM trip_assignments WHERE vehicle_id = ? AND is_deleted = 0'
  ).bind(id).first<{ count: number }>();
  const total = countResult?.count ?? 0;

  const rows = await db.prepare(`
    SELECT ta.*, d.name as driver_name, d.phone as driver_phone
    FROM trip_assignments ta
    LEFT JOIN drivers d ON d.id = ta.driver_id
    WHERE ta.vehicle_id = ? AND ta.is_deleted = 0
    ORDER BY ta.pickup_datetime DESC
    LIMIT ? OFFSET ?
  `).bind(id, limit, offset).all();

  return paginated(c, (rows.results || []).map(parseTripRow), total, page, limit);
});

// ============================================================================
// VEHICLE PHOTO UPLOAD (TICKET-308)
// ============================================================================

fleet.post('/vehicles/:id/photo', async (c) => {
  const db = c.get('tenantDb');
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const r2 = c.env.FILE_STORAGE;

  const vehicle = await db.prepare('SELECT id, photo_url FROM vehicles WHERE id = ? AND is_deleted = 0').bind(id).first();
  if (!vehicle) return notFound(c, 'Vehicle');

  const formData = await c.req.formData();
  const file = formData.get('photo') as File | null;
  if (!file) return error(c, 'No photo provided', 400);
  if (file.size > 5 * 1024 * 1024) return error(c, 'File too large (max 5MB)', 400);

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) return error(c, 'Invalid file type. Allowed: JPEG, PNG, WebP', 400);

  // Delete old photo if exists
  if (vehicle.photo_url) {
    try { await r2.delete(vehicle.photo_url as string); } catch {}
  }

  const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
  const key = `${tenantId}/fleet/vehicles/${id}/photo.${ext}`;
  await r2.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  await db.prepare('UPDATE vehicles SET photo_url = ?, updated_at = ? WHERE id = ?')
    .bind(key, new Date().toISOString(), id).run();

  return success(c, { photoUrl: key });
});

fleet.get('/vehicles/:id/photo', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const vehicle = await db.prepare('SELECT photo_url FROM vehicles WHERE id = ? AND is_deleted = 0').bind(id).first();
  if (!vehicle || !vehicle.photo_url) return notFound(c, 'Photo');

  // Return the key (client uses file service for signed URL)
  return success(c, { photoUrl: vehicle.photo_url });
});

// ============================================================================
// VEHICLE DOCUMENT MANAGEMENT (TICKET-309)
// ============================================================================

fleet.post('/vehicles/:id/documents', async (c) => {
  const db = c.get('tenantDb');
  const tenantId = c.get('tenantId');
  const vehicleId = c.req.param('id');
  const r2 = c.env.FILE_STORAGE;

  const vehicle = await db.prepare('SELECT id FROM vehicles WHERE id = ? AND is_deleted = 0').bind(vehicleId).first();
  if (!vehicle) return notFound(c, 'Vehicle');

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const docType = formData.get('type') as string;
  const docNumber = formData.get('documentNumber') as string || null;
  const expiryDate = formData.get('expiryDate') as string || null;
  const issuedDate = formData.get('issuedDate') as string || null;

  const validTypes = ['rc', 'insurance', 'permit', 'pollution'];
  if (!docType || !validTypes.includes(docType)) return error(c, 'Invalid document type', 400);
  if (!file) return error(c, 'No file provided', 400);
  if (file.size > 10 * 1024 * 1024) return error(c, 'File too large (max 10MB)', 400);

  // Deactivate previous documents of same type
  await db.prepare(
    "UPDATE vehicle_documents SET is_active = 0, updated_at = ? WHERE vehicle_id = ? AND type = ? AND is_active = 1"
  ).bind(new Date().toISOString(), vehicleId, docType).run();

  const docId = generateId();
  const ext = file.name.split('.').pop() || 'pdf';
  const key = `${tenantId}/fleet/vehicles/${vehicleId}/documents/${docType}/${docId}.${ext}`;
  await r2.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO vehicle_documents (id, vehicle_id, type, document_number, file_url, file_name, expiry_date, issued_date, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).bind(docId, vehicleId, docType, docNumber, key, file.name, expiryDate, issuedDate, now, now).run();

  const doc = await db.prepare('SELECT * FROM vehicle_documents WHERE id = ?').bind(docId).first();
  return created(c, parseVehicleDocument(doc!, (await tenantToday(c)).today));
});

fleet.get('/vehicles/:id/documents', async (c) => {
  const db = c.get('tenantDb');
  const vehicleId = c.req.param('id');

  const rows = await db.prepare(
    'SELECT * FROM vehicle_documents WHERE vehicle_id = ? AND is_active = 1 ORDER BY type, created_at DESC'
  ).bind(vehicleId).all();

  { const { today: todayDoc } = await tenantToday(c); return success(c, (rows.results || []).map((r: any) => parseVehicleDocument(r, todayDoc))); }
});

fleet.get('/vehicles/:vehicleId/documents/:docId/download', async (c) => {
  const db = c.get('tenantDb');
  const docId = c.req.param('docId');

  const doc = await db.prepare('SELECT * FROM vehicle_documents WHERE id = ?').bind(docId).first();
  if (!doc || !doc.file_url) return notFound(c, 'Document');

  return success(c, { downloadUrl: doc.file_url, fileName: doc.file_name });
});

fleet.delete('/vehicles/:vehicleId/documents/:docId', async (c) => {
  const db = c.get('tenantDb');
  const docId = c.req.param('docId');

  await db.prepare("UPDATE vehicle_documents SET is_active = 0, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), docId).run();

  return success(c, { message: 'Document deactivated' });
});

// Expiring vehicle documents across fleet
fleet.get('/documents/expiring', async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);
  const days = parseInt(url.searchParams.get('days') || '30');
  const { today } = await tenantToday(c);
  const futureDate = addDaysLocal(today, days);

  const rows = await db.prepare(`
    SELECT vd.*, v.registration_number, v.type as vehicle_type, 'vehicle' as owner_type
    FROM vehicle_documents vd
    INNER JOIN vehicles v ON vd.vehicle_id = v.id
    WHERE vd.is_active = 1 AND v.is_deleted = 0 AND vd.expiry_date <= ?
    UNION ALL
    SELECT dd.*, d.name as registration_number, 'driver' as vehicle_type, 'driver' as owner_type
    FROM driver_documents dd
    INNER JOIN drivers d ON dd.driver_id = d.id
    WHERE dd.is_active = 1 AND d.is_deleted = 0 AND dd.expiry_date <= ?
    ORDER BY expiry_date ASC
  `).bind(futureDate, futureDate).all();

  const data = (rows.results || []).map((r: any) => {
    const expiryDate = r.expiry_date ? new Date(r.expiry_date) : null;
    const todayDate = new Date(today);
    const daysUntil = expiryDate ? Math.ceil((expiryDate.getTime() - todayDate.getTime()) / 86400000) : null;
    return {
      ...r,
      isExpired: daysUntil !== null && daysUntil < 0,
      daysUntilExpiry: daysUntil,
    };
  });

  return success(c, data);
});

// ============================================================================
// VEHICLE MAINTENANCE (TICKET-310)
// ============================================================================

fleet.post('/vehicles/:id/maintenance', zValidator('json', createMaintenanceSchema), async (c) => {
  const db = c.get('tenantDb');
  const vehicleId = c.req.param('id');
  const userId = c.get('userId');
  const data = c.req.valid('json');
  const id = generateId();
  const now = new Date().toISOString();

  const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ? AND is_deleted = 0').bind(vehicleId).first();
  if (!vehicle) return notFound(c, 'Vehicle');

  await db.prepare(`
    INSERT INTO vehicle_maintenance (id, vehicle_id, service_type, description, service_date, odometer_at_service, cost, vendor_name, next_service_due_date, next_service_due_km, notes, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, vehicleId, data.serviceType, data.description ?? null,
    data.serviceDate, data.odometerAtService ?? null, data.cost ?? null,
    data.vendorName ?? null, data.nextServiceDueDate ?? null, data.nextServiceDueKm ?? null,
    data.notes ?? null, userId, now,
  ).run();

  // Update vehicle fields
  const vehicleUpdates: string[] = ['updated_at = ?'];
  const vehicleParams: any[] = [now];
  vehicleUpdates.push('last_service_date = ?'); vehicleParams.push(data.serviceDate);
  if (data.nextServiceDueDate) { vehicleUpdates.push('next_service_due = ?'); vehicleParams.push(data.nextServiceDueDate); }
  if (data.odometerAtService) { vehicleUpdates.push('odometer_km = ?'); vehicleParams.push(data.odometerAtService); }

  // If vehicle was under_maintenance, set to available
  if (vehicle.status === 'under_maintenance') {
    vehicleUpdates.push('status = ?'); vehicleParams.push('available');
  }

  vehicleParams.push(vehicleId);
  await db.prepare(`UPDATE vehicles SET ${vehicleUpdates.join(', ')} WHERE id = ?`).bind(...vehicleParams).run();

  const row = await db.prepare('SELECT * FROM vehicle_maintenance WHERE id = ?').bind(id).first();
  return created(c, row);
});

fleet.get('/vehicles/:id/maintenance', async (c) => {
  const db = c.get('tenantDb');
  const vehicleId = c.req.param('id');

  const rows = await db.prepare(
    'SELECT * FROM vehicle_maintenance WHERE vehicle_id = ? ORDER BY service_date DESC'
  ).bind(vehicleId).all();

  return success(c, rows.results || []);
});

// Maintenance due across fleet
fleet.get('/maintenance/due', async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);
  const days = parseInt(url.searchParams.get('days') || '15');
  const { today } = await tenantToday(c);
  const futureDate = addDaysLocal(today, days);

  const rows = await db.prepare(`
    SELECT v.id, v.registration_number, v.type, v.next_service_due, v.odometer_km, v.last_service_date
    FROM vehicles v
    WHERE v.is_deleted = 0 AND v.next_service_due IS NOT NULL AND v.next_service_due <= ?
    ORDER BY v.next_service_due ASC
  `).bind(futureDate).all();

  return success(c, rows.results || []);
});

// Update odometer
fleet.put('/vehicles/:id/odometer', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const body = await c.req.json();
  const km = body.km;

  if (!km || typeof km !== 'number' || km < 0) return error(c, 'Invalid km value', 400);

  await db.prepare('UPDATE vehicles SET odometer_km = ?, updated_at = ? WHERE id = ? AND is_deleted = 0')
    .bind(km, new Date().toISOString(), id).run();

  return success(c, { odometerKm: km });
});

// Single vehicle availability
fleet.get('/vehicles/:id/availability', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const url = new URL(c.req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) return error(c, 'from and to are required', 400);

  const vehicle = await db.prepare('SELECT * FROM vehicles WHERE id = ? AND is_deleted = 0').bind(id).first();
  if (!vehicle) return notFound(c, 'Vehicle');

  const trips = await db.prepare(`
    SELECT ta.*, d.name as driver_name
    FROM trip_assignments ta
    LEFT JOIN drivers d ON d.id = ta.driver_id
    WHERE ta.vehicle_id = ? AND ta.is_deleted = 0
      AND ta.status NOT IN ('completed', 'cancelled')
      AND ta.pickup_datetime <= ? AND ta.drop_datetime >= ?
    ORDER BY ta.pickup_datetime
  `).bind(id, to, from).all();

  return success(c, {
    vehicle: parseVehicle(vehicle),
    trips: (trips.results || []).map(parseTripRow),
  });
});

// ============================================================================
// DRIVER CRUD (TICKET-313)
// ============================================================================

fleet.get('/drivers', zValidator('query', driverListSchema), async (c) => {
  const db = c.get('tenantDb');
  const { page, limit, status, search, availableFrom, availableTo, crewRole, sortBy, sortOrder } = c.req.valid('query');
  const offset = (page - 1) * limit;

  const conditions: string[] = ['d.is_deleted = 0'];
  const params: any[] = [];

  if (status) { conditions.push('d.status = ?'); params.push(status); }
  // R145: "driver" and "tour_leader" mean everyone who can do that job, so a person with both roles is in both lists
  if (crewRole === 'driver') conditions.push("d.crew_role IN ('driver', 'both')");
  else if (crewRole === 'tour_leader') conditions.push("d.crew_role IN ('tour_leader', 'both')");
  else if (crewRole === 'both') conditions.push("d.crew_role = 'both'");
  if (search) {
    conditions.push('(d.name LIKE ? OR d.phone LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (availableFrom && availableTo) {
    conditions.push(`d.id NOT IN (
      SELECT ta.driver_id FROM trip_assignments ta
      WHERE ta.is_deleted = 0 AND ta.status NOT IN ('completed', 'cancelled')
        AND ta.pickup_datetime <= ? AND ta.drop_datetime >= ?
        AND ta.driver_id IS NOT NULL
    )`);
    params.push(availableTo, availableFrom);
  }

  const whereClause = conditions.join(' AND ');
  const orderCol = sortBy || 'created_at';
  const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const countResult = await db.prepare(
    `SELECT COUNT(*) as count FROM drivers d WHERE ${whereClause}`
  ).bind(...params).first<{ count: number }>();
  const total = countResult?.count ?? 0;

  const rows = await db.prepare(`
    SELECT d.* FROM drivers d
    WHERE ${whereClause}
    ORDER BY d.${orderCol} ${orderDir}
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return paginated(c, (rows.results || []).map(parseDriver), total, page, limit);
});

// ============================================================================
// DRIVER SCHEDULE (TICKET-315)
// ============================================================================

fleet.get('/drivers/schedule', zValidator('query', scheduleSchema), async (c) => {
  const db = c.get('tenantDb');
  const { from, to } = c.req.valid('query');

  const fromDate = new Date(from);
  const toDate = new Date(to);
  if ((toDate.getTime() - fromDate.getTime()) / 86400000 > 90) {
    return error(c, 'Date range cannot exceed 90 days', 400);
  }

  const allDrivers = await db.prepare(
    'SELECT id, name, phone, status, rating FROM drivers WHERE is_deleted = 0 ORDER BY name'
  ).all();

  const trips = await db.prepare(`
    SELECT ta.driver_id, ta.id as trip_id, ta.pickup_datetime, ta.drop_datetime,
           ta.pickup_location, ta.passenger_name, ta.status as trip_status
    FROM trip_assignments ta
    WHERE ta.is_deleted = 0 AND ta.status NOT IN ('completed', 'cancelled')
      AND ta.pickup_datetime <= ? AND ta.drop_datetime >= ?
      AND ta.driver_id IS NOT NULL
  `).bind(to, from).all();

  const tripsByDriver = new Map<string, any[]>();
  for (const trip of (trips.results || [])) {
    const arr = tripsByDriver.get(trip.driver_id as string) || [];
    arr.push(trip);
    tripsByDriver.set(trip.driver_id as string, arr);
  }

  const result = (allDrivers.results || []).map((d: any) => ({
    driverId: d.id,
    name: d.name,
    phone: d.phone,
    status: d.status,
    rating: d.rating,
    trips: (tripsByDriver.get(d.id) || []).map((t: any) => ({
      tripId: t.trip_id,
      pickupDatetime: t.pickup_datetime,
      dropDatetime: t.drop_datetime,
      pickupLocation: t.pickup_location,
      passengerName: t.passenger_name,
      status: t.trip_status,
    })),
  }));

  return success(c, result);
});

fleet.get('/drivers/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const driver = await db.prepare('SELECT * FROM drivers WHERE id = ? AND is_deleted = 0').bind(id).first();
  if (!driver) return notFound(c, 'Driver');

  const docs = await db.prepare(
    'SELECT * FROM driver_documents WHERE driver_id = ? AND is_active = 1 ORDER BY type'
  ).bind(id).all();

  const trips = await db.prepare(`
    SELECT ta.*, v.registration_number, v.type as vehicle_type
    FROM trip_assignments ta
    LEFT JOIN vehicles v ON v.id = ta.vehicle_id
    WHERE (ta.driver_id = ? OR ta.tour_leader_id = ?) AND ta.is_deleted = 0
      AND ta.status NOT IN ('completed', 'cancelled')
    ORDER BY ta.pickup_datetime ASC LIMIT 5
  `).bind(id, id).all();

  const ratings = await db.prepare(
    'SELECT * FROM driver_ratings WHERE driver_id = ? ORDER BY created_at DESC LIMIT 10'
  ).bind(id).all();

  // Revenue attribution
  const { timeZone: tzDriver, today: todayDrv } = await tenantToday(c);
  const thisMonthStart = localMonthWindow(tzDriver).startIso;
  const lastMonthStart = localMonthWindow(tzDriver, new Date(), -1).startIso;
  const [revenueAll, revenueThisMonth, revenueLastMonth, completedTrips, revenueByMonth] = await Promise.all([
    db.prepare(`SELECT COALESCE(SUM(i.total), 0) as total, COUNT(i.id) as count
      FROM invoices i JOIN trip_assignments ta ON ta.invoice_id = i.id
      WHERE ta.driver_id = ? AND ta.is_deleted = 0 AND i.status != 'cancelled'`).bind(id).first(),
    db.prepare(`SELECT COALESCE(SUM(i.total), 0) as total, COUNT(i.id) as count
      FROM invoices i JOIN trip_assignments ta ON ta.invoice_id = i.id
      WHERE ta.driver_id = ? AND ta.is_deleted = 0 AND i.status != 'cancelled'
        AND i.created_at >= ?`).bind(id, thisMonthStart).first(),
    db.prepare(`SELECT COALESCE(SUM(i.total), 0) as total, COUNT(i.id) as count
      FROM invoices i JOIN trip_assignments ta ON ta.invoice_id = i.id
      WHERE ta.driver_id = ? AND ta.is_deleted = 0 AND i.status != 'cancelled'
        AND i.created_at >= ? AND i.created_at < ?`).bind(id, lastMonthStart, thisMonthStart).first(),
    db.prepare(`SELECT COUNT(*) as count FROM trip_assignments
      WHERE driver_id = ? AND is_deleted = 0 AND status = 'completed'`).bind(id).first(),
    db.prepare(`SELECT strftime('%Y-%m', i.created_at) as month, COALESCE(SUM(i.total), 0) as total, COUNT(i.id) as count
      FROM invoices i JOIN trip_assignments ta ON ta.invoice_id = i.id
      WHERE ta.driver_id = ? AND ta.is_deleted = 0 AND i.status != 'cancelled'
        AND i.created_at >= date('now', '-6 months')
      GROUP BY strftime('%Y-%m', i.created_at) ORDER BY month DESC`).bind(id).all(),
  ]);

  const linkedUser = driver.user_id
    ? await db.prepare('SELECT name, email FROM users WHERE id = ?').bind(driver.user_id).first<{ name: string; email: string }>()
    : null;

  return success(c, {
    ...parseDriver(driver),
    userName: linkedUser?.name ?? null,
    userEmail: linkedUser?.email ?? null,
    documents: (docs.results || []).map((r: any) => parseDriverDocument(r, todayDrv)),
    upcomingTrips: (trips.results || []).map(parseTripRow),
    recentRatings: ratings.results || [],
    revenue: {
      totalRevenue: (revenueAll as any)?.total ?? 0,
      totalInvoices: (revenueAll as any)?.count ?? 0,
      thisMonthRevenue: (revenueThisMonth as any)?.total ?? 0,
      thisMonthInvoices: (revenueThisMonth as any)?.count ?? 0,
      lastMonthRevenue: (revenueLastMonth as any)?.total ?? 0,
      lastMonthInvoices: (revenueLastMonth as any)?.count ?? 0,
      completedTrips: (completedTrips as any)?.count ?? 0,
      byMonth: (revenueByMonth.results || []).map((r: any) => ({
        month: r.month, revenue: r.total, trips: r.count,
      })),
    },
  });
});

fleet.post('/drivers', zValidator('json', createDriverSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');
  const id = generateId();
  const now = new Date().toISOString();

  // Store phones as E.164 so the driver app and desktop (digits-only) agree; numbers typed without a country code
  // are read as the agency's own country (R204)
  const phoneCountry = await tenantPhoneCountry(db);
  const phone = normalizePhone(data.phone, phoneCountry) || data.phone;
  const phoneVariants = phoneLookupVariants(data.phone, phoneCountry);

  // Check unique phone (any stored format)
  const existing = await db.prepare(
    `SELECT id FROM drivers WHERE phone IN (${inPlaceholders(phoneVariants)}) AND is_deleted = 0`
  ).bind(...phoneVariants).first();
  if (existing) return error(c, 'Driver with this phone number already exists', 409);
  if (data.userId && !(await db.prepare('SELECT id FROM users WHERE id = ?').bind(data.userId).first())) return error(c, 'The linked staff user was not found', 400);

  await db.prepare(`
    INSERT INTO drivers (id, tenant_id, name, phone, email, license_number, license_expiry, address, emergency_contact_name, emergency_contact_phone, date_of_joining, notes, crew_role, user_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, tenantId, data.name, phone,
    data.email ?? null, data.licenseNumber ?? null, data.licenseExpiry ?? null,
    data.address ?? null, data.emergencyContactName ?? null, normalizePhone(data.emergencyContactPhone ?? '', phoneCountry) || null,
    data.dateOfJoining ?? null, data.notes ?? null, data.crewRole ?? 'driver', data.userId ?? null, userId, now, now,
  ).run();

  await logActivity(db as any, {
    userId, action: 'create', entityType: 'driver', entityId: id,
    details: JSON.stringify({ name: data.name }),
    ipAddress: c.get('clientIp'),
  });

  const row = await db.prepare('SELECT * FROM drivers WHERE id = ?').bind(id).first();
  return created(c, parseDriver(row!));
});

fleet.put('/drivers/:id', zValidator('json', updateDriverSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const now = new Date().toISOString();

  const existing = await db.prepare('SELECT * FROM drivers WHERE id = ? AND is_deleted = 0').bind(id).first();
  if (!existing) return notFound(c, 'Driver');

  const phoneCountry = data.phone !== undefined || data.emergencyContactPhone !== undefined ? await tenantPhoneCountry(db) : undefined;
  const normalizedPhone = data.phone ? (normalizePhone(data.phone, phoneCountry) || data.phone) : undefined;
  if (data.phone && normalizedPhone !== existing.phone) {
    const phoneVariants = phoneLookupVariants(data.phone, phoneCountry);
    const dup = await db.prepare(
      `SELECT id FROM drivers WHERE phone IN (${inPlaceholders(phoneVariants)}) AND is_deleted = 0 AND id != ?`
    ).bind(...phoneVariants, id).first();
    if (dup) return error(c, 'Driver with this phone number already exists', 409);
  }

  const sets: string[] = ['updated_at = ?'];
  const params: any[] = [now];

  if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
  if (data.phone !== undefined) { sets.push('phone = ?'); params.push(normalizedPhone ?? data.phone); }
  if (data.email !== undefined) { sets.push('email = ?'); params.push(data.email); }
  if (data.licenseNumber !== undefined) { sets.push('license_number = ?'); params.push(data.licenseNumber); }
  if (data.licenseExpiry !== undefined) { sets.push('license_expiry = ?'); params.push(data.licenseExpiry); }
  if (data.address !== undefined) { sets.push('address = ?'); params.push(data.address); }
  if (data.emergencyContactName !== undefined) { sets.push('emergency_contact_name = ?'); params.push(data.emergencyContactName); }
  if (data.emergencyContactPhone !== undefined) { sets.push('emergency_contact_phone = ?'); params.push(normalizePhone(data.emergencyContactPhone ?? '', phoneCountry) || null); }
  if (data.dateOfJoining !== undefined) { sets.push('date_of_joining = ?'); params.push(data.dateOfJoining); }
  if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes); }
  if (data.crewRole !== undefined) { sets.push('crew_role = ?'); params.push(data.crewRole); }
  if (data.userId !== undefined) {
    if (data.userId && !(await db.prepare('SELECT id FROM users WHERE id = ?').bind(data.userId).first())) return error(c, 'The linked staff user was not found', 400);
    sets.push('user_id = ?'); params.push(data.userId);
  }

  params.push(id);
  await db.prepare(`UPDATE drivers SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  const row = await db.prepare('SELECT * FROM drivers WHERE id = ?').bind(id).first();
  return success(c, parseDriver(row!));
});

fleet.delete('/drivers/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const userId = c.get('userId');

  const activeTrip = await db.prepare(
    "SELECT id FROM trip_assignments WHERE (driver_id = ? OR tour_leader_id = ?) AND status NOT IN ('completed', 'cancelled') AND is_deleted = 0"
  ).bind(id, id).first();
  if (activeTrip) return error(c, 'Cannot delete driver with active trips', 400);

  await db.prepare("UPDATE drivers SET is_deleted = 1, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id).run();

  await logActivity(db as any, {
    userId, action: 'delete', entityType: 'driver', entityId: id,
    ipAddress: c.get('clientIp'),
  });

  return success(c, { message: 'Driver deleted' });
});

fleet.put('/drivers/:id/status', zValidator('json', driverStatusSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const { status: newStatus } = c.req.valid('json');
  const now = new Date().toISOString();

  const driver = await db.prepare('SELECT * FROM drivers WHERE id = ? AND is_deleted = 0').bind(id).first();
  if (!driver) return notFound(c, 'Driver');

  if (newStatus === 'active') {
    const activeTrip = await db.prepare(
      "SELECT id FROM trip_assignments WHERE driver_id = ? AND status IN ('accepted', 'en_route', 'started') AND is_deleted = 0"
    ).bind(id).first();
    if (activeTrip) return error(c, 'Cannot set active while driver has an active trip in progress', 400);
  }

  await db.prepare('UPDATE drivers SET status = ?, updated_at = ? WHERE id = ?').bind(newStatus, now, id).run();

  const row = await db.prepare('SELECT * FROM drivers WHERE id = ?').bind(id).first();
  return success(c, parseDriver(row!));
});

// Rate driver
fleet.post('/drivers/:id/rate', zValidator('json', rateDriverSchema), async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.req.param('id');
  const userId = c.get('userId');
  const data = c.req.valid('json');
  const id = generateId();

  const driver = await db.prepare('SELECT id FROM drivers WHERE id = ? AND is_deleted = 0').bind(driverId).first();
  if (!driver) return notFound(c, 'Driver');

  await db.prepare(`
    INSERT INTO driver_ratings (id, driver_id, trip_id, rating, comments, rated_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, driverId, data.tripId, data.rating, data.comments ?? null, userId, new Date().toISOString()).run();

  // Update rolling average
  const avg = await db.prepare(
    'SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM driver_ratings WHERE driver_id = ?'
  ).bind(driverId).first<{ avg_rating: number; count: number }>();

  const avgRating = Math.round((avg?.avg_rating ?? 0) * 10) / 10;
  const totalTrips = avg?.count ?? 0;

  await db.prepare('UPDATE drivers SET rating = ?, total_trips = ?, updated_at = ? WHERE id = ?')
    .bind(avgRating, totalTrips, new Date().toISOString(), driverId).run();

  return success(c, { rating: avgRating, totalTrips });
});

// Driver trips
fleet.get('/drivers/:id/trips', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const url = new URL(c.req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  const countResult = await db.prepare(
    'SELECT COUNT(*) as count FROM trip_assignments WHERE (driver_id = ? OR tour_leader_id = ?) AND is_deleted = 0'
  ).bind(id, id).first<{ count: number }>();
  const total = countResult?.count ?? 0;

  const rows = await db.prepare(`
    SELECT ta.*, v.registration_number, v.type as vehicle_type
    FROM trip_assignments ta
    LEFT JOIN vehicles v ON v.id = ta.vehicle_id
    WHERE (ta.driver_id = ? OR ta.tour_leader_id = ?) AND ta.is_deleted = 0
    ORDER BY ta.pickup_datetime DESC
    LIMIT ? OFFSET ?
  `).bind(id, id, limit, offset).all();

  return paginated(c, (rows.results || []).map(parseTripRow), total, page, limit);
});

// ============================================================================
// DRIVER DOCUMENT MANAGEMENT (TICKET-314)
// ============================================================================

fleet.post('/drivers/:id/documents', async (c) => {
  const db = c.get('tenantDb');
  const tenantId = c.get('tenantId');
  const driverId = c.req.param('id');
  const r2 = c.env.FILE_STORAGE;

  const driver = await db.prepare('SELECT id FROM drivers WHERE id = ? AND is_deleted = 0').bind(driverId).first();
  if (!driver) return notFound(c, 'Driver');

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

  // Deactivate previous
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

  const doc = await db.prepare('SELECT * FROM driver_documents WHERE id = ?').bind(docId).first();
  return created(c, parseDriverDocument(doc!, (await tenantToday(c)).today));
});

fleet.get('/drivers/:id/documents', async (c) => {
  const db = c.get('tenantDb');
  const driverId = c.req.param('id');

  const rows = await db.prepare(
    'SELECT * FROM driver_documents WHERE driver_id = ? AND is_active = 1 ORDER BY type, created_at DESC'
  ).bind(driverId).all();

  { const { today: todayDoc } = await tenantToday(c); return success(c, (rows.results || []).map((r: any) => parseDriverDocument(r, todayDoc))); }
});

fleet.get('/drivers/:driverId/documents/:docId/download', async (c) => {
  const db = c.get('tenantDb');
  const docId = c.req.param('docId');

  const doc = await db.prepare('SELECT * FROM driver_documents WHERE id = ?').bind(docId).first();
  if (!doc || !doc.file_url) return notFound(c, 'Document');

  return success(c, { downloadUrl: doc.file_url, fileName: doc.file_name });
});

fleet.delete('/drivers/:driverId/documents/:docId', async (c) => {
  const db = c.get('tenantDb');
  const docId = c.req.param('docId');

  await db.prepare("UPDATE driver_documents SET is_active = 0, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), docId).run();

  return success(c, { message: 'Document deactivated' });
});

// Expiring driver documents
fleet.get('/documents/drivers/expiring', async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);
  const days = parseInt(url.searchParams.get('days') || '30');
  const { today } = await tenantToday(c);
  const futureDate = addDaysLocal(today, days);

  const rows = await db.prepare(`
    SELECT dd.*, d.name as driver_name, d.phone as driver_phone
    FROM driver_documents dd
    INNER JOIN drivers d ON dd.driver_id = d.id
    WHERE dd.is_active = 1 AND d.is_deleted = 0 AND dd.expiry_date <= ?
    ORDER BY dd.expiry_date ASC
  `).bind(futureDate).all();

  const data = (rows.results || []).map((r: any) => {
    const expiryDate = r.expiry_date ? new Date(r.expiry_date) : null;
    const todayDate = new Date(today);
    const daysUntil = expiryDate ? Math.ceil((expiryDate.getTime() - todayDate.getTime()) / 86400000) : null;
    return {
      ...r,
      isExpired: daysUntil !== null && daysUntil < 0,
      daysUntilExpiry: daysUntil,
    };
  });

  return success(c, data);
});

fleet.get('/drivers/:id/schedule', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const url = new URL(c.req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) return error(c, 'from and to are required', 400);

  const driver = await db.prepare('SELECT * FROM drivers WHERE id = ? AND is_deleted = 0').bind(id).first();
  if (!driver) return notFound(c, 'Driver');

  const trips = await db.prepare(`
    SELECT ta.*, v.registration_number, v.type as vehicle_type
    FROM trip_assignments ta
    LEFT JOIN vehicles v ON v.id = ta.vehicle_id
    WHERE ta.driver_id = ? AND ta.is_deleted = 0
      AND ta.status NOT IN ('completed', 'cancelled')
      AND ta.pickup_datetime <= ? AND ta.drop_datetime >= ?
    ORDER BY ta.pickup_datetime
  `).bind(id, to, from).all();

  return success(c, {
    driver: parseDriver(driver),
    trips: (trips.results || []).map(parseTripRow),
  });
});

// ============================================================================
// TRIP ASSIGNMENT CRUD (TICKET-316)
// ============================================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  assigned: ['accepted', 'cancelled'],
  accepted: ['en_route', 'cancelled'],
  en_route: ['started'],
  started: ['completed'],
};

fleet.get('/trips', zValidator('query', tripListSchema), async (c) => {
  const db = c.get('tenantDb');
  const { page, limit, status, driverId, vehicleId, tripKind, departureId, leadId, from, to, search, sortBy, sortOrder } = c.req.valid('query');
  const offset = (page - 1) * limit;

  const conditions: string[] = ['ta.is_deleted = 0'];
  const params: any[] = [];

  if (status) { conditions.push('ta.status = ?'); params.push(status); }
  if (driverId) { conditions.push('ta.driver_id = ?'); params.push(driverId); }
  if (vehicleId) { conditions.push('ta.vehicle_id = ?'); params.push(vehicleId); }
  if (leadId) { conditions.push('ta.lead_id = ?'); params.push(leadId); }
  if (tripKind) { conditions.push('ta.trip_kind = ?'); params.push(tripKind); }
  if (departureId) { conditions.push('ta.departure_id = ?'); params.push(departureId); }
  if (from) { conditions.push('ta.pickup_datetime >= ?'); params.push(from); }
  if (to) { conditions.push('ta.pickup_datetime <= ?'); params.push(to); }
  if (search) {
    conditions.push('(ta.passenger_name LIKE ? OR v.registration_number LIKE ? OR d.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereClause = conditions.join(' AND ');
  const orderCol = sortBy || 'ta.created_at';
  const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const countResult = await db.prepare(`
    SELECT COUNT(*) as count FROM trip_assignments ta
    LEFT JOIN vehicles v ON v.id = ta.vehicle_id
    LEFT JOIN drivers d ON d.id = ta.driver_id
    WHERE ${whereClause}
  `).bind(...params).first<{ count: number }>();
  const total = countResult?.count ?? 0;

  const rows = await db.prepare(`
    SELECT ta.*, d.name as driver_name, d.phone as driver_phone,
           v.registration_number, v.type as vehicle_type, tl.name as tour_leader_name,
           (SELECT COUNT(*) FROM trip_stops ts WHERE ts.trip_id = ta.id) as stop_count,
           (SELECT COALESCE(SUM(tp.seats), 0) FROM trip_passengers tp WHERE tp.trip_id = ta.id) as pax_expected,
           (SELECT COALESCE(SUM(tp.seats), 0) FROM trip_passengers tp WHERE tp.trip_id = ta.id AND tp.boarding_status = 'boarded') as pax_boarded,
           (SELECT COALESCE(SUM(tp.seats), 0) FROM trip_passengers tp WHERE tp.trip_id = ta.id AND tp.boarding_status = 'no_show') as pax_no_show
    FROM trip_assignments ta
    LEFT JOIN vehicles v ON v.id = ta.vehicle_id
    LEFT JOIN drivers d ON d.id = ta.driver_id
    LEFT JOIN drivers tl ON tl.id = ta.tour_leader_id
    WHERE ${whereClause}
    ORDER BY ${orderCol} ${orderDir}
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return paginated(c, (rows.results || []).map(parseTripRow), total, page, limit);
});

fleet.get('/trips/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const trip = await db.prepare(`
    SELECT ta.*, d.name as driver_name, d.phone as driver_phone, d.photo_url as driver_photo,
           v.registration_number, v.type as vehicle_type, v.make as vehicle_make, v.model as vehicle_model,
           v.seating_capacity, v.photo_url as vehicle_photo,
           l.title as lead_title, tl.name as tour_leader_name, tl.phone as tour_leader_phone
    FROM trip_assignments ta
    LEFT JOIN vehicles v ON v.id = ta.vehicle_id
    LEFT JOIN drivers d ON d.id = ta.driver_id
    LEFT JOIN drivers tl ON tl.id = ta.tour_leader_id
    LEFT JOIN leads l ON l.id = ta.lead_id
    WHERE ta.id = ? AND ta.is_deleted = 0
  `).bind(id).first();
  if (!trip) return notFound(c, 'Trip');

  // Timeline
  const timeline = await db.prepare(
    'SELECT * FROM trip_timeline WHERE trip_id = ? ORDER BY created_at ASC'
  ).bind(id).all();

  // Costs
  const costs = await db.prepare(
    'SELECT * FROM trip_costs WHERE trip_id = ? ORDER BY created_at DESC'
  ).bind(id).all();

  const costTotal = await db.prepare(
    'SELECT SUM(amount) as total FROM trip_costs WHERE trip_id = ?'
  ).bind(id).first<{ total: number }>();

  return success(c, {
    ...parseTripRow(trip),
    driverPhoto: trip.driver_photo,
    vehicleMake: trip.vehicle_make,
    vehicleModel: trip.vehicle_model,
    seatingCapacity: trip.seating_capacity,
    vehiclePhoto: trip.vehicle_photo,
    leadTitle: trip.lead_title,
    tourLeaderPhone: trip.tour_leader_phone ?? null,
    ...(trip.trip_kind === 'coach' && { stops: await listStops(db, id), headcount: await headcountOf(db, id) }),
    timeline: timeline.results || [],
    costs: costs.results || [],
    totalCost: costTotal?.total ?? 0,
  });
});

fleet.post('/trips', zValidator('json', createTripSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');
  const id = generateId();
  const now = new Date().toISOString();

  // R145: coach trips, a tour leader or a departure link need the coach_trips feature and valid references
  const tripKind = data.tripKind ?? 'transfer';
  const coachProblem = await coachFieldsProblem(c, db, { tripKind, tourLeaderId: data.tourLeaderId, departureId: data.departureId });
  if (coachProblem) return coachProblem;

  // Validate vehicle availability
  if (data.vehicleId) {
    const vehicleConflict = await db.prepare(`
      SELECT id FROM trip_assignments
      WHERE vehicle_id = ? AND is_deleted = 0 AND status NOT IN ('completed', 'cancelled')
        AND pickup_datetime <= ? AND drop_datetime >= ?
    `).bind(data.vehicleId, data.dropDatetime, data.pickupDatetime).first();
    if (vehicleConflict) return error(c, 'Vehicle is not available for the selected date range', 400);
  }

  // Validate driver availability
  if (data.driverId) {
    const driverConflict = await db.prepare(`
      SELECT id FROM trip_assignments
      WHERE driver_id = ? AND is_deleted = 0 AND status NOT IN ('completed', 'cancelled')
        AND pickup_datetime <= ? AND drop_datetime >= ?
    `).bind(data.driverId, data.dropDatetime, data.pickupDatetime).first();
    if (driverConflict) return error(c, 'Driver is not available for the selected date range', 400);
  }

  // Store the passenger phone as E.164 (empty -> null)
  const passengerPhoneE164 = normalizePhone(data.passengerPhone ?? '', await tenantPhoneCountry(db)) || null;

  await db.prepare(`
    INSERT INTO trip_assignments (
      id, tenant_id, lead_id, vehicle_id, driver_id, pickup_location, drop_location,
      pickup_datetime, drop_datetime, status, passenger_name, passenger_phone,
      special_instructions, assigned_by,
      trip_type, rate_card_id, estimated_distance_km, estimated_duration_min,
      estimated_cost, estimated_breakdown,
      pickup_lat, pickup_lng, drop_lat, drop_lng, contact_id,
      trip_kind, tour_leader_id, departure_id,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, tenantId, data.leadId ?? null, data.vehicleId ?? null, data.driverId ?? null,
    data.pickupLocation ?? null, data.dropLocation ?? null,
    data.pickupDatetime, data.dropDatetime,
    data.passengerName ?? null, passengerPhoneE164,
    data.specialInstructions ?? null, userId,
    data.tripType ?? 'one_way', data.rateCardId ?? null,
    data.estimatedDistanceKm ?? null, data.estimatedDurationMin ?? null,
    data.estimatedCost ?? null, data.estimatedBreakdown ?? null,
    data.pickupLat ?? null, data.pickupLng ?? null,
    data.dropLat ?? null, data.dropLng ?? null,
    data.contactId ?? null,
    tripKind, data.tourLeaderId ?? null, data.departureId ?? null,
    now, now,
  ).run();

  // Record timeline entry
  await db.prepare(`
    INSERT INTO trip_timeline (id, trip_id, status, changed_by, notes, created_at)
    VALUES (?, ?, 'assigned', ?, 'Trip created', ?)
  `).bind(generateId(), id, userId, now).run();

  if (data.stops?.length) {
    try {
      await replaceStops(coachCtx(c), id, data.stops);
    } catch (e) {
      if (!(e instanceof DepartureError)) throw e;
      await db.prepare('UPDATE trip_assignments SET is_deleted = 1 WHERE id = ?').bind(id).run();
      return departureErrorResponse(c, e);
    }
  }

  await logActivity(db as any, {
    userId, action: 'create', entityType: 'trip_assignment', entityId: id,
    details: JSON.stringify({ vehicleId: data.vehicleId, driverId: data.driverId }),
    ipAddress: c.get('clientIp'),
  });

  // Send customer notification (async, non-blocking)
  if (passengerPhoneE164 && data.vehicleId && data.driverId) {
    try {
      const driver = await db.prepare('SELECT name, phone FROM drivers WHERE id = ?').bind(data.driverId).first();
      const vehicle = await db.prepare('SELECT registration_number, type FROM vehicles WHERE id = ?').bind(data.vehicleId).first();
      if (driver && vehicle) {
        const tzPickup = await tenantTimeZone(c);
        const pickupLocale = (await loadLocaleContext(db)).locale;
        const pickupDate = new Date(data.pickupDatetime).toLocaleDateString(pickupLocale, { timeZone: tzPickup, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const pickupTime = new Date(data.pickupDatetime).toLocaleTimeString(pickupLocale, { timeZone: tzPickup, hour: '2-digit', minute: '2-digit' });
        const settings = await db.prepare('SELECT company_name FROM settings LIMIT 1').first<{ company_name: string }>();
        const message = `Hello ${data.passengerName || 'Guest'}, your vehicle has been assigned for ${pickupDate}.\n\nDriver: ${driver.name}\nPhone: ${driver.phone}\nVehicle: ${(vehicle.type as string).replace(/_/g, ' ')} (${vehicle.registration_number})\n\nPickup: ${data.pickupLocation || 'TBD'} at ${pickupTime}\n\n— ${settings?.company_name || 'TravelCRM'}`;
        await c.env.SMS_QUEUE.send({
          type: 'whatsapp', to: passengerPhoneE164, body: message,
          tenantId, entityType: 'trip_assignment', entityId: id,
        });
      }
    } catch { /* notification failure should not block trip creation */ }
  }

  const row = await db.prepare(`
    SELECT ta.*, d.name as driver_name, d.phone as driver_phone,
           v.registration_number, v.type as vehicle_type,
           co.name as contact_name, vrc.name as rate_card_name, tl.name as tour_leader_name
    FROM trip_assignments ta
    LEFT JOIN vehicles v ON v.id = ta.vehicle_id
    LEFT JOIN drivers d ON d.id = ta.driver_id
    LEFT JOIN contacts co ON co.id = ta.contact_id
    LEFT JOIN vehicle_rate_cards vrc ON vrc.id = ta.rate_card_id
    LEFT JOIN drivers tl ON tl.id = ta.tour_leader_id
    WHERE ta.id = ?
  `).bind(id).first();

  // Auto-create voucher if requested
  if (data.autoCreateVoucher !== false && data.passengerName && data.vehicleId && data.driverId && tripKind !== 'coach') {
    try {
      const voucherId = generateId();
      const driver = await db.prepare('SELECT name, phone FROM drivers WHERE id = ?').bind(data.driverId).first();
      const vehicle = await db.prepare('SELECT registration_number, type FROM vehicles WHERE id = ?').bind(data.vehicleId).first();
      const detailsJson = JSON.stringify({
        driverName: driver?.name, driverPhone: driver?.phone,
        vehicleType: vehicle?.type, vehicleRegistration: vehicle?.registration_number,
        pickupLocation: data.pickupLocation, dropLocation: data.dropLocation,
        pickupDatetime: data.pickupDatetime, dropDatetime: data.dropDatetime,
        passengerName: data.passengerName, passengerPhone: passengerPhoneE164,
        tripType: data.tripType ?? 'one_way',
      });
      await db.prepare(`
        INSERT INTO vouchers (id, lead_id, type, title, details_json, status, created_by, created_at, updated_at)
        VALUES (?, ?, 'transport', ?, ?, 'draft', ?, ?, ?)
      `).bind(
        voucherId, data.leadId ?? '', `Transport - ${data.passengerName}`,
        detailsJson, userId, now, now,
      ).run();
      // Link voucher to trip
      await db.prepare('UPDATE trip_assignments SET voucher_id = ? WHERE id = ?').bind(voucherId, id).run();
    } catch { /* voucher creation failure should not block trip */ }
  }

  // Re-fetch with voucher link
  const finalRow = await db.prepare(`
    SELECT ta.*, d.name as driver_name, d.phone as driver_phone,
           v.registration_number, v.type as vehicle_type,
           co.name as contact_name, vrc.name as rate_card_name, tl.name as tour_leader_name
    FROM trip_assignments ta
    LEFT JOIN vehicles v ON v.id = ta.vehicle_id
    LEFT JOIN drivers d ON d.id = ta.driver_id
    LEFT JOIN contacts co ON co.id = ta.contact_id
    LEFT JOIN vehicle_rate_cards vrc ON vrc.id = ta.rate_card_id
    LEFT JOIN drivers tl ON tl.id = ta.tour_leader_id
    WHERE ta.id = ?
  `).bind(id).first();

  return created(c, parseTripRow(finalRow!));
});

fleet.put('/trips/:id', zValidator('json', updateTripSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const now = new Date().toISOString();

  const existing = await db.prepare(
    "SELECT * FROM trip_assignments WHERE id = ? AND is_deleted = 0"
  ).bind(id).first();
  if (!existing) return notFound(c, 'Trip');
  if (existing.status !== 'assigned') return error(c, 'Can only edit trips with status "assigned"', 400);

  const coachProblem = await coachFieldsProblem(c, db, {
    tripKind: data.tripKind,
    tourLeaderId: data.tourLeaderId,
    departureId: data.departureId,
  });
  if (coachProblem) return coachProblem;
  if (data.tripKind === 'transfer' && existing.trip_kind === 'coach') {
    const used = await db.prepare(
      'SELECT (SELECT COUNT(*) FROM trip_stops WHERE trip_id = ?1) + (SELECT COUNT(*) FROM trip_passengers WHERE trip_id = ?1) AS n',
    ).bind(id).first<{ n: number }>();
    if ((used?.n ?? 0) > 0) return error(c, 'A coach trip with stops or passengers cannot become a transfer', 409);
  }

  const sets: string[] = ['updated_at = ?'];
  const params: any[] = [now];
  if (data.tripKind !== undefined) { sets.push('trip_kind = ?'); params.push(data.tripKind); }
  if (data.tourLeaderId !== undefined) { sets.push('tour_leader_id = ?'); params.push(data.tourLeaderId); }
  if (data.departureId !== undefined) { sets.push('departure_id = ?'); params.push(data.departureId); }

  if (data.vehicleId !== undefined) {
    // Check availability
    const conflict = await db.prepare(`
      SELECT id FROM trip_assignments
      WHERE vehicle_id = ? AND is_deleted = 0 AND status NOT IN ('completed', 'cancelled') AND id != ?
        AND pickup_datetime <= ? AND drop_datetime >= ?
    `).bind(data.vehicleId, id, data.dropDatetime || existing.drop_datetime, data.pickupDatetime || existing.pickup_datetime).first();
    if (conflict) return error(c, 'Vehicle not available for date range', 400);
    sets.push('vehicle_id = ?'); params.push(data.vehicleId);
  }
  if (data.driverId !== undefined) {
    const conflict = await db.prepare(`
      SELECT id FROM trip_assignments
      WHERE driver_id = ? AND is_deleted = 0 AND status NOT IN ('completed', 'cancelled') AND id != ?
        AND pickup_datetime <= ? AND drop_datetime >= ?
    `).bind(data.driverId, id, data.dropDatetime || existing.drop_datetime, data.pickupDatetime || existing.pickup_datetime).first();
    if (conflict) return error(c, 'Driver not available for date range', 400);
    sets.push('driver_id = ?'); params.push(data.driverId);
  }
  if (data.leadId !== undefined) { sets.push('lead_id = ?'); params.push(data.leadId); }
  if (data.pickupLocation !== undefined) { sets.push('pickup_location = ?'); params.push(data.pickupLocation); }
  if (data.dropLocation !== undefined) { sets.push('drop_location = ?'); params.push(data.dropLocation); }
  if (data.pickupDatetime !== undefined) { sets.push('pickup_datetime = ?'); params.push(data.pickupDatetime); }
  if (data.dropDatetime !== undefined) { sets.push('drop_datetime = ?'); params.push(data.dropDatetime); }
  if (data.passengerName !== undefined) { sets.push('passenger_name = ?'); params.push(data.passengerName); }
  if (data.passengerPhone !== undefined) { sets.push('passenger_phone = ?'); params.push(normalizePhone(data.passengerPhone ?? '', await tenantPhoneCountry(db)) || null); }
  if (data.specialInstructions !== undefined) { sets.push('special_instructions = ?'); params.push(data.specialInstructions); }
  // M20 fields
  if (data.tripType !== undefined) { sets.push('trip_type = ?'); params.push(data.tripType); }
  if (data.rateCardId !== undefined) { sets.push('rate_card_id = ?'); params.push(data.rateCardId); }
  if (data.estimatedDistanceKm !== undefined) { sets.push('estimated_distance_km = ?'); params.push(data.estimatedDistanceKm); }
  if (data.estimatedDurationMin !== undefined) { sets.push('estimated_duration_min = ?'); params.push(data.estimatedDurationMin); }
  if (data.estimatedCost !== undefined) { sets.push('estimated_cost = ?'); params.push(data.estimatedCost); }
  if (data.estimatedBreakdown !== undefined) { sets.push('estimated_breakdown = ?'); params.push(data.estimatedBreakdown); }
  if (data.pickupLat !== undefined) { sets.push('pickup_lat = ?'); params.push(data.pickupLat); }
  if (data.pickupLng !== undefined) { sets.push('pickup_lng = ?'); params.push(data.pickupLng); }
  if (data.dropLat !== undefined) { sets.push('drop_lat = ?'); params.push(data.dropLat); }
  if (data.dropLng !== undefined) { sets.push('drop_lng = ?'); params.push(data.dropLng); }
  if (data.contactId !== undefined) { sets.push('contact_id = ?'); params.push(data.contactId); }

  params.push(id);
  await db.prepare(`UPDATE trip_assignments SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  // Send notification if driver/vehicle changed
  if ((data.vehicleId || data.driverId) && existing.passenger_phone) {
    try {
      const dId = data.driverId || existing.driver_id;
      const vId = data.vehicleId || existing.vehicle_id;
      const driver = await db.prepare('SELECT name, phone FROM drivers WHERE id = ?').bind(dId).first();
      const vehicle = await db.prepare('SELECT registration_number, type FROM vehicles WHERE id = ?').bind(vId).first();
      if (driver && vehicle) {
        const message = `Update: Your vehicle assignment has been changed.\n\nDriver: ${driver.name}\nPhone: ${driver.phone}\nVehicle: ${(vehicle.type as string).replace(/_/g, ' ')} (${vehicle.registration_number})\n\nPickup: ${data.pickupLocation || existing.pickup_location || 'TBD'}`;
        await c.env.SMS_QUEUE.send({
          type: 'whatsapp', to: existing.passenger_phone as string, body: message,
          tenantId: c.get('tenantId'), entityType: 'trip_assignment', entityId: id,
        });
      }
    } catch {}
  }

  const row = await db.prepare(`
    SELECT ta.*, d.name as driver_name, d.phone as driver_phone,
           v.registration_number, v.type as vehicle_type,
           co.name as contact_name, vrc.name as rate_card_name, tl.name as tour_leader_name
    FROM trip_assignments ta
    LEFT JOIN vehicles v ON v.id = ta.vehicle_id
    LEFT JOIN drivers d ON d.id = ta.driver_id
    LEFT JOIN contacts co ON co.id = ta.contact_id
    LEFT JOIN vehicle_rate_cards vrc ON vrc.id = ta.rate_card_id
    LEFT JOIN drivers tl ON tl.id = ta.tour_leader_id
    WHERE ta.id = ?
  `).bind(id).first();

  return success(c, parseTripRow(row!));
});

fleet.delete('/trips/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const existing = await db.prepare(
    "SELECT status FROM trip_assignments WHERE id = ? AND is_deleted = 0"
  ).bind(id).first();
  if (!existing) return notFound(c, 'Trip');
  if (existing.status !== 'assigned') return error(c, 'Can only delete trips with status "assigned"', 400);

  await db.prepare("UPDATE trip_assignments SET is_deleted = 1, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id).run();

  return success(c, { message: 'Trip deleted' });
});

// Trip status change
fleet.put('/trips/:id/status', zValidator('json', tripStatusSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const userId = c.get('userId');
  const data = c.req.valid('json');
  const now = new Date().toISOString();

  const trip = await db.prepare(
    'SELECT * FROM trip_assignments WHERE id = ? AND is_deleted = 0'
  ).bind(id).first();
  if (!trip) return notFound(c, 'Trip');

  const currentStatus = trip.status as string;
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(data.status)) {
    return error(c, `Cannot transition from '${currentStatus}' to '${data.status}'`, 400);
  }

  const updateData: Record<string, any> = { status: data.status, updated_at: now };
  switch (data.status) {
    case 'accepted': updateData.accepted_at = now; break;
    case 'en_route': updateData.en_route_at = now; break;
    case 'started': updateData.started_at = now; break;
    case 'completed': updateData.completed_at = now; break;
    case 'cancelled': updateData.cancelled_at = now; updateData.cancellation_reason = data.reason || null; break;
  }

  const sets = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
  await db.prepare(`UPDATE trip_assignments SET ${sets} WHERE id = ?`)
    .bind(...Object.values(updateData), id).run();

  // Record timeline entry
  await db.prepare(`
    INSERT INTO trip_timeline (id, trip_id, status, changed_by, latitude, longitude, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(generateId(), id, data.status, userId, data.latitude ?? null, data.longitude ?? null, data.notes ?? null, now).run();

  // Update vehicle and driver status
  if (data.status === 'started') {
    if (trip.vehicle_id) await db.prepare("UPDATE vehicles SET status = 'on_trip', updated_at = ? WHERE id = ?").bind(now, trip.vehicle_id).run();
    if (trip.driver_id) await db.prepare("UPDATE drivers SET status = 'on_trip', updated_at = ? WHERE id = ?").bind(now, trip.driver_id).run();
  } else if (data.status === 'completed' || data.status === 'cancelled') {
    if (trip.vehicle_id) await db.prepare("UPDATE vehicles SET status = 'available', updated_at = ? WHERE id = ?").bind(now, trip.vehicle_id).run();
    if (trip.driver_id) await db.prepare("UPDATE drivers SET status = 'active', updated_at = ? WHERE id = ?").bind(now, trip.driver_id).run();
  }

  await logActivity(db as any, {
    userId, action: 'update_status', entityType: 'trip_assignment', entityId: id,
    details: JSON.stringify({ from: currentStatus, to: data.status }),
    ipAddress: c.get('clientIp'),
  });

  // M20: Auto-generate invoice on completion (non-blocking)
  if (data.status === 'completed') {
    try {
      const completedTrip = await db.prepare('SELECT * FROM trip_assignments WHERE id = ?').bind(id).first();
      if (completedTrip && !completedTrip.invoice_id && completedTrip.contact_id) {
        const { generateTripInvoice } = await import('../services/trip-invoice-generator');
        await generateTripInvoice(db, completedTrip, userId);
      }
    } catch {
      // Invoice generation failure should not block status update
    }
  }

  const row = await db.prepare('SELECT * FROM trip_assignments WHERE id = ?').bind(id).first();
  return success(c, parseTripRow(row!));
});

// Trip timeline
fleet.get('/trips/:id/timeline', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const rows = await db.prepare(
    'SELECT * FROM trip_timeline WHERE trip_id = ? ORDER BY created_at ASC'
  ).bind(id).all();

  return success(c, rows.results || []);
});

// ============================================================================
// COACH TRIPS (R145): stops, passengers, check-in, head count
// ============================================================================

/** Who acts in the coach service: this staff user, with the request's waiter so automations run after the response. */
function coachCtx(c: Context<AppContext>): CoachCtx {
  let waiter: CoachCtx['waiter'];
  try { waiter = c.executionCtx; } catch { waiter = undefined; }
  return { env: c.env, tenantId: c.get('tenantId'), db: c.get('tenantDb'), userId: c.get('userId'), waiter };
}

/**
 * The coach fields of a trip body: a coach trip, a tour leader or a departure link need the coach_trips feature (the routes under
 * /trips/:id/stops and so on are gated by middleware; this covers the trip body). A tour leader must be crew with that role.
 */
async function coachFieldsProblem(
  c: Context<AppContext>,
  db: D1Database,
  f: { tripKind?: string; tourLeaderId?: string | null; departureId?: string | null },
): Promise<Response | null> {
  const used = f.tripKind === 'coach' || Boolean(f.tourLeaderId) || Boolean(f.departureId);
  if (!used) return null;
  const feature = await resolveFeature(c.env, c.get('tenantId'), 'coach_trips');
  if (!feature.enabled) return c.json({ error: 'Feature "coach_trips" is not available for this agency.', featureKey: 'coach_trips', upgrade: feature.source !== 'platform' }, 403);
  if (f.tourLeaderId) {
    const leader = await db.prepare("SELECT id FROM drivers WHERE id = ? AND is_deleted = 0 AND crew_role IN ('tour_leader', 'both')").bind(f.tourLeaderId).first();
    if (!leader) return error(c, 'The tour leader was not found, or is not a tour leader', 400);
  }
  if (f.departureId) {
    const dep = await db.prepare('SELECT id FROM departures WHERE id = ? AND is_deleted = 0').bind(f.departureId).first();
    if (!dep) return error(c, 'The departure was not found', 400);
  }
  return null;
}

// Stops, passengers and head count exist only with the coach_trips feature.
fleet.use('/trips/:id/stops', requireFeature('coach_trips'));
fleet.use('/trips/:id/stops/*', requireFeature('coach_trips'));
fleet.use('/trips/:id/passengers', requireFeature('coach_trips'));
fleet.use('/trips/:id/passengers/*', requireFeature('coach_trips'));
fleet.use('/trips/:id/headcount', requireFeature('coach_trips'));

fleet.get('/trips/:id/stops', (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    if (!(await db.prepare('SELECT id FROM trip_assignments WHERE id = ? AND is_deleted = 0').bind(c.req.param('id')).first())) return notFound(c, 'Trip');
    return success(c, await listStops(db, c.req.param('id')));
  }),
);

fleet.put('/trips/:id/stops', zValidator('json', tripStopsBodySchema), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    const stops = await replaceStops(coachCtx(c), id, c.req.valid('json').stops);
    await logActivity(c.get('tenantDb') as any, { userId: c.get('userId'), action: 'update', entityType: 'trip_assignment', entityId: id, details: JSON.stringify({ stops: stops.length }), ipAddress: c.get('clientIp') });
    return success(c, stops);
  }),
);

// The body is optional (the position is only a courtesy); an empty body parses as {}.
const optionalJson = async (c: Context<AppContext>): Promise<unknown> => {
  try { return await c.req.json(); } catch { return {}; }
};

fleet.post('/trips/:id/stops/:sid/arrive', (c) =>
  guarded(c, async () => {
    const where = stopWhereSchema.safeParse(await optionalJson(c));
    if (!where.success) return error(c, 'The position is not valid', 400);
    return success(c, await setStopStatus(coachCtx(c), c.req.param('id'), c.req.param('sid'), 'arrive', where.data));
  }),
);

fleet.post('/trips/:id/stops/:sid/depart', (c) =>
  guarded(c, async () => {
    const where = stopWhereSchema.safeParse(await optionalJson(c));
    if (!where.success) return error(c, 'The position is not valid', 400);
    return success(c, await setStopStatus(coachCtx(c), c.req.param('id'), c.req.param('sid'), 'depart', where.data));
  }),
);

fleet.get('/trips/:id/passengers', (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    if (!(await db.prepare('SELECT id FROM trip_assignments WHERE id = ? AND is_deleted = 0').bind(c.req.param('id')).first())) return notFound(c, 'Trip');
    return success(c, await listPassengersGrouped(db, c.req.param('id')));
  }),
);

fleet.post('/trips/:id/passengers', zValidator('json', addTripPassengerSchema), (c) =>
  guarded(c, async () => created(c, await addPassenger(coachCtx(c), c.req.param('id'), c.req.valid('json')))),
);

fleet.put('/trips/:id/passengers/:pid', zValidator('json', tickPassengerSchema), (c) =>
  guarded(c, async () => success(c, await tickPassenger(coachCtx(c), c.req.param('id'), c.req.param('pid'), c.req.valid('json')))),
);

fleet.delete('/trips/:id/passengers/:pid', (c) =>
  guarded(c, async () => {
    await removePassenger(coachCtx(c), c.req.param('id'), c.req.param('pid'));
    return success(c, { message: 'Passenger removed' });
  }),
);

fleet.get('/trips/:id/headcount', (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    if (!(await db.prepare('SELECT id FROM trip_assignments WHERE id = ? AND is_deleted = 0').bind(c.req.param('id')).first())) return notFound(c, 'Trip');
    return success(c, await headcountOf(db, c.req.param('id')));
  }),
);

// ============================================================================
// TRIP COST TRACKING (TICKET-317)
// ============================================================================

fleet.post('/trips/:id/costs', zValidator('json', createTripCostSchema), async (c) => {
  const db = c.get('tenantDb');
  const tripId = c.req.param('id');
  const userId = c.get('userId');
  const data = c.req.valid('json');
  const id = generateId();

  const trip = await db.prepare('SELECT id FROM trip_assignments WHERE id = ? AND is_deleted = 0').bind(tripId).first();
  if (!trip) return notFound(c, 'Trip');

  await db.prepare(`
    INSERT INTO trip_costs (id, trip_id, cost_type, amount, description, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, tripId, data.costType, data.amount, data.description ?? null, userId, new Date().toISOString()).run();

  const row = await db.prepare('SELECT * FROM trip_costs WHERE id = ?').bind(id).first();
  return created(c, row);
});

fleet.get('/trips/:id/costs', async (c) => {
  const db = c.get('tenantDb');
  const tripId = c.req.param('id');

  const rows = await db.prepare(
    'SELECT * FROM trip_costs WHERE trip_id = ? ORDER BY created_at DESC'
  ).bind(tripId).all();

  const total = await db.prepare(
    'SELECT SUM(amount) as total FROM trip_costs WHERE trip_id = ?'
  ).bind(tripId).first<{ total: number }>();

  return success(c, { costs: rows.results || [], totalCost: total?.total ?? 0 });
});

fleet.delete('/trips/:tripId/costs/:costId', async (c) => {
  const db = c.get('tenantDb');
  const costId = c.req.param('costId');
  const userId = c.get('userId');
  const role = c.get('role');

  const cost = await db.prepare('SELECT * FROM trip_costs WHERE id = ?').bind(costId).first();
  if (!cost) return notFound(c, 'Cost entry');

  if (cost.created_by !== userId && role !== 'admin') {
    return error(c, 'Only the creator or admin can delete this cost entry', 403);
  }

  await db.prepare('DELETE FROM trip_costs WHERE id = ?').bind(costId).run();
  return success(c, { message: 'Cost entry deleted' });
});

fleet.get('/trips/:id/costs/summary', async (c) => {
  const db = c.get('tenantDb');
  const tripId = c.req.param('id');

  const summary = await db.prepare(`
    SELECT cost_type, SUM(amount) as total FROM trip_costs WHERE trip_id = ? GROUP BY cost_type
  `).bind(tripId).all();

  const result: Record<string, number> = { fuel: 0, toll: 0, driver_allowance: 0, parking: 0, other: 0, total: 0 };
  for (const row of (summary.results || [])) {
    result[row.cost_type as string] = row.total as number;
    result.total += row.total as number;
  }

  return success(c, result);
});

// Fleet cost report
fleet.get('/costs/report', async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let query = `
    SELECT tc.cost_type, SUM(tc.amount) as total, COUNT(*) as count
    FROM trip_costs tc
    INNER JOIN trip_assignments ta ON tc.trip_id = ta.id
    WHERE ta.is_deleted = 0
  `;
  const params: any[] = [];
  if (from) { query += ' AND ta.pickup_datetime >= ?'; params.push(from); }
  if (to) { query += ' AND ta.pickup_datetime <= ?'; params.push(to); }
  query += ' GROUP BY tc.cost_type';

  const rows = await db.prepare(query).bind(...params).all();

  const result: Record<string, any> = {};
  let grandTotal = 0;
  for (const row of (rows.results || [])) {
    result[row.cost_type as string] = { total: row.total, count: row.count };
    grandTotal += row.total as number;
  }
  result.grandTotal = grandTotal;

  return success(c, result);
});

// ============================================================================
// FLEET DASHBOARD (TICKET-319)
// ============================================================================

fleet.get('/dashboard', async (c) => {
  const db = c.get('tenantDb');
  const now = new Date().toISOString();
  const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString();
  const { timeZone: tzDash, today: todayDash } = await tenantToday(c);
  const thirtyDays = addDaysLocal(todayDash, 30);
  const fifteenDays = addDaysLocal(todayDash, 15);

  const thisMonthStart = localMonthWindow(tzDash).startIso;
  const lastMonthStart = localMonthWindow(tzDash, new Date(), -1).startIso;

  const [vehicleCounts, driverCounts, activeTrips, upcomingTrips, expiringDocs, maintenanceDue, recentCompleted, topDrivers, revenueThisMonth, revenueLastMonth, revenueByVehicleType, revenueByDriver] = await Promise.all([
    // Vehicle summary
    db.prepare("SELECT status, COUNT(*) as count FROM vehicles WHERE is_deleted = 0 GROUP BY status").all(),
    // Driver summary
    db.prepare("SELECT status, COUNT(*) as count FROM drivers WHERE is_deleted = 0 GROUP BY status").all(),
    // Active trips
    db.prepare(`
      SELECT ta.*, d.name as driver_name, d.phone as driver_phone,
             v.registration_number, v.type as vehicle_type
      FROM trip_assignments ta
      LEFT JOIN drivers d ON d.id = ta.driver_id
      LEFT JOIN vehicles v ON v.id = ta.vehicle_id
      WHERE ta.is_deleted = 0 AND ta.status IN ('accepted', 'en_route', 'started')
      ORDER BY ta.pickup_datetime ASC LIMIT 10
    `).all(),
    // Upcoming trips (next 7 days)
    db.prepare(`
      SELECT ta.*, d.name as driver_name, v.registration_number
      FROM trip_assignments ta
      LEFT JOIN drivers d ON d.id = ta.driver_id
      LEFT JOIN vehicles v ON v.id = ta.vehicle_id
      WHERE ta.is_deleted = 0 AND ta.status = 'assigned'
        AND ta.pickup_datetime <= ?
      ORDER BY ta.pickup_datetime ASC LIMIT 10
    `).bind(sevenDays).all(),
    // Expiring documents count
    db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM vehicle_documents WHERE is_active = 1 AND expiry_date <= ?) +
        (SELECT COUNT(*) FROM driver_documents WHERE is_active = 1 AND expiry_date <= ?)
      as count
    `).bind(thirtyDays, thirtyDays).first<{ count: number }>(),
    // Maintenance due
    db.prepare("SELECT COUNT(*) as count FROM vehicles WHERE is_deleted = 0 AND next_service_due IS NOT NULL AND next_service_due <= ?")
      .bind(fifteenDays).first<{ count: number }>(),
    // Recent completed
    db.prepare(`
      SELECT ta.*, d.name as driver_name, v.registration_number,
             (SELECT SUM(amount) FROM trip_costs WHERE trip_id = ta.id) as total_cost
      FROM trip_assignments ta
      LEFT JOIN drivers d ON d.id = ta.driver_id
      LEFT JOIN vehicles v ON v.id = ta.vehicle_id
      WHERE ta.is_deleted = 0 AND ta.status = 'completed'
      ORDER BY ta.completed_at DESC LIMIT 5
    `).all(),
    // Top drivers: active drivers ranked by completed trips, then rating. Drivers with no trips yet are
    // still listed (a fresh fleet must not show an empty widget); trips are counted from the assignments
    // themselves so the figure does not depend on the denormalised drivers.total_trips counter.
    db.prepare(`
      SELECT d.id, d.name, d.phone, d.rating,
             MAX(COALESCE(d.total_trips, 0), COUNT(ta.id)) AS total_trips
      FROM drivers d
      LEFT JOIN trip_assignments ta
        ON ta.driver_id = d.id AND ta.is_deleted = 0 AND ta.status = 'completed'
      WHERE d.is_deleted = 0 AND d.status IN ('active', 'on_trip')
      GROUP BY d.id
      ORDER BY total_trips DESC, d.rating DESC, d.name ASC
      LIMIT 5
    `).all(),
    // Revenue this month (from invoices linked to trips)
    db.prepare(`
      SELECT COALESCE(SUM(i.total), 0) as revenue, COUNT(DISTINCT ta.id) as trips,
             COALESCE(SUM(tc_total.cost_sum), 0) as costs
      FROM trip_assignments ta
      LEFT JOIN invoices i ON i.id = ta.invoice_id
      LEFT JOIN (SELECT trip_id, SUM(amount) as cost_sum FROM trip_costs GROUP BY trip_id) tc_total ON tc_total.trip_id = ta.id
      WHERE ta.is_deleted = 0 AND ta.status = 'completed' AND ta.completed_at >= ?
    `).bind(thisMonthStart).first(),
    // Revenue last month
    db.prepare(`
      SELECT COALESCE(SUM(i.total), 0) as revenue, COUNT(DISTINCT ta.id) as trips
      FROM trip_assignments ta
      LEFT JOIN invoices i ON i.id = ta.invoice_id
      WHERE ta.is_deleted = 0 AND ta.status = 'completed' AND ta.completed_at >= ? AND ta.completed_at < ?
    `).bind(lastMonthStart, thisMonthStart).first(),
    // Revenue by vehicle type
    db.prepare(`
      SELECT v.type as vehicle_type, COUNT(DISTINCT ta.id) as trips,
             COALESCE(SUM(COALESCE(ta.actual_cost, ta.estimated_cost, 0)), 0) as revenue
      FROM trip_assignments ta
      LEFT JOIN vehicles v ON v.id = ta.vehicle_id
      WHERE ta.is_deleted = 0 AND ta.status = 'completed' AND ta.completed_at >= ?
      GROUP BY v.type ORDER BY revenue DESC LIMIT 5
    `).bind(thisMonthStart).all(),
    // Revenue by driver
    db.prepare(`
      SELECT d.id, d.name, COUNT(DISTINCT ta.id) as trips,
             COALESCE(SUM(COALESCE(ta.actual_cost, ta.estimated_cost, 0)), 0) as revenue
      FROM trip_assignments ta
      LEFT JOIN drivers d ON d.id = ta.driver_id
      WHERE ta.is_deleted = 0 AND ta.status = 'completed' AND ta.completed_at >= ?
      GROUP BY d.id ORDER BY revenue DESC LIMIT 5
    `).bind(thisMonthStart).all(),
  ]);

  // Build vehicle summary
  const vehicleSummary: Record<string, number> = { total: 0, available: 0, on_trip: 0, under_maintenance: 0, out_of_service: 0 };
  for (const row of (vehicleCounts.results || [])) {
    vehicleSummary[row.status as string] = row.count as number;
    vehicleSummary.total += row.count as number;
  }

  // Build driver summary
  const driverSummary: Record<string, number> = { total: 0, active: 0, on_trip: 0, off_duty: 0, on_leave: 0 };
  for (const row of (driverCounts.results || [])) {
    driverSummary[row.status as string] = row.count as number;
    driverSummary.total += row.count as number;
  }

  return success(c, {
    vehicleSummary,
    driverSummary,
    activeTrips: (activeTrips.results || []).map(parseTripRow),
    upcomingTrips: (upcomingTrips.results || []).map(parseTripRow),
    expiringDocuments: expiringDocs?.count ?? 0,
    maintenanceDue: maintenanceDue?.count ?? 0,
    recentCompleted: (recentCompleted.results || []).map((r: any) => ({
      ...parseTripRow(r),
      totalCost: r.total_cost ?? 0,
    })),
    topDrivers: (topDrivers.results || []).map((d: any) => ({
      id: d.id, name: d.name, phone: d.phone,
      rating: d.rating, totalTrips: d.total_trips,
    })),
    revenue: {
      thisMonth: (revenueThisMonth as any)?.revenue ?? 0,
      thisMonthTrips: (revenueThisMonth as any)?.trips ?? 0,
      thisMonthCosts: (revenueThisMonth as any)?.costs ?? 0,
      lastMonth: (revenueLastMonth as any)?.revenue ?? 0,
      lastMonthTrips: (revenueLastMonth as any)?.trips ?? 0,
      byVehicleType: (revenueByVehicleType.results || []).map((r: any) => ({
        vehicleType: r.vehicle_type ?? 'unknown',
        trips: r.trips,
        revenue: r.revenue,
      })),
      byDriver: (revenueByDriver.results || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        trips: r.trips,
        revenue: r.revenue,
      })),
    },
  });
});

// ============================================================================
// ROW PARSERS
// ============================================================================

function parseVehicle(row: Record<string, any>) {
  return {
    id: row.id,
    registrationNumber: row.registration_number,
    type: row.type,
    make: row.make ?? null,
    model: row.model ?? null,
    year: row.year ?? null,
    seatingCapacity: row.seating_capacity ?? null,
    color: row.color ?? null,
    photoUrl: row.photo_url ?? null,
    status: row.status ?? 'available',
    insuranceExpiry: row.insurance_expiry ?? null,
    permitExpiry: row.permit_expiry ?? null,
    pollutionExpiry: row.pollution_expiry ?? null,
    lastServiceDate: row.last_service_date ?? null,
    nextServiceDue: row.next_service_due ?? null,
    odometerKm: row.odometer_km ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseVehicleDocument(row: Record<string, any>, today: string) {
  const expiryDate = row.expiry_date;
  const daysUntil = expiryDate ? daysBetweenLocal(today, expiryDate) : null;
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    type: row.type,
    documentNumber: row.document_number ?? null,
    fileUrl: row.file_url ?? null,
    fileName: row.file_name ?? null,
    expiryDate: row.expiry_date ?? null,
    issuedDate: row.issued_date ?? null,
    isActive: row.is_active === 1,
    isExpired: daysUntil !== null && daysUntil < 0,
    daysUntilExpiry: daysUntil,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseDriver(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email ?? null,
    photoUrl: row.photo_url ?? null,
    licenseNumber: row.license_number ?? null,
    licenseExpiry: row.license_expiry ?? null,
    address: row.address ?? null,
    emergencyContactName: row.emergency_contact_name ?? null,
    emergencyContactPhone: row.emergency_contact_phone ?? null,
    status: row.status ?? 'active',
    rating: row.rating ?? 0,
    totalTrips: row.total_trips ?? 0,
    dateOfJoining: row.date_of_joining ?? null,
    notes: row.notes ?? null,
    crewRole: row.crew_role ?? 'driver',
    userId: row.user_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseDriverDocument(row: Record<string, any>, today: string) {
  const expiryDate = row.expiry_date;
  const daysUntil = expiryDate ? daysBetweenLocal(today, expiryDate) : null;
  return {
    id: row.id,
    driverId: row.driver_id,
    type: row.type,
    documentNumber: row.document_number ?? null,
    fileUrl: row.file_url ?? null,
    fileName: row.file_name ?? null,
    expiryDate: row.expiry_date ?? null,
    issuedDate: row.issued_date ?? null,
    isActive: row.is_active === 1,
    isExpired: daysUntil !== null && daysUntil < 0,
    daysUntilExpiry: daysUntil,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseTripRow(row: Record<string, any>) {
  return {
    id: row.id,
    leadId: row.lead_id ?? null,
    vehicleId: row.vehicle_id ?? null,
    driverId: row.driver_id ?? null,
    pickupLocation: row.pickup_location ?? null,
    dropLocation: row.drop_location ?? null,
    pickupDatetime: row.pickup_datetime ?? null,
    dropDatetime: row.drop_datetime ?? null,
    status: row.status ?? 'assigned',
    passengerName: row.passenger_name ?? null,
    passengerPhone: row.passenger_phone ?? null,
    specialInstructions: row.special_instructions ?? null,
    assignedBy: row.assigned_by ?? null,
    acceptedAt: row.accepted_at ?? null,
    enRouteAt: row.en_route_at ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    cancellationReason: row.cancellation_reason ?? null,
    // M19: Check-in/check-out
    checkInAt: row.check_in_at ?? null,
    checkInLat: row.check_in_lat ?? null,
    checkInLng: row.check_in_lng ?? null,
    checkOutAt: row.check_out_at ?? null,
    checkOutLat: row.check_out_lat ?? null,
    checkOutLng: row.check_out_lng ?? null,
    // M20: Costing + location + links
    tripType: row.trip_type ?? 'one_way',
    rateCardId: row.rate_card_id ?? null,
    estimatedDistanceKm: row.estimated_distance_km ?? null,
    estimatedDurationMin: row.estimated_duration_min ?? null,
    estimatedCost: row.estimated_cost ?? null,
    estimatedBreakdown: row.estimated_breakdown ? JSON.parse(row.estimated_breakdown) : null,
    actualDistanceKm: row.actual_distance_km ?? null,
    actualDurationMin: row.actual_duration_min ?? null,
    actualCost: row.actual_cost ?? null,
    actualBreakdown: row.actual_breakdown ? JSON.parse(row.actual_breakdown) : null,
    costOverride: row.cost_override ?? null,
    costOverrideReason: row.cost_override_reason ?? null,
    pickupLat: row.pickup_lat ?? null,
    pickupLng: row.pickup_lng ?? null,
    dropLat: row.drop_lat ?? null,
    dropLng: row.drop_lng ?? null,
    contactId: row.contact_id ?? null,
    invoiceId: row.invoice_id ?? null,
    voucherId: row.voucher_id ?? null,
    // R145: coach trips
    tripKind: row.trip_kind ?? 'transfer',
    departureId: row.departure_id ?? null,
    tourLeaderId: row.tour_leader_id ?? null,
    tourLeaderName: row.tour_leader_name ?? null,
    ...(row.stop_count !== undefined && {
      stopCount: row.stop_count ?? 0,
      headcount: { expected: row.pax_expected ?? 0, boarded: row.pax_boarded ?? 0, noShow: row.pax_no_show ?? 0 },
    }),
    // Joined fields
    driverName: row.driver_name ?? null,
    driverPhone: row.driver_phone ?? null,
    vehicleRegistration: row.registration_number ?? null,
    vehicleType: row.vehicle_type ?? null,
    contactName: row.contact_name ?? null,
    rateCardName: row.rate_card_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// VEHICLE RATE CARDS CRUD (M20)
// ============================================================================

// List rate cards
fleet.get('/vehicle-rate-cards', zValidator('query', rateCardListSchema), async (c) => {
  const db = c.get('tenantDb');
  const { page, limit, vehicleType, tripType, isActive, search } = c.req.valid('query');
  const offset = (page - 1) * limit;

  const conditions: string[] = ['is_deleted = 0'];
  const params: any[] = [];

  if (vehicleType) { conditions.push('vehicle_type = ?'); params.push(vehicleType); }
  if (tripType) { conditions.push('trip_type = ?'); params.push(tripType); }
  if (isActive !== undefined) { conditions.push('is_active = ?'); params.push(isActive === '1' ? 1 : 0); }
  if (search) { conditions.push('name LIKE ?'); params.push(`%${search}%`); }

  const whereClause = conditions.join(' AND ');

  const agencyCurrency = (await loadLocaleContext(db)).currency;
  const [countResult, rows] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as total FROM vehicle_rate_cards WHERE ${whereClause}`).bind(...params).first<{ total: number }>(),
    db.prepare(`SELECT * FROM vehicle_rate_cards WHERE ${whereClause} ORDER BY vehicle_type ASC, trip_type ASC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all(),
  ]);

  return paginated(c, (rows.results || []).map((r) => parseRateCardRow(r, agencyCurrency)), countResult?.total ?? 0, page, limit);
});

// Lookup rate card by vehicle type + trip type
fleet.get('/vehicle-rate-cards/lookup', zValidator('query', rateCardLookupSchema), async (c) => {
  const db = c.get('tenantDb');
  const { vehicleType, tripType } = c.req.valid('query');
  // valid_from / valid_to are local calendar dates, inclusive on both ends
  const { today: now } = await tenantToday(c);

  const row = await db.prepare(`
    SELECT * FROM vehicle_rate_cards
    WHERE vehicle_type = ? AND trip_type = ? AND is_active = 1 AND is_deleted = 0
      AND (valid_from IS NULL OR valid_from <= ?)
      AND (valid_to IS NULL OR valid_to >= ?)
    ORDER BY created_at DESC LIMIT 1
  `).bind(vehicleType, tripType, now, now).first();

  if (!row) return success(c, null);
  return success(c, parseRateCardRow(row, row.currency ? null : (await loadLocaleContext(db)).currency));
});

// Get single rate card
fleet.get('/vehicle-rate-cards/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const row = await db.prepare('SELECT * FROM vehicle_rate_cards WHERE id = ? AND is_deleted = 0').bind(id).first();
  if (!row) return notFound(c, 'Rate card');
  return success(c, parseRateCardRow(row, row.currency ? null : (await loadLocaleContext(db)).currency));
});

// Create rate card
fleet.post('/vehicle-rate-cards', zValidator('json', createRateCardSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const tenantId = c.get('tenantId');
  const data = c.req.valid('json');
  const id = generateId();
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO vehicle_rate_cards (
      id, tenant_id, name, vehicle_type, trip_type, base_fare, per_km_rate, per_hour_rate,
      min_km, min_hours, night_charge, driver_allowance, flat_rate, extra_km_rate, extra_hour_rate,
      toll_included, parking_included, currency, valid_from, valid_to, notes, is_active,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, tenantId, data.name, data.vehicleType, data.tripType,
    data.baseFare, data.perKmRate, data.perHourRate,
    data.minKm, data.minHours, data.nightCharge, data.driverAllowance,
    data.flatRate ?? null, data.extraKmRate, data.extraHourRate,
    data.tollIncluded ? 1 : 0, data.parkingIncluded ? 1 : 0,
    data.currency?.toUpperCase() ?? (await loadLocaleContext(db)).currency, data.validFrom ?? null, data.validTo ?? null,
    data.notes ?? null, data.isActive ? 1 : 0,
    userId, now, now,
  ).run();

  await logActivity(db as any, {
    userId, action: 'create', entityType: 'vehicle_rate_card', entityId: id,
    details: JSON.stringify({ name: data.name, vehicleType: data.vehicleType, tripType: data.tripType }),
    ipAddress: c.get('clientIp'),
  });

  const row = await db.prepare('SELECT * FROM vehicle_rate_cards WHERE id = ?').bind(id).first();
  return created(c, parseRateCardRow(row!));
});

// Update rate card
fleet.put('/vehicle-rate-cards/:id', zValidator('json', updateRateCardSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const now = new Date().toISOString();

  const existing = await db.prepare('SELECT * FROM vehicle_rate_cards WHERE id = ? AND is_deleted = 0').bind(id).first();
  if (!existing) return notFound(c, 'Rate card');

  const sets: string[] = ['updated_at = ?'];
  const params: any[] = [now];
  const fieldMap: Record<string, string> = {
    name: 'name', vehicleType: 'vehicle_type', tripType: 'trip_type',
    baseFare: 'base_fare', perKmRate: 'per_km_rate', perHourRate: 'per_hour_rate',
    minKm: 'min_km', minHours: 'min_hours', nightCharge: 'night_charge',
    driverAllowance: 'driver_allowance', flatRate: 'flat_rate',
    extraKmRate: 'extra_km_rate', extraHourRate: 'extra_hour_rate',
    currency: 'currency', validFrom: 'valid_from', validTo: 'valid_to', notes: 'notes',
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if ((data as any)[key] !== undefined) {
      sets.push(`${col} = ?`);
      params.push((data as any)[key] ?? null);
    }
  }
  if (data.tollIncluded !== undefined) { sets.push('toll_included = ?'); params.push(data.tollIncluded ? 1 : 0); }
  if (data.parkingIncluded !== undefined) { sets.push('parking_included = ?'); params.push(data.parkingIncluded ? 1 : 0); }
  if (data.isActive !== undefined) { sets.push('is_active = ?'); params.push(data.isActive ? 1 : 0); }

  params.push(id);
  await db.prepare(`UPDATE vehicle_rate_cards SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  const row = await db.prepare('SELECT * FROM vehicle_rate_cards WHERE id = ?').bind(id).first();
  return success(c, parseRateCardRow(row!));
});

// Delete rate card (soft)
fleet.delete('/vehicle-rate-cards/:id', async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const now = new Date().toISOString();

  const existing = await db.prepare('SELECT id FROM vehicle_rate_cards WHERE id = ? AND is_deleted = 0').bind(id).first();
  if (!existing) return notFound(c, 'Rate card');

  await db.prepare('UPDATE vehicle_rate_cards SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(now, id).run();
  return success(c, { deleted: true });
});

// ============================================================================
// COST ESTIMATION + DISTANCE CALCULATION (M20)
// ============================================================================

// Calculate distance between two points
fleet.post('/calculate-distance', zValidator('json', calculateDistanceSchema), async (c) => {
  const data = c.req.valid('json');
  const apiKey = (c.env as any).GOOGLE_MAPS_API_KEY;
  const result = await calculateDistance(data.originLat, data.originLng, data.destLat, data.destLng, apiKey);
  return success(c, result);
});

// Estimate cost from rate card + distance
fleet.post('/vehicle-rate-cards/estimate', zValidator('json', costEstimateSchema), async (c) => {
  const db = c.get('tenantDb');
  const data = c.req.valid('json');

  const row = await db.prepare('SELECT * FROM vehicle_rate_cards WHERE id = ? AND is_deleted = 0').bind(data.rateCardId).first();
  if (!row) return notFound(c, 'Rate card');

  const rateCard: RateCard = {
    flatRate: row.flat_rate as number | null,
    baseFare: row.base_fare as number,
    perKmRate: row.per_km_rate as number,
    perHourRate: row.per_hour_rate as number,
    minKm: row.min_km as number,
    minHours: row.min_hours as number,
    nightCharge: row.night_charge as number,
    driverAllowance: row.driver_allowance as number,
    extraKmRate: row.extra_km_rate as number,
    extraHourRate: row.extra_hour_rate as number,
    tollIncluded: row.toll_included as number,
    parkingIncluded: row.parking_included as number,
    tripType: row.trip_type as string,
  };

  const breakdown = calculateTripCost(rateCard, {
    distanceKm: data.distanceKm,
    durationMinutes: data.durationMinutes,
    numDays: data.numDays,
    numNights: data.numNights,
    isNightTrip: data.isNightTrip,
  });

  return success(c, { rateCard: parseRateCardRow(row, row.currency ? null : (await loadLocaleContext(db)).currency), breakdown });
});

// Generate invoice for completed trip
fleet.post('/trips/:id/generate-invoice', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const tripId = c.req.param('id');

  const trip = await db.prepare('SELECT * FROM trip_assignments WHERE id = ? AND is_deleted = 0').bind(tripId).first();
  if (!trip) return notFound(c, 'Trip');
  if (trip.invoice_id) return error(c, 'Invoice already exists for this trip', 400);
  if (!trip.contact_id) return error(c, 'Trip has no linked contact for invoicing', 400);

  try {
    const { generateTripInvoice } = await import('../services/trip-invoice-generator');
    const invoice = await generateTripInvoice(db, trip, userId);
    return created(c, invoice);
  } catch (err: any) {
    return error(c, err.message || 'Failed to generate invoice', 500);
  }
});

// Generate voucher for trip
fleet.post('/trips/:id/generate-voucher', async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const tripId = c.req.param('id');

  const trip = await db.prepare(`
    SELECT ta.*, d.name as driver_name, d.phone as driver_phone,
           v.registration_number, v.type as vehicle_type
    FROM trip_assignments ta
    LEFT JOIN drivers d ON d.id = ta.driver_id
    LEFT JOIN vehicles v ON v.id = ta.vehicle_id
    WHERE ta.id = ? AND ta.is_deleted = 0
  `).bind(tripId).first();
  if (!trip) return notFound(c, 'Trip');
  if (trip.voucher_id) return error(c, 'Voucher already exists for this trip', 400);

  const voucherId = generateId();
  const now = new Date().toISOString();
  const detailsJson = JSON.stringify({
    driverName: trip.driver_name, driverPhone: trip.driver_phone,
    vehicleType: trip.vehicle_type, vehicleRegistration: trip.registration_number,
    pickupLocation: trip.pickup_location, dropLocation: trip.drop_location,
    pickupDatetime: trip.pickup_datetime, dropDatetime: trip.drop_datetime,
    passengerName: trip.passenger_name, passengerPhone: trip.passenger_phone,
    tripType: trip.trip_type ?? 'one_way',
    estimatedCost: trip.estimated_cost,
  });

  await db.prepare(`
    INSERT INTO vouchers (id, lead_id, type, title, details_json, status, created_by, created_at, updated_at)
    VALUES (?, ?, 'transport', ?, ?, 'draft', ?, ?, ?)
  `).bind(voucherId, trip.lead_id ?? '', `Transport - ${trip.passenger_name || 'Trip'}`, detailsJson, userId, now, now).run();

  await db.prepare('UPDATE trip_assignments SET voucher_id = ?, updated_at = ? WHERE id = ?').bind(voucherId, now, tripId).run();

  return created(c, { voucherId, tripId });
});

// ============================================================================
// HELPERS
// ============================================================================

function parseRateCardRow(row: Record<string, any>, agencyCurrency: string | null = null) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    vehicleType: row.vehicle_type,
    tripType: row.trip_type,
    baseFare: row.base_fare ?? 0,
    perKmRate: row.per_km_rate ?? 0,
    perHourRate: row.per_hour_rate ?? 0,
    minKm: row.min_km ?? 0,
    minHours: row.min_hours ?? 0,
    nightCharge: row.night_charge ?? 0,
    driverAllowance: row.driver_allowance ?? 0,
    flatRate: row.flat_rate ?? null,
    extraKmRate: row.extra_km_rate ?? 0,
    extraHourRate: row.extra_hour_rate ?? 0,
    tollIncluded: row.toll_included === 1,
    parkingIncluded: row.parking_included === 1,
    currency: row.currency ?? agencyCurrency,
    validFrom: row.valid_from ?? null,
    validTo: row.valid_to ?? null,
    notes: row.notes ?? null,
    isActive: row.is_active === 1,
    isDeleted: row.is_deleted === 1,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default fleet;
