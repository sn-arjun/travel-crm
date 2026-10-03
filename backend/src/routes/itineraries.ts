import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, like, sql, count, isNull } from 'drizzle-orm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { AppContext } from '../types';
import {
  itineraries,
  itineraryDays,
  itineraryItems,
  leads,
  contacts,
  leadActivities,
  messageLog,
} from '../db/tenant-schema';
import { requirePermission } from '../middleware/rbac';
import { generateId } from '../utils/uuid';
import { logActivity } from '../utils/activity-logger';
import { success, created, paginated, error, notFound } from '../utils/response';

const itineraryRoutes = new Hono<AppContext>();

// ============================================================
// Zod Schemas
// ============================================================

const itineraryItemSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['hotel', 'transport', 'activity', 'meal', 'flight']),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  rateCardId: z.string().optional().nullable(),
  costPrice: z.number().min(0).optional().default(0),
  sellingPrice: z.number().min(0).optional().default(0),
  markupType: z.enum(['percentage', 'fixed']).optional().nullable(),
  markupValue: z.number().optional().nullable(),
  taxRate: z.number().min(0).optional().default(0),
  taxAmount: z.number().min(0).optional().default(0),
  quantity: z.number().int().min(1).optional().default(1),
  paxType: z.enum(['adult', 'child', 'infant']).optional().nullable(),
  timeStart: z.string().optional().nullable(),
  timeEnd: z.string().optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
  detailsJson: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
});

const itineraryDaySchema = z.object({
  id: z.string().optional(),
  dayNumber: z.number().int().min(1),
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  overnightCity: z.string().optional().nullable(),
  images: z.array(z.string()).optional().default([]),
  isFreeDay: z.boolean().optional().default(false),
  items: z.array(itineraryItemSchema).optional().default([]),
});

const createItinerarySchema = z.object({
  leadId: z.string().min(1),
  title: z.string().min(1).max(500),
  validityDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  inclusions: z.array(z.string()).optional().default([]),
  exclusions: z.array(z.string()).optional().default([]),
  termsConditions: z.string().optional().nullable(),
  currency: z.string().optional().default('INR'),
  markupType: z.enum(['percentage', 'fixed']).optional().nullable(),
  markupValue: z.number().optional().nullable(),
  days: z.array(itineraryDaySchema).min(1),
});

const updateItinerarySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  validityDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  inclusions: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
  termsConditions: z.string().optional().nullable(),
  currency: z.string().optional(),
  markupType: z.enum(['percentage', 'fixed']).optional().nullable(),
  markupValue: z.number().optional().nullable(),
  status: z.enum(['draft', 'sent', 'approved', 'rejected', 'expired']).optional(),
  days: z.array(itineraryDaySchema).optional(),
});

const sendSchema = z.object({
  channel: z.enum(['email', 'whatsapp']),
  to: z.string().min(1),
  subject: z.string().optional(),
  message: z.string().optional(),
});

const cloneSchema = z.object({
  targetLeadId: z.string().optional(),
});

const shareLinkSchema = z.object({});

// ============================================================
// Helper: Calculate totals from days/items
// ============================================================

function calculateTotals(
  days: Array<{ items: Array<{ costPrice?: number; sellingPrice?: number; taxRate?: number; quantity?: number }> }>,
  markupType?: string | null,
  markupValue?: number | null
) {
  let totalCost = 0;
  let totalSelling = 0;
  let totalTax = 0;

  for (const day of days) {
    for (const item of day.items) {
      const qty = item.quantity || 1;
      const cost = (item.costPrice || 0) * qty;
      const selling = (item.sellingPrice || 0) * qty;
      const tax = selling * ((item.taxRate || 0) / 100);

      totalCost += cost;
      totalSelling += selling;
      totalTax += tax;
    }
  }

  // Apply itinerary-level markup
  if (markupType === 'percentage' && markupValue) {
    totalSelling += totalSelling * (markupValue / 100);
  } else if (markupType === 'fixed' && markupValue) {
    totalSelling += markupValue;
  }

  return {
    totalCost,
    totalSelling,
    totalTax,
    grandTotal: totalSelling + totalTax,
  };
}

// ============================================================
// Helper: Fetch full itinerary with days and items
// ============================================================

