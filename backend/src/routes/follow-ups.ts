import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, lt, gte, lte, desc } from 'drizzle-orm';
import type { AppContext } from '../types';
import { followUps, leads, contacts } from '../db/tenant-schema';
import { requirePermission } from '../middleware/rbac';
import { logLeadActivity } from '../utils/lead-activity-logger';
import { success, created, error, notFound } from '../utils/response';
import { generateId } from '../utils/uuid';

const followUpRoutes = new Hono<AppContext>();

// ─── Schemas ──────────────────────────────────────────────────

const createFollowUpSchema = z.object({
  leadId: z.string().min(1),
  scheduledAt: z.string().datetime(),
  type: z.enum(['call', 'email', 'whatsapp', 'visit', 'sms']),
  notes: z.string().optional(),
});

const updateFollowUpSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  type: z.enum(['call', 'email', 'whatsapp', 'visit', 'sms']).optional(),
  notes: z.string().optional(),
});

const completeFollowUpSchema = z.object({
  outcomeNotes: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────

function buildFollowUpQuery(
  tenantDb: D1Database,
  filter: string | undefined,
  userId: string,
  role: string,
  teamView: boolean,
  now: string,
  contactId?: string,
  status: string = 'pending',
): { sql: string; params: unknown[] } {
  const today = now.split('T')[0];
  const todayStart = `${today}T00:00:00.000Z`;
  const todayEnd = `${today}T23:59:59.999Z`;
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  let whereClause = status === 'all' ? '1 = 1' : 'f.status = ?';
  const params: unknown[] = status === 'all' ? [] : [status];

  // RBAC: salesperson only sees own follow-ups unless team view by manager/admin
  const canSeeTeam = (role === 'admin' || role === 'sales_manager') && teamView;
  if (!canSeeTeam) {
    whereClause += ` AND f.created_by = ?`;
    params.push(userId);
  }

  // Follow-ups belong to a lead; a contact's follow-ups are those of its leads
  if (contactId) {
    whereClause += ` AND l.contact_id = ?`;
    params.push(contactId);
  }

  if (filter === 'today') {
    whereClause += ` AND f.scheduled_at >= ? AND f.scheduled_at <= ?`;
    params.push(todayStart, todayEnd);
  } else if (filter === 'overdue') {
    whereClause += ` AND f.scheduled_at < ?`;
    params.push(todayStart);
  } else if (filter === 'upcoming') {
    whereClause += ` AND f.scheduled_at > ? AND f.scheduled_at <= ?`;
    params.push(todayEnd, in7Days);
  }

  const sql = `
    SELECT f.*,
           l.title AS lead_title,
           c.name  AS contact_name,
           c.phone AS contact_phone,
           u.name  AS created_by_name
    FROM follow_ups f
    JOIN leads l ON l.id = f.lead_id
    JOIN contacts c ON c.id = l.contact_id
    LEFT JOIN users u ON u.id = f.created_by
    WHERE ${whereClause}
    ORDER BY f.scheduled_at ${status === 'pending' ? 'ASC' : 'DESC'}
  `;

  return { sql, params };
}

// ============================================================
// GET / — List follow-ups
// ============================================================

followUpRoutes.get('/', requirePermission('leads', 'view'), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const filter = c.req.query('filter'); // today | overdue | upcoming
  const teamView = c.req.query('team') === 'true';
  const now = new Date().toISOString();

  const contactId = c.req.query('contactId') || undefined;

  // status: pending (default) | completed | cancelled | all
  const status = (c.req.query('status') || 'pending').toLowerCase();
  if (!['pending', 'completed', 'cancelled', 'missed', 'all'].includes(status)) {
    return error(c, 'status must be one of pending, completed, cancelled, missed, all', 400);
  }

  const { sql, params } = buildFollowUpQuery(tenantDb, filter, userId, role, teamView, now, contactId, status);

  const result = await tenantDb.prepare(sql).bind(...params).all();

  const followUpsList = (result.results ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    leadId: row.lead_id,
    leadTitle: row.lead_title,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    scheduledAt: row.scheduled_at,
    type: row.type,
    notes: row.notes,
    status: row.status,
    completedAt: row.completed_at,
    outcomeNotes: row.outcome_notes,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  }));

  return success(c, followUpsList);
});

// ============================================================
// POST / — Schedule a follow-up
// ============================================================

