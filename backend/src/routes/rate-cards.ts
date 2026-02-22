import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, like, count, gte, lte } from 'drizzle-orm';
import type { AppContext } from '../types';
import { rateCards, suppliers } from '../db/tenant-schema';
import { requirePermission } from '../middleware/rbac';
import { generateId } from '../utils/uuid';
import { logActivity } from '../utils/activity-logger';
import { success, created, paginated, error, notFound } from '../utils/response';

const rateCardRoutes = new Hono<AppContext>();

// ============================================================
// Zod Schemas
// ============================================================

const createRateCardSchema = z.object({
  supplierId: z.string().optional().nullable(),
  serviceType: z.enum(['hotel', 'transport', 'activity', 'meal', 'flight']),
  destination: z.string().optional().nullable(),
  name: z.string().min(1).max(300),
  description: z.string().optional().nullable(),
  season: z.enum(['peak', 'off_peak', 'shoulder']).optional().nullable(),
  costPrice: z.number().min(0),
  sellingPrice: z.number().min(0).optional().nullable(),
  currency: z.string().optional().default('INR'),
  unit: z.enum(['per_person', 'per_room', 'per_vehicle', 'per_day']).optional().nullable(),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
  childPricePercent: z.number().min(0).max(100).optional().nullable(),
  groupDiscountJson: z.string().optional().nullable(),
  detailsJson: z.string().optional().nullable(),
});

const updateRateCardSchema = createRateCardSchema.partial();

// ============================================================
// GET / — List rate cards
// ============================================================

