/**
 * Public booking page of a departure (R148, design sections 7 and 13), no staff login.
 *
 *   GET  /api/v1/public/departures/:token            what the page shows: the fixed public projection of the departure
 *   GET  /api/v1/public/departures/:token/frame      the websites allowed to embed the page (read by the web app for frame-ancestors)
 *   POST /api/v1/public/departures/:token/bookings   a party books: contact, lead, passengers, held seats, invoice and deposit link
 *
 * The token (master public_links, 128 random bits) names exactly one departure of one agency. The tenant is found from the token
 * before any agency database is opened, and an unknown, revoked or wrong-kind token, a feature that is off, an agency that has not
 * switched group tours on and a departure that is not public all answer the same 404, so nothing reveals which agencies,
 * departures or bookings exist. Every request is rate limited per IP (and the booking per token), responses carry noindex and
 * no-store, and the projection lists named fields only: no cost prices, no other bookings, no ids except the token (pickup points
 * are addressed by an opaque reference).
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext, Env } from '../types';
import { rateLimit } from '../middleware/rate-limit';
import { resolveFeature } from '../services/features/resolve';
import { resolveTenantDb } from '../services/tenant-db';
import { resolve as resolveLink } from '../services/public-links';
import { loadDepartureContext, seatsLeft, type DepartureContext, type SeatCtx } from '../services/departures/seat-support';
import { DepartureError } from '../services/departures/common';
import { requestSeats } from '../services/departures/seats';
import { ageOn, bandForAge, loadAgencyBands } from '../services/pricing/age-bands';
import { getDepartureStops } from '../services/departures/departures';
import { effectivePrices } from '../services/departures/tours';
import { getGroupToursSettings, type PassengerFieldDef } from '../services/departures/settings';
import { bankInstructions, bookingDeposit, createBookingInvoice, createDepositLink } from '../services/departures/booking-invoice';
import { invoiceExtras, loadEffectiveExtras, MAX_EXTRA_QUANTITY, setChoices } from '../services/departures/extras';
import { buildTripView, loadTrip, payFor, refOf, saveTravellers, type LinkScope, type TripCtx } from '../services/departures/self-service';
import { grantMarketing, recordConsent } from '../services/privacy/consent';
import { readWidgetConfig } from './public-chatbot';
import { hmacSha256Hex, safeEqual, sha256Hex } from '../services/billing/gateway';
import { loadLocaleContext } from '../utils/money';
import { normalizePhone, tenantPhoneCountry } from '../utils/phone';
import { isTestMode } from '../utils/test-mode';
import { agencyDefaultLanguage, t, textLanguage, type TextLanguage } from '../i18n';
import type { PassengerInput } from '../validators/seat-bookings';

type Row = Record<string, any>;

export const publicBookingRoutes = new Hono<AppContext>();

const MAX_BODY_BYTES = 48 * 1024;
/** A public booking is for a party, not a block: bigger groups are booked by the agency. */
const MAX_PARTY = 30;
const FORM_MAX_AGE_MS = 24 * 3600 * 1000;
const IDEMPOTENCY_TTL_SECONDS = 24 * 3600;
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const LANGUAGES: TextLanguage[] = ['en', 'nl'];
/** Passenger fields the form maps onto columns; every other field a departure collects is stored in extra_fields. */
const CORE_FIELDS = new Set(['name', 'gender', 'dateOfBirth', 'pickupPoint', 'roomType', 'meal']);

publicBookingRoutes.use('*', async (c, next) => {
  c.header('X-Robots-Tag', 'noindex, nofollow');
  c.header('Cache-Control', 'no-store');
  await next();
});

const ip = (c: Context<AppContext>) => c.req.header('cf-connecting-ip') || 'unknown';
const tokenOf = (c: Context<AppContext>) => (c.req.param('token') ?? '').slice(0, 40);

/** 60 reads / minute / IP. */
const readLimit = rateLimit({ limit: 60, windowMs: 60 * 1000, keyFn: (c) => `rl:pubdep-get:${ip(c)}` });
/** 5 bookings / 10 minutes / IP, and 30 / hour / token. */
const bookIpLimit = rateLimit({ limit: 5, windowMs: 10 * 60 * 1000, keyFn: (c) => `rl:pubdep-post:${ip(c)}` });
const bookTokenLimit = rateLimit({ limit: 30, windowMs: 60 * 60 * 1000, keyFn: (c) => `rl:pubdep-token:${tokenOf(c)}` });

// ---------------------------------------------------------------- answers

function fail(c: Context<AppContext>, status: 400 | 404 | 409 | 410 | 413 | 422 | 502, code: string, lang: TextLanguage, key: string, extra: Record<string, unknown> = {}, vars?: Record<string, string | number>) {
  return c.json({ success: false, error: { code, message: t(lang, key, vars), ...extra } }, status);
}

/** The one 404 for everything that is not a bookable public page. English and identical for every reason, so it says nothing about the agency. */
const notFound = (c: Context<AppContext>) => fail(c, 404, 'NOT_FOUND', 'en', 'public.booking.notFound');

// ---------------------------------------------------------------- resolving the page

interface PageCtx {
  tenantId: string;
  db: D1Database;
  dep: DepartureContext;
}

