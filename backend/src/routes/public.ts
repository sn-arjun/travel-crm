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
import { verifyUnsubscribeToken } from '../utils/unsubscribe-token';
import { withdrawMarketing } from '../services/privacy/consent';
import { agencyDefaultLanguage, t, type TextLanguage } from '../i18n';

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

// ---- R208: public unsubscribe (no login) ----------------------------------------------------
// 20 per minute per IP. A token with a bad signature is a 400; a correctly signed token always gets the same 200 page,
// whether or not the agency or contact still exists, so the page never tells anyone who is (or is not) on a list.
const unsubscribeLimit = rateLimit({
  limit: 20,
  windowMs: 60 * 1000,
  keyFn: (c) => `rl:unsub:${c.req.header('cf-connecting-ip') || 'unknown'}`,
}) as any;

/** The agency's default language (en or nl) for the texts of a public page; English when the agency cannot be reached. */
async function agencyLanguage(env: Env, tenantId: string): Promise<TextLanguage> {
  try {
    const db = await resolveTenantDb(env, tenantId);
    return db ? await agencyDefaultLanguage(db) : 'en';
  } catch {
    return 'en';
  }
}

function unsubscribePage(title: string, message: string, status: 200 | 400 = 200, lang: TextLanguage = 'en'): Response {
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#222"><h1 style="font-size:1.4rem">${title}</h1><p>${message}</p></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}

async function handleUnsubscribe(c: any): Promise<Response> {
  const claims = await verifyUnsubscribeToken(c.env, c.req.param('token'));
  // A link with a bad signature names no agency, so its page is English.
  if (!claims) return unsubscribePage(t('en', 'public.unsubscribe.invalidTitle'), t('en', 'public.unsubscribe.invalidBody'), 400);
  const lang = await agencyLanguage(c.env, claims.tenantId);
  try {
    const db = await resolveTenantDb(c.env, claims.tenantId);
    if (db) {
      const contact = await db.prepare('SELECT id FROM contacts WHERE id = ? AND erased_at IS NULL').bind(claims.contactId).first();
      if (contact) {
        await withdrawMarketing(db, claims.contactId, claims.channel, 'unsubscribe_link', {
          reason: 'Unsubscribed via link',
          label: claims.channel,
          evidence: { ip: c.req.header('cf-connecting-ip') || null, userAgent: (c.req.header('user-agent') || '').slice(0, 200), method: c.req.method },
        });
      }
    }
  } catch (err) {
    console.error('[unsubscribe] failed', err);
  }
  return unsubscribePage(t(lang, 'public.unsubscribe.doneTitle'), t(lang, 'public.unsubscribe.doneBody'), 200, lang);
}

publicRoutes.get('/unsubscribe/:token', unsubscribeLimit, handleUnsubscribe);
publicRoutes.post('/unsubscribe/:token', unsubscribeLimit, handleUnsubscribe);

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
    return c.json({ error: t('en', 'public.quotation.notFound') }, 404);
  }
  // Revoked links stay known (so the client sees "gone", not "never existed").
  // Expiry is the itinerary's validity date, checked below (quotation_links has no expiry column).
  if (!mapping.is_active) {
    return c.json({ error: t(await agencyLanguage(c.env, mapping.tenant_id), 'public.quotation.revoked') }, 410);
  }

  // Get tenant DB
  const tenantDbBinding = await resolveTenantDb(c.env, mapping.tenant_id);
  if (!tenantDbBinding) {
    return c.json({ error: t('en', 'public.quotation.notFound') }, 404);
  }

  const db = drizzle(tenantDbBinding);

  // Fetch itinerary
  const [itin] = await db.select().from(itineraries)
    .where(and(eq(itineraries.id, mapping.itinerary_id), eq(itineraries.isDeleted, 0)));

  const lang = await agencyDefaultLanguage(tenantDbBinding);
  if (!itin) {
    return c.json({ error: t(lang, 'public.quotation.notFound') }, 404);
  }

  // Check expiry
  // validityDate is a local calendar date: valid through the end of that day in the tenant's timezone
  if (itin.validityDate && itin.validityDate < localDateString(await getTenantTimeZone(tenantDbBinding))) {
    return c.json({ error: t(lang, 'public.quotation.expired') }, 410);
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