rateCardRoutes.get('/', requirePermission('rate_cards', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const url = new URL(c.req.url);

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;
  const search = url.searchParams.get('search') || '';
  const serviceType = url.searchParams.get('serviceType');
  const destination = url.searchParams.get('destination');
  const season = url.searchParams.get('season');
  const supplierId = url.searchParams.get('supplierId');
  const isActive = url.searchParams.get('isActive');

  const conditions: any[] = [];
  if (search) conditions.push(like(rateCards.name, `%${search}%`));
  if (serviceType) conditions.push(eq(rateCards.serviceType, serviceType));
  if (destination) conditions.push(like(rateCards.destination, `%${destination}%`));
  if (season) conditions.push(eq(rateCards.season, season));
  if (supplierId) conditions.push(eq(rateCards.supplierId, supplierId));
  if (isActive !== null && isActive !== undefined) {
    conditions.push(eq(rateCards.isActive, isActive === 'true' ? 1 : 0));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db.select({ total: count() }).from(rateCards).where(whereClause);

  const rows = await db
    .select()
    .from(rateCards)
    .where(whereClause)
    .orderBy(desc(rateCards.createdAt))
    .limit(limit)
    .offset(offset);

  // Enrich with supplier name
  const enriched = await Promise.all(
    rows.map(async (row) => {
      let supplierName = '';
      if (row.supplierId) {
        const [supplier] = await db.select({ companyName: suppliers.companyName }).from(suppliers).where(eq(suppliers.id, row.supplierId));
        supplierName = supplier?.companyName || '';
      }
      return {
        ...row,
        isActive: !!row.isActive,
        detailsJson: row.detailsJson ? JSON.parse(row.detailsJson) : null,
        groupDiscountJson: row.groupDiscountJson ? JSON.parse(row.groupDiscountJson) : null,
        supplierName,
      };
    })
  );

  return paginated(c, enriched, totalResult?.total || 0, page, limit);
});

// ============================================================
// GET /lookup — Quick lookup for itinerary builder (TICKET-093)
// ============================================================

rateCardRoutes.get('/lookup', requirePermission('rate_cards', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const url = new URL(c.req.url);
  const type = url.searchParams.get('type');
  const destination = url.searchParams.get('destination');
  const season = url.searchParams.get('season');
  const today = new Date().toISOString().split('T')[0];

  const conditions: any[] = [eq(rateCards.isActive, 1)];
  if (type) conditions.push(eq(rateCards.serviceType, type));
  if (destination) conditions.push(like(rateCards.destination, `%${destination}%`));
  if (season) conditions.push(eq(rateCards.season, season));

  // Filter by validity dates if present
  conditions.push(
    // Either no validFrom set, or validFrom <= today
    // Either no validTo set, or validTo >= today
  );

  const rows = await db
    .select()
    .from(rateCards)
    .where(and(...conditions))
    .orderBy(rateCards.costPrice);

  // Filter by date validity in JS since SQLite NULL handling is tricky with Drizzle
  const validRows = rows.filter((r) => {
    if (r.validFrom && r.validFrom > today) return false;
    if (r.validTo && r.validTo < today) return false;
    return true;
  });

  // Enrich with supplier name
  const enriched = await Promise.all(
    validRows.map(async (row) => {
      let supplierName = '';
      if (row.supplierId) {
        const [supplier] = await db.select({ companyName: suppliers.companyName }).from(suppliers).where(eq(suppliers.id, row.supplierId));
        supplierName = supplier?.companyName || '';
      }
      return {
        ...row,
        isActive: !!row.isActive,
        detailsJson: row.detailsJson ? JSON.parse(row.detailsJson) : null,
        groupDiscountJson: row.groupDiscountJson ? JSON.parse(row.groupDiscountJson) : null,
        supplierName,
      };
    })
  );

  return success(c, enriched);
});

// ============================================================
// GET /:id — Rate card detail
// ============================================================

rateCardRoutes.get('/:id', requirePermission('rate_cards', 'view'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const [card] = await db.select().from(rateCards).where(eq(rateCards.id, c.req.param('id')));
  if (!card) return notFound(c, 'Rate card');

  let supplierName = '';
  if (card.supplierId) {
    const [supplier] = await db.select({ companyName: suppliers.companyName }).from(suppliers).where(eq(suppliers.id, card.supplierId));
    supplierName = supplier?.companyName || '';
  }

  return success(c, {
    ...card,
    isActive: !!card.isActive,
    detailsJson: card.detailsJson ? JSON.parse(card.detailsJson) : null,
    groupDiscountJson: card.groupDiscountJson ? JSON.parse(card.groupDiscountJson) : null,
    supplierName,
  });
});

// ============================================================
// POST / — Create rate card
// ============================================================

rateCardRoutes.post('/', requirePermission('rate_cards', 'create'), zValidator('json', createRateCardSchema), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const body = c.req.valid('json');

  const id = generateId();
  const now = new Date().toISOString();

  await db.insert(rateCards).values({
    id,
    supplierId: body.supplierId || null,
    serviceType: body.serviceType,
    destination: body.destination || null,
    name: body.name,
    description: body.description || null,
    season: body.season || null,
    costPrice: body.costPrice,
    sellingPrice: body.sellingPrice || null,
    currency: body.currency || 'INR',
    unit: body.unit || null,
    validFrom: body.validFrom || null,
    validTo: body.validTo || null,
    childPricePercent: body.childPricePercent || null,
    groupDiscountJson: body.groupDiscountJson || null,
    detailsJson: body.detailsJson || null,
    isActive: 1,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  await logActivity(db, {
    userId,
    action: 'create',
    entityType: 'rate_card',
    entityId: id,
    ipAddress: c.get('clientIp'),
  });

  const [card] = await db.select().from(rateCards).where(eq(rateCards.id, id));
  return created(c, card);
});

// ============================================================
// PUT /:id — Update rate card
// ============================================================

rateCardRoutes.put('/:id', requirePermission('rate_cards', 'edit'), zValidator('json', updateRateCardSchema), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const [existing] = await db.select().from(rateCards).where(eq(rateCards.id, id));
  if (!existing) return notFound(c, 'Rate card');

  const updateData: Record<string, any> = { updatedAt: new Date().toISOString() };
  if (body.supplierId !== undefined) updateData.supplierId = body.supplierId;
  if (body.serviceType !== undefined) updateData.serviceType = body.serviceType;
  if (body.destination !== undefined) updateData.destination = body.destination;
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.season !== undefined) updateData.season = body.season;
  if (body.costPrice !== undefined) updateData.costPrice = body.costPrice;
  if (body.sellingPrice !== undefined) updateData.sellingPrice = body.sellingPrice;
  if (body.currency !== undefined) updateData.currency = body.currency;
  if (body.unit !== undefined) updateData.unit = body.unit;
  if (body.validFrom !== undefined) updateData.validFrom = body.validFrom;
  if (body.validTo !== undefined) updateData.validTo = body.validTo;
  if (body.childPricePercent !== undefined) updateData.childPricePercent = body.childPricePercent;
  if (body.groupDiscountJson !== undefined) updateData.groupDiscountJson = body.groupDiscountJson;
  if (body.detailsJson !== undefined) updateData.detailsJson = body.detailsJson;

  await db.update(rateCards).set(updateData).where(eq(rateCards.id, id));

  await logActivity(db, {
    userId,
    action: 'update',
    entityType: 'rate_card',
    entityId: id,
    ipAddress: c.get('clientIp'),
  });

  const [updated] = await db.select().from(rateCards).where(eq(rateCards.id, id));
  return success(c, updated);
});

// ============================================================
// DELETE /:id — Soft delete (deactivate)
// ============================================================

rateCardRoutes.delete('/:id', requirePermission('rate_cards', 'delete'), async (c) => {
  const db = drizzle(c.get('tenantDb'));
  const userId = c.get('userId');
  const id = c.req.param('id');

  const [existing] = await db.select().from(rateCards).where(eq(rateCards.id, id));
  if (!existing) return notFound(c, 'Rate card');

  await db.update(rateCards).set({ isActive: 0, updatedAt: new Date().toISOString() }).where(eq(rateCards.id, id));

  await logActivity(db, {
    userId,
    action: 'delete',
    entityType: 'rate_card',
    entityId: id,
    ipAddress: c.get('clientIp'),
  });

  return success(c, { message: 'Rate card deactivated' });
});

export default rateCardRoutes;
