import { Hono } from 'hono';
import type { AppContext } from '../../types';
import { requirePermission } from '../../middleware/rbac';
import { success, error, notFound, paginated } from '../../utils/response';
import { withdrawMarketing, grantMarketing, CONSENT_CHANNELS, type ConsentChannel } from '../../services/privacy/consent';

const optOutRoutes = new Hono<AppContext>();

// ============================================================
// GET OPT-OUT LIST
// ============================================================

optOutRoutes.get(
  '/',
  requirePermission('marketing', 'view'),
  async (c) => {
    const db = c.get('tenantDb');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;

    const search = (c.req.query('search') || '').trim();
    const channel = c.req.query('channel');

    const conditions: string[] = ['opted_out = 1', 'is_deleted = 0'];
    const params: unknown[] = [];
    if (search) {
      conditions.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (channel && channel !== 'all') {
      if (channel === 'manual') {
        conditions.push("(opt_out_channel IS NULL OR opt_out_channel = 'manual')");
      } else {
        conditions.push('opt_out_channel = ?');
        params.push(channel);
      }
    }
    const whereClause = conditions.join(' AND ');

    const countResult = await db
      .prepare(`SELECT COUNT(*) as count FROM contacts WHERE ${whereClause}`)
      .bind(...params)
      .first();
    const total = Number(countResult?.count || 0);

    const results = await db
      .prepare(
        `SELECT id, name, email, phone, city, opted_out, opted_out_at, opt_out_channel, opt_out_reason
         FROM contacts WHERE ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`
      )
      .bind(...params, limit, offset)
      .all();

    const rows = (results.results || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      optedOut: r.opted_out,
      optedOutAt: r.opted_out_at,
      optOutChannel: r.opt_out_channel,
      optOutReason: r.opt_out_reason,
    }));

    return paginated(c, rows, total, page, limit);
  }
);

// ============================================================
// OPT OUT A CONTACT
// ============================================================

optOutRoutes.post(
  '/:contactId',
  requirePermission('marketing', 'edit'),
  async (c) => {
    const db = c.get('tenantDb');
    const contactId = c.req.param('contactId');

    const contact = await db
      .prepare('SELECT id FROM contacts WHERE id = ? AND is_deleted = 0')
      .bind(contactId)
      .first();
    if (!contact) return notFound(c, 'Contact');

    const body = await c.req.json().catch(() => ({}));
    const channel = typeof body?.channel === 'string' ? body.channel : 'manual';
    const reason = typeof body?.reason === 'string' ? body.reason : null;

    // R208: the opt-out is also a consent record (append-only) so the history shows who withdrew and when
    const consentChannel: ConsentChannel = (CONSENT_CHANNELS as readonly string[]).includes(channel) && channel !== 'call' ? (channel as ConsentChannel) : 'any';
    await withdrawMarketing(db, contactId, consentChannel, 'manual', { reason, label: channel, capturedBy: c.get('userId') });

    return success(c, { opted_out: true });
  }
);

// ============================================================
// OPT IN A CONTACT (reverse opt-out)
// ============================================================

optOutRoutes.post(
  '/:contactId/opt-in',
  requirePermission('marketing', 'edit'),
  async (c) => {
    const db = c.get('tenantDb');
    const contactId = c.req.param('contactId');

    const contact = await db
      .prepare('SELECT id FROM contacts WHERE id = ? AND is_deleted = 0')
      .bind(contactId)
      .first();
    if (!contact) return notFound(c, 'Contact');

    await grantMarketing(db, contactId, 'any', 'manual', { capturedBy: c.get('userId') });

    return success(c, { opted_out: false });
  }
);

export default optOutRoutes;
