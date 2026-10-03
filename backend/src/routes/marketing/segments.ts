import { Hono } from 'hono';
import { zValidator } from '../../utils/validator';
import type { AppContext } from '../../types';
import { requirePermission } from '../../middleware/rbac';
import { generateId } from '../../utils/uuid';
import { success, created, paginated, error, notFound } from '../../utils/response';
import { createSegmentSchema, updateSegmentSchema, segmentListSchema } from '../../validators/marketing';
import { buildSegmentQuery } from '../../services/segmentation-engine';

const segmentRoutes = new Hono<AppContext>();

// ============================================================
// LIST SEGMENTS
// ============================================================

segmentRoutes.get(
  '/',
  requirePermission('marketing', 'view'),
  zValidator('query', segmentListSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const { page, limit, search } = c.req.valid('query');
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM contact_segments WHERE is_deleted = 0';
    const params: any[] = [];

    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = await db.prepare(countQuery).bind(...params).first();
    const total = Number(countResult?.count || 0);

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await db.prepare(query).bind(...params).all();

    return paginated(
      c,
      (results.results || []).map((s: any) => ({
        ...s,
        is_dynamic: s.is_dynamic === 1,
      })),
      total,
      page,
      limit
    );
  }
);

// ============================================================
// GET SINGLE SEGMENT
// ============================================================

segmentRoutes.get(
  '/:id',
  requirePermission('marketing', 'view'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const segment = await db
      .prepare('SELECT * FROM contact_segments WHERE id = ? AND is_deleted = 0')
      .bind(id)
      .first();

    if (!segment) return notFound(c, 'Segment');
    return success(c, { ...segment, is_dynamic: (segment as any).is_dynamic === 1 });
  }
);

// ============================================================
// PREVIEW CONTACTS IN SEGMENT
// ============================================================

segmentRoutes.get(
  '/:id/contacts',
  requirePermission('marketing', 'view'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;

    const segment = await db
      .prepare('SELECT * FROM contact_segments WHERE id = ? AND is_deleted = 0')
      .bind(id)
      .first();

    if (!segment) return notFound(c, 'Segment');

    const filtersJson = (segment as any).filters_json;
    if (!filtersJson) {
      return paginated(c, [], 0, page, limit);
    }

    const filters = JSON.parse(filtersJson);
    const { whereClause, bindings } = buildSegmentQuery(filters);

    const countResult = await db
      .prepare(`SELECT COUNT(*) as count FROM contacts WHERE is_deleted = 0 ${whereClause}`)
      .bind(...bindings)
      .first();
    const total = Number(countResult?.count || 0);

    const results = await db
      .prepare(
        `SELECT id, name, email, phone, city, country, tags FROM contacts WHERE is_deleted = 0 ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`
      )
      .bind(...bindings, limit, offset)
      .all();

    return paginated(c, results.results || [], total, page, limit);
  }
);

// ============================================================
// CREATE SEGMENT
// ============================================================

segmentRoutes.post(
  '/',
  requirePermission('marketing', 'create'),
  zValidator('json', createSegmentSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const body = c.req.valid('json');
    const id = generateId();
    const userId = c.get('userId');
    const tenantId = c.get('tenantId');
    const now = new Date().toISOString();

    // Calculate initial count if filters provided
    let contactCount = 0;
    if (body.filtersJson) {
      try {
        const filters = JSON.parse(body.filtersJson);
        const { whereClause, bindings } = buildSegmentQuery(filters);
        const countResult = await db
          .prepare(`SELECT COUNT(*) as count FROM contacts WHERE is_deleted = 0 ${whereClause}`)
          .bind(...bindings)
          .first();
        contactCount = Number(countResult?.count || 0);
      } catch {
        // Invalid filters, count stays 0
      }
    }

    await db
      .prepare(
        `INSERT INTO contact_segments (
          id, tenant_id, name, description, filters_json, contact_count, is_dynamic,
          is_deleted, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
      )
      .bind(
        id,
        tenantId,
        body.name,
        body.description || null,
        body.filtersJson || null,
        contactCount,
        body.isDynamic !== false ? 1 : 0,
        userId,
        now,
        now
      )
      .run();

    const inserted = await db.prepare('SELECT * FROM contact_segments WHERE id = ?').bind(id).first();
    return created(c, inserted);
  }
);

// ============================================================
// UPDATE SEGMENT
// ============================================================

segmentRoutes.put(
  '/:id',
  requirePermission('marketing', 'edit'),
  zValidator('json', updateSegmentSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const existing = await db
      .prepare('SELECT * FROM contact_segments WHERE id = ? AND is_deleted = 0')
      .bind(id)
      .first();
    if (!existing) return notFound(c, 'Segment');

    const updates: string[] = [];
    const params: any[] = [];

    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      filtersJson: 'filters_json',
      isDynamic: 'is_dynamic',
    };

    for (const [key, value] of Object.entries(body)) {
      const col = fieldMap[key];
      if (col) {
        updates.push(`${col} = ?`);
        params.push(key === 'isDynamic' ? (value ? 1 : 0) : value);
      }
    }

    // Recalculate count if filters changed
    if (body.filtersJson) {
      try {
        const filters = JSON.parse(body.filtersJson);
        const { whereClause, bindings } = buildSegmentQuery(filters);
        const countResult = await db
          .prepare(`SELECT COUNT(*) as count FROM contacts WHERE is_deleted = 0 ${whereClause}`)
          .bind(...bindings)
          .first();
        updates.push('contact_count = ?');
        params.push(Number(countResult?.count || 0));
      } catch {
        // skip count update on invalid filters
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(now, id);
      await db
        .prepare(`UPDATE contact_segments SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...params)
        .run();
    }

    const updated = await db.prepare('SELECT * FROM contact_segments WHERE id = ?').bind(id).first();
    return success(c, updated);
  }
);

// ============================================================
// REFRESH SEGMENT COUNT
// ============================================================

segmentRoutes.post(
  '/:id/refresh-count',
  requirePermission('marketing', 'edit'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const segment = await db
      .prepare('SELECT * FROM contact_segments WHERE id = ? AND is_deleted = 0')
      .bind(id)
      .first();
    if (!segment) return notFound(c, 'Segment');

    const filtersJson = (segment as any).filters_json;
    if (!filtersJson) {
      return success(c, { contact_count: 0 });
    }

    const filters = JSON.parse(filtersJson);
    const { whereClause, bindings } = buildSegmentQuery(filters);
    const countResult = await db
      .prepare(`SELECT COUNT(*) as count FROM contacts WHERE is_deleted = 0 ${whereClause}`)
      .bind(...bindings)
      .first();
    const count = Number(countResult?.count || 0);

    await db
      .prepare('UPDATE contact_segments SET contact_count = ?, updated_at = ? WHERE id = ?')
      .bind(count, new Date().toISOString(), id)
      .run();

    return success(c, { contact_count: count });
  }
);

// ============================================================
// DELETE SEGMENT (soft delete)
// ============================================================

segmentRoutes.delete(
  '/:id',
  requirePermission('marketing', 'delete'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');

    const existing = await db
      .prepare('SELECT * FROM contact_segments WHERE id = ? AND is_deleted = 0')
      .bind(id)
      .first();
    if (!existing) return notFound(c, 'Segment');

    await db
      .prepare('UPDATE contact_segments SET is_deleted = 1, updated_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), id)
      .run();

    return success(c, { deleted: true });
  }
);

export default segmentRoutes;
