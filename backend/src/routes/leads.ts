import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '../utils/validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, sql, inArray, isNull } from 'drizzle-orm';
import type { AppContext } from '../types';
import {
  leads,
  leadActivities,
  followUps,
  followUpSequences,
  users,
  contacts,
  itineraries,
  pushTokens,
  notifications,
  settings,
} from '../db/tenant-schema';
import { requirePermission } from '../middleware/rbac';
import { rbac } from '../middleware/rbac';
import { generateId } from '../utils/uuid';
import { logActivity } from '../utils/activity-logger';
import { logLeadActivity } from '../utils/lead-activity-logger';
import { createLead } from '../services/domain/leads';
import { loadLocaleContext } from '../utils/money';
import { resolveFeature } from '../services/features/resolve';
import { emitFromRequest, requestDepth } from '../services/automation/events';
import { success, created, paginated, error, notFound } from '../utils/response';

const leadRoutes = new Hono<AppContext>();

/** Lead response; a legacy row without a currency shows the agency currency (read only when needed). */
async function parseLeadFor(c: Context<AppContext>, row: Record<string, unknown>) {
  const agencyCurrency = row.currency ? null : (await loadLocaleContext(c.get('tenantDb'))).currency;
  return parseLead(row, agencyCurrency);
}

/** Same for a page of rows: one settings read at most. */
async function parseLeadsFor(c: Context<AppContext>, rows: Record<string, unknown>[]) {
  const agencyCurrency = rows.some((r) => !r.currency) ? (await loadLocaleContext(c.get('tenantDb'))).currency : null;
  return rows.map((r) => parseLead(r, agencyCurrency));
}

// ── Zod Schemas ───────────────────────────────────────────────

const createLeadSchema = z.object({
  contactId: z.string().min(1),
  title: z.string().min(3).max(200),
  destinations: z.array(z.string()).min(1),
  travelDate: z.string(),
  returnDate: z.string().optional().nullable(),
  paxAdults: z.number().int().min(1).default(1),
  paxChildren: z.number().int().min(0).default(0),
  paxInfants: z.number().int().min(0).default(0),
  budget: z.number().positive().optional().nullable(),
  // Absent means the agency currency (filled in by createLead), never a fixed one.
  currency: z.string().optional(),
  tripType: z.enum(['domestic', 'international', 'honeymoon', 'family', 'group', 'corporate', 'adventure', 'pilgrimage']),
  source: z.enum(['manual', 'website', 'facebook', 'google', 'referral', 'walkin']),
  priority: z.enum(['hot', 'warm', 'cold']).optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  passportAvailable: z.boolean().optional().nullable(),
  travelClass: z.enum(['economy', 'premium_economy', 'business', 'first']).optional().nullable(),
  hotelPreference: z.enum(['budget', 'standard', 'premium', 'luxury']).optional().nullable(),
  mealPreference: z.enum(['veg', 'non_veg', 'vegan', 'jain', 'halal']).optional().nullable(),
  specialRequirements: z.string().optional().nullable(),
  estimatedValue: z.number().optional().nullable(),
  probability: z.number().int().min(0).max(100).optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
});

const updateLeadSchema = createLeadSchema.partial();