/** token -> tenant (master) -> agency database -> plan features -> agency switch -> departure switch. A refusal is returned as a Response. */
async function loadPage(c: Context<AppContext>, opts: { allowClosed: boolean }): Promise<PageCtx | Response> {
  let waiter: SeatCtx['waiter'];
  try {
    waiter = c.executionCtx;
  } catch {
    waiter = undefined;
  }
  const link = await resolveLink(c.env, c.req.param('token') ?? '', 'departure_booking', waiter);
  if (!link) return notFound(c);
  if (link.status === 'expired') return fail(c, 410, 'EXPIRED', 'en', 'public.booking.expired');

  const db = await resolveTenantDb(c.env, link.tenantId);
  if (!db) return notFound(c);
  const [publicBooking, groupDepartures] = await Promise.all([
    resolveFeature(c.env, link.tenantId, 'public_booking'),
    resolveFeature(c.env, link.tenantId, 'group_departures'),
  ]);
  if (!publicBooking.enabled || !groupDepartures.enabled) return notFound(c);

  let dep: DepartureContext;
  try {
    dep = await loadDepartureContext(db, link.entityId);
  } catch (e) {
    if (e instanceof DepartureError) return notFound(c);
    throw e;
  }
  if (!dep.settings.enabled || !dep.row.public_booking_enabled) return notFound(c);
  const status = dep.row.status as string;
  if (!(status === 'open' || (opts.allowClosed && status === 'closed'))) return notFound(c);
  return { tenantId: link.tenantId, db, dep };
}

// ---------------------------------------------------------------- the projection

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/** An opaque, stable reference for a pickup point, so the page never holds a row id. */
async function stopRef(stopId: string): Promise<string> {
  return (await sha256Hex(`pickup:${stopId}`)).slice(0, 16);
}

function seatsLeftDisplay(mode: string, threshold: number, left: number): number | null {
  if (mode === 'always') return left;
  if (mode === 'below_threshold') return left <= threshold ? left : null;
  return null;
}

async function agencyBranding(env: Env, tenantId: string, db: D1Database) {
  const brand = await db
    .prepare('SELECT agency_name, logo_url, primary_color, accent_color, tagline, agency_email, agency_phone FROM tenant_branding WHERE tenant_id = ? LIMIT 1')
    .bind(tenantId)
    .first<Row>()
    .catch(() => null);
  const master = await env.MASTER_DB.prepare('SELECT company_name FROM tenants WHERE id = ?').bind(tenantId).first<{ company_name: string }>().catch(() => null);
  const logo = typeof brand?.logo_url === 'string' && /^https:\/\//i.test(brand.logo_url) ? brand.logo_url : null;
  return {
    name: (brand?.agency_name as string | null) || master?.company_name || '',
    logoUrl: logo,
    primaryColor: HEX_COLOUR.test(brand?.primary_color ?? '') ? (brand!.primary_color as string) : null,
    accentColor: HEX_COLOUR.test(brand?.accent_color ?? '') ? (brand!.accent_color as string) : null,
    tagline: (brand?.tagline as string | null) || null,
    email: (brand?.agency_email as string | null) || null,
    phone: (brand?.agency_phone as string | null) || null,
  };
}

/** Day numbers and titles of the tour's plan; nothing else of the template (no notes, no costs). */
async function dayTitles(db: D1Database, templateId: string | null): Promise<Array<{ day: number; title: string }>> {
  if (!templateId) return [];
  const row = await db.prepare('SELECT template_data FROM itinerary_templates WHERE id = ?').bind(templateId).first<{ template_data: string | null }>().catch(() => null);
  if (!row?.template_data) return [];
  try {
    const data = JSON.parse(row.template_data) as { days?: Array<{ dayNumber?: number; title?: string | null; city?: string | null }> };
    return (data.days ?? [])
      .map((d, i) => ({ day: Number(d.dayNumber) || i + 1, title: String(d.title || d.city || '').slice(0, 200) }))
      .filter((d) => d.title)
      .slice(0, 60);
  } catch {
    return [];
  }
}

async function termsText(db: D1Database, dep: DepartureContext): Promise<string> {
  const own = dep.settings.publicBooking.termsText?.trim() || (dep.tour.terms as string | null)?.trim();
  if (own) return own.slice(0, 20000);
  try {
    const row = await db.prepare(`SELECT value FROM settings WHERE key = 'itinerary_defaults'`).first<{ value: string | null }>();
    const defaults = row?.value ? (JSON.parse(row.value) as { defaultTerms?: unknown }) : null;
    return typeof defaults?.defaultTerms === 'string' ? defaults.defaultTerms.trim().slice(0, 20000) : '';
  } catch {
    return '';
  }
}

const bookingFields = (dep: DepartureContext): PassengerFieldDef[] => dep.effective.passengerFields.filter((f) => f.collectOn === 'booking');

async function issueFormToken(env: Env, token: string): Promise<string> {
  const issued = Date.now();
  return `${issued}.${(await hmacSha256Hex(env.JWT_SECRET, `pubdep-form:${token}:${issued}`)).slice(0, 32)}`;
}

async function checkFormToken(env: Env, token: string, formToken: string): Promise<'ok' | 'invalid' | 'too_fast'> {
  const [issuedText, sig] = formToken.split('.');
  const issued = Number(issuedText);
  if (!Number.isFinite(issued) || !sig) return 'invalid';
  const expected = (await hmacSha256Hex(env.JWT_SECRET, `pubdep-form:${token}:${issued}`)).slice(0, 32);
  if (!safeEqual(expected, sig)) return 'invalid';
  const age = Date.now() - issued;
  if (age > FORM_MAX_AGE_MS || age < -5000) return 'invalid';
  const configured = env.PUBLIC_BOOKING_MIN_FILL_SECONDS;
  const minSeconds = configured !== undefined && configured !== '' ? Number(configured) : isTestMode(env) ? 0 : 3;
  return age < (Number.isFinite(minSeconds) ? minSeconds : 3) * 1000 ? 'too_fast' : 'ok';
}

