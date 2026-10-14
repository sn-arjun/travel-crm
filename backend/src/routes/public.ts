import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import type { Env } from '../types';
import { resolveTenantDb } from '../services/tenant-db';
import { getTenantTimeZone, localDateString } from '../utils/tz';
import { rateLimit } from '../middleware/rate-limit';
import { itineraries, itineraryDays, itineraryItems } from '../db/tenant-schema';
import { getCatalogue } from '../services/plans/catalogue';
import { publicPlansView } from '../services/plans/view';

// Minimal context — no auth, just Env bindings
const publicRoutes = new Hono<{ Bindings: Env }>();

// Shared quotation links are unauthenticated: never indexed, and limited to 60 requests per minute per IP.
publicRoutes.use('*', async (c, next) => {
  c.header('X-Robots-Tag', 'noindex, nofollow');
  await next();
});
publicRoutes.use(
  '*',
  rateLimit({
    limit: 60,
    windowMs: 60 * 1000,
    keyFn: (c) => `rl:public:${c.req.header('cf-connecting-ip') || 'unknown'}`,
  }) as any
);

// GET /plans?market=IN - the public price list, built from the plan catalogue (cached 5 minutes, 60/min/IP above)
publicRoutes.get('/plans', async (c) => {
  const market = (new URL(c.req.url).searchParams.get('market') || 'IN').trim().toUpperCase().slice(0, 16);
  const view = publicPlansView(await getCatalogue(c.env), market);
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ success: true, data: view });
});

// GET /quotation/:token - Public view (no auth)
publicRoutes.get('/quotation/:token', async (c) => {
  const token = c.req.param('token');
  const masterDb = c.env.MASTER_DB;

  // Look up which tenant owns this token
  const mapping = await masterDb.prepare(
    'SELECT tenant_id, itinerary_id, is_active FROM quotation_links WHERE token = ?'
  ).bind(token).first<{ tenant_id: string; itinerary_id: string; is_active: number }>();

  if (!mapping) {
    return c.json({ error: 'Quotation not found' }, 404);
  }
  // Revoked links stay known (so the client sees "gone", not "never existed").
  // Expiry is the itinerary's validity date, checked below (quotation_links has no expiry column).
  if (!mapping.is_active) {
    return c.json({ error: 'This quotation link has been revoked' }, 410);
  }

  // Get tenant DB
  const tenantDbBinding = await resolveTenantDb(c.env, mapping.tenant_id);
  if (!tenantDbBinding) {
    return c.json({ error: 'Quotation not found' }, 404);
  }

  const db = drizzle(tenantDbBinding);

  // Fetch itinerary
  const [itin] = await db.select().from(itineraries)
    .where(and(eq(itineraries.id, mapping.itinerary_id), eq(itineraries.isDeleted, 0)));

  if (!itin) {
    return c.json({ error: 'Quotation not found' }, 404);
  }

  // Check expiry
  // validityDate is a local calendar date: valid through the end of that day in the tenant's timezone
  if (itin.validityDate && itin.validityDate < localDateString(await getTenantTimeZone(tenantDbBinding))) {
    return c.json({ error: 'This quotation has expired' }, 410);
  }

  // Increment view count
  await db.update(itineraries).set({
    viewCount: (itin.viewCount || 0) + 1,
    lastViewedAt: new Date().toISOString(),
  }).where(eq(itineraries.id, itin.id));

  // Fetch days + items
  const days = await db.select().from(itineraryDays)
    .where(eq(itineraryDays.itineraryId, itin.id))
    .orderBy(itineraryDays.dayNumber);

  const daysWithItems = await Promise.all(days.map(async (day) => {
    const items = await db.select().from(itineraryItems)
      .where(eq(itineraryItems.dayId, day.id))
      .orderBy(itineraryItems.sortOrder);
    return {
      ...day,
      items: items.map(item => ({
        ...item,
        detailsJson: item.detailsJson ? JSON.parse(item.detailsJson) : null,
        // Hide internal notes and cost prices from public view
        internalNotes: undefined,
        costPrice: undefined,
        markupType: undefined,
        markupValue: undefined,
      })),
    };
  }));

  return c.json({
    itinerary: {
      id: itin.id,
      title: itin.title,
      status: itin.status,
      validityDate: itin.validityDate,
      notes: itin.notes,
      inclusions: itin.inclusions ? JSON.parse(itin.inclusions) : [],
      exclusions: itin.exclusions ? JSON.parse(itin.exclusions) : [],
      termsConditions: itin.termsConditions,
      currency: itin.currency,
      grandTotal: itin.grandTotal,
      totalSelling: itin.totalSelling,
      totalTax: itin.totalTax,
      version: itin.version,
    },
    days: daysWithItems,
    viewCount: (itin.viewCount || 0) + 1,
  });
});

export default publicRoutes;