const statusChangeSchema = z.object({
  status: z.enum(['new', 'contacted', 'qualified', 'requirement_gathered', 'proposal_sent', 'negotiation', 'won', 'booking_confirmed', 'completed', 'lost', 'on_hold']),
  lostReason: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const assignSchema = z.object({
  assignedTo: z.string().min(1),
  notes: z.string().optional(),
});

const bulkAssignSchema = z.object({
  leadIds: z.array(z.string()).min(1).max(50),
  assignedTo: z.string().min(1),
});

const bulkStatusSchema = z.object({
  leadIds: z.array(z.string()).min(1).max(50),
  status: z.string().min(1),
  lostReason: z.string().optional().nullable(),
});

const bulkDeleteSchema = z.object({
  leadIds: z.array(z.string()).min(1).max(50),
});

const activitySchema = z.object({
  type: z.enum(['note', 'call', 'email', 'whatsapp', 'sms', 'status_change', 'assignment', 'follow_up']),
  content: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const noteSchema = z.object({
  content: z.string().min(1),
});

// ── Helper: build lead response object ───────────────────────
// Raw D1 SQL returns snake_case columns; Flutter models expect camelCase.

function parseLead(row: Record<string, unknown>, agencyCurrency: string | null = null) {
  let destinations: string[] = [];
  try {
    const raw = (row.destination ?? row.destinations) as string | null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) destinations = parsed as string[];
    }
  } catch (_) { }

  const assignedToName = (row.assigned_to_name ?? row.assignedToName ?? null) as string | null;

  return {
    id: row.id,
    contactId: row.contact_id ?? row.contactId,
    contactName: row.contact_name ?? row.contactName ?? null,
    contactPhone: row.contact_phone ?? row.contactPhone ?? null,
    contactEmail: row.contact_email ?? row.contactEmail ?? null,
    title: row.title,
    destinations,
    destination: undefined, // keep undefined so Flutter's JsonKey(name:'destination') still works — we send destinations instead
    travelDate: row.travel_date ?? row.travelDate,
    returnDate: row.return_date ?? row.returnDate ?? null,
    paxAdults: row.pax_adults ?? row.paxAdults ?? 1,
    paxChildren: row.pax_children ?? row.paxChildren ?? 0,
    paxInfants: row.pax_infants ?? row.paxInfants ?? 0,
    budget: row.budget ?? null,
    currency: row.currency ?? agencyCurrency,
    tripType: row.trip_type ?? row.tripType,
    source: row.source,
    status: row.status ?? 'new',
    priority: row.priority ?? null,
    assignedTo: row.assigned_to ?? row.assignedTo ?? null,
    assignedToName,
    assignedUser: assignedToName ? { name: assignedToName } : null,
    lostReason: row.lost_reason ?? row.lostReason ?? null,
    passportAvailable: !!(row.passport_available ?? row.passportAvailable),
    travelClass: row.travel_class ?? row.travelClass ?? null,
    hotelPreference: row.hotel_preference ?? row.hotelPreference ?? null,
    mealPreference: row.meal_preference ?? row.mealPreference ?? null,
    specialRequirements: row.special_requirements ?? row.specialRequirements ?? null,
    estimatedValue: row.estimated_value ?? row.estimatedValue ?? null,
    probability: row.probability ?? null,
    expectedCloseDate: row.expected_close_date ?? row.expectedCloseDate ?? null,
    notes: row.notes ?? null,
    departureId: row.departure_id ?? row.departureId ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdByName: row.created_by_name ?? row.createdByName ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

// ── Helper: broadcast to realtime DO ─────────────────────────

async function broadcastLeadEvent(
  c: Context<AppContext>,
  type: string,
  data: Record<string, unknown>
) {
  try {
    const tenantId = c.get('tenantId');
    const roomId = c.env.REALTIME.idFromName(tenantId);
    const room = c.env.REALTIME.get(roomId);
    await room.fetch('http://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({ type, data }),
    });
  } catch (_) {
    // Non-critical — real-time updates best-effort
  }
}

// ── Helper: notify user via push queue ───────────────────────

async function notifyUser(
  c: Context<AppContext>,
  db: ReturnType<typeof drizzle>,
  tenantDb: D1Database,
  targetUserId: string,
  title: string,
  message: string,
  refType: string,
  refId: string,
  notifType = 'lead_assigned'
) {
  // Create in-app notification
  await db.insert(notifications).values({
    id: generateId(),
    userId: targetUserId,
    title,
    message,
    type: notifType,
    referenceType: refType,
    referenceId: refId,
  });

  // Get FCM tokens and enqueue push
  const tokens = await tenantDb
    .prepare('SELECT fcm_token FROM push_tokens WHERE user_id = ? AND is_active = 1')
    .bind(targetUserId)
    .all<{ fcm_token: string }>();

  for (const token of tokens.results) {
    await c.env.PUSH_NOTIFICATION_QUEUE.send({
      type: 'push',
      fcmToken: token.fcm_token,
      title,
      body: message,
      data: { type: refType, id: refId },
    });
  }
}

// ============================================================
// GET / — List leads (pipeline or list view)
// ============================================================

leadRoutes.get('/', requirePermission('leads', 'view'), async (c) => {
  const tenantDb = c.get('tenantDb');
  const db = drizzle(tenantDb);
  const userId = c.get('userId');
  const role = c.get('role');

  const {
    view = 'list',
    search,
    status: statusFilter,
    priority: priorityFilter,
    assignedTo: assigned_to,
    contactId: contactIdFilter,
    source: sourceFilter,
    tripType: trip_type,
    travelDateFrom: travel_from,
    travelDateTo: travel_to,
    budgetMin: budget_min,
    budgetMax: budget_max,
    page = '1',
    limit = '20',
    sortBy: sort_by = 'createdAt',
    sortOrder: sort_order = 'desc',
  } = c.req.query();

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;

  // Build WHERE clauses
  const conditions: string[] = ['l.is_deleted = 0'];
  const bindings: unknown[] = [];

  // RBAC: salesperson sees only their assigned leads
  if (role === 'salesperson') {
    conditions.push('l.assigned_to = ?');
    bindings.push(userId);
  }

  if (search) {
    // Escape the term for FTS5 MATCH: wrap as a quoted phrase-prefix so
    // characters with special meaning in FTS5 query syntax (-, ", :, (, ))
    // are treated as literal text instead of being parsed as operators.
    const ftsQuery = `"${search.replace(/"/g, '""')}"*`;
    conditions.push('(l.rowid IN (SELECT rowid FROM leads_fts WHERE leads_fts MATCH ?) OR c.name LIKE ?)');
    bindings.push(ftsQuery, `%${search}%`);
  }

  if (statusFilter) {
    const statuses = statusFilter.split(',').map((s) => `'${s}'`).join(',');
    conditions.push(`l.status IN (${statuses})`);
  }

  if (priorityFilter) {
    const priorities = priorityFilter.split(',').map((s) => `'${s}'`).join(',');
    conditions.push(`l.priority IN (${priorities})`);
  }

  if (assigned_to) {
    conditions.push('l.assigned_to = ?');
    bindings.push(assigned_to);
  }

  if (contactIdFilter) {
    conditions.push('l.contact_id = ?');
    bindings.push(contactIdFilter);
  }

  if (sourceFilter) {
    conditions.push('l.source = ?');
    bindings.push(sourceFilter);
  }

  if (trip_type) {
    conditions.push('l.trip_type = ?');
    bindings.push(trip_type);
  }

  if (travel_from) {
    conditions.push('l.travel_date >= ?');
    bindings.push(travel_from);
  }

  if (travel_to) {
    conditions.push('l.travel_date <= ?');
    bindings.push(travel_to);
  }

  if (budget_min) {
    conditions.push('l.budget >= ?');
    bindings.push(Number(budget_min));
  }

  if (budget_max) {
    conditions.push('l.budget <= ?');
    bindings.push(Number(budget_max));
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const allowedSortFields: Record<string, string> = {
    createdAt: 'l.created_at',
    travelDate: 'l.travel_date',
    budget: 'l.budget',
    status: 'l.status',
    priority: 'l.priority',
  };
  const orderField = allowedSortFields[sort_by] ?? 'l.created_at';
  const orderDir = sort_order === 'asc' ? 'ASC' : 'DESC';

  if (view === 'pipeline') {
    // Pipeline view: group by status, include leads per stage
    const stageOrder = "CASE l.status WHEN 'new' THEN 1 WHEN 'contacted' THEN 2 WHEN 'requirement_gathered' THEN 3 WHEN 'proposal_sent' THEN 4 WHEN 'negotiation' THEN 5 WHEN 'booking_confirmed' THEN 6 WHEN 'completed' THEN 7 WHEN 'lost' THEN 8 ELSE 9 END";

    const [rows, stageSummary] = await Promise.all([
      tenantDb
        .prepare(`
          SELECT l.*, c.name as contact_name, c.phone as contact_phone, c.email as contact_email,
                 u.name as assigned_to_name, cb.name as created_by_name
          FROM leads l
          LEFT JOIN contacts c ON l.contact_id = c.id
          LEFT JOIN users u ON l.assigned_to = u.id
          LEFT JOIN users cb ON l.created_by = cb.id
          ${where}
          ORDER BY ${stageOrder}, ${orderField} ${orderDir}
        `)
        .bind(...bindings)
        .all<Record<string, unknown>>(),
      tenantDb
        .prepare(`
          SELECT l.status, COUNT(*) as count, COALESCE(SUM(l.budget), 0) as total_value
          FROM leads l
          LEFT JOIN contacts c ON l.contact_id = c.id
          ${where}
          GROUP BY l.status
          ORDER BY ${stageOrder}
        `)
        .bind(...bindings)
        .all<{ status: string; count: number; total_value: number }>(),
    ]);

    const allLeads = await parseLeadsFor(c, rows.results);
    const stageLabels: Record<string, string> = {
      new: 'New', contacted: 'Contacted', requirement_gathered: 'Requirement Gathered',
      proposal_sent: 'Proposal Sent', negotiation: 'Negotiation',
      booking_confirmed: 'Booking Confirmed', completed: 'Completed', lost: 'Lost',
    };

    const stageMap = new Map(stageSummary.results.map((s) => [s.status, s]));
    const allStatuses = ['new', 'contacted', 'requirement_gathered', 'proposal_sent', 'negotiation', 'booking_confirmed', 'completed', 'lost'];

    const stages = allStatuses.map((s) => {
      const summary = stageMap.get(s);
      return {
        name: s,
        label: stageLabels[s] ?? s,
        count: summary?.count ?? 0,
        totalValue: summary?.total_value ?? 0,
        leads: allLeads.filter((l) => l.status === s),
      };
    });

    return success(c, { stages });
  }

  // List view: paginated
  const [rows, countRow] = await Promise.all([
    tenantDb
      .prepare(`
        SELECT l.*, c.name as contact_name, c.phone as contact_phone, c.email as contact_email,
               u.name as assigned_to_name, cb.name as created_by_name
        FROM leads l
        LEFT JOIN contacts c ON l.contact_id = c.id
        LEFT JOIN users u ON l.assigned_to = u.id
        LEFT JOIN users cb ON l.created_by = cb.id
        ${where}
        ORDER BY ${orderField} ${orderDir}
        LIMIT ? OFFSET ?
      `)
      .bind(...bindings, limitNum, offset)
      .all<Record<string, unknown>>(),
    tenantDb
      .prepare(`
        SELECT COUNT(*) as total FROM leads l
        LEFT JOIN contacts c ON l.contact_id = c.id
        ${where}
      `)
      .bind(...bindings)
      .first<{ total: number }>(),
  ]);

  const total = countRow?.total ?? 0;
  const totalPages = Math.ceil(total / limitNum);

  return paginated(c, await parseLeadsFor(c, rows.results), total, pageNum, limitNum);
});

// ============================================================
// GET /filter-options — Distinct filter values (TICKET-070)
// ============================================================

leadRoutes.get('/filter-options', requirePermission('leads', 'view'), async (c) => {
  const tenantDb = c.get('tenantDb');

  const [destinations, tripTypes, sources, assignees] = await Promise.all([
    tenantDb
      .prepare("SELECT DISTINCT destination FROM leads WHERE is_deleted = 0 AND destination IS NOT NULL AND destination != '' AND destination != '[]'")
      .all<{ destination: string }>(),
    tenantDb
      .prepare("SELECT DISTINCT trip_type FROM leads WHERE is_deleted = 0 AND trip_type IS NOT NULL")
      .all<{ trip_type: string }>(),
    tenantDb
      .prepare("SELECT DISTINCT source FROM leads WHERE is_deleted = 0 AND source IS NOT NULL")
      .all<{ source: string }>(),
    tenantDb
      .prepare("SELECT DISTINCT u.id, u.name FROM users u INNER JOIN leads l ON l.assigned_to = u.id WHERE l.is_deleted = 0")
      .all<{ id: string; name: string }>(),
  ]);

  // Extract unique destination strings from JSON arrays
  const destSet = new Set<string>();
  for (const row of destinations.results) {
    try {
      const parsed = JSON.parse(row.destination);
      if (Array.isArray(parsed)) parsed.forEach((d: string) => destSet.add(d));
    } catch (_) { }
  }

  return success(c, {
    destinations: [...destSet].sort(),
    tripTypes: tripTypes.results.map((r) => r.trip_type),
    sources: sources.results.map((r) => r.source),
    assignees: assignees.results.map((r) => ({ id: r.id, name: r.name })),
  });
});

// ============================================================
// GET /unassigned — Leads without an assignee (TICKET-071)
// ============================================================

leadRoutes.get('/unassigned', requirePermission('leads', 'view'), async (c) => {
  const tenantDb = c.get('tenantDb');

  const rows = await tenantDb
    .prepare(`
      SELECT l.*, c.name as contact_name, c.phone as contact_phone, c.email as contact_email
      FROM leads l
      LEFT JOIN contacts c ON l.contact_id = c.id
      WHERE l.is_deleted = 0 AND l.assigned_to IS NULL
      ORDER BY l.created_at DESC
    `)
    .all<Record<string, unknown>>();

  return success(c, await parseLeadsFor(c, rows.results));
});

// ============================================================
// Pipeline board (R153, design 4.7 and 13.2)
// ============================================================

/** Every status a lead can be in, in pipeline order. */
const BOARD_STATUSES = ['new', 'contacted', 'qualified', 'requirement_gathered', 'proposal_sent', 'negotiation', 'won', 'booking_confirmed', 'completed', 'lost', 'on_hold'] as const;
/** The columns a new agency sees: the statuses staff can pick today, without on_hold. */
const DEFAULT_BOARD_COLUMNS = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'];
const BOARD_SETTING_KEY = 'leads.board';
const BOARD_PAGE_SIZE = 20;

interface BoardSettings { columns: string[]; showValue: boolean }

function normalizeBoardSettings(raw: unknown): BoardSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const wanted = Array.isArray(obj.columns) ? obj.columns : [];
  const columns = [...new Set(wanted.filter((s): s is string => typeof s === 'string' && (BOARD_STATUSES as readonly string[]).includes(s)))];
  return { columns: columns.length ? columns : [...DEFAULT_BOARD_COLUMNS], showValue: obj.showValue !== false };
}

async function loadBoardSettings(db: D1Database): Promise<BoardSettings> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(BOARD_SETTING_KEY).first<{ value: string | null }>();
  let parsed: unknown = null;
  try { parsed = row?.value ? JSON.parse(row.value) : null; } catch { parsed = null; }
  return normalizeBoardSettings(parsed);
}

const boardSettingsSchema = z.object({
  columns: z.array(z.enum(BOARD_STATUSES)).min(1).max(BOARD_STATUSES.length),
  showValue: z.boolean().optional(),
});

async function boardSettingsPayload(db: D1Database) {
  return { ...(await loadBoardSettings(db)), available: BOARD_STATUSES, defaults: { columns: DEFAULT_BOARD_COLUMNS, showValue: true } };
}

leadRoutes.get('/board-settings', requirePermission('leads', 'view'), async (c) => success(c, await boardSettingsPayload(c.get('tenantDb'))));

leadRoutes.put('/board-settings', rbac(['admin', 'sales_manager']), zValidator('json', boardSettingsSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const db = drizzle(tenantDb);
  const userId = c.get('userId');
  const body = c.req.valid('json');
  const value = JSON.stringify(normalizeBoardSettings({ columns: body.columns, showValue: body.showValue ?? true }));
  const now = new Date().toISOString();
  const [existing] = await db.select().from(settings).where(eq(settings.key, BOARD_SETTING_KEY)).limit(1);
  if (existing) await db.update(settings).set({ value, updatedBy: userId, updatedAt: now }).where(eq(settings.key, BOARD_SETTING_KEY));
  else await db.insert(settings).values({ key: BOARD_SETTING_KEY, value, updatedBy: userId, updatedAt: now });
  await logActivity(db, { userId, action: 'update_settings', entityType: 'settings', details: JSON.stringify({ key: BOARD_SETTING_KEY }), ipAddress: c.get('clientIp') });
  return success(c, await boardSettingsPayload(tenantDb));
});

/** The pipeline board: a column per configured status, each with its count, value and first page of leads. */
leadRoutes.get('/board', requirePermission('leads', 'view'), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const q = c.req.query();
  const csv = (v: string | undefined) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

  // The same filters as the list (and the same visibility rules), minus the status, which the columns carry.
  const conditions: string[] = ['l.is_deleted = 0'];
  const bindings: unknown[] = [];
  if (role === 'salesperson') {
    conditions.push('l.assigned_to = ?');
    bindings.push(userId);
  }
  const search = q.search || q.q;
  if (search) {
    conditions.push('(l.rowid IN (SELECT rowid FROM leads_fts WHERE leads_fts MATCH ?) OR c.name LIKE ?)');
    bindings.push(`"${search.replace(/"/g, '""')}"*`, `%${search}%`);
  }
  const priorities = csv(q.priority).slice(0, 10);
  if (priorities.length) {
    conditions.push(`l.priority IN (${priorities.map(() => '?').join(',')})`);
    bindings.push(...priorities);
  }
  if (q.unassigned === '1' || q.unassigned === 'true') conditions.push('l.assigned_to IS NULL');
  else if (q.assignedTo) {
    conditions.push('l.assigned_to = ?');
    bindings.push(q.assignedTo);
  }
  if (q.source) {
    conditions.push('l.source = ?');
    bindings.push(q.source);
  }
  if (q.tripType) {
    conditions.push('l.trip_type = ?');
    bindings.push(q.tripType);
  }
  if (q.destination) {
    // destination holds a JSON array of names.
    conditions.push("l.destination LIKE ? ESCAPE '\\'");
    bindings.push(`%"${q.destination.replace(/[\\%_]/g, '\\$&').replace(/"/g, '')}"%`);
  }
  if (q.travelDateFrom) {
    conditions.push('l.travel_date >= ?');
    bindings.push(q.travelDateFrom);
  }
  if (q.travelDateTo) {
    conditions.push('l.travel_date <= ?');
    bindings.push(q.travelDateTo);
  }
  const where = conditions.join(' AND ');

  // Columns: the configured ones, or exactly the statuses asked for (also how "load more" asks for one column).
  const settingsNow = await loadBoardSettings(tenantDb);
  const asked = csv(q.status).filter((s) => (BOARD_STATUSES as readonly string[]).includes(s));
  const statuses = asked.length
    ? [...settingsNow.columns.filter((s) => asked.includes(s)), ...BOARD_STATUSES.filter((s) => asked.includes(s) && !settingsNow.columns.includes(s))]
    : settingsNow.columns;

  const pageNum = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(q.limit ?? String(BOARD_PAGE_SIZE), 10) || BOARD_PAGE_SIZE));
  const from = (pageNum - 1) * limitNum;
  const marks = statuses.map(() => '?').join(',');

  const locale = await loadLocaleContext(tenantDb);
  const agencyCurrency = locale.currency;
  const seatsOn = (await resolveFeature(c.env, c.get('tenantId'), 'group_departures')).enabled;

  const [sums, rows] = await Promise.all([
    tenantDb
      .prepare(`
        SELECT l.status AS status, COALESCE(NULLIF(l.currency, ''), ?) AS cur, COUNT(*) AS n,
               COALESCE(SUM(COALESCE(NULLIF(l.estimated_value, 0), l.budget, 0)), 0) AS total
        FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id
        WHERE ${where} AND l.status IN (${marks})
        GROUP BY l.status, cur
      `)
      .bind(agencyCurrency, ...bindings, ...statuses)
      .all<{ status: string; cur: string; n: number; total: number }>(),
    tenantDb
      .prepare(`
        SELECT t.*${seatsOn ? `,
          (SELECT SUM(sb.seats) FROM seat_bookings sb WHERE sb.lead_id = t.id AND sb.status IN ('held', 'confirmed')) AS seats_total,
          (SELECT MIN(CASE sb.status WHEN 'confirmed' THEN 1 ELSE 2 END) FROM seat_bookings sb WHERE sb.lead_id = t.id AND sb.status IN ('held', 'confirmed')) AS seats_rank` : ''}
        FROM (
          SELECT l.*, c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email, u.name AS assigned_to_name,
                 ROW_NUMBER() OVER (PARTITION BY l.status ORDER BY l.created_at DESC, l.id DESC) AS board_rn
          FROM leads l
          LEFT JOIN contacts c ON l.contact_id = c.id
          LEFT JOIN users u ON l.assigned_to = u.id
          WHERE ${where} AND l.status IN (${marks})
        ) t
        WHERE t.board_rn > ? AND t.board_rn <= ?
        ORDER BY t.board_rn
      `)
      .bind(...bindings, ...statuses, from, from + limitNum)
      .all<Record<string, unknown>>(),
  ]);

  const parsed = await parseLeadsFor(c, rows.results);
  const byStatus = new Map<string, Array<ReturnType<typeof parseLead> & { seats?: number; seatStatus?: string }>>();
  rows.results.forEach((raw, i) => {
    const lead: ReturnType<typeof parseLead> & { seats?: number; seatStatus?: string } = parsed[i];
    if (seatsOn && Number(raw.seats_total) > 0) {
      lead.seats = Number(raw.seats_total);
      lead.seatStatus = Number(raw.seats_rank) === 1 ? 'confirmed' : 'held';
    }
    const list = byStatus.get(String(raw.status)) ?? [];
    list.push(lead);
    byStatus.set(String(raw.status), list);
  });

  const columns = statuses.map((status) => {
    let count = 0;
    let value = 0;
    let otherCurrencyCount = 0;
    for (const s of sums.results) {
      if (s.status !== status) continue;
      count += s.n;
      if (s.cur === agencyCurrency) value += s.total;
      else otherCurrencyCount += s.n;
    }
    return {
      status,
      count,
      value: Math.round(value * 100) / 100,
      currency: agencyCurrency,
      mixedCurrencies: otherCurrencyCount > 0,
      otherCurrencyCount,
      leads: byStatus.get(status) ?? [],
    };
  });

  return success(c, { columns, showValue: settingsNow.showValue, currency: agencyCurrency, page: pageNum, limit: limitNum });
});