async function buildProjection(c: Context<AppContext>, page: PageCtx) {
  const { db, dep, tenantId } = page;
  const token = c.req.param('token') ?? '';
  const [branding, locale, language, prices, stops, days, terms, bands, left] = await Promise.all([
    agencyBranding(c.env, tenantId, db),
    loadLocaleContext(db),
    agencyDefaultLanguage(db),
    effectivePrices(db, dep.row.tour_id, dep.row.id),
    getDepartureStops(db, dep.row.id),
    dayTitles(db, (dep.tour.itinerary_template_id as string | null) ?? null),
    termsText(db, dep),
    loadAgencyBands(db),
    seatsLeft(db, dep.row.id, dep.row.capacity),
  ]);

  const fields = bookingFields(dep);
  const collects = (key: string) => fields.some((f) => f.key === key);

  // Bands: the priced ones; when the tour has no band prices every band is offered unpriced.
  const bandPrices = prices.filter((p) => p.kind === 'age_band');
  const shown = bandPrices.length ? bands.filter((b) => bandPrices.some((p) => p.key === b.key)) : bands;
  const bandOut: Array<{ key: string; label: string | null; minAge: number; maxAge: number | null; amount: number | null }> = shown.map((b) => {
    const higher = bands.filter((o) => o.minAge > b.minAge).sort((x, y) => x.minAge - y.minAge)[0];
    const price = bandPrices.find((p) => p.key === b.key);
    return { key: b.key, label: price?.label || b.label, minAge: b.minAge, maxAge: higher ? higher.minAge - 1 : null, amount: price ? price.amount : null };
  });
  // A band priced on the tour but missing from the agency list (renamed since) still sells.
  for (const p of bandPrices) if (!bandOut.some((b) => b.key === p.key)) bandOut.push({ key: p.key, label: p.label, minAge: 0, maxAge: null, amount: p.amount });

  const supplements = new Map(prices.filter((p) => p.kind === 'room_supplement').map((p) => [p.key, p.amount]));
  const seatSurcharge = prices.find((p) => p.kind === 'seat_surcharge')?.amount ?? null;
  const showRooms = collects('roomType');
  const pickup = collects('pickupPoint') ? stops.filter((s) => s.kind === 'pickup' || s.kind === 'both') : [];

  const full = left === 0;
  const waitlist = dep.settings.waitlist.enabled;
  const open = dep.row.status === 'open';
  const deposit = dep.effective.deposit;
  const hasDeposit = deposit.type !== 'none' && (deposit.value ?? 0) > 0;

  return {
    state: open ? 'open' : 'closed',
    agency: branding,
    tour: {
      title: dep.tour.title as string,
      description: (dep.tour.description as string | null) ?? null,
      destination: (dep.tour.destination as string | null) ?? null,
      durationDays: (dep.tour.duration_days as number | null) ?? null,
    },
    startDate: dep.row.start_date as string,
    endDate: dep.row.end_date as string,
    startTime: (dep.row.start_time as string | null) ?? null,
    days,
    currency: ((dep.tour.currency as string | null) ?? locale.currency).toUpperCase(),
    locale: { locale: locale.locale, timeZone: locale.timezone, country: locale.country, phoneDefaultCountry: locale.phoneDefaultCountry },
    language: { default: language, available: LANGUAGES },
    prices: {
      bands: bandOut,
      roomSupplements: showRooms ? dep.effective.roomTypes.map((r) => ({ key: r.key, label: r.label, occupancy: r.occupancy, amount: supplements.get(r.key) ?? null })) : [],
      seatSurcharge: dep.settings.preferredSeat.enabled ? seatSurcharge : null,
    },
    pickupPoints: await Promise.all(pickup.map(async (s) => ({ ref: await stopRef(s.id), name: s.name, address: s.address ?? null, localTime: s.localTime ?? null, dayOffset: s.dayOffset ?? 0 }))),
    passengerFields: fields.map((f) => ({ key: f.key, label: f.label, required: !!f.required, type: f.type ?? 'text', options: f.options ?? null, custom: !!f.custom })),
    shareMatching: dep.settings.shareMatching,
    preferredSeat: dep.settings.preferredSeat.enabled,
    terms,
    requireTerms: dep.settings.publicBooking.requireTerms,
    marketingOptIn: dep.settings.publicBooking.marketingOptIn,
    deposit: hasDeposit ? { type: deposit.type, value: deposit.value } : null,
    holdHours: dep.effective.holdExpiryHours,
    seats: { left: seatsLeftDisplay(dep.effective.showSeatsLeft, dep.settings.seatsLeftThreshold, left), full, waitlist: full && waitlist },
    maxParty: MAX_PARTY,
    captcha: c.env.TURNSTILE_SECRET_KEY && c.env.TURNSTILE_SITE_KEY ? { siteKey: c.env.TURNSTILE_SITE_KEY } : null,
    formToken: await issueFormToken(c.env, token),
  };
}

publicBookingRoutes.get('/:token', readLimit, async (c) => {
  const page = await loadPage(c, { allowClosed: true });
  if (page instanceof Response) return page;
  return c.json({ success: true, data: await buildProjection(c, page) });
});