async function getFullItinerary(db: ReturnType<typeof drizzle>, itineraryId: string) {
  const [itin] = await db
    .select()
    .from(itineraries)
    .where(and(eq(itineraries.id, itineraryId), eq(itineraries.isDeleted, 0)));

  if (!itin) return null;

  const days = await db
    .select()
    .from(itineraryDays)
    .where(eq(itineraryDays.itineraryId, itineraryId))
    .orderBy(itineraryDays.dayNumber);

  const daysWithItems = await Promise.all(
    days.map(async (day) => {
      const items = await db
        .select()
        .from(itineraryItems)
        .where(eq(itineraryItems.dayId, day.id))
        .orderBy(itineraryItems.sortOrder);
      return { ...day, images: day.images ? JSON.parse(day.images) : [], isFreeDay: !!day.isFreeDay, items };
    })
  );

  // Get lead info
  const [lead] = await db.select().from(leads).where(eq(leads.id, itin.leadId));
  let contact = null;
  if (lead?.contactId) {
    const [c] = await db.select().from(contacts).where(eq(contacts.id, lead.contactId));
    contact = c || null;
  }

  return {
    ...itin,
    inclusions: itin.inclusions ? JSON.parse(itin.inclusions) : [],
    exclusions: itin.exclusions ? JSON.parse(itin.exclusions) : [],
    isDeleted: !!itin.isDeleted,
    shareLinkActive: !!itin.shareLinkActive,
    days: daysWithItems,
    lead: lead ? { id: lead.id, title: lead.title, destination: lead.destination } : null,
    contact: contact ? { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone } : null,
  };
}

// ============================================================
// GET / — List itineraries
// ============================================================

itineraryRoutes.get('/', requirePermission('itineraries', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const url = new URL(c.req.url);
  const userId = c.get('userId');
  const role = c.get('role');

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;
  const search = url.searchParams.get('search') || '';
  const statusFilter = url.searchParams.get('status');
  const leadIdFilter = url.searchParams.get('leadId');
  const createdByFilter = url.searchParams.get('createdBy');
  const contactIdFilter = url.searchParams.get('contactId');

  const conditions = [eq(itineraries.isDeleted, 0)];

  if (statusFilter) conditions.push(eq(itineraries.status, statusFilter));
  if (leadIdFilter) conditions.push(eq(itineraries.leadId, leadIdFilter));
  // Itineraries hang off a lead, so a contact's itineraries are those of its leads
  if (contactIdFilter) {
    conditions.push(sql`${itineraries.leadId} IN (SELECT id FROM leads WHERE contact_id = ${contactIdFilter} AND is_deleted = 0)`);
  }
  if (createdByFilter) conditions.push(eq(itineraries.createdBy, createdByFilter));
  if (search) conditions.push(like(itineraries.title, `%${search}%`));

  // RBAC: salesperson sees own + assigned leads' itineraries
  if (role === 'salesperson') {
    conditions.push(eq(itineraries.createdBy, userId));
  }

  const [totalResult] = await db
    .select({ total: count() })
    .from(itineraries)
    .where(and(...conditions));

  const rows = await db
    .select({
      id: itineraries.id,
      leadId: itineraries.leadId,
      title: itineraries.title,
      version: itineraries.version,
      status: itineraries.status,
      currency: itineraries.currency,
      totalCost: itineraries.totalCost,
      totalSelling: itineraries.totalSelling,
      grandTotal: itineraries.grandTotal,
      createdBy: itineraries.createdBy,
      createdAt: itineraries.createdAt,
    })
    .from(itineraries)
    .where(and(...conditions))
    .orderBy(desc(itineraries.createdAt))
    .limit(limit)
    .offset(offset);

  // Enrich with lead title, contact name, days count
  const enriched = await Promise.all(
    rows.map(async (row) => {
      const [lead] = await db.select({ id: leads.id, title: leads.title, contactId: leads.contactId }).from(leads).where(eq(leads.id, row.leadId));
      let contactName = '';
      if (lead?.contactId) {
        const [contact] = await db.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, lead.contactId));
        contactName = contact?.name || '';
      }
      const [daysCount] = await db.select({ count: count() }).from(itineraryDays).where(eq(itineraryDays.itineraryId, row.id));

      return {
        ...row,
        leadTitle: lead?.title || '',
        contactName,
        daysCount: daysCount?.count || 0,
      };
    })
  );

  return paginated(c, enriched, totalResult?.total || 0, page, limit);
});