// ============================================================
// POST /bulk-assign (TICKET-082)
// ============================================================

leadRoutes.post(
  '/bulk-assign',
  rbac(['admin', 'sales_manager']),
  zValidator('json', bulkAssignSchema),
  async (c) => {
    const { leadIds, assignedTo } = c.req.valid('json');
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const now = new Date().toISOString();

    const statements = leadIds.map((id) =>
      tenantDb.prepare('UPDATE leads SET assigned_to = ?, updated_at = ? WHERE id = ? AND is_deleted = 0').bind(assignedTo, now, id)
    );
    await tenantDb.batch(statements);

    // Log activities
    for (const leadId of leadIds) {
      await logLeadActivity(db, { leadId, type: 'assignment', content: 'Bulk assigned', metadata: { assigned_to: assignedTo }, userId });
    }

    await logActivity(db, { userId, action: 'bulk_assign', entityType: 'lead', details: JSON.stringify({ count: leadIds.length, assignedTo }), ipAddress: c.get('clientIp') });

    return success(c, { updated: leadIds.length });
  }
);

// ============================================================
// POST /bulk-status (TICKET-082)
// ============================================================

leadRoutes.post(
  '/bulk-status',
  rbac(['admin', 'sales_manager']),
  zValidator('json', bulkStatusSchema),
  async (c) => {
    const { leadIds, status, lostReason } = c.req.valid('json');
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const now = new Date().toISOString();

    if (status === 'lost' && !lostReason) {
      return error(c, 'Lost reason is required when changing status to lost', 400);
    }

    const statements = leadIds.map((id) =>
      tenantDb
        .prepare('UPDATE leads SET status = ?, lost_reason = ?, updated_at = ? WHERE id = ? AND is_deleted = 0')
        .bind(status, lostReason ?? null, now, id)
    );
    await tenantDb.batch(statements);

    for (const leadId of leadIds) {
      await logLeadActivity(db, {
        leadId, type: 'status_change',
        metadata: { new_status: status, lost_reason: lostReason },
        userId,
      });
    }

    return success(c, { updated: leadIds.length });
  }
);