/** The websites that may show the page in a frame: the chat widget's allowed websites, else none (the page sends frame-ancestors 'self'). */
publicBookingRoutes.get('/:token/frame', readLimit, async (c) => {
  const page = await loadPage(c, { allowClosed: true });
  if (page instanceof Response) return page;
  const config = await readWidgetConfig(page.db).catch(() => null);
  let list: unknown = [];
  try {
    list = config?.allowed_origins ? JSON.parse(config.allowed_origins) : [];
  } catch {
    list = [];
  }
  const ancestors = (Array.isArray(list) ? list : [])
    .filter((o): o is string => typeof o === 'string')
    .map((o) => o.trim().replace(/\/+$/, ''))
    // A source expression only: no spaces, semicolons or quotes that could add directives to the policy.
    .filter((o) => /^https?:\/\/[A-Za-z0-9*.\-]+(:\d{1,5})?$/.test(o))
    .slice(0, 20);
  return c.json({ success: true, data: { ancestors } });
});

// ---------------------------------------------------------------- booking

const text = (max: number) => z.string().trim().max(max);

const passengerSchema = z.object({
  band: z.string().trim().min(1).max(40),
  firstName: text(80).default(''),
  lastName: text(80).default(''),
  gender: z.enum(['male', 'female', 'other']).nullish(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  ageYears: z.number().int().min(0).max(120).nullish(),
  pickupPoint: text(40).nullish(),
  roomType: text(40).nullish(),
  shareOk: z.boolean().nullish(),
  shareGender: z.boolean().nullish(),
  mealPreference: text(60).nullish(),
  preferredSeat: text(20).nullish(),
  extraFields: z.record(z.string().max(40), z.union([z.string().max(300), z.number(), z.boolean(), z.null()])).nullish(),
});

const bookingSchema = z.object({
  formToken: z.string().min(10).max(120),
  /** Honeypot: hidden from people, filled by bots. */
  website: z.string().max(500).optional(),
  language: z.string().max(5).optional(),
  captchaToken: z.string().max(4096).optional(),
  contact: z.object({ name: text(120), email: text(200).optional(), phone: text(40).optional() }),
  passengers: z.array(passengerSchema).min(1).max(MAX_PARTY),
  acceptTerms: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
  notes: text(1000).optional(),
});

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function turnstileOk(secret: string, token: string | undefined, remoteIp: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(TURNSTILE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, ...(remoteIp !== 'unknown' ? { remoteip: remoteIp } : {}) }),
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}

interface StoredAnswer {
  status: number;
  body: unknown;
  pending?: boolean;
}

