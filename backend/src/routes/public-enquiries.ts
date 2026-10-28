/**
 * Landing page enquiries (R116).
 *
 *   POST /api/v1/public/enquiries        public: a visitor asks for a demo, a trial or contact (no login)
 *   GET  /api/v1/admin/enquiries         super admin: list, newest first (?status=&kind=&page=&limit=)
 *   PATCH /api/v1/admin/enquiries/:id    super admin: set status new|contacted|converted|spam
 *
 * The public endpoint never creates an account or an agency (the operator approves enquiries by hand), never
 * says whether an email is already registered, and answers 202 with no echo of what was stored. Defences, in
 * order: 5 requests/hour/IP (429), 10 KB body cap (413), JSON + honeypot field `website` (a filled honeypot
 * answers 202 and stores nothing), zod validation (400), Cloudflare Turnstile when TURNSTILE_SECRET is set
 * (400), 3 enquiries/day/email (429). Stored in MASTER_DB; the platform inbox gets a `platform_enquiry` mail.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppContext } from '../types';
import { zValidator } from '../utils/validator';
import { rateLimit } from '../middleware/rate-limit';
import { requireSuperAdmin } from '../middleware/require-super-admin';
import { sendTransactional } from '../services/mail/transactional';
import { supportEmail } from '../utils/app-urls';
import { generateId } from '../utils/uuid';
import { error, success } from '../utils/response';
import { actorFrom, logAdminAction } from '../services/admin/audit';

const MAX_BODY_BYTES = 10 * 1024;
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const KINDS = ['contact', 'demo', 'signup'] as const;
const STATUSES = ['new', 'contacted', 'converted', 'spam'] as const;
const ACCEPTED = { received: true };

const text = (max: number) => z.string().trim().max(max);
const optional = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), text(max).optional());

const enquirySchema = z.object({
  kind: z.enum(KINDS).default('contact'),
  name: text(120).min(1, 'Please enter your name'),
  email: text(200).email('Please enter a valid email address'),
  phone: optional(32).refine((v) => v === undefined || /^[0-9+()\-.\s]{5,32}$/.test(v), 'Please enter a valid phone number'),
  company: optional(160),
  country: optional(80),
  agentsCount: z.preprocess(
    (v) => (v === '' || v === null ? undefined : typeof v === 'string' ? Number(v) : v),
    z.number().int().min(1).max(100000).optional(),
  ),
  message: optional(2000),
  sourceUrl: optional(300),
  turnstileToken: optional(2048),
});

const clientIp = (c: Context<AppContext>) => c.req.header('cf-connecting-ip') || 'unknown';

async function ipHash(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`travelcrm-enquiry:${ip}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function turnstileOk(secret: string, token: string | undefined, ip: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch(TURNSTILE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, ...(ip !== 'unknown' ? { remoteip: ip } : {}) }),
    });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}

// -- Public ------------------------------------------------------

export const publicEnquiryRoutes = new Hono<AppContext>();

publicEnquiryRoutes.use('*', async (c, next) => {
  c.header('X-Robots-Tag', 'noindex, nofollow');
  c.header('Cache-Control', 'no-store');
  await next();
});

/** 5 enquiries per hour per IP (the 6th is refused). */
const perIp = rateLimit({
  limit: 5,
  windowMs: 60 * 60 * 1000,
  keyFn: (c) => `rl:enquiry:${clientIp(c)}`,
});