followUpRoutes.post(
  '/',
  requirePermission('leads', 'edit'),
  zValidator('json', createFollowUpSchema),
  async (c) => {
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const body = c.req.valid('json');

    // Verify lead exists
    const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, body.leadId)).limit(1);
    if (!lead) return notFound(c, 'Lead');

    const id = generateId();
    const now = new Date().toISOString();

    await db.insert(followUps).values({
      id,
      leadId: body.leadId,
      scheduledAt: body.scheduledAt,
      type: body.type,
      notes: body.notes ?? null,
      status: 'pending',
      createdBy: userId,
      createdAt: now,
    });

    await logLeadActivity(db, {
      leadId: body.leadId,
      type: 'follow_up',
      content: `Follow-up scheduled: ${body.type} on ${body.scheduledAt}`,
      metadata: { followUpId: id, type: body.type, scheduledAt: body.scheduledAt },
      userId,
    });

    const newFollowUp = await db.select().from(followUps).where(eq(followUps.id, id)).limit(1);
    return created(c, newFollowUp[0]);
  }
);

// ============================================================
// PUT /:id — Reschedule / edit follow-up
// ============================================================

followUpRoutes.put(
  '/:id',
  requirePermission('leads', 'edit'),
  zValidator('json', updateFollowUpSchema),
  async (c) => {
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const followUpId = c.req.param('id');
    const body = c.req.valid('json');

    const [existing] = await db.select().from(followUps).where(eq(followUps.id, followUpId)).limit(1);
    if (!existing) return notFound(c, 'Follow-up');

    // Only creator or admin/manager can edit
    const role = c.get('role');
    if (existing.createdBy !== userId && role !== 'admin' && role !== 'sales_manager') {
      return error(c, 'Forbidden', 403);
    }

    const now = new Date().toISOString();
    await db.update(followUps).set({ ...body }).where(eq(followUps.id, followUpId));

    if (body.scheduledAt) {
      await logLeadActivity(db, {
        leadId: existing.leadId,
        type: 'follow_up',
        content: `Follow-up rescheduled to ${body.scheduledAt}`,
        metadata: { followUpId, newScheduledAt: body.scheduledAt },
        userId,
      });
    }

    const [updated] = await db.select().from(followUps).where(eq(followUps.id, followUpId)).limit(1);
    return success(c, updated);
  }
);

// ============================================================
// PUT /:id/complete — Mark follow-up as completed
// ============================================================

followUpRoutes.put(
  '/:id/complete',
  requirePermission('leads', 'edit'),
  zValidator('json', completeFollowUpSchema),
  async (c) => {
    const tenantDb = c.get('tenantDb');
    const db = drizzle(tenantDb);
    const userId = c.get('userId');
    const followUpId = c.req.param('id');
    const body = c.req.valid('json');

    const [existing] = await db.select().from(followUps).where(eq(followUps.id, followUpId)).limit(1);
    if (!existing) return notFound(c, 'Follow-up');

    if (existing.status !== 'pending') {
      return error(c, 'Follow-up is already completed or missed', 400);
    }

    const now = new Date().toISOString();

    await db.update(followUps).set({
      status: 'completed',
      completedAt: now,
      outcome: body.outcomeNotes ?? null,
    }).where(eq(followUps.id, followUpId));

    await logLeadActivity(db, {
      leadId: existing.leadId,
      type: 'follow_up',
      content: `Follow-up completed: ${existing.type}${body.outcomeNotes ? ` — ${body.outcomeNotes}` : ''}`,
      metadata: {
        followUpId,
        type: existing.type,
        completedAt: now,
        outcomeNotes: body.outcomeNotes,
      },
      userId,
    });

    const [updated] = await db.select().from(followUps).where(eq(followUps.id, followUpId)).limit(1);
    return success(c, updated);
  }
);

// ============================================================
// DELETE /:id — Cancel follow-up
// ============================================================

followUpRoutes.delete('/:id', requirePermission('leads', 'delete'), async (c) => {
  const tenantDb = c.get('tenantDb');
  const db = drizzle(tenantDb);
  const userId = c.get('userId');
  const followUpId = c.req.param('id');

  const [existing] = await db.select().from(followUps).where(eq(followUps.id, followUpId)).limit(1);
  if (!existing) return notFound(c, 'Follow-up');

  // Only creator or admin/manager can delete
  const role = c.get('role');
  if (existing.createdBy !== userId && role !== 'admin' && role !== 'sales_manager') {
    return error(c, 'Forbidden', 403);
  }

  await db.delete(followUps).where(eq(followUps.id, followUpId));

  await logLeadActivity(db, {
    leadId: existing.leadId,
    type: 'follow_up',
    content: `Follow-up cancelled (${existing.type} scheduled for ${existing.scheduledAt})`,
    metadata: { followUpId, type: existing.type },
    userId,
  });

  return success(c, { message: 'Follow-up cancelled' });
});

export default followUpRoutes;
