import { Hono } from 'hono';
import { emitFromRequest } from '../services/automation/events';
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
import { quoteUrl } from '../utils/app-urls';
import { formatMoney, loadLocaleContext } from '../utils/money';
import { agencyEmailHtml, escapeHtml, queueAgencyEmail, textToHtml } from '../services/mail/delivery';
import { success, created, paginated, error, notFound } from '../utils/response';
import { requireFeature } from '../middleware/feature-gate';
import { getDepartureSummary } from '../services/departures/capacity';
import { bandsFromColumn, bandsFor, countByBand, fillQuantities, loadAgencyBands } from '../services/pricing/age-bands';
import { paxFromAges, paxFromLead, paxFromTravellers, travelDateFor, type ResolvedPax } from '../services/pricing/quote-fill';

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
  // 0 is a band nobody falls in (R149).
  quantity: z.number().int().min(0).optional().default(1),
  // A band key of the agency (adult, child, infant or its own) or per_person (R149).
  paxType: z.string().regex(/^[a-z0-9_]{1,30}$/).optional().nullable(),
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
  // Absent means the agency currency, filled in by the handler.
  currency: z.string().optional(),
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

const fillQuantitiesSchema = z.object({
  source: z.enum(['ages', 'travellers', 'lead']),
  adults: z.number().int().min(0).max(200).optional(),
  ages: z.array(z.number().min(0).max(120)).max(100).optional(),
  travellerIds: z.array(z.string().min(1)).max(100).optional(),
});

function parseJsonColumn(value: string | null | undefined): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

// ============================================================
// Helper: Calculate totals from days/items
// ============================================================