publicEnquiryRoutes.post('/', perIp, async (c) => {
  // Size cap: the declared length first, then the real length (a client can lie about, or omit, the header).
  const declared = Number(c.req.header('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return error(c, 'Request too large', 413);
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return error(c, 'Request too large', 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(c, 'Invalid request', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error(c, 'Invalid request', 400);

  // Honeypot: real visitors never see this field. A bot gets the same answer as everyone else.
  const trap = (body as Record<string, unknown>).website;
  if (typeof trap === 'string' && trap.trim() !== '') return success(c, ACCEPTED, 202);

  const parsed = enquirySchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? 'form')] ??= issue.message;
    return c.json({ success: false, error: Object.values(fields)[0] ?? 'Please check the form', fields }, 400);
  }
  const data = parsed.data;
  const ip = clientIp(c);

  if (c.env.TURNSTILE_SECRET && !(await turnstileOk(c.env.TURNSTILE_SECRET, data.turnstileToken, ip))) {
    return error(c, 'Please complete the verification and try again', 400);
  }

  const email = data.email.toLowerCase();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  const recent = await c.env.MASTER_DB
    .prepare('SELECT COUNT(*) AS n FROM platform_enquiries WHERE email = ? AND created_at >= ?')
    .bind(email, since)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 3) return error(c, 'Too many requests. We already have your details and will be in touch.', 429);

  const id = generateId();
  await c.env.MASTER_DB
    .prepare(
      `INSERT INTO platform_enquiries (id, kind, name, email, phone, company, country, agents_count, message, source_url, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, data.kind, data.name, email, data.phone ?? null, data.company ?? null, data.country ?? null,
      data.agentsCount ?? null, data.message ?? null, data.sourceUrl ?? null, await ipHash(ip),
    )
    .run();

  const details = [
    `Type: ${data.kind}`,
    data.country ? `Country: ${data.country}` : '',
    data.agentsCount ? `Staff: ${data.agentsCount}` : '',
    data.sourceUrl ? `Page: ${data.sourceUrl}` : '',
    data.message ?? '',
  ].filter(Boolean).join('\n');
  await sendTransactional(c.env, {
    to: supportEmail(c.env),
    template: 'platform_enquiry',
    data: { name: data.name, email, phone: data.phone ?? '', company: data.company ?? '', message: details },
  });

  return success(c, ACCEPTED, 202);
});

// -- Operator view -----------------------------------------------

export const adminEnquiryRoutes = new Hono<AppContext>();
adminEnquiryRoutes.use('*', requireSuperAdmin);

adminEnquiryRoutes.get('/', async (c) => {
  const q = c.req.query();
  const where: string[] = [];
  const binds: unknown[] = [];
  if (q.status && (STATUSES as readonly string[]).includes(q.status)) { where.push('status = ?'); binds.push(q.status); }
  if (q.kind && (KINDS as readonly string[]).includes(q.kind)) { where.push('kind = ?'); binds.push(q.kind); }
  const limit = Math.min(Math.max(parseInt(q.limit ?? '50', 10) || 50, 1), 200);
  const page = Math.max(parseInt(q.page ?? '1', 10) || 1, 1);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await c.env.MASTER_DB.prepare(`SELECT COUNT(*) AS n FROM platform_enquiries ${clause}`).bind(...binds).first<{ n: number }>();
  const rows = await c.env.MASTER_DB
    .prepare(
      `SELECT id, kind, name, email, phone, company, country, agents_count AS agentsCount, message, source_url AS sourceUrl, status, created_at AS createdAt
       FROM platform_enquiries ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, (page - 1) * limit)
    .all();
  const count = total?.n ?? 0;
  return c.json({
    success: true,
    data: rows.results,
    pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit), hasMore: page * limit < count },
  });
});

adminEnquiryRoutes.patch('/:id', zValidator('json', z.object({ status: z.enum(STATUSES) })), async (c) => {
  const id = c.req.param('id');
  const { status } = c.req.valid('json');
  const res = await c.env.MASTER_DB.prepare('UPDATE platform_enquiries SET status = ? WHERE id = ?').bind(status, id).run();
  if (!res.meta.changes) return error(c, 'Enquiry not found', 404);
  await logAdminAction(c.env, actorFrom(c), 'enquiry.status', null, null, null, { entityType: 'enquiry', entityId: id, extra: { status } });
  return success(c, { id, status });
});
