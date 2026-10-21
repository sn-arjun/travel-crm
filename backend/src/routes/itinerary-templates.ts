import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, like, count } from 'drizzle-orm';
import type { AppContext } from '../types';
import {
  itineraryTemplates,
  itineraries,
  itineraryDays,
  itineraryItems,
  leads,
} from '../db/tenant-schema';
import { requirePermission } from '../middleware/rbac';
import { generateId } from '../utils/uuid';
import { isValidCurrency, loadLocaleContext } from '../utils/money';
import { logActivity } from '../utils/activity-logger';
import { success, created, paginated, error, notFound } from '../utils/response';

const templateRoutes = new Hono<AppContext>();

// ============================================================
// Zod Schemas
// ============================================================

const createTemplateSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().optional().nullable(),
  destination: z.string().optional().nullable(),
  durationDays: z.number().int().optional().nullable(),
  category: z.enum(['beach', 'mountain', 'heritage', 'adventure', 'honeymoon', 'family', 'corporate', 'pilgrimage', 'custom']).optional().nullable(),
  templateData: z.string(), // JSON snapshot
});

const saveFromItinerarySchema = z.object({
  itineraryId: z.string().min(1),
  title: z.string().min(1).max(300),
  description: z.string().optional().nullable(),
  destination: z.string().optional().nullable(),
  category: z.enum(['beach', 'mountain', 'heritage', 'adventure', 'honeymoon', 'family', 'corporate', 'pilgrimage', 'custom']).optional().nullable(),
});

const createFromTemplateSchema = z.object({
  templateId: z.string().min(1),
  leadId: z.string().min(1),
  title: z.string().optional(),
});

// ============================================================
// GET / — List templates
// ============================================================