// ============================================================
// POST /bulk-delete (TICKET-082)
// ============================================================

leadRoutes.post(
  '/bulk-delete',
  rbac(['admin', 'sales_manager']),
  zValidator('json', bulkDeleteSchema),
  async (c) => {
    const { leadIds } = c.req.valid('json');
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const now = new Date().toISOString();

    const statements = leadIds.map((id) =>
      tenantDb.prepare('UPDATE leads SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(now, id)
    );
    await tenantDb.batch(statements);

    await logActivity(db, { userId, action: 'bulk_delete', entityType: 'lead', details: JSON.stringify({ count: leadIds.length }), ipAddress: c.get('clientIp') });

    return success(c, { deleted: leadIds.length });
  }
);

// ============================================================
// POST / — Create lead (TICKET-061)
// ============================================================

leadRoutes.post(
  '/',
  requirePermission('leads', 'create'),
  zValidator('json', createLeadSchema),
  async (c) => {
    const body = c.req.valid('json');
    const tenantDb = c.get('tenantDb');

    // An explicit `assignedTo: null` means "leave unassigned" (no routing rule, no round-robin).
    // Omitting the field keeps auto-assignment: explicit → source rule → round-robin.
    let waiter: { waitUntil(promise: Promise<unknown>): void } | undefined;
    try {
      waiter = c.executionCtx;
    } catch {
      waiter = undefined;
    }
    const { id } = await createLead(c.env, c.get('tenantId'), tenantDb, body, {
      userId: c.get('userId'),
      clientIp: c.get('clientIp'),
      depth: requestDepth(c),
      waiter,
    });

    const lead = await tenantDb.prepare('SELECT l.*, c.name as contact_name FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id WHERE l.id = ?').bind(id).first<Record<string, unknown>>();

    return created(c, await parseLeadFor(c, lead ?? { id }));
  }
);

// ============================================================
// GET /:id — Get lead detail (TICKET-061)
// ============================================================

leadRoutes.get('/:id', requirePermission('leads', 'view'), async (c) => {
  const { id } = c.req.param();
  const tenantDb = c.get('tenantDb');

  const lead = await tenantDb
    .prepare(`
      SELECT l.*, c.name as contact_name, c.phone as contact_phone, c.email as contact_email,
             u.name as assigned_to_name, cb.name as created_by_name
      FROM leads l
      LEFT JOIN contacts c ON l.contact_id = c.id
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN users cb ON l.created_by = cb.id
      WHERE l.id = ? AND l.is_deleted = 0
    `)
    .bind(id)
    .first<Record<string, unknown>>();

  if (!lead) return notFound(c, 'Lead');

  return success(c, await parseLeadFor(c, lead));
});

// ============================================================
// PUT /:id — Update lead (TICKET-061)
// ============================================================

leadRoutes.put(
  '/:id',
  requirePermission('leads', 'edit'),
  zValidator('json', updateLeadSchema),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid('json');
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');

    const [existing] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.isDeleted, 0))).limit(1);
    if (!existing) return notFound(c, 'Lead');

    const now = new Date().toISOString();
    const updates: Partial<typeof leads.$inferInsert> = { updatedAt: now };

    if (body.contactId !== undefined) updates.contactId = body.contactId;
    if (body.title !== undefined) updates.title = body.title;
    if (body.destinations !== undefined) updates.destination = JSON.stringify(body.destinations);
    if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo ?? null;
    if (body.travelDate !== undefined) updates.travelDate = body.travelDate;
    if (body.returnDate !== undefined) updates.returnDate = body.returnDate ?? null;
    if (body.paxAdults !== undefined) updates.paxAdults = body.paxAdults;
    if (body.paxChildren !== undefined) updates.paxChildren = body.paxChildren;
    if (body.paxInfants !== undefined) updates.paxInfants = body.paxInfants;
    if (body.budget !== undefined) updates.budget = body.budget ?? null;
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.tripType !== undefined) updates.tripType = body.tripType;
    if (body.source !== undefined) updates.source = body.source;
    if (body.priority !== undefined) {
      updates.priority = body.priority ?? null;
      if (body.priority !== existing.priority) {
        await logLeadActivity(db, {
          leadId: id, type: 'status_change',
          metadata: { field: 'priority', old: existing.priority, new: body.priority },
          userId,
        });
      }
    }
    if (body.notes !== undefined) updates.notes = body.notes ?? null;
    if (body.passportAvailable !== undefined) updates.passportAvailable = body.passportAvailable ? 1 : (body.passportAvailable === false ? 0 : null);
    if (body.travelClass !== undefined) updates.travelClass = body.travelClass ?? null;
    if (body.hotelPreference !== undefined) updates.hotelPreference = body.hotelPreference ?? null;
    if (body.mealPreference !== undefined) updates.mealPreference = body.mealPreference ?? null;
    if (body.specialRequirements !== undefined) updates.specialRequirements = body.specialRequirements ?? null;
    if (body.estimatedValue !== undefined) updates.estimatedValue = body.estimatedValue ?? null;
    if (body.probability !== undefined) updates.probability = body.probability ?? null;
    if (body.expectedCloseDate !== undefined) updates.expectedCloseDate = body.expectedCloseDate ?? null;

    await db.update(leads).set(updates).where(eq(leads.id, id));
    await logActivity(db, { userId, action: 'update', entityType: 'lead', entityId: id, ipAddress: c.get('clientIp') });

    const updated = await tenantDb
      .prepare('SELECT l.*, c.name as contact_name FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id WHERE l.id = ?')
      .bind(id).first<Record<string, unknown>>();

    return success(c, await parseLeadFor(c, updated ?? { id }));
  }
);