publicBookingRoutes.post('/:token/bookings', bookIpLimit, bookTokenLimit, async (c) => {
  if (Number(c.req.header('Content-Length') || 0) > MAX_BODY_BYTES) return fail(c, 413, 'TOO_LARGE', 'en', 'public.booking.tooLarge');
  const page = await loadPage(c, { allowClosed: true });
  if (page instanceof Response) return page;
  const { db, dep, tenantId } = page;
  const agencyLang = await agencyDefaultLanguage(db);
  if (dep.row.status !== 'open') return fail(c, 409, 'CLOSED', agencyLang, 'public.booking.closed');

  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return fail(c, 413, 'TOO_LARGE', agencyLang, 'public.booking.tooLarge');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(c, 400, 'INVALID', agencyLang, 'public.booking.invalid');
  }
  const parsed = bookingSchema.safeParse(json);
  const lang: TextLanguage = textLanguage((parsed.success ? parsed.data.language : undefined) ?? agencyLang);
  if (!parsed.success) return fail(c, 400, 'INVALID', lang, 'public.booking.invalid');
  const body = parsed.data;

  // Abuse controls: honeypot, then the signed fill-time token, then Turnstile when the agency platform has keys.
  if (body.website && body.website.trim()) return fail(c, 400, 'REJECTED', lang, 'public.booking.rejected');
  const token = c.req.param('token') ?? '';
  const form = await checkFormToken(c.env, token, body.formToken);
  if (form === 'invalid') return fail(c, 400, 'REJECTED', lang, 'public.booking.rejected');
  if (form === 'too_fast') return fail(c, 400, 'TOO_FAST', lang, 'public.booking.tooFast');

  // One booking per Idempotency-Key for 24 hours: a double submit gets the first answer back.
  const keyHeader = (c.req.header('Idempotency-Key') ?? '').trim().slice(0, 128);
  const idemKey = keyHeader ? `pubbook:idem:${token}:${(await sha256Hex(keyHeader)).slice(0, 40)}` : null;
  if (idemKey) {
    const prior = await c.env.CACHE.get(idemKey, 'json').catch(() => null) as StoredAnswer | null;
    if (prior) {
      if (prior.pending) return fail(c, 409, 'IN_PROGRESS', lang, 'public.booking.inProgress');
      c.header('Idempotent-Replayed', 'true');
      return c.json(prior.body as object, prior.status as 200);
    }
    await c.env.CACHE.put(idemKey, JSON.stringify({ pending: true }), { expirationTtl: 60 }).catch(() => undefined);
  }
  const answer = async (status: number, payload: unknown) => {
    if (idemKey) {
      // Only a booking is replayed; a refused form can be corrected and sent again with the same key.
      if (status < 300) await c.env.CACHE.put(idemKey, JSON.stringify({ status, body: payload } satisfies StoredAnswer), { expirationTtl: IDEMPOTENCY_TTL_SECONDS }).catch(() => undefined);
      else await c.env.CACHE.delete(idemKey).catch(() => undefined);
    }
    return c.json(payload as object, status as 200);
  };
  const refuse = (status: 400 | 409, code: string, key: string, extra: Record<string, unknown> = {}, vars?: Record<string, string | number>) =>
    answer(status, { success: false, error: { code, message: t(lang, key, vars), ...extra } });

  if (c.env.TURNSTILE_SECRET_KEY && !(await turnstileOk(c.env.TURNSTILE_SECRET_KEY, body.captchaToken, ip(c)))) {
    return refuse(400, 'CAPTCHA', 'public.booking.captcha');
  }

  // ---- contact and terms
  const name = body.contact.name.trim();
  const email = (body.contact.email ?? '').trim().toLowerCase();
  const phoneCountry = await tenantPhoneCountry(db);
  const phone = body.contact.phone?.trim() ? normalizePhone(body.contact.phone.trim(), phoneCountry) : '';
  if (!name || (!email && !phone)) return refuse(400, 'CONTACT_REQUIRED', 'public.booking.contactRequired', { field: !name ? 'name' : 'email' });
  if (email && !EMAIL_SHAPE.test(email)) return refuse(400, 'INVALID', 'public.booking.emailInvalid', { field: 'email' });
  if (phone) {
    const digits = phone.replace(/\D/g, '').length;
    if (digits < 6 || digits > 15) return refuse(400, 'INVALID', 'public.booking.phoneInvalid', { field: 'phone' });
  }
  if (dep.settings.publicBooking.requireTerms && body.acceptTerms !== true) return refuse(400, 'TERMS_REQUIRED', 'public.booking.termsRequired', { field: 'acceptTerms' });
  if (body.passengers.length > MAX_PARTY) return refuse(400, 'INVALID', 'public.booking.tooMany', {}, { max: MAX_PARTY });

  // ---- passengers: only the fields the departure collects at booking, bands checked against age
  const fields = bookingFields(dep);
  const collects = (key: string) => fields.some((f) => f.key === key);
  const customKeys = new Set(fields.filter((f) => !CORE_FIELDS.has(f.key)).map((f) => f.key));
  const stops = collects('pickupPoint') ? await getDepartureStops(db, dep.row.id) : [];
  const refToStop = new Map<string, string>();
  for (const s of stops) if (s.kind === 'pickup' || s.kind === 'both') refToStop.set(await stopRef(s.id), s.id);
  const bands = await loadAgencyBands(db);
  const bandKeys = new Set(bands.map((b) => b.key));
  const priced = (await effectivePrices(db, dep.row.tour_id, dep.row.id)).filter((p) => p.kind === 'age_band');
  for (const p of priced) bandKeys.add(p.key);
  const topBand = bands[0]?.key;
  const startDate: string = dep.row.start_date;

  const problems: Array<{ index: number; field: string }> = [];
  const inputs: PassengerInput[] = [];
  const declared: string[] = [];
  body.passengers.forEach((p, index) => {
    const bad = (field: string) => problems.push({ index, field });
    if (!p.firstName.trim()) bad('name');
    if (!bandKeys.has(p.band)) bad('band');
    const dob = collects('dateOfBirth') ? p.dateOfBirth ?? null : null;
    const age = dob ? ageOn(dob, startDate) : p.ageYears ?? null;
    if (dob && dob > startDate) bad('dateOfBirth');
    if (age !== null) {
      const computed = bandForAge(bands, age);
      if (computed && computed !== p.band) bad('band');
    } else if (p.band !== topBand && bandKeys.has(p.band)) {
      // Anything but the top (adult) band must show an age, so a child fare cannot be claimed for an adult.
      bad(collects('dateOfBirth') ? 'dateOfBirth' : 'ageYears');
    }
    const stopId = p.pickupPoint ? refToStop.get(p.pickupPoint) : undefined;
    if (p.pickupPoint && !stopId) bad('pickupPoint');
    const extra: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(p.extraFields ?? {})) if (customKeys.has(k)) extra[k] = v;
    declared.push(p.band);
    inputs.push({
      firstName: p.firstName,
      lastName: p.lastName,
      gender: collects('gender') ? p.gender ?? null : null,
      dateOfBirth: dob,
      ageYears: dob ? null : p.ageYears ?? null,
      pickupStopId: stopId ?? null,
      roomType: collects('roomType') ? p.roomType || null : null,
      shareOk: collects('roomType') && dep.settings.shareMatching ? !!p.shareOk : false,
      shareGender: collects('roomType') && dep.settings.shareMatching ? !!p.shareGender : false,
      mealPreference: collects('meal') ? p.mealPreference || null : null,
      seatNumber: dep.settings.preferredSeat.enabled && p.preferredSeat ? p.preferredSeat : undefined,
      extraFields: Object.keys(extra).length ? extra : undefined,
    });
  });
  if (problems.length) {
    const bandProblem = problems.some((x) => x.field === 'band');
    return refuse(400, 'PASSENGER_INVALID', bandProblem ? 'public.booking.bandMismatch' : 'public.booking.passengerInvalid', { errors: problems });
  }

  // ---- the booking itself
  let waiter: SeatCtx['waiter'];
  try {
    waiter = c.executionCtx;
  } catch {
    waiter = undefined;
  }
  const ctx: SeatCtx = { env: c.env, tenantId, db, userId: null, depth: 0, waiter };
  let booking;
  try {
    booking = await requestSeats(ctx, {
      departureId: dep.row.id,
      passengers: inputs,
      contact: { name, email: email || undefined, phone: phone || undefined },
      source: 'public_page',
      notes: body.notes?.trim() || null,
    });
  } catch (e) {
    if (e instanceof DepartureError) {
      if (e.code === 'SEATS_UNAVAILABLE') {
        const left = await seatsLeft(db, dep.row.id, dep.row.capacity);
        return refuse(409, 'SEATS_UNAVAILABLE', 'public.booking.noSeats', { seats: { left: seatsLeftDisplay(dep.effective.showSeatsLeft, dep.settings.seatsLeftThreshold, left), full: left === 0 } });
      }
      if (e.code === 'PASSENGER_INVALID') {
        const list = ((e.details?.errors as Array<{ index: number; field: string }> | undefined) ?? []).map((x) => ({ index: x.index, field: x.field }));
        const seatTaken = list.some((x) => x.field === 'seatNumber');
        return refuse(400, 'PASSENGER_INVALID', seatTaken ? 'public.booking.seatTaken' : 'public.booking.passengerInvalid', { errors: list });
      }
      if (e.code === 'INVALID_PICKUP_STOP') return refuse(400, 'PASSENGER_INVALID', 'public.booking.passengerInvalid', { errors: [{ index: Number(e.details?.index ?? 0), field: 'pickupPoint' }] });
      if (e.code === 'DEPARTURE_NOT_OPEN') return refuse(409, 'CLOSED', 'public.booking.closed');
      if (e.code === 'CONTACT_REQUIRED') return refuse(400, 'CONTACT_REQUIRED', 'public.booking.contactRequired');
    }
    throw e;
  }

  // Passengers that gave no age keep the band the party chose (an age, when given, already decided the band above).
  const created = booking.passengers;
  for (let i = 0; i < created.length; i++) {
    if (!created[i].bandKey && declared[i]) {
      await db.prepare('UPDATE seat_passengers SET band_key = ? WHERE id = ?').bind(declared[i], created[i].id).run();
    }
  }

  // ---- consent: the terms always, marketing only when ticked and offered
  const evidence = { ip: ip(c) === 'unknown' ? null : ip(c), userAgent: (c.req.header('user-agent') ?? '').slice(0, 200), departureId: dep.row.id, language: lang, page: 'public_booking' };
  if (body.acceptTerms === true) {
    await recordConsent(db, {
      contactId: booking.contactId, channel: 'any', purpose: 'service', status: 'granted', source: 'form',
      evidence: { ...evidence, accepted: 'terms', termsSha256: (await sha256Hex(await termsText(db, dep))).slice(0, 16) },
    });
  }
  if (body.marketingOptIn === true && dep.settings.publicBooking.marketingOptIn) {
    const contact = await db.prepare('SELECT opted_out FROM contacts WHERE id = ?').bind(booking.contactId).first<{ opted_out: number | null }>();
    // Someone typing an address in a form cannot lift an earlier opt-out of its owner: the new consent is recorded, the switch stays.
    if (contact?.opted_out) await recordConsent(db, { contactId: booking.contactId, channel: 'any', purpose: 'marketing', status: 'granted', source: 'form', evidence });
    else await grantMarketing(db, booking.contactId, 'any', 'form', { evidence });
  }

  // ---- the invoice and the deposit (confirmed and held bookings only; a waitlisted party owes nothing yet)
  const out: Record<string, unknown> = {
    status: booking.status,
    reference: `BK-${booking.id.replace(/-/g, '').slice(-8).toUpperCase()}`,
    holdExpiresAt: booking.holdExpiresAt,
    seats: booking.seats,
    currency: ((dep.tour.currency as string | null) ?? (await loadLocaleContext(db)).currency).toUpperCase(),
  };
  const deposit = dep.effective.deposit;
  if (booking.status !== 'waitlisted' && deposit.type !== 'none' && (deposit.value ?? 0) > 0) {
    try {
      const invoice = await createBookingInvoice(c.env, tenantId, db, booking.id, { userId: null, waiter });
      const amount = bookingDeposit(deposit, booking.seats, invoice.total);
      out.reference = invoice.invoiceNumber;
      out.total = invoice.total;
      out.currency = invoice.currency;
      out.depositAmount = amount;
      if (amount > 0) {
        const apiBase = (c.env.API_PUBLIC_URL?.trim() || new URL(c.req.url).origin).replace(/\/+$/, '');
        const link = await createDepositLink(
          c.env, tenantId, db, { id: invoice.invoiceId, invoiceNumber: invoice.invoiceNumber, currency: invoice.currency }, amount,
          { name, email: email || null, phone: phone || null }, apiBase,
        );
        if (link) out.payment = { url: link.url, amount: link.amount, currency: link.currency };
        else {
          const bank = await bankInstructions(db, invoice.invoiceNumber);
          if (bank) out.bank = { ...bank, amount, currency: invoice.currency };
        }
      }
    } catch (e) {
      // The seats are held whatever happens here; the agency finishes the invoice by hand.
      if (!(e instanceof DepartureError)) console.error('[public-booking] invoice step failed:', e);
    }
  }
  return answer(201, { success: true, data: out });
});