// ============================================================
// POST / — Create itinerary with nested days + items
// ============================================================

itineraryRoutes.post('/', requirePermission('itineraries', 'create'), zValidator('json', createItinerarySchema), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const body = c.req.valid('json');

  // Verify lead exists
  const [lead] = await db.select().from(leads).where(eq(leads.id, body.leadId));
  if (!lead) return notFound(c, 'Lead');

  const totals = calculateTotals(body.days, body.markupType, body.markupValue);
  const itineraryId = generateId();
  const now = new Date().toISOString();

  // Insert itinerary
  await db.insert(itineraries).values({
    id: itineraryId,
    leadId: body.leadId,
    title: body.title,
    version: 1,
    status: 'draft',
    validityDate: body.validityDate || null,
    notes: body.notes || null,
    inclusions: JSON.stringify(body.inclusions),
    exclusions: JSON.stringify(body.exclusions),
    termsConditions: body.termsConditions || null,
    currency: body.currency || 'INR',
    totalCost: totals.totalCost,
    totalSelling: totals.totalSelling,
    totalTax: totals.totalTax,
    grandTotal: totals.grandTotal,
    markupType: body.markupType || null,
    markupValue: body.markupValue || null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  // Insert days and items
  for (const [dayIdx, day] of body.days.entries()) {
    const dayId = generateId();
    await db.insert(itineraryDays).values({
      id: dayId,
      itineraryId,
      dayNumber: day.dayNumber || dayIdx + 1,
      title: day.title || null,
      description: day.description || null,
      city: day.city || null,
      overnightCity: day.overnightCity || null,
      images: JSON.stringify(day.images || []),
      isFreeDay: day.isFreeDay ? 1 : 0,
      createdAt: now,
    });

    for (const [itemIdx, item] of (day.items || []).entries()) {
      await db.insert(itineraryItems).values({
        id: generateId(),
        dayId,
        type: item.type,
        title: item.title,
        description: item.description || null,
        supplierId: item.supplierId || null,
        rateCardId: item.rateCardId || null,
        costPrice: item.costPrice || 0,
        sellingPrice: item.sellingPrice || 0,
        markupType: item.markupType || null,
        markupValue: item.markupValue || null,
        taxRate: item.taxRate || 0,
        taxAmount: item.taxAmount || 0,
        quantity: item.quantity || 1,
        paxType: item.paxType || null,
        timeStart: item.timeStart || null,
        timeEnd: item.timeEnd || null,
        sortOrder: item.sortOrder ?? itemIdx,
        detailsJson: item.detailsJson || null,
        internalNotes: item.internalNotes || null,
        createdAt: now,
      });
    }
  }

  // Log activity
  await logActivity(db, {
    userId,
    action: 'create',
    entityType: 'itinerary',
    entityId: itineraryId,
    details: JSON.stringify({ title: body.title, leadId: body.leadId }),
    ipAddress: c.get('clientIp'),
  });

  // Log lead activity
  await db.insert(leadActivities).values({
    id: generateId(),
    leadId: body.leadId,
    type: 'note',
    content: `Itinerary "${body.title}" created`,
    metadata: JSON.stringify({ itineraryId }),
    createdBy: userId,
  });

  const full = await getFullItinerary(db, itineraryId);
  return created(c, full);
});

// ============================================================
// GET /:id — Get full itinerary detail
// ============================================================

itineraryRoutes.get('/:id', requirePermission('itineraries', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const id = c.req.param('id');
  const full = await getFullItinerary(db, id);
  if (!full) return notFound(c, 'Itinerary');
  return success(c, full);
});

// ============================================================
// PUT /:id — Update itinerary + nested days/items
// ============================================================

itineraryRoutes.put('/:id', requirePermission('itineraries', 'edit'), zValidator('json', updateItinerarySchema), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const [existing] = await db.select().from(itineraries).where(and(eq(itineraries.id, id), eq(itineraries.isDeleted, 0)));
  if (!existing) return notFound(c, 'Itinerary');

  const now = new Date().toISOString();
  const updateData: Record<string, any> = { updatedAt: now };

  if (body.title !== undefined) updateData.title = body.title;
  if (body.validityDate !== undefined) updateData.validityDate = body.validityDate;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.inclusions !== undefined) updateData.inclusions = JSON.stringify(body.inclusions);
  if (body.exclusions !== undefined) updateData.exclusions = JSON.stringify(body.exclusions);
  if (body.termsConditions !== undefined) updateData.termsConditions = body.termsConditions;
  if (body.currency !== undefined) updateData.currency = body.currency;
  if (body.markupType !== undefined) updateData.markupType = body.markupType;
  if (body.markupValue !== undefined) updateData.markupValue = body.markupValue;
  if (body.status !== undefined) updateData.status = body.status;

  // If days are provided, replace all days and items
  if (body.days) {
    // Delete existing days (cascade deletes items)
    await db.delete(itineraryDays).where(eq(itineraryDays.itineraryId, id));

    // Insert new days and items
    for (const [dayIdx, day] of body.days.entries()) {
      const dayId = day.id || generateId();
      await db.insert(itineraryDays).values({
        id: dayId,
        itineraryId: id,
        dayNumber: day.dayNumber || dayIdx + 1,
        title: day.title || null,
        description: day.description || null,
        city: day.city || null,
        overnightCity: day.overnightCity || null,
        images: JSON.stringify(day.images || []),
        isFreeDay: day.isFreeDay ? 1 : 0,
        createdAt: now,
      });

      for (const [itemIdx, item] of (day.items || []).entries()) {
        await db.insert(itineraryItems).values({
          id: item.id || generateId(),
          dayId,
          type: item.type,
          title: item.title,
          description: item.description || null,
          supplierId: item.supplierId || null,
          rateCardId: item.rateCardId || null,
          costPrice: item.costPrice || 0,
          sellingPrice: item.sellingPrice || 0,
          markupType: item.markupType || null,
          markupValue: item.markupValue || null,
          taxRate: item.taxRate || 0,
          taxAmount: item.taxAmount || 0,
          quantity: item.quantity || 1,
          paxType: item.paxType || null,
          timeStart: item.timeStart || null,
          timeEnd: item.timeEnd || null,
          sortOrder: item.sortOrder ?? itemIdx,
          detailsJson: item.detailsJson || null,
          internalNotes: item.internalNotes || null,
          createdAt: now,
        });
      }
    }

    // Recalculate totals
    const totals = calculateTotals(body.days, body.markupType ?? existing.markupType, body.markupValue ?? existing.markupValue);
    updateData.totalCost = totals.totalCost;
    updateData.totalSelling = totals.totalSelling;
    updateData.totalTax = totals.totalTax;
    updateData.grandTotal = totals.grandTotal;
  }

  await db.update(itineraries).set(updateData).where(eq(itineraries.id, id));

  await logActivity(db, {
    userId,
    action: 'update',
    entityType: 'itinerary',
    entityId: id,
    ipAddress: c.get('clientIp'),
  });

  const full = await getFullItinerary(db, id);
  return success(c, full);
});