// ============================================================
// DELETE /:id — Soft delete lead (TICKET-061)
// ============================================================

leadRoutes.delete('/:id', requirePermission('leads', 'delete'), async (c) => {
  const { id } = c.req.param();
  const tenantDb = c.get('tenantDb');
  const db = drizzle(tenantDb);
  const userId = c.get('userId');

  const [existing] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.isDeleted, 0))).limit(1);
  if (!existing) return notFound(c, 'Lead');

  await db.update(leads).set({ isDeleted: 1, updatedAt: new Date().toISOString() }).where(eq(leads.id, id));
  await logActivity(db, { userId, action: 'delete', entityType: 'lead', entityId: id, ipAddress: c.get('clientIp') });

  return success(c, { message: 'Lead deleted' });
});

// ============================================================
// PUT /:id/status — Change pipeline status (TICKET-069)
// ============================================================

leadRoutes.put(
  '/:id/status',
  requirePermission('leads', 'edit'),
  zValidator('json', statusChangeSchema),
  async (c) => {
    const { id } = c.req.param();
    const { status: newStatus, lostReason, reason, notes } = c.req.valid('json');
    const resolvedLostReason = lostReason || reason || null;
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');

    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.isDeleted, 0)))
      .limit(1);

    if (!lead) return notFound(c, 'Lead');

    const oldStatus = lead.status;

    // Business rules
    if (newStatus === 'proposal_sent') {
      const count = await tenantDb
        .prepare('SELECT COUNT(*) as count FROM itineraries WHERE lead_id = ? AND status != ?')
        .bind(id, 'rejected')
        .first<{ count: number }>();
      if (!count || count.count === 0) {
        return error(c, 'Create an itinerary before moving to Proposal Sent', 400);
      }
    }

    if (newStatus === 'lost' && !resolvedLostReason) {
      return error(c, 'Lost reason is required', 400);
    }

    const now = new Date().toISOString();
    const updates: Partial<typeof leads.$inferInsert> = {
      status: newStatus,
      updatedAt: now,
    };
    if (newStatus === 'lost') updates.lostReason = resolvedLostReason;

    await db.update(leads).set(updates).where(eq(leads.id, id));

    // Log activity
    await logLeadActivity(db, {
      leadId: id,
      type: 'status_change',
      content: notes ?? undefined,
      metadata: { old_status: oldStatus, new_status: newStatus, lost_reason: lostReason },
      userId,
    });

    // Trigger auto follow-up sequences (TICKET-077)
    await triggerFollowUpSequences(tenantDb, db, id, newStatus, userId);

    // Notify assigned salesperson of status change (TICKET-165)
    if (lead.assignedTo && lead.assignedTo !== userId) {
      await notifyUser(
        c, db, tenantDb,
        lead.assignedTo,
        'Lead status updated',
        `${lead.title} moved to ${newStatus.replace(/_/g, ' ')}`,
        'lead',
        id,
        'lead_status_change',
      );
    }

    // Broadcast real-time update (TICKET-080)
    await broadcastLeadEvent(c, 'lead_status_changed', { id, status: newStatus, updatedBy: userId });

    await logActivity(db, { userId, action: 'update', entityType: 'lead', entityId: id, details: JSON.stringify({ old_status: oldStatus, new_status: newStatus }), ipAddress: c.get('clientIp') });

    if (oldStatus !== newStatus) {
      await emitFromRequest(c, { type: 'lead.status_changed', entityType: 'lead', entityId: id, payload: { from: oldStatus, to: newStatus } });
    }

    const updated = await tenantDb
      .prepare('SELECT l.*, c.name as contact_name FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id WHERE l.id = ?')
      .bind(id).first<Record<string, unknown>>();

    return success(c, await parseLeadFor(c, updated ?? { id }));
  }
);