// ================================================================ the traveller self-service page (R150)
//
//   GET /api/v1/public/booking/:token             the booking (or one traveller): details to collect, extras, money
//   PUT /api/v1/public/booking/:token/passengers  save the travellers' details (and their travellers records)
//   PUT /api/v1/public/booking/:token/extras      choose extras per person; the extras invoice follows
//   POST /api/v1/public/booking/:token/pay        a payment link (or the bank details) for the extras, the balance or the deposit
//
// The token (master public_links, kind booking_self_service or passenger_self_service) names one seat booking or one passenger. The
// same gates and the same uniform 404 as the booking page apply, except that the departure's own public-page switch is not needed (a
// party booked by staff gets a link too); a passenger link sees and changes that passenger only, and ids reach the page as opaque
// references.

export const publicTripRoutes = new Hono<AppContext>();

publicTripRoutes.use('*', async (c, next) => {
  c.header('X-Robots-Tag', 'noindex, nofollow');
  c.header('Cache-Control', 'no-store');
  await next();
});

/** 60 reads / minute / IP. */
const tripReadLimit = rateLimit({ limit: 60, windowMs: 60 * 1000, keyFn: (c) => `rl:pubtrip-get:${ip(c)}` });
/** 30 writes / minute / token. */
const tripWriteLimit = rateLimit({ limit: 30, windowMs: 60 * 1000, keyFn: (c) => `rl:pubtrip-write:${tokenOf(c)}` });
/** 5 pay requests / minute / token. */
const tripPayLimit = rateLimit({ limit: 5, windowMs: 60 * 1000, keyFn: (c) => `rl:pubtrip-pay:${tokenOf(c)}` });

