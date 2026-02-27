import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, created, paginated, error, notFound, forbidden } from '../utils/response';
import { hasPermission, type Role } from '../constants/permissions';

const voucherRoutes = new Hono<AppContext>();

// ============================================================
// Zod Schemas — Type-specific details validation
// ============================================================

const hotelDetailsSchema = z.object({
  guestNames: z.array(z.string()).min(1),
  hotelName: z.string().min(1),
  hotelAddress: z.string().optional(),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  roomType: z.string().min(1),
  roomCount: z.number().int().min(1).default(1),
  mealPlan: z.enum(['EP', 'CP', 'MAP', 'AP', 'AI']).default('EP'),
  specialRequests: z.string().optional(),
  confirmationNumber: z.string().optional(),
  emergencyContact: z.string().optional(),
});

const transportDetailsSchema = z.object({
  vehicleType: z.string().min(1),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  pickupLocation: z.string().min(1),
  pickupTime: z.string().min(1),
  pickupMapsLink: z.string().url().optional().or(z.literal('')),
  dropLocation: z.string().min(1),
  dropMapsLink: z.string().url().optional().or(z.literal('')),
  route: z.string().optional(),
  sightseeing: z.array(z.string()).optional(),
  terms: z.string().optional(),
});

const flightDetailsSchema = z.object({
  airline: z.string().min(1),
  flightNumber: z.string().min(1),
  departureAirport: z.string().min(1),
  departureTime: z.string().min(1),
  departureTerminal: z.string().optional(),
  arrivalAirport: z.string().min(1),
  arrivalTime: z.string().min(1),
  arrivalTerminal: z.string().optional(),
  passengers: z.array(z.object({
    name: z.string().min(1),
    pnr: z.string().optional(),
  })).min(1),
  pnr: z.string().optional(),
  baggageAllowance: z.string().optional(),
  seatNumbers: z.string().optional(),
  travelClass: z.enum(['economy', 'premium_economy', 'business', 'first']).default('economy'),
  mealPreference: z.string().optional(),
});

const activityDetailsSchema = z.object({
  activityName: z.string().min(1),
  dateTime: z.string().min(1),
  meetingPoint: z.string().min(1),
  meetingPointMapsLink: z.string().url().optional().or(z.literal('')),
  duration: z.string().optional(),
  whatToBring: z.array(z.string()).optional(),
  inclusions: z.array(z.string()).optional(),
  emergencyContact: z.string().optional(),
  operatorContact: z.string().optional(),
});

const detailsSchemasMap: Record<string, z.ZodTypeAny> = {
  hotel: hotelDetailsSchema,
  transport: transportDetailsSchema,
  flight: flightDetailsSchema,
  activity: activityDetailsSchema,
};

const createVoucherSchema = z.object({
  leadId: z.string().min(1),
  type: z.enum(['hotel', 'transport', 'flight', 'activity']),
  supplierId: z.string().optional().nullable(),
  title: z.string().min(1),
  details: z.record(z.string(), z.any()),
  language: z.string().default('en'),
  notes: z.string().optional().nullable(),
});

const updateVoucherSchema = z.object({
  title: z.string().min(1).optional(),
  supplierId: z.string().optional().nullable(),
  details: z.record(z.string(), z.any()).optional(),
  language: z.string().optional(),
  notes: z.string().optional().nullable(),
});

// ============================================================
// Permission helpers
// ============================================================

function checkPermission(role: string, permission: 'view' | 'create' | 'edit' | 'delete'): boolean {
  return hasPermission(role as Role, 'vouchers', permission);
}

// ============================================================
// GET / — List vouchers with pagination & filters
// ============================================================