// Helper: trigger auto follow-up sequences when status changes (TICKET-077)
async function triggerFollowUpSequences(
  tenantDb: D1Database,
  db: ReturnType<typeof drizzle>,
  leadId: string,
  newStatus: string,
  userId: string
) {
  try {
    const sequences = await tenantDb
      .prepare('SELECT * FROM follow_up_sequences WHERE trigger_status = ? AND is_active = 1')
      .bind(newStatus)
      .all<{ id: string; steps: string }>();

    for (const seq of sequences.results) {
      const steps = JSON.parse(seq.steps) as Array<{ day: number; type: string; notes?: string }>;
      const baseDate = new Date();

      for (const step of steps) {
        const scheduledAt = new Date(baseDate.getTime() + step.day * 24 * 60 * 60 * 1000).toISOString();
        await db.insert(followUps).values({
          id: generateId(),
          leadId,
          scheduledAt,
          type: step.type,
          notes: step.notes ?? null,
          status: 'pending',
          createdBy: userId,
        });
      }
    }
  } catch (err) {
    console.error('Failed to trigger follow-up sequences:', err);
  }
}

// ============================================================
// POST /:id/assign — Assign lead to user (TICKET-071)
// ============================================================

leadRoutes.post(
  '/:id/assign',
  rbac(['admin', 'sales_manager']),
  zValidator('json', assignSchema),
  async (c) => {
    const { id } = c.req.param();
    const { assignedTo: newAssignee, notes } = c.req.valid('json');
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');

    const [lead] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.isDeleted, 0))).limit(1);
    if (!lead) return notFound(c, 'Lead');

    const oldAssignee = lead.assignedTo;

    await db.update(leads).set({ assignedTo: newAssignee, updatedAt: new Date().toISOString() }).where(eq(leads.id, id));

    await logLeadActivity(db, {
      leadId: id, type: 'assignment',
      content: notes ?? undefined,
      metadata: { old_assignee: oldAssignee, new_assignee: newAssignee },
      userId,
    });

    // Notify new assignee
    await notifyUser(c, db, tenantDb, newAssignee, 'Lead assigned to you', lead.title, 'lead', id);

    // Broadcast
    await broadcastLeadEvent(c, 'lead_assigned', { id, assigned_to: newAssignee });

    return success(c, { message: 'Lead assigned', assignedTo: newAssignee });
  }
);