const TRIP_MAX_BODY_BYTES = 64 * 1024;

const waiterOf = (c: Context<AppContext>): SeatCtx['waiter'] => {
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
};

/** token -> tenant (master) -> agency database -> plan features -> booking. A refusal is returned as a Response. */
async function loadTripPage(c: Context<AppContext>): Promise<{ trip: TripCtx; lang: TextLanguage } | Response> {
  const waiter = waiterOf(c);
  const token = c.req.param('token') ?? '';
  let scope: LinkScope = 'booking';
  let link = await resolveLink(c.env, token, 'booking_self_service', waiter);
  if (!link) {
    scope = 'passenger';
    link = await resolveLink(c.env, token, 'passenger_self_service', waiter);
  }
  if (!link) return notFound(c);
  if (link.status === 'expired') return fail(c, 410, 'EXPIRED', 'en', 'public.booking.expired');

  const db = await resolveTenantDb(c.env, link.tenantId);
  if (!db) return notFound(c);
  const [publicBooking, groupDepartures] = await Promise.all([
    resolveFeature(c.env, link.tenantId, 'public_booking'),
    resolveFeature(c.env, link.tenantId, 'group_departures'),
  ]);
  if (!publicBooking.enabled || !groupDepartures.enabled) return notFound(c);

  const trip = await loadTrip(db, link.tenantId, scope, link.entityId);
  if (!trip) return notFound(c);
  return { trip, lang: await agencyDefaultLanguage(db) };
}

async function readJson(c: Context<AppContext>, lang: TextLanguage): Promise<unknown | Response> {
  if (Number(c.req.header('Content-Length') || 0) > TRIP_MAX_BODY_BYTES) return fail(c, 413, 'TOO_LARGE', lang, 'public.booking.tooLarge');
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).length > TRIP_MAX_BODY_BYTES) return fail(c, 413, 'TOO_LARGE', lang, 'public.booking.tooLarge');
  try {
    return JSON.parse(raw);
  } catch {
    return fail(c, 400, 'INVALID', lang, 'public.trip.invalid');
  }
}

/** The page: the booking's own view plus the agency branding, locale and language (a fixed projection). */
async function tripProjection(c: Context<AppContext>, trip: TripCtx) {
  const [view, branding, locale, language, days] = await Promise.all([
    buildTripView(trip),
    agencyBranding(c.env, trip.tenantId, trip.db),
    loadLocaleContext(trip.db),
    agencyDefaultLanguage(trip.db),
    dayTitles(trip.db, (trip.dep.tour.itinerary_template_id as string | null) ?? null),
  ]);
  return {
    ...view,
    agency: branding,
    days,
    locale: { locale: locale.locale, timeZone: locale.timezone, country: locale.country, phoneDefaultCountry: locale.phoneDefaultCountry },
    language: { default: language, available: LANGUAGES },
  };
}

/** Reads the booking again after a write, so the page is built from what is stored. */
async function reloadTrip(trip: TripCtx): Promise<TripCtx> {
  const fresh = await loadTrip(trip.db, trip.tenantId, trip.scope, trip.scope === 'booking' ? trip.booking.id : trip.passengers[0].id);
  return fresh ?? trip;
}

publicTripRoutes.get('/:token', tripReadLimit, async (c) => {
  const page = await loadTripPage(c);
  if (page instanceof Response) return page;
  return c.json({ success: true, data: await tripProjection(c, page.trip) });
});

const travellerSchema = z.object({
  ref: z.string().min(1).max(40),
  firstName: text(80).optional(),
  lastName: text(80).optional(),
  gender: z.enum(['male', 'female', 'other', '']).nullish(),
  dateOfBirth: z.string().max(10).nullish(),
  mealPreference: text(60).nullish(),
  values: z.record(z.string().max(40), z.union([z.string().max(300), z.boolean(), z.null()])).optional(),
});
const travellersSchema = z.object({ passengers: z.array(travellerSchema).min(1).max(MAX_PARTY) });

publicTripRoutes.put('/:token/passengers', tripWriteLimit, async (c) => {
  const page = await loadTripPage(c);
  if (page instanceof Response) return page;
  const { trip, lang } = page;
  const json = await readJson(c, lang);
  if (json instanceof Response) return json;
  const parsed = travellersSchema.safeParse(json);
  if (!parsed.success) return fail(c, 400, 'INVALID', lang, 'public.trip.invalid');
  try {
    await saveTravellers(c.env, trip, parsed.data.passengers.map((p) => ({ ...p, gender: p.gender ?? undefined, dateOfBirth: p.dateOfBirth ?? undefined })));
  } catch (e) {
    if (e instanceof DepartureError && e.code === 'PASSENGER_INVALID') {
      return fail(c, 400, 'PASSENGER_INVALID', lang, 'public.trip.required', { errors: (e.details?.errors as unknown[] | undefined) ?? [] });
    }
    throw e;
  }
  return c.json({ success: true, data: await tripProjection(c, await reloadTrip(trip)) });
});

