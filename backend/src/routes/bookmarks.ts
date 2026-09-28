import { Hono } from 'hono';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, error, paginated } from '../utils/response';

const bookmarkRoutes = new Hono<AppContext>();

const MAX_BOOKMARKS = 50;

// ============================================================
// POST / — Add bookmark
// ============================================================

bookmarkRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = c.get('tenantDb');
  const { entityType, entityId } = await c.req.json();

  if (!entityType || !entityId) {
    return error(c, 'entityType and entityId are required', 400);
  }

  // Check limit
  const count = await db.prepare(
    'SELECT COUNT(*) as cnt FROM bookmarks WHERE user_id = ?'
  ).bind(userId).first<{ cnt: number }>();

  if ((count?.cnt || 0) >= MAX_BOOKMARKS) {
    return error(c, `Bookmark limit reached (${MAX_BOOKMARKS})`, 400);
  }

  // Check duplicate
  const existing = await db.prepare(
    'SELECT id FROM bookmarks WHERE user_id = ? AND entity_type = ? AND entity_id = ?'
  ).bind(userId, entityType, entityId).first();

  if (existing) {
    return error(c, 'Already bookmarked', 409);
  }

  const id = generateId();
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT INTO bookmarks (id, user_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, userId, entityType, entityId, now).run();

  return success(c, { id, entityType, entityId, createdAt: now }, 201);
});

// ============================================================
// GET / — List user's bookmarks with entity preview
// ============================================================

bookmarkRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.get('tenantDb');
  const entityType = c.req.query('entityType') || c.req.query('entity_type');
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20', 10)));
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE user_id = ?';
  const params: string[] = [userId];

  if (entityType) {
    whereClause += ' AND entity_type = ?';
    params.push(entityType);
  }

  const totalRow = await db.prepare(
    `SELECT COUNT(*) as cnt FROM bookmarks ${whereClause}`
  ).bind(...params).first<{ cnt: number }>();
  const total = totalRow?.cnt || 0;

  const rows = await db.prepare(
    `SELECT * FROM bookmarks ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all();
  const bookmarks = rows.results || [];

  // Enrich with entity preview
  const enriched = [];
  for (const bm of bookmarks) {
    let entityName = '';
    try {
      if (bm.entity_type === 'lead') {
        const lead = await db.prepare('SELECT title FROM leads WHERE id = ?').bind(bm.entity_id).first<{ title: string }>();
        entityName = lead?.title || 'Unknown Lead';
      } else if (bm.entity_type === 'contact') {
        const contact = await db.prepare('SELECT name FROM contacts WHERE id = ?').bind(bm.entity_id).first<{ name: string }>();
        entityName = contact?.name || 'Unknown Contact';
      } else if (bm.entity_type === 'itinerary') {
        const itin = await db.prepare('SELECT title FROM itineraries WHERE id = ?').bind(bm.entity_id).first<{ title: string }>();
        entityName = itin?.title || 'Unknown Itinerary';
      } else if (bm.entity_type === 'invoice') {
        const inv = await db.prepare('SELECT invoice_number FROM invoices WHERE id = ?').bind(bm.entity_id).first<{ invoice_number: string }>();
        entityName = inv?.invoice_number || 'Unknown Invoice';
      } else if (bm.entity_type === 'task') {
        const task = await db.prepare('SELECT title FROM tasks WHERE id = ?').bind(bm.entity_id).first<{ title: string }>();
        entityName = task?.title || 'Unknown Task';
      }
    } catch {
      entityName = 'Unknown';
    }
    enriched.push({
      id: bm.id,
      entityType: bm.entity_type,
      entityId: bm.entity_id,
      entityName,
      createdAt: bm.created_at,
    });
  }

  return paginated(c, enriched, total, page, limit);
});

// ============================================================
// GET /check — Check if entity is bookmarked
// ============================================================

bookmarkRoutes.post('/check', async (c) => {
  const userId = c.get('userId');
  const db = c.get('tenantDb');
  const { entityType, entityId } = await c.req.json();

  if (!entityType || !entityId) {
    return error(c, 'entityType and entityId are required', 400);
  }

  const existing = await db.prepare(
    'SELECT id FROM bookmarks WHERE user_id = ? AND entity_type = ? AND entity_id = ?'
  ).bind(userId, entityType, entityId).first();

  return success(c, { bookmarked: !!existing, bookmarkId: existing?.id || null });
});

// ============================================================
// DELETE /:id — Remove bookmark
// ============================================================

bookmarkRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const bm = await db.prepare(
    'SELECT id FROM bookmarks WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first();

  if (!bm) {
    return error(c, 'Bookmark not found', 404);
  }

  await db.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id).run();

  return success(c, { message: 'Bookmark removed' });
});

export default bookmarkRoutes;
