import { Hono } from 'hono';
import type { AppContext } from '../../types';
import { requirePermission } from '../../middleware/rbac';
import { success, error, notFound, paginated } from '../../utils/response';

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

    const countResult = await db
      .prepare('SELECT COUNT(*) as count FROM contacts WHERE opted_out = 1 AND is_deleted = 0')
      .first();
    const total = Number(countResult?.count || 0);

    const results = await db
      .prepare(
        'SELECT id, name, email, phone, city, opted_out FROM contacts WHERE opted_out = 1 AND is_deleted = 0 ORDER BY name ASC LIMIT ? OFFSET ?'
      )
      .bind(limit, offset)
      .all();

    return paginated(c, results.results || [], total, page, limit);
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

    await db
      .prepare('UPDATE contacts SET opted_out = 1, updated_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), contactId)
      .run();

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

    await db
      .prepare('UPDATE contacts SET opted_out = 0, updated_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), contactId)
      .run();

    return success(c, { opted_out: false });
  }
);

export default optOutRoutes;