const choicesSchema = z.object({
  choices: z
    .array(z.object({ passengerRef: z.string().min(1).max(40), extraRef: z.string().min(1).max(40), quantity: z.number().int().min(0).max(MAX_EXTRA_QUANTITY) }))
    .max(600),
});

publicTripRoutes.put('/:token/extras', tripWriteLimit, async (c) => {
  const page = await loadTripPage(c);
  if (page instanceof Response) return page;
  const { trip, lang } = page;
  const json = await readJson(c, lang);
  if (json instanceof Response) return json;
  const parsed = choicesSchema.safeParse(json);
  if (!parsed.success) return fail(c, 400, 'INVALID', lang, 'public.trip.invalid');

  const passengerByRef = new Map<string, string>();
  for (const p of trip.passengers) passengerByRef.set(await refOf('passenger', p.id), p.id);
  const catalogue = await loadEffectiveExtras(trip.db, trip.dep.row.tour_id, trip.dep.row.id);
  const extraByRef = new Map<string, string>();
  for (const e of catalogue) extraByRef.set(await refOf('extra', e.id), e.id);
  const choices: Array<{ passengerId: string; extraId: string; quantity: number }> = [];
  for (const ch of parsed.data.choices) {
    const passengerId = passengerByRef.get(ch.passengerRef);
    const extraId = extraByRef.get(ch.extraRef);
    if (!passengerId || !extraId) return fail(c, 400, 'INVALID_EXTRA', lang, 'public.trip.extraInvalid');
    choices.push({ passengerId, extraId, quantity: ch.quantity });
  }

  let invoice: Awaited<ReturnType<typeof invoiceExtras>> = null;
  try {
    await setChoices(trip.db, trip.booking.id, choices, { via: 'self_service', enforceCutoff: true, passengerIds: trip.passengers.map((p) => p.id as string) });
    try {
      invoice = await invoiceExtras(c.env, trip.tenantId, trip.db, trip.booking.id, { userId: null, waiter: waiterOf(c) });
    } catch (e) {
      // The choices are saved whatever happens here; the agency finishes the invoice by hand.
      if (!(e instanceof DepartureError)) console.error('[public-trip] extras invoice failed:', e);
    }
  } catch (e) {
    if (e instanceof DepartureError) {
      if (e.code === 'EXTRAS_CLOSED') return fail(c, 409, 'EXTRAS_CLOSED', lang, 'public.trip.extraClosed', {}, { extra: String(e.details?.extra ?? '') });
      if (e.code === 'EXTRA_FULL') return fail(c, 409, 'EXTRA_FULL', lang, 'public.trip.extraFull', { left: e.details?.left ?? 0 }, { extra: String(e.details?.extra ?? '') });
      if (e.code === 'INVALID_EXTRA') return fail(c, 400, 'INVALID_EXTRA', lang, 'public.trip.extraInvalid');
      if (e.code === 'BOOKING_NOT_EDITABLE') return fail(c, 409, 'NOT_EDITABLE', lang, 'public.trip.notEditable');
    }
    throw e;
  }
  const data = await tripProjection(c, await reloadTrip(trip));
  return c.json({ success: true, data: { ...data, invoiceCreated: invoice ? { number: invoice.invoiceNumber, total: invoice.total, currency: invoice.currency } : null } });
});

const paySchema = z.object({ what: z.enum(['extras', 'balance', 'deposit']) });

publicTripRoutes.post('/:token/pay', tripPayLimit, async (c) => {
  const page = await loadTripPage(c);
  if (page instanceof Response) return page;
  const { trip, lang } = page;
  const json = await readJson(c, lang);
  if (json instanceof Response) return json;
  // Paying is for the whole booking: the link of one traveller does not reach the booking's invoices.
  if (trip.scope === 'passenger') return fail(c, 409, 'NOT_EDITABLE', lang, 'public.trip.notEditable');
  const parsed = paySchema.safeParse(json);
  if (!parsed.success) return fail(c, 400, 'INVALID', lang, 'public.trip.invalid');
  const apiBase = (c.env.API_PUBLIC_URL?.trim() || new URL(c.req.url).origin).replace(/\/+$/, '');
  try {
    const result = await payFor(c.env, trip, parsed.data.what, apiBase, { userId: null, waiter: waiterOf(c) });
    if (result.kind === 'link') {
      return c.json({ success: true, data: { payment: { url: result.url, amount: result.amount, currency: result.currency }, reference: result.invoiceNumber } });
    }
    if (result.kind === 'bank') {
      return c.json({ success: true, data: { bank: { ...result.bank, amount: result.amount, currency: result.currency }, reference: result.invoiceNumber } });
    }
    return c.json({ success: true, data: { unavailable: true, amount: result.amount, currency: result.currency, reference: result.invoiceNumber, message: t(lang, 'public.trip.paymentUnavailable') } });
  } catch (e) {
    if (e instanceof DepartureError) {
      if (e.code === 'NOTHING_DUE') return fail(c, 409, 'NOTHING_DUE', lang, 'public.trip.nothingDue');
      if (e.code === 'BOOKING_NOT_EDITABLE') return fail(c, 409, 'NOT_EDITABLE', lang, 'public.trip.notEditable');
    }
    throw e;
  }
});