// ============================================================
// GET /:id/activities — Lead activity timeline (TICKET-067)
// ============================================================

leadRoutes.get('/:id/activities', requirePermission('leads', 'view'), async (c) => {
  const { id } = c.req.param();
  const tenantDb = c.get('tenantDb');
  const db = drizzle(tenantDb);

  const [lead] = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, id), eq(leads.isDeleted, 0))).limit(1);
  if (!lead) return notFound(c, 'Lead');

  const { page = '1', limit = '30' } = c.req.query();
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, parseInt(limit, 10));
  const offset = (pageNum - 1) * limitNum;

  const rows = await tenantDb
    .prepare(`
      SELECT a.*, u.name as created_by_name
      FROM lead_activities a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE a.lead_id = ?
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .bind(id, limitNum, offset)
    .all<Record<string, unknown>>();

  const total = await tenantDb
    .prepare('SELECT COUNT(*) as count FROM lead_activities WHERE lead_id = ?')
    .bind(id).first<{ count: number }>();

  // additive: `metadata` stays the stored JSON string; `meta` is the same data parsed, with camelCase keys
  const items = rows.results.map((row) => ({ ...row, meta: parseActivityMeta(row.metadata) }));

  return paginated(c, items, total?.count ?? 0, pageNum, limitNum);
});

function parseActivityMeta(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    out[k.replace(/_([a-z0-9])/g, (_m, ch: string) => ch.toUpperCase())] = v;
  }
  return out;
}

// ============================================================
// POST /:id/activities — Log manual activity (TICKET-067)
// ============================================================

leadRoutes.post(
  '/:id/activities',
  requirePermission('leads', 'edit'),
  zValidator('json', activitySchema),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid('json');
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');

    const [lead] = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, id), eq(leads.isDeleted, 0))).limit(1);
    if (!lead) return notFound(c, 'Lead');

    await logLeadActivity(db, {
      leadId: id,
      type: body.type,
      content: body.content,
      metadata: body.metadata as Record<string, unknown> | undefined,
      userId,
    });

    return created(c, { message: 'Activity logged' });
  }
);

// ============================================================
// GET /:id/notes — Get lead notes (TICKET-068)
// ============================================================

leadRoutes.get('/:id/notes', requirePermission('leads', 'view'), async (c) => {
  const { id } = c.req.param();
  const tenantDb = c.get('tenantDb');

  const rows = await tenantDb
    .prepare(`
      SELECT a.*, u.name as created_by_name
      FROM lead_activities a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE a.lead_id = ? AND a.type = 'note'
      ORDER BY a.created_at DESC
    `)
    .bind(id)
    .all<Record<string, unknown>>();

  return success(c, rows.results);
});

// ============================================================
// POST /:id/notes — Add note (TICKET-068)
// ============================================================

leadRoutes.post(
  '/:id/notes',
  requirePermission('leads', 'edit'),
  zValidator('json', noteSchema),
  async (c) => {
    const { id } = c.req.param();
    const { content } = c.req.valid('json');
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');

    const [lead] = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, id), eq(leads.isDeleted, 0))).limit(1);
    if (!lead) return notFound(c, 'Lead');

    const noteId = generateId();
    await db.insert(leadActivities).values({
      id: noteId,
      leadId: id,
      type: 'note',
      content,
      createdBy: userId,
    });

    return created(c, { id: noteId, content, createdBy: userId });
  }
);

// ============================================================
// PUT /:id/notes/:noteId — Edit note (TICKET-068)
// ============================================================

leadRoutes.put(
  '/:id/notes/:noteId',
  requirePermission('leads', 'edit'),
  zValidator('json', noteSchema),
  async (c) => {
    const { noteId } = c.req.param();
    const { content } = c.req.valid('json');
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const role = c.get('role');

    const [note] = await db
      .select()
      .from(leadActivities)
      .where(and(eq(leadActivities.id, noteId), eq(leadActivities.type, 'note')))
      .limit(1);

    if (!note) return notFound(c, 'Note');
    if (note.createdBy !== userId && role !== 'admin') {
      return error(c, 'Only the author or admin can edit this note', 403);
    }

    await tenantDb
      .prepare('UPDATE lead_activities SET content = ? WHERE id = ?')
      .bind(content, noteId)
      .run();

    return success(c, { id: noteId, content });
  }
);

// ============================================================
// DELETE /:id/notes/:noteId — Delete note (TICKET-068)
// ============================================================

leadRoutes.delete('/:id/notes/:noteId', requirePermission('leads', 'edit'), async (c) => {
  const { noteId } = c.req.param();
  const tenantDb = c.get('tenantDb');
  const db = drizzle(tenantDb);
  const userId = c.get('userId');
  const role = c.get('role');

  const [note] = await db
    .select()
    .from(leadActivities)
    .where(and(eq(leadActivities.id, noteId), eq(leadActivities.type, 'note')))
    .limit(1);

  if (!note) return notFound(c, 'Note');
  if (note.createdBy !== userId && role !== 'admin') {
    return error(c, 'Only the author or admin can delete this note', 403);
  }

  await db.delete(leadActivities).where(eq(leadActivities.id, noteId));

  return success(c, { message: 'Note deleted' });
});

// ============================================================
// GET /:id/follow-ups — List follow-ups for a lead (TICKET-074)
// ============================================================

leadRoutes.get('/:id/follow-ups', requirePermission('leads', 'view'), async (c) => {
  const { id } = c.req.param();
  const tenantDb = c.get('tenantDb');

  const rows = await tenantDb
    .prepare(`
      SELECT f.*, u.name as created_by_name
      FROM follow_ups f
      LEFT JOIN users u ON f.created_by = u.id
      WHERE f.lead_id = ?
      ORDER BY f.scheduled_at ASC
    `)
    .bind(id)
    .all<Record<string, unknown>>();

  return success(c, rows.results);
});

// ============================================================
// Seat bookings of a lead (R143): the lead page's seats list and its "Hold seats" action
// ============================================================

import { guarded as departureGuarded } from '../services/departures/common';
import { seatCtxFromRequest } from '../services/departures/seat-support';
import { listLeadBookings, requestSeats } from '../services/departures/seats';
import { holdSeatsBodySchema } from '../validators/seat-bookings';
import { requireFeature } from '../middleware/feature-gate';
import { getDepartureSummary } from '../services/departures/capacity';

leadRoutes.get('/:id/seat-bookings', requireFeature('group_departures'), requirePermission('departures', 'view'), async (c) => {
  return success(c, await listLeadBookings(c.get('tenantDb'), c.req.param('id')));
});

leadRoutes.post(
  '/:id/hold-seats',
  requireFeature('group_departures'),
  requirePermission('departures', 'create'),
  zValidator('json', holdSeatsBodySchema),
  (c) =>
    departureGuarded(c, async () => {
      const { departureId, seats, notes } = c.req.valid('json');
      const booking = await requestSeats(seatCtxFromRequest(c), { departureId, seats, leadId: c.req.param('id'), notes, source: 'staff' });
      return created(c, booking);
    }),
);

// Links the enquiry to a group departure (or clears the link) without holding seats (R146).
leadRoutes.put(
  '/:id/departure',
  requireFeature('group_departures'),
  requirePermission('leads', 'edit'),
  zValidator('json', z.object({ departureId: z.string().min(1).max(64).nullable() })),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const { departureId } = c.req.valid('json');
    const lead = await db.prepare('SELECT id FROM leads WHERE id = ? AND is_deleted = 0').bind(id).first();
    if (!lead) return notFound(c, 'Lead');
    if (departureId && !(await getDepartureSummary(db, departureId))) return error(c, 'Departure not found', 404, { code: 'DEPARTURE_NOT_FOUND' });
    await db.prepare('UPDATE leads SET departure_id = ?, updated_at = ? WHERE id = ?').bind(departureId, new Date().toISOString(), id).run();
    return success(c, { id, departureId });
  },
);

export default leadRoutes;