voucherRoutes.get('/', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');

  if (!checkPermission(role, 'view')) {
    return forbidden(c, 'You do not have permission to view vouchers');
  }

  const url = new URL(c.req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  // Filters
  const leadId = url.searchParams.get('leadId') || url.searchParams.get('lead_id');
  const type = url.searchParams.get('type');
  const status = url.searchParams.get('status');
  const supplierId = url.searchParams.get('supplierId') || url.searchParams.get('supplier_id');
  const createdBy = url.searchParams.get('createdBy') || url.searchParams.get('created_by');
  const search = url.searchParams.get('search') || '';
  const dateFrom = url.searchParams.get('dateFrom') || url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('dateTo') || url.searchParams.get('date_to');

  let whereClause = 'v.is_deleted = 0';
  const params: any[] = [];
  let paramIdx = 1;

  if (leadId) {
    whereClause += ` AND v.lead_id = ?${paramIdx++}`;
    params.push(leadId);
  }
  if (type) {
    whereClause += ` AND v.type = ?${paramIdx++}`;
    params.push(type);
  }
  if (status) {
    whereClause += ` AND v.status = ?${paramIdx++}`;
    params.push(status);
  }
  if (supplierId) {
    whereClause += ` AND v.supplier_id = ?${paramIdx++}`;
    params.push(supplierId);
  }
  if (createdBy) {
    whereClause += ` AND v.created_by = ?${paramIdx++}`;
    params.push(createdBy);
  }
  if (dateFrom) {
    whereClause += ` AND v.created_at >= ?${paramIdx++}`;
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ` AND v.created_at <= ?${paramIdx++}`;
    params.push(dateTo);
  }
  if (search) {
    whereClause += ` AND (v.title LIKE ?${paramIdx} OR l.title LIKE ?${paramIdx})`;
    params.push(`%${search}%`);
    paramIdx++;
  }

  // RBAC: salesperson sees own leads' vouchers only
  if (role === 'salesperson') {
    whereClause += ` AND (v.created_by = ?${paramIdx} OR l.assigned_to = ?${paramIdx})`;
    params.push(userId);
    paramIdx++;
  }

  try {
    const countResult = await tenantDb
      .prepare(`SELECT COUNT(*) as count FROM vouchers v LEFT JOIN leads l ON v.lead_id = l.id WHERE ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();
    const total = countResult?.count || 0;

    const vouchers = await tenantDb
      .prepare(`
        SELECT v.id, v.title, v.type, v.status, v.language, v.lead_id,
               v.supplier_id, v.sent_via, v.sent_at, v.confirmed_at,
               v.created_by, v.created_at, v.updated_at, v.details_json,
               l.title as lead_name,
               s.company_name as supplier_name
        FROM vouchers v
        LEFT JOIN leads l ON v.lead_id = l.id
        LEFT JOIN suppliers s ON v.supplier_id = s.id
        WHERE ${whereClause}
        ORDER BY v.created_at DESC
        LIMIT ?${paramIdx} OFFSET ?${paramIdx + 1}
      `)
      .bind(...params, limit, offset)
      .all<Record<string, unknown>>();

    const mappedVouchers = (vouchers.results || []).map((v) => {
      const details = v.details_json ? JSON.parse(v.details_json as string) : {};
      const { details_json, ...rest } = v;
      return { ...rest, details };
    });

    return paginated(c, mappedVouchers, total, page, limit);
  } catch (err) {
    console.error('Error listing vouchers:', err);
    return error(c, 'Failed to list vouchers', 500);
  }
});

// ============================================================
// GET /by-lead/:leadId — Vouchers for a specific lead, grouped by type
// ============================================================

voucherRoutes.get('/by-lead/:leadId', async (c) => {
  const tenantDb = c.get('tenantDb');
  const role = c.get('role');
  const leadId = c.req.param('leadId');

  if (!checkPermission(role, 'view')) {
    return forbidden(c, 'You do not have permission to view vouchers');
  }

  try {
    const vouchers = await tenantDb
      .prepare(`
        SELECT v.*, s.company_name as supplier_name
        FROM vouchers v
        LEFT JOIN suppliers s ON v.supplier_id = s.id
        WHERE v.lead_id = ?1 AND v.is_deleted = 0
        ORDER BY v.type, v.created_at DESC
      `)
      .bind(leadId)
      .all<Record<string, unknown>>();

    // Group by type
    const grouped: Record<string, any[]> = { hotel: [], transport: [], flight: [], activity: [] };
    for (const v of (vouchers.results || [])) {
      const vType = v.type as string;
      if (grouped[vType]) {
        grouped[vType].push({
          ...v,
          details: v.details_json ? JSON.parse(v.details_json as string) : null,
        });
      }
    }

    return success(c, grouped);
  } catch (err) {
    console.error('Error fetching vouchers by lead:', err);
    return error(c, 'Failed to fetch vouchers', 500);
  }
});

// ============================================================
// POST / — Create voucher
// ============================================================

voucherRoutes.post('/', zValidator('json', createVoucherSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');

  if (!checkPermission(role, 'create')) {
    return forbidden(c, 'You do not have permission to create vouchers');
  }

  const data = c.req.valid('json');

  // Validate type-specific details
  const detailsSchema = detailsSchemasMap[data.type];
  if (detailsSchema) {
    const result = detailsSchema.safeParse(data.details);
    if (!result.success) {
      return error(c, 'Invalid voucher details', 422, {
        type: data.type,
        errors: result.error.flatten().fieldErrors,
      });
    }
  }

  try {
    // Verify lead exists
    const lead = await tenantDb
      .prepare('SELECT id FROM leads WHERE id = ?1')
      .bind(data.leadId)
      .first<{ id: string }>();

    if (!lead) return notFound(c, 'Lead');

    const voucherId = generateId();
    const now = new Date().toISOString();

    await tenantDb
      .prepare(`
        INSERT INTO vouchers (id, lead_id, type, supplier_id, title, details_json, status, language, notes, created_by, created_at, updated_at, is_deleted)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0)
      `)
      .bind(
        voucherId,
        data.leadId,
        data.type,
        data.supplierId || null,
        data.title,
        JSON.stringify(data.details),
        'draft',
        data.language || 'en',
        data.notes || null,
        userId,
        now,
        now
      )
      .run();

    return created(c, {
      id: voucherId,
      leadId: data.leadId,
      type: data.type,
      title: data.title,
      status: 'draft',
      language: data.language || 'en',
      createdAt: now,
    });
  } catch (err) {
    console.error('Error creating voucher:', err);
    return error(c, 'Failed to create voucher', 500);
  }
});

// ============================================================
// POST /from-itinerary-item — Create voucher from itinerary item (pre-fill)
// ============================================================

voucherRoutes.post('/from-itinerary-item', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');

  if (!checkPermission(role, 'create')) {
    return forbidden(c, 'You do not have permission to create vouchers');
  }

  const body = await c.req.json();
  const itineraryItemId = body.itinerary_item_id || body.itineraryItemId;

  if (!itineraryItemId) {
    return error(c, 'itinerary_item_id is required', 400);
  }

  try {
    // Fetch itinerary item with lead context
    const item = await tenantDb
      .prepare(`
        SELECT ii.*, id.itinerary_id, i.lead_id, i.title as itinerary_title
        FROM itinerary_items ii
        JOIN itinerary_days id ON ii.day_id = id.id
        JOIN itineraries i ON id.itinerary_id = i.id
        WHERE ii.id = ?1
      `)
      .bind(itineraryItemId)
      .first<Record<string, any>>();

    if (!item) return notFound(c, 'Itinerary item');

    // Check if voucher already exists for this item
    const existing = await tenantDb
      .prepare('SELECT id FROM vouchers WHERE itinerary_item_id = ?1 AND is_deleted = 0')
      .bind(itineraryItemId)
      .first<{ id: string }>();

    const itemDetails = item.details_json ? JSON.parse(item.details_json) : {};
    const itemType = (item.type as string) || 'activity';

    // Map itinerary item details to voucher details
    const voucherDetails = mapItemToVoucherDetails(itemType, item, itemDetails);
    const voucherTitle = item.title || `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} Voucher`;

    const voucherId = generateId();
    const now = new Date().toISOString();

    await tenantDb
      .prepare(`
        INSERT INTO vouchers (id, lead_id, type, supplier_id, title, details_json, itinerary_item_id, status, language, created_by, created_at, updated_at, is_deleted)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0)
      `)
      .bind(
        voucherId,
        item.lead_id,
        itemType,
        item.supplier_id || null,
        voucherTitle,
        JSON.stringify(voucherDetails),
        itineraryItemId,
        'draft',
        'en',
        userId,
        now,
        now
      )
      .run();

    return created(c, {
      id: voucherId,
      leadId: item.lead_id,
      type: itemType,
      title: voucherTitle,
      status: 'draft',
      itineraryItemId,
      existingVoucher: existing?.id || null,
      createdAt: now,
    });
  } catch (err) {
    console.error('Error creating voucher from itinerary item:', err);
    return error(c, 'Failed to create voucher from itinerary item', 500);
  }
});

function mapItemToVoucherDetails(type: string, item: any, details: any): Record<string, any> {
  switch (type) {
    case 'hotel':
      return {
        guestNames: [],
        hotelName: item.title || details.hotel_name || '',
        hotelAddress: details.address || '',
        checkIn: item.time_start || details.check_in || '',
        checkOut: item.time_end || details.check_out || '',
        roomType: details.room_type || 'Deluxe',
        roomCount: details.room_count || 1,
        mealPlan: details.meal_plan || 'EP',
        specialRequests: details.special_requests || '',
      };
    case 'transport':
      return {
        vehicleType: details.vehicle_type || '',
        driverName: details.driver_name || '',
        driverPhone: details.driver_phone || '',
        pickupLocation: details.pickup || item.description || '',
        pickupTime: item.time_start || '',
        dropLocation: details.drop || '',
      };
    case 'flight':
      return {
        airline: details.airline || '',
        flightNumber: details.flight_number || '',
        departureAirport: details.departure_airport || '',
        departureTime: item.time_start || details.departure_time || '',
        arrivalAirport: details.arrival_airport || '',
        arrivalTime: item.time_end || details.arrival_time || '',
        passengers: details.passengers || [],
        travelClass: details.travel_class || 'economy',
      };
    case 'activity':
      return {
        activityName: item.title || details.activity_name || '',
        dateTime: item.time_start || '',
        meetingPoint: details.meeting_point || details.location || '',
        duration: details.duration || '',
        whatToBring: details.what_to_bring || [],
        inclusions: details.inclusions || [],
      };
    default:
      return details;
  }
}

// ============================================================
// GET /:id — Get single voucher with relations
// ============================================================

voucherRoutes.get('/:id', async (c) => {
  const tenantDb = c.get('tenantDb');
  const role = c.get('role');
  const voucherId = c.req.param('id');

  if (!checkPermission(role, 'view')) {
    return forbidden(c, 'You do not have permission to view vouchers');
  }

  try {
    const voucher = await tenantDb
      .prepare(`
        SELECT v.*,
               l.title as lead_name, l.contact_id,
               s.company_name as supplier_name
        FROM vouchers v
        LEFT JOIN leads l ON v.lead_id = l.id
        LEFT JOIN suppliers s ON v.supplier_id = s.id
        WHERE v.id = ?1 AND v.is_deleted = 0
      `)
      .bind(voucherId)
      .first<Record<string, unknown>>();

    if (!voucher) return notFound(c, 'Voucher');

    return success(c, {
      ...voucher,
      details: voucher.details_json ? JSON.parse(voucher.details_json as string) : null,
    });
  } catch (err) {
    console.error('Error fetching voucher:', err);
    return error(c, 'Failed to fetch voucher', 500);
  }
});

// ============================================================
// PUT /:id — Update voucher (only if draft)
// ============================================================

voucherRoutes.put('/:id', zValidator('json', updateVoucherSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const role = c.get('role');
  const voucherId = c.req.param('id');

  if (!checkPermission(role, 'edit')) {
    return forbidden(c, 'You do not have permission to edit vouchers');
  }

  const data = c.req.valid('json');

  try {
    const voucher = await tenantDb
      .prepare('SELECT id, status, type FROM vouchers WHERE id = ?1 AND is_deleted = 0')
      .bind(voucherId)
      .first<{ id: string; status: string; type: string }>();

    if (!voucher) return notFound(c, 'Voucher');
    if (voucher.status !== 'draft') {
      return error(c, 'Only draft vouchers can be updated', 400);
    }

    // If details provided, validate against the type schema
    if (data.details) {
      const detailsSchema = detailsSchemasMap[voucher.type];
      if (detailsSchema) {
        const result = detailsSchema.safeParse(data.details);
        if (!result.success) {
          return error(c, 'Invalid voucher details', 422, {
            type: voucher.type,
            errors: result.error.flatten().fieldErrors,
          });
        }
      }
    }

    const now = new Date().toISOString();
    const setClauses: string[] = ['updated_at = ?1'];
    const bindParams: any[] = [now];
    let idx = 2;

    if (data.title !== undefined) {
      setClauses.push(`title = ?${idx++}`);
      bindParams.push(data.title);
    }
    if (data.supplierId !== undefined) {
      setClauses.push(`supplier_id = ?${idx++}`);
      bindParams.push(data.supplierId);
    }
    if (data.details !== undefined) {
      setClauses.push(`details_json = ?${idx++}`);
      bindParams.push(JSON.stringify(data.details));
    }
    if (data.language !== undefined) {
      setClauses.push(`language = ?${idx++}`);
      bindParams.push(data.language);
    }
    if (data.notes !== undefined) {
      setClauses.push(`notes = ?${idx++}`);
      bindParams.push(data.notes);
    }

    await tenantDb
      .prepare(`UPDATE vouchers SET ${setClauses.join(', ')} WHERE id = ?${idx}`)
      .bind(...bindParams, voucherId)
      .run();

    // Fetch updated record
    const updated = await tenantDb
      .prepare('SELECT * FROM vouchers WHERE id = ?1')
      .bind(voucherId)
      .first<Record<string, unknown>>();

    return success(c, {
      ...updated,
      details: updated?.details_json ? JSON.parse(updated.details_json as string) : null,
    });
  } catch (err) {
    console.error('Error updating voucher:', err);
    return error(c, 'Failed to update voucher', 500);
  }
});

// ============================================================
// DELETE /:id — Soft delete
// ============================================================

voucherRoutes.delete('/:id', async (c) => {
  const tenantDb = c.get('tenantDb');
  const role = c.get('role');
  const voucherId = c.req.param('id');

  if (!checkPermission(role, 'delete')) {
    return forbidden(c, 'You do not have permission to delete vouchers');
  }

  try {
    const voucher = await tenantDb
      .prepare('SELECT id, title FROM vouchers WHERE id = ?1 AND is_deleted = 0')
      .bind(voucherId)
      .first<{ id: string; title: string }>();

    if (!voucher) return notFound(c, 'Voucher');

    const now = new Date().toISOString();
    await tenantDb
      .prepare('UPDATE vouchers SET is_deleted = 1, updated_at = ?1 WHERE id = ?2')
      .bind(now, voucherId)
      .run();

    return success(c, { id: voucherId, deleted: true });
  } catch (err) {
    console.error('Error deleting voucher:', err);
    return error(c, 'Failed to delete voucher', 500);
  }
});

// ============================================================
// PATCH /:id/status — Update status (draft→sent, sent→confirmed)
// ============================================================

voucherRoutes.patch('/:id/status', async (c) => {
  const tenantDb = c.get('tenantDb');
  const role = c.get('role');
  const voucherId = c.req.param('id');

  if (!checkPermission(role, 'edit')) {
    return forbidden(c, 'You do not have permission to update voucher status');
  }

  const body = await c.req.json();
  const newStatus = body.status;

  if (!newStatus || !['sent', 'confirmed'].includes(newStatus)) {
    return error(c, 'Invalid status. Must be sent or confirmed', 400);
  }

  try {
    const voucher = await tenantDb
      .prepare('SELECT id, status, title, lead_id FROM vouchers WHERE id = ?1 AND is_deleted = 0')
      .bind(voucherId)
      .first<{ id: string; status: string; title: string; lead_id: string }>();

    if (!voucher) return notFound(c, 'Voucher');

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      draft: ['sent', 'confirmed'],
      sent: ['confirmed'],
      confirmed: [],
    };

    const allowed = validTransitions[voucher.status] || [];
    if (!allowed.includes(newStatus)) {
      return error(c, `Cannot transition from ${voucher.status} to ${newStatus}`, 400);
    }

    const now = new Date().toISOString();
    const updates: string[] = ['status = ?1', 'updated_at = ?2'];
    const bindParams: any[] = [newStatus, now];
    let idx = 3;

    if (newStatus === 'sent') {
      updates.push(`sent_at = ?${idx++}`);
      bindParams.push(now);
    }
    if (newStatus === 'confirmed') {
      updates.push(`confirmed_at = ?${idx++}`);
      bindParams.push(now);
    }

    await tenantDb
      .prepare(`UPDATE vouchers SET ${updates.join(', ')} WHERE id = ?${idx}`)
      .bind(...bindParams, voucherId)
      .run();

    return success(c, {
      id: voucherId,
      status: newStatus,
      ...(newStatus === 'sent' ? { sentAt: now } : {}),
      ...(newStatus === 'confirmed' ? { confirmedAt: now } : {}),
    });
  } catch (err) {
    console.error('Error updating voucher status:', err);
    return error(c, 'Failed to update voucher status', 500);
  }
});

// ============================================================
// POST /:id/send — Send voucher via email/whatsapp
// ============================================================

voucherRoutes.post('/:id/send', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const voucherId = c.req.param('id');

  if (!checkPermission(role, 'edit')) {
    return forbidden(c, 'You do not have permission to send vouchers');
  }

  const body = await c.req.json();
  const { channel, to } = body;

  if (!channel || !['email', 'whatsapp', 'sms', 'both'].includes(channel)) {
    return error(c, 'Invalid channel. Must be email, whatsapp, sms, or both', 400);
  }
  if (!to) {
    return error(c, 'Recipient (to) is required', 400);
  }

  try {
    const voucher = await tenantDb
      .prepare('SELECT * FROM vouchers WHERE id = ?1 AND is_deleted = 0')
      .bind(voucherId)
      .first<Record<string, any>>();

    if (!voucher) return notFound(c, 'Voucher');

    const now = new Date().toISOString();

    // Determine sent_via (merge if previously sent via different channel)
    let sentVia = channel;
    if (voucher.sent_via && voucher.sent_via !== channel && channel !== 'both') {
      sentVia = 'both';
    }

    // Update voucher status to sent
    await tenantDb
      .prepare(`
        UPDATE vouchers SET status = 'sent', sent_at = ?1, sent_via = ?2, updated_at = ?3
        WHERE id = ?4
      `)
      .bind(now, sentVia, now, voucherId)
      .run();

    // In production, queue email/whatsapp sending here
    // For now, just update status and log

    return success(c, {
      id: voucherId,
      status: 'sent',
      sentVia,
      sentAt: now,
      channel,
      to,
    });
  } catch (err) {
    console.error('Error sending voucher:', err);
    return error(c, 'Failed to send voucher', 500);
  }
});

// ============================================================
// POST /bulk-send — Send multiple vouchers for a lead
// ============================================================

voucherRoutes.post('/bulk-send', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');

  if (!checkPermission(role, 'edit')) {
    return forbidden(c, 'You do not have permission to send vouchers');
  }

  const body = await c.req.json();
  const { lead_id, leadId, voucher_ids, voucherIds, channel, to } = body;
  const resolvedLeadId = lead_id || leadId;
  const resolvedIds = voucher_ids || voucherIds;

  if (!channel || !['email', 'whatsapp', 'both'].includes(channel)) {
    return error(c, 'Invalid channel. Must be email, whatsapp, or both', 400);
  }
  if (!to) {
    return error(c, 'Recipient (to) is required', 400);
  }

  try {
    let vouchers: any;
    if (resolvedIds && resolvedIds.length > 0) {
      const placeholders = resolvedIds.map((_: any, i: number) => `?${i + 1}`).join(',');
      vouchers = await tenantDb
        .prepare(`SELECT * FROM vouchers WHERE id IN (${placeholders}) AND is_deleted = 0`)
        .bind(...resolvedIds)
        .all<Record<string, any>>();
    } else if (resolvedLeadId) {
      vouchers = await tenantDb
        .prepare('SELECT * FROM vouchers WHERE lead_id = ?1 AND is_deleted = 0')
        .bind(resolvedLeadId)
        .all<Record<string, any>>();
    } else {
      return error(c, 'Either lead_id or voucher_ids is required', 400);
    }

    const results = vouchers.results || [];
    if (results.length === 0) {
      return error(c, 'No vouchers found to send', 404);
    }
    if (results.length > 10) {
      return error(c, 'Maximum 10 vouchers per bulk send', 400);
    }

    const now = new Date().toISOString();
    let sentCount = 0;

    for (const v of results) {
      let sentVia = channel;
      if (v.sent_via && v.sent_via !== channel && channel !== 'both') {
        sentVia = 'both';
      }

      await tenantDb
        .prepare(`UPDATE vouchers SET status = 'sent', sent_at = ?1, sent_via = ?2, updated_at = ?3 WHERE id = ?4`)
        .bind(now, sentVia, now, v.id)
        .run();
      sentCount++;
    }

    return success(c, {
      success: true,
      count: sentCount,
      channel,
      to,
    });
  } catch (err) {
    console.error('Error bulk sending vouchers:', err);
    return error(c, 'Failed to bulk send vouchers', 500);
  }
});

export default voucherRoutes;
