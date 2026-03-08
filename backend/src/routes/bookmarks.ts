import { Hono } from 'hono';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, error } from '../utils/response';

const bookmarkRoutes = new Hono<AppContext>();

const MAX_BOOKMARKS = 50;

// ============================================================
// POST / — Add bookmark
// ============================================================

bookmarkRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = c.get('tenantDb');
  const { entity_type, entity_id } = await c.req.json();

  if (!entity_type || !entity_id) {
    return error(c, 'entity_type and entity_id are required', 400);
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
  ).bind(userId, entity_type, entity_id).first();

  if (existing) {
    return error(c, 'Already bookmarked', 409);
  }

  const id = generateId();
  await db.prepare(
    'INSERT INTO bookmarks (id, user_id, entity_type, entity_id) VALUES (?, ?, ?, ?)'
  ).bind(id, userId, entity_type, entity_id).run();

  return success(c, { id, entity_type, entity_id }, 201);
});

// ============================================================
// GET / — List user's bookmarks with entity preview
// ============================================================

bookmarkRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.get('tenantDb');
  const entityType = c.req.query('entity_type');

  let query = 'SELECT * FROM bookmarks WHERE user_id = ?';
  const params: string[] = [userId];

  if (entityType) {
    query += ' AND entity_type = ?';
    params.push(entityType);
  }

  query += ' ORDER BY created_at DESC';

  const rows = await db.prepare(query).bind(...params).all();
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
      }
    } catch {
      entityName = 'Unknown';
    }
    enriched.push({ ...bm, entity_name: entityName });
  }

  return success(c, enriched);
});

// ============================================================
// GET /check — Check if entity is bookmarked
// ============================================================

bookmarkRoutes.get('/check', async (c) => {
  const userId = c.get('userId');
  const db = c.get('tenantDb');
  const entityType = c.req.query('entity_type');
  const entityId = c.req.query('entity_id');

  if (!entityType || !entityId) {
    return error(c, 'entity_type and entity_id are required', 400);
  }

  const existing = await db.prepare(
    'SELECT id FROM bookmarks WHERE user_id = ? AND entity_type = ? AND entity_id = ?'
  ).bind(userId, entityType, entityId).first();

  return success(c, { bookmarked: !!existing, bookmark_id: existing?.id || null });
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