function calculateTotals(
  days: Array<{ items: Array<{ costPrice?: number | null; sellingPrice?: number | null; taxRate?: number | null; quantity?: number | null }> }>,
  markupType?: string | null,
  markupValue?: number | null
) {
  let totalCost = 0;
  let totalSelling = 0;
  let totalTax = 0;

  for (const day of days) {
    for (const item of day.items) {
      const qty = item.quantity ?? 1;
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
    ageBands: bandsFromColumn(itin.ageBands),
    paxAges: parseJsonColumn(itin.paxAges),
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
    currency: body.currency?.trim() ? body.currency.trim().toUpperCase() : (await loadLocaleContext(c.get('tenantDb'))).currency,
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
        quantity: item.quantity ?? 1,
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
  // A quote for a group departure shows the departure and the seats left without opening it (R146).
  if (!full.departureId) return success(c, { ...full, departure: null, seats: null });
  const departure = await getDepartureSummary(c.get('tenantDb'), full.departureId);
  const requested = full.seatsRequested ?? null;
  return success(c, { ...full, departure, seats: departure && { requested, left: departure.seats.left, fits: requested === null || requested <= departure.seats.left } });
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
          quantity: item.quantity ?? 1,
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
    ageBands: original.ageBands ? JSON.stringify(original.ageBands) : null,
    paxAges: original.paxAges ? JSON.stringify(original.paxAges) : null,
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
    ageBands: original.ageBands ? JSON.stringify(original.ageBands) : null,
    paxAges: original.paxAges ? JSON.stringify(original.paxAges) : null,
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
// POST /:id/fill-quantities — Fill the band quantities from ages, travellers or the lead (R149, design 14)
// ============================================================

itineraryRoutes.post('/:id/fill-quantities', requireFeature('age_band_pricing'), requirePermission('itineraries', 'edit'), zValidator('json', fillQuantitiesSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const db = drizzle(tenantDb);
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const apply = ['1', 'true'].includes(c.req.query('apply') ?? '');

  const [itin] = await db.select().from(itineraries).where(and(eq(itineraries.id, id), eq(itineraries.isDeleted, 0)));
  if (!itin) return notFound(c, 'Itinerary');

  const bands = bandsFor(bandsFromColumn(itin.ageBands), await loadAgencyBands(tenantDb));
  const travelDate = await travelDateFor(tenantDb, { departureId: itin.departureId, leadId: itin.leadId });

  let pax: ResolvedPax | null;
  if (body.source === 'ages') {
    let adults = body.adults;
    if (adults === undefined) adults = (await tenantDb.prepare('SELECT pax_adults FROM leads WHERE id = ?').bind(itin.leadId).first<{ pax_adults: number | null }>())?.pax_adults ?? 1;
    pax = paxFromAges(adults, body.ages ?? []);
  } else if (body.source === 'travellers') {
    if (!body.travellerIds?.length) return error(c, 'Pick at least one traveller', 400, { code: 'NO_TRAVELLERS' });
    pax = await paxFromTravellers(tenantDb, body.travellerIds, travelDate);
  } else {
    pax = await paxFromLead(tenantDb, itin.leadId);
  }
  if (!pax) return notFound(c, 'Lead');

  const items = await tenantDb
    .prepare(
      `SELECT i.id, i.title, i.pax_type, i.quantity FROM itinerary_items i JOIN itinerary_days d ON d.id = i.day_id
       WHERE d.itinerary_id = ? ORDER BY d.day_number, i.sort_order`,
    )
    .bind(id)
    .all<{ id: string; title: string; pax_type: string | null; quantity: number | null }>();
  const rows = items.results ?? [];
  const changes = fillQuantities(rows.map((r) => ({ id: r.id, paxType: r.pax_type, quantity: r.quantity })), bands, pax);
  const titleOf = new Map(rows.map((r) => [r.id, r]));
  const { counts, total } = countByBand(bands, pax);
  const summary = {
    source: pax.source,
    travelDate,
    bands,
    counts,
    total,
    adults: pax.adults ?? 0,
    ages: pax.ages ?? [],
    unknown: pax.unknown,
    lines: changes.map((ch) => ({ ...ch, title: titleOf.get(ch.id)?.title ?? '', paxType: titleOf.get(ch.id)?.pax_type ?? null })),
  };
  if (!apply) return success(c, { ...summary, applied: false });

  const now = new Date().toISOString();
  const statements = changes.map((ch) => tenantDb.prepare('UPDATE itinerary_items SET quantity = ? WHERE id = ?').bind(ch.to, ch.id));
  for (let i = 0; i < statements.length; i += 80) await tenantDb.batch(statements.slice(i, i + 80));

  // Totals from the lines as they now stand, with the quote's own markup.
  const full = await getFullItinerary(db, id);
  const totals = calculateTotals(full?.days ?? [], itin.markupType, itin.markupValue);
  const paxAges = { adults: pax.adults ?? 0, ages: pax.ages ?? [], children: pax.children ?? 0, infants: pax.infants ?? 0, source: pax.source };
  await db
    .update(itineraries)
    .set({ ...totals, ageBands: itin.ageBands ?? JSON.stringify(bands), paxAges: JSON.stringify(paxAges), updatedAt: now })
    .where(eq(itineraries.id, id));

  await logActivity(db, {
    userId,
    action: 'update',
    entityType: 'itinerary',
    entityId: id,
    details: JSON.stringify({ fillQuantities: body.source, lines: changes.length }),
    ipAddress: c.get('clientIp'),
  });
  return success(c, { ...summary, applied: true, totals });
});

// ============================================================
// PUT /:id/departure — Link the quote to a group departure (R146)
// ============================================================

const linkDepartureSchema = z.object({
  departureId: z.string().min(1).max(64).nullable(),
  seatsRequested: z.number().int().min(1).max(200).nullable().optional(),
});

itineraryRoutes.put('/:id/departure', requireFeature('group_departures'), requirePermission('itineraries', 'edit'), zValidator('json', linkDepartureSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const { departureId, seatsRequested } = c.req.valid('json');
  const itin = await db.prepare('SELECT i.id, l.pax_adults, l.pax_children FROM itineraries i LEFT JOIN leads l ON l.id = i.lead_id WHERE i.id = ? AND i.is_deleted = 0').bind(id).first<{ pax_adults: number | null; pax_children: number | null }>();
  if (!itin) return notFound(c, 'Itinerary');
  let seats: number | null = null;
  if (departureId) {
    const departure = await getDepartureSummary(db, departureId);
    if (!departure) return error(c, 'Departure not found', 404, { code: 'DEPARTURE_NOT_FOUND' });
    // No number given: the party size of the lead, so the quote shows whether the party fits.
    seats = seatsRequested ?? (Math.max(1, (itin.pax_adults ?? 0) + (itin.pax_children ?? 0)));
  }
  await db.prepare('UPDATE itineraries SET departure_id = ?, seats_requested = ?, updated_at = ? WHERE id = ?').bind(departureId, seats, new Date().toISOString(), id).run();
  return success(c, { id, departureId, seatsRequested: seats });
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
    // R128: a real email job (the queue only knows type 'email'), carrying the secure quotation link
    try {
      const tenantDb = c.get('tenantDb');
      const lead = await tenantDb.prepare('SELECT contact_id FROM leads WHERE id = ?').bind(itin.leadId).first<{ contact_id: string | null }>();
      const shareToken = await ensureShareLink(c, db, itin);
      const locale = await loadLocaleContext(tenantDb);
      const total = itin.grandTotal ? formatMoney(itin.grandTotal, itin.currency || locale.currency, locale.locale) : '';
      const subject = body.subject || `Travel Quotation — ${itin.title}`;
      const queuedMail = await queueAgencyEmail(c.env, tenantDb, { tenantId: c.get('tenantId'), userId }, {
        to: body.to,
        subject,
        contactId: lead?.contact_id ?? null,
        html: agencyEmailHtml({
          heading: itin.title,
          bodyHtml: textToHtml(body.message) + (total ? `<p>Total: <strong>${escapeHtml(total)}</strong></p>` : ''),
          button: { label: 'View your quotation', url: quoteUrl(c.env, shareToken) },
        }),
      });
      if (!queuedMail.queued) {
        return error(c, 'This email address bounced earlier and is blocked. Correct the email address on the contact first.', 409);
      }
    } catch (err) {
      console.error('Failed to queue email:', err);
      return error(c, 'Failed to queue the email', 500);
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

  await emitFromRequest(c, { type: 'itinerary.sent', entityType: 'itinerary', entityId: id, payload: { leadId: itin.leadId, channel: body.channel } });

  return success(c, { message: `Quotation queued for ${body.channel} delivery` });
});

// ============================================================
// POST /:id/share-link — Generate shareable link (TICKET-100)
// ============================================================

/** The itinerary's public quotation token: reuse the existing one or create it, and (re)activate the link. */
async function ensureShareLink(c: any, db: ReturnType<typeof drizzle>, itin: { id: string; shareToken: string | null }): Promise<string> {
  const shareToken = itin.shareToken || generateId();

  await db.update(itineraries).set({
    shareToken,
    shareLinkActive: 1,
    updatedAt: new Date().toISOString(),
  }).where(eq(itineraries.id, itin.id));

  // Store in master DB for cross-tenant lookup
  await c.env.MASTER_DB.prepare(
    `INSERT OR REPLACE INTO quotation_links (token, tenant_id, itinerary_id, is_active, created_at)
     VALUES (?, ?, ?, 1, ?)`
  ).bind(shareToken, c.get('tenantId'), itin.id, new Date().toISOString()).run();
  return shareToken;
}

itineraryRoutes.post('/:id/share-link', requirePermission('itineraries', 'edit'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [itin] = await db.select().from(itineraries).where(and(eq(itineraries.id, id), eq(itineraries.isDeleted, 0)));
  if (!itin) return notFound(c, 'Itinerary');

  const shareToken = await ensureShareLink(c, db, itin);

  const shareUrl = quoteUrl(c.env, shareToken);

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
  // Money prints in the quote's currency with the agency's number format.
  const localeCtx = await loadLocaleContext(c.get('tenantDb'));
  const currency = itin.currency || localeCtx.currency;
  const daysData = full.days;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // The built-in PDF fonts only encode Latin text; a symbol or digit set they cannot draw falls back to the code.
  const money = (amount: number): string => {
    const text = formatMoney(amount, currency, localeCtx.locale);
    try {
      font.encodeText(text);
      return text;
    } catch {
      return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
    }
  };

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
  drawText(`Currency: ${currency}`, margin, y, { size: 9, color: rgb(0.4, 0.4, 0.4) });
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
      const price = money(item.sellingPrice || 0);
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
  drawText(money(itin.totalSelling || 0), summaryX, y, { size: 10 });
  y -= 14;
  drawText('Tax:', margin + 10, y, { size: 10 });
  drawText(money(itin.totalTax || 0), summaryX, y, { size: 10 });
  y -= 14;
  drawText('Grand Total:', margin + 10, y, { font: boldFont, size: 11 });
  drawText(money(itin.grandTotal || 0), summaryX, y, { font: boldFont, size: 11, color: rgb(0.1, 0.5, 0.1) });
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