// ============================================================
// DELETE /:id — Soft delete
// ============================================================

itineraryRoutes.delete('/:id', requirePermission('itineraries', 'delete'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [existing] = await db.select().from(itineraries).where(and(eq(itineraries.id, id), eq(itineraries.isDeleted, 0)));
  if (!existing) return notFound(c, 'Itinerary');

  await db.update(itineraries).set({ isDeleted: 1, updatedAt: new Date().toISOString() }).where(eq(itineraries.id, id));

  await logActivity(db, {
    userId,
    action: 'delete',
    entityType: 'itinerary',
    entityId: id,
    ipAddress: c.get('clientIp'),
  });

  return success(c, { message: 'Itinerary deleted' });
});

// ============================================================
// POST /:id/clone — Deep clone itinerary
// ============================================================

itineraryRoutes.post('/:id/clone', requirePermission('itineraries', 'create'), zValidator('json', cloneSchema), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const original = await getFullItinerary(db, id);
  if (!original) return notFound(c, 'Itinerary');

  const targetLeadId = body.targetLeadId || original.leadId;

  // Verify target lead exists
  const [targetLead] = await db.select().from(leads).where(eq(leads.id, targetLeadId));
  if (!targetLead) return notFound(c, 'Target lead');

  const newId = generateId();
  const now = new Date().toISOString();

  await db.insert(itineraries).values({
    id: newId,
    leadId: targetLeadId,
    title: `${original.title} (Copy)`,
    version: 1,
    status: 'draft',
    validityDate: original.validityDate,
    notes: original.notes,
    inclusions: original.inclusions ? JSON.stringify(original.inclusions) : null,
    exclusions: original.exclusions ? JSON.stringify(original.exclusions) : null,
    termsConditions: original.termsConditions,
    currency: original.currency,
    totalCost: original.totalCost,
    totalSelling: original.totalSelling,
    totalTax: original.totalTax,
    grandTotal: original.grandTotal,
    markupType: original.markupType,
    markupValue: original.markupValue,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  // Clone days and items
  for (const day of original.days) {
    const newDayId = generateId();
    await db.insert(itineraryDays).values({
      id: newDayId,
      itineraryId: newId,
      dayNumber: day.dayNumber,
      title: day.title,
      description: day.description,
      city: day.city,
      overnightCity: day.overnightCity,
      images: JSON.stringify(day.images || []),
      isFreeDay: day.isFreeDay ? 1 : 0,
      createdAt: now,
    });

    for (const item of day.items) {
      await db.insert(itineraryItems).values({
        id: generateId(),
        dayId: newDayId,
        type: item.type,
        title: item.title,
        description: item.description,
        supplierId: item.supplierId,
        rateCardId: item.rateCardId,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        markupType: item.markupType,
        markupValue: item.markupValue,
        taxRate: item.taxRate,
        taxAmount: item.taxAmount,
        quantity: item.quantity,
        paxType: item.paxType,
        timeStart: item.timeStart,
        timeEnd: item.timeEnd,
        sortOrder: item.sortOrder,
        detailsJson: item.detailsJson,
        internalNotes: item.internalNotes,
        createdAt: now,
      });
    }
  }

  await logActivity(db, {
    userId,
    action: 'create',
    entityType: 'itinerary',
    entityId: newId,
    details: JSON.stringify({ clonedFrom: id, targetLeadId }),
    ipAddress: c.get('clientIp'),
  });

  const full = await getFullItinerary(db, newId);
  return created(c, full);
});

// ============================================================
// POST /:id/new-version — Create new version (TICKET-090)
// ============================================================

itineraryRoutes.post('/:id/new-version', requirePermission('itineraries', 'create'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const id = c.req.param('id');

  const original = await getFullItinerary(db, id);
  if (!original) return notFound(c, 'Itinerary');

  // Get max version for this lead's itineraries with same parent chain
  const rootId = original.parentId || original.id;
  const allVersions = await db
    .select({ version: itineraries.version })
    .from(itineraries)
    .where(
      and(
        eq(itineraries.leadId, original.leadId),
        eq(itineraries.isDeleted, 0)
      )
    )
    .orderBy(desc(itineraries.version));

  const maxVersion = allVersions.length > 0 ? Math.max(...allVersions.map((v) => v.version || 1)) : 1;
  const newVersion = maxVersion + 1;
  const newId = generateId();
  const now = new Date().toISOString();

  await db.insert(itineraries).values({
    id: newId,
    leadId: original.leadId,
    title: original.title,
    version: newVersion,
    parentId: original.id,
    status: 'draft',
    validityDate: original.validityDate,
    notes: original.notes,
    inclusions: original.inclusions ? JSON.stringify(original.inclusions) : null,
    exclusions: original.exclusions ? JSON.stringify(original.exclusions) : null,
    termsConditions: original.termsConditions,
    currency: original.currency,
    totalCost: original.totalCost,
    totalSelling: original.totalSelling,
    totalTax: original.totalTax,
    grandTotal: original.grandTotal,
    markupType: original.markupType,
    markupValue: original.markupValue,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  // Clone days and items
  for (const day of original.days) {
    const newDayId = generateId();
    await db.insert(itineraryDays).values({
      id: newDayId,
      itineraryId: newId,
      dayNumber: day.dayNumber,
      title: day.title,
      description: day.description,
      city: day.city,
      overnightCity: day.overnightCity,
      images: JSON.stringify(day.images || []),
      isFreeDay: day.isFreeDay ? 1 : 0,
      createdAt: now,
    });

    for (const item of day.items) {
      await db.insert(itineraryItems).values({
        id: generateId(),
        dayId: newDayId,
        type: item.type,
        title: item.title,
        description: item.description,
        supplierId: item.supplierId,
        rateCardId: item.rateCardId,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        markupType: item.markupType,
        markupValue: item.markupValue,
        taxRate: item.taxRate,
        taxAmount: item.taxAmount,
        quantity: item.quantity,
        paxType: item.paxType,
        timeStart: item.timeStart,
        timeEnd: item.timeEnd,
        sortOrder: item.sortOrder,
        detailsJson: item.detailsJson,
        internalNotes: item.internalNotes,
        createdAt: now,
      });
    }
  }

  await logActivity(db, {
    userId,
    action: 'create',
    entityType: 'itinerary',
    entityId: newId,
    details: JSON.stringify({ newVersion, previousVersion: original.id }),
    ipAddress: c.get('clientIp'),
  });

  return created(c, { id: newId, version: newVersion });
});

// ============================================================
// GET /:id/versions — Version history
// ============================================================

itineraryRoutes.get('/:id/versions', requirePermission('itineraries', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const id = c.req.param('id');

  const [itin] = await db.select().from(itineraries).where(eq(itineraries.id, id));
  if (!itin) return notFound(c, 'Itinerary');

  // Find all versions: those with same leadId and in the parent chain
  const versions = await db
    .select({
      id: itineraries.id,
      version: itineraries.version,
      status: itineraries.status,
      grandTotal: itineraries.grandTotal,
      createdAt: itineraries.createdAt,
      createdBy: itineraries.createdBy,
    })
    .from(itineraries)
    .where(
      and(
        eq(itineraries.leadId, itin.leadId),
        eq(itineraries.isDeleted, 0),
        eq(itineraries.title, itin.title)
      )
    )
    .orderBy(desc(itineraries.version));

  return success(c, versions);
});

// ============================================================
// POST /:id/send — Send via email or WhatsApp (TICKET-098, 099)
// ============================================================

itineraryRoutes.post('/:id/send', requirePermission('itineraries', 'edit'), zValidator('json', sendSchema), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const [itin] = await db.select().from(itineraries).where(and(eq(itineraries.id, id), eq(itineraries.isDeleted, 0)));
  if (!itin) return notFound(c, 'Itinerary');

  const now = new Date().toISOString();

  if (body.channel === 'email') {
    // Queue email send
    try {
      await c.env.EMAIL_QUEUE.send({
        type: 'itinerary_send',
        itineraryId: id,
        to: body.to,
        subject: body.subject || `Travel Quotation — ${itin.title}`,
        message: body.message,
        tenantId: c.get('tenantId'),
        userId,
      });
    } catch (err) {
      console.error('Failed to queue email:', err);
    }
  } else if (body.channel === 'whatsapp') {
    // Queue WhatsApp send
    try {
      await c.env.SMS_QUEUE.send({
        type: 'itinerary_whatsapp',
        itineraryId: id,
        to: body.to,
        message: body.message,
        tenantId: c.get('tenantId'),
        userId,
      });
    } catch (err) {
      console.error('Failed to queue WhatsApp:', err);
    }
  }

  // Update status to 'sent'
  await db.update(itineraries).set({ status: 'sent', updatedAt: now }).where(eq(itineraries.id, id));

  // Log activity
  await db.insert(leadActivities).values({
    id: generateId(),
    leadId: itin.leadId,
    type: 'email',
    content: `Quotation "${itin.title}" sent via ${body.channel} to ${body.to}`,
    metadata: JSON.stringify({ itineraryId: id, channel: body.channel, to: body.to }),
    createdBy: userId,
  });

  // Log to message_log
  await db.insert(messageLog).values({
    id: generateId(),
    leadId: itin.leadId,
    channel: body.channel === 'whatsapp' ? 'whatsapp' : 'email',
    subject: body.subject || `Travel Quotation — ${itin.title}`,
    content: body.message || '',
    status: 'queued',
    sentBy: userId,
    sentAt: now,
  });

  await logActivity(db, {
    userId,
    action: 'send_message',
    entityType: 'itinerary',
    entityId: id,
    details: JSON.stringify({ channel: body.channel, to: body.to }),
    ipAddress: c.get('clientIp'),
  });

  return success(c, { message: `Quotation queued for ${body.channel} delivery` });
});

// ============================================================
// POST /:id/share-link — Generate shareable link (TICKET-100)
// ============================================================

itineraryRoutes.post('/:id/share-link', requirePermission('itineraries', 'edit'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [itin] = await db.select().from(itineraries).where(and(eq(itineraries.id, id), eq(itineraries.isDeleted, 0)));
  if (!itin) return notFound(c, 'Itinerary');

  const shareToken = itin.shareToken || generateId();

  await db.update(itineraries).set({
    shareToken,
    shareLinkActive: 1,
    updatedAt: new Date().toISOString(),
  }).where(eq(itineraries.id, id));

  // Store in master DB for cross-tenant lookup
  const masterDb = c.env.MASTER_DB;
  await masterDb.prepare(
    `INSERT OR REPLACE INTO quotation_links (token, tenant_id, itinerary_id, is_active, created_at)
     VALUES (?, ?, ?, 1, ?)`
  ).bind(shareToken, c.get('tenantId'), id, new Date().toISOString()).run();

  const shareUrl = `https://quotes.travelcrm.pro/q/${shareToken}`;

  await logActivity(db, {
    userId,
    action: 'create',
    entityType: 'share_link',
    entityId: id,
    details: JSON.stringify({ shareToken }),
    ipAddress: c.get('clientIp'),
  });

  return success(c, { shareUrl, shareToken });
});

// ============================================================
// DELETE /:id/share-link — Revoke share link
// ============================================================

itineraryRoutes.delete('/:id/share-link', requirePermission('itineraries', 'edit'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const id = c.req.param('id');

  await db.update(itineraries).set({
    shareLinkActive: 0,
    updatedAt: new Date().toISOString(),
  }).where(eq(itineraries.id, id));

  // Deactivate in master DB
  const masterDb = c.env.MASTER_DB;
  await masterDb.prepare(
    'UPDATE quotation_links SET is_active = 0 WHERE itinerary_id = ?'
  ).bind(id).run();

  return success(c, { message: 'Share link revoked' });
});

// ============================================================
// GET /:id/pdf — Generate quotation PDF (TICKET-097)
// ============================================================

itineraryRoutes.get('/:id/pdf', requirePermission('itineraries', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const id = c.req.param('id');

  // Reuse the existing helper to get full itinerary data
  const full = await getFullItinerary(db, id);
  if (!full) return notFound(c, 'Itinerary');

  const itin = full;
  const daysData = full.days;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595; // A4 portrait
  const pageHeight = 842;
  const margin = 50;
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawText = (text: string, x: number, yPos: number, options?: { font?: any; size?: number; color?: any }) => {
    page.drawText(text, {
      x,
      y: yPos,
      font: options?.font || font,
      size: options?.size || 10,
      color: options?.color || rgb(0, 0, 0),
    });
  };

  const checkPageBreak = (needed: number) => {
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  // Title
  drawText('TRAVEL QUOTATION', margin, y, { font: boldFont, size: 18, color: rgb(0.1, 0.3, 0.6) });
  y -= 25;

  // Itinerary info
  drawText(`${itin.title}`, margin, y, { font: boldFont, size: 14 });
  y -= 18;
  drawText(`Status: ${(itin.status || 'draft').toUpperCase()} | Version: V${itin.version || 1}`, margin, y, { size: 9, color: rgb(0.4, 0.4, 0.4) });
  y -= 14;
  if (itin.validityDate) {
    drawText(`Valid until: ${itin.validityDate}`, margin, y, { size: 9, color: rgb(0.4, 0.4, 0.4) });
    y -= 14;
  }
  drawText(`Currency: ${itin.currency || 'INR'}`, margin, y, { size: 9, color: rgb(0.4, 0.4, 0.4) });
  y -= 25;

  // Separator
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 20;

  // Days
  for (const day of daysData) {
    checkPageBreak(80);
    drawText(`Day ${day.dayNumber}: ${day.title || ''} ${day.city ? '-- ' + day.city : ''}`, margin, y, { font: boldFont, size: 12, color: rgb(0.1, 0.3, 0.6) });
    y -= 16;

    if (day.description) {
      const desc = day.description.replace(/<[^>]*>/g, '').substring(0, 200);
      drawText(desc, margin + 10, y, { size: 9, color: rgb(0.3, 0.3, 0.3) });
      y -= 14;
    }

    for (const item of day.items) {
      checkPageBreak(30);
      const typeLabel: Record<string, string> = { hotel: '[Hotel]', transport: '[Transport]', activity: '[Activity]', meal: '[Meal]', flight: '[Flight]' };
      const label = typeLabel[item.type] || '[*]';
      drawText(`${label} ${item.title || item.type}`, margin + 15, y, { size: 10 });
      const price = `${itin.currency || 'INR'} ${(item.sellingPrice || 0).toFixed(2)}`;
      const priceWidth = font.widthOfTextAtSize(price, 10);
      drawText(price, pageWidth - margin - priceWidth, y, { size: 10 });
      y -= 14;
      if (item.description) {
        drawText(item.description.substring(0, 100), margin + 25, y, { size: 8, color: rgb(0.5, 0.5, 0.5) });
        y -= 12;
      }
    }
    y -= 10;
  }

  // Pricing Summary
  checkPageBreak(80);
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 20;
  drawText('PRICING SUMMARY', margin, y, { font: boldFont, size: 12, color: rgb(0.1, 0.3, 0.6) });
  y -= 18;
  const summaryX = pageWidth - margin - 120;
  drawText('Subtotal:', margin + 10, y, { size: 10 });
  drawText(`${itin.currency || 'INR'} ${(itin.totalSelling || 0).toFixed(2)}`, summaryX, y, { size: 10 });
  y -= 14;
  drawText('Tax:', margin + 10, y, { size: 10 });
  drawText(`${itin.currency || 'INR'} ${(itin.totalTax || 0).toFixed(2)}`, summaryX, y, { size: 10 });
  y -= 14;
  drawText('Grand Total:', margin + 10, y, { font: boldFont, size: 11 });
  drawText(`${itin.currency || 'INR'} ${(itin.grandTotal || 0).toFixed(2)}`, summaryX, y, { font: boldFont, size: 11, color: rgb(0.1, 0.5, 0.1) });
  y -= 25;

  // Inclusions
  const inclusions: string[] = Array.isArray(itin.inclusions) ? itin.inclusions : [];
  if (inclusions.length > 0) {
    checkPageBreak(30 + inclusions.length * 14);
    drawText('INCLUSIONS', margin, y, { font: boldFont, size: 11, color: rgb(0.1, 0.3, 0.6) });
    y -= 16;
    for (const inc of inclusions) {
      drawText(`+ ${inc}`, margin + 10, y, { size: 9, color: rgb(0.1, 0.5, 0.1) });
      y -= 13;
    }
    y -= 8;
  }

  // Exclusions
  const exclusions: string[] = Array.isArray(itin.exclusions) ? itin.exclusions : [];
  if (exclusions.length > 0) {
    checkPageBreak(30 + exclusions.length * 14);
    drawText('EXCLUSIONS', margin, y, { font: boldFont, size: 11, color: rgb(0.1, 0.3, 0.6) });
    y -= 16;
    for (const exc of exclusions) {
      drawText(`x ${exc}`, margin + 10, y, { size: 9, color: rgb(0.7, 0.1, 0.1) });
      y -= 13;
    }
    y -= 8;
  }

  // Terms & Conditions
  if (itin.termsConditions) {
    checkPageBreak(60);
    drawText('TERMS & CONDITIONS', margin, y, { font: boldFont, size: 11, color: rgb(0.1, 0.3, 0.6) });
    y -= 16;
    const terms = itin.termsConditions.replace(/<[^>]*>/g, '');
    const lines = terms.match(/.{1,90}/g) || [];
    for (const line of lines.slice(0, 10)) {
      checkPageBreak(14);
      drawText(line, margin + 10, y, { size: 8, color: rgb(0.3, 0.3, 0.3) });
      y -= 12;
    }
  }

  // Footer
  checkPageBreak(30);
  y -= 10;
  drawText('Generated by TravelCRM Pro', margin, y, { size: 7, color: rgb(0.6, 0.6, 0.6) });

  const pdfBytes = await pdfDoc.save();
  return new Response(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="quotation-${itin.title?.replace(/[^a-zA-Z0-9]/g, '-') || id}.pdf"`,
    },
  });
});

export default itineraryRoutes;