templateRoutes.get('/', requirePermission('itineraries', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const url = new URL(c.req.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;
  const search = url.searchParams.get('search') || '';
  const destination = url.searchParams.get('destination');
  const category = url.searchParams.get('category');
  const duration = url.searchParams.get('durationDays');

  const conditions: any[] = [];
  if (search) conditions.push(like(itineraryTemplates.title, `%${search}%`));
  if (destination) conditions.push(like(itineraryTemplates.destination, `%${destination}%`));
  if (category) conditions.push(eq(itineraryTemplates.category, category));
  if (duration) conditions.push(eq(itineraryTemplates.durationDays, parseInt(duration)));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db.select({ total: count() }).from(itineraryTemplates).where(whereClause);

  const templates = await db
    .select({
      id: itineraryTemplates.id,
      title: itineraryTemplates.title,
      description: itineraryTemplates.description,
      destination: itineraryTemplates.destination,
      durationDays: itineraryTemplates.durationDays,
      category: itineraryTemplates.category,
      isSystem: itineraryTemplates.isSystem,
      createdBy: itineraryTemplates.createdBy,
      createdAt: itineraryTemplates.createdAt,
    })
    .from(itineraryTemplates)
    .where(whereClause)
    .orderBy(desc(itineraryTemplates.createdAt))
    .limit(limit)
    .offset(offset);

  return paginated(c, templates, totalResult?.total || 0, page, limit);
});

// ============================================================
// GET /:id — Template detail
// ============================================================

templateRoutes.get('/:id', requirePermission('itineraries', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const [template] = await db.select().from(itineraryTemplates).where(eq(itineraryTemplates.id, c.req.param('id')));
  if (!template) return notFound(c, 'Template');

  return success(c, {
    ...template,
    templateData: template.templateData ? JSON.parse(template.templateData) : null,
    isSystem: !!template.isSystem,
  });
});

// ============================================================
// POST / — Create template directly
// ============================================================

templateRoutes.post('/', requirePermission('itineraries', 'create'), zValidator('json', createTemplateSchema), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const body = c.req.valid('json');

  const templateId = generateId();
  const now = new Date().toISOString();

  await db.insert(itineraryTemplates).values({
    id: templateId,
    title: body.title,
    description: body.description || null,
    destination: body.destination || null,
    durationDays: body.durationDays || null,
    category: body.category || null,
    templateData: body.templateData,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  await logActivity(db, {
    userId,
    action: 'create',
    entityType: 'itinerary_template',
    entityId: templateId,
    ipAddress: c.get('clientIp'),
  });

  const [created_template] = await db.select().from(itineraryTemplates).where(eq(itineraryTemplates.id, templateId));
  return created(c, created_template);
});

// ============================================================
// POST /from-itinerary — Save existing itinerary as template
// ============================================================

templateRoutes.post('/from-itinerary', requirePermission('itineraries', 'create'), zValidator('json', saveFromItinerarySchema), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const body = c.req.valid('json');

  // Fetch the itinerary with days and items
  const [itin] = await db.select().from(itineraries).where(eq(itineraries.id, body.itineraryId));
  if (!itin) return notFound(c, 'Itinerary');

  const days = await db.select().from(itineraryDays).where(eq(itineraryDays.itineraryId, body.itineraryId)).orderBy(itineraryDays.dayNumber);

  const daysWithItems = await Promise.all(
    days.map(async (day) => {
      const items = await db.select().from(itineraryItems).where(eq(itineraryItems.dayId, day.id)).orderBy(itineraryItems.sortOrder);
      return {
        dayNumber: day.dayNumber,
        title: day.title,
        description: day.description,
        city: day.city,
        overnightCity: day.overnightCity,
        images: day.images ? JSON.parse(day.images) : [],
        isFreeDay: !!day.isFreeDay,
        items: items.map((item) => ({
          type: item.type,
          title: item.title,
          description: item.description,
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice,
          taxRate: item.taxRate,
          quantity: item.quantity,
          paxType: item.paxType,
          timeStart: item.timeStart,
          timeEnd: item.timeEnd,
          sortOrder: item.sortOrder,
          detailsJson: item.detailsJson,
        })),
      };
    })
  );

  const templateData = JSON.stringify({
    inclusions: itin.inclusions ? JSON.parse(itin.inclusions) : [],
    exclusions: itin.exclusions ? JSON.parse(itin.exclusions) : [],
    termsConditions: itin.termsConditions,
    markupType: itin.markupType,
    markupValue: itin.markupValue,
    days: daysWithItems,
  });

  const templateId = generateId();
  const now = new Date().toISOString();

  await db.insert(itineraryTemplates).values({
    id: templateId,
    title: body.title,
    description: body.description || null,
    destination: body.destination || null,
    durationDays: days.length,
    category: body.category || null,
    templateData,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  await logActivity(db, {
    userId,
    action: 'create',
    entityType: 'itinerary_template',
    entityId: templateId,
    details: JSON.stringify({ fromItinerary: body.itineraryId }),
    ipAddress: c.get('clientIp'),
  });

  const [tpl] = await db.select().from(itineraryTemplates).where(eq(itineraryTemplates.id, templateId));
  return created(c, tpl);
});

// ============================================================
// POST /create-from — Create itinerary from template (TICKET-091)
// ============================================================

templateRoutes.post('/create-from', requirePermission('itineraries', 'create'), zValidator('json', createFromTemplateSchema), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const body = c.req.valid('json');

  const [template] = await db.select().from(itineraryTemplates).where(eq(itineraryTemplates.id, body.templateId));
  if (!template) return notFound(c, 'Template');

  const [lead] = await db.select().from(leads).where(eq(leads.id, body.leadId));
  if (!lead) return notFound(c, 'Lead');

  const data = template.templateData ? JSON.parse(template.templateData) : { days: [] };
  // The quote follows the template's own currency, else the agency's.
  const currency = isValidCurrency(data.currency) ? data.currency.toUpperCase() : (await loadLocaleContext(c.get('tenantDb'))).currency;
  const itineraryId = generateId();
  const now = new Date().toISOString();

  // Calculate totals
  let totalCost = 0, totalSelling = 0, totalTax = 0;
  for (const day of data.days || []) {
    for (const item of day.items || []) {
      const qty = item.quantity || 1;
      totalCost += (item.costPrice || 0) * qty;
      const selling = (item.sellingPrice || 0) * qty;
      totalSelling += selling;
      totalTax += selling * ((item.taxRate || 0) / 100);
    }
  }

  await db.insert(itineraries).values({
    id: itineraryId,
    leadId: body.leadId,
    title: body.title || template.title,
    version: 1,
    status: 'draft',
    inclusions: data.inclusions ? JSON.stringify(data.inclusions) : null,
    exclusions: data.exclusions ? JSON.stringify(data.exclusions) : null,
    termsConditions: data.termsConditions || null,
    currency,
    totalCost,
    totalSelling,
    totalTax,
    grandTotal: totalSelling + totalTax,
    markupType: data.markupType || null,
    markupValue: data.markupValue || null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  // Expand template days into real itinerary_days + items
  for (const day of data.days || []) {
    const dayId = generateId();
    await db.insert(itineraryDays).values({
      id: dayId,
      itineraryId,
      dayNumber: day.dayNumber,
      title: day.title || null,
      description: day.description || null,
      city: day.city || null,
      overnightCity: day.overnightCity || null,
      images: JSON.stringify(day.images || []),
      isFreeDay: day.isFreeDay ? 1 : 0,
      createdAt: now,
    });

    for (const [idx, item] of (day.items || []).entries()) {
      await db.insert(itineraryItems).values({
        id: generateId(),
        dayId,
        type: item.type,
        title: item.title,
        description: item.description || null,
        costPrice: item.costPrice || 0,
        sellingPrice: item.sellingPrice || 0,
        taxRate: item.taxRate || 0,
        taxAmount: (item.sellingPrice || 0) * ((item.taxRate || 0) / 100),
        quantity: item.quantity || 1,
        paxType: item.paxType || null,
        timeStart: item.timeStart || null,
        timeEnd: item.timeEnd || null,
        sortOrder: item.sortOrder ?? idx,
        detailsJson: item.detailsJson || null,
        createdAt: now,
      });
    }
  }

  await logActivity(db, {
    userId,
    action: 'create',
    entityType: 'itinerary',
    entityId: itineraryId,
    details: JSON.stringify({ fromTemplate: body.templateId }),
    ipAddress: c.get('clientIp'),
  });

  return created(c, { id: itineraryId, title: body.title || template.title });
});

// ============================================================
// DELETE /:id — Delete template
// ============================================================

templateRoutes.delete('/:id', requirePermission('itineraries', 'delete'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [template] = await db.select().from(itineraryTemplates).where(eq(itineraryTemplates.id, id));
  if (!template) return notFound(c, 'Template');

  await db.delete(itineraryTemplates).where(eq(itineraryTemplates.id, id));

  await logActivity(db, {
    userId,
    action: 'delete',
    entityType: 'itinerary_template',
    entityId: id,
    ipAddress: c.get('clientIp'),
  });

  return success(c, { message: 'Template deleted' });
});

export default templateRoutes;
