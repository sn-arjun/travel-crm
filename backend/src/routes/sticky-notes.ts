import { Hono } from 'hono';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, error } from '../utils/response';

const stickyNoteRoutes = new Hono<AppContext>();

const MAX_NOTES = 20;

// ============================================================
// POST / — Create sticky note
// ============================================================

stickyNoteRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = c.get('tenantDb');
  const { content, color } = await c.req.json();

  if (content === undefined || content === null) {
    return error(c, 'content is required', 400);
  }

  // Check limit
  const count = await db.prepare(
    'SELECT COUNT(*) as cnt FROM sticky_notes WHERE user_id = ?'
  ).bind(userId).first<{ cnt: number }>();

  if ((count?.cnt || 0) >= MAX_NOTES) {
    return error(c, `Sticky note limit reached (${MAX_NOTES})`, 400);
  }

  const id = generateId();
  const now = new Date().toISOString();
  const noteColor = color || 'yellow';

  await db.prepare(`
    INSERT INTO sticky_notes (id, user_id, content, color, is_pinned, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).bind(id, userId, content, noteColor, now, now).run();

  return success(c, { id, content, color: noteColor, is_pinned: 0 }, 201);
});

// ============================================================
// GET / — List user's sticky notes
// ============================================================

stickyNoteRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = c.get('tenantDb');

  const rows = await db.prepare(
    'SELECT * FROM sticky_notes WHERE user_id = ? ORDER BY is_pinned DESC, updated_at DESC'
  ).bind(userId).all();

  return success(c, rows.results || []);
});

// ============================================================
// PUT /:id — Update sticky note
// ============================================================

stickyNoteRoutes.put('/:id', async (c) => {
  const userId = c.get('userId');
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const body = await c.req.json();

  const note = await db.prepare(
    'SELECT id FROM sticky_notes WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first();

  if (!note) {
    return error(c, 'Sticky note not found', 404);
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.content !== undefined) { updates.push('content = ?'); values.push(body.content); }
  if (body.color !== undefined) { updates.push('color = ?'); values.push(body.color); }
  if (body.is_pinned !== undefined) { updates.push('is_pinned = ?'); values.push(body.is_pinned ? 1 : 0); }

  if (updates.length === 0) {
    return error(c, 'No fields to update', 400);
  }

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  values.push(id);

  await db.prepare(
    `UPDATE sticky_notes SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return success(c, { message: 'Note updated' });
});

// ============================================================
// DELETE /:id — Delete sticky note
// ============================================================

stickyNoteRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  const note = await db.prepare(
    'SELECT id FROM sticky_notes WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first();

  if (!note) {
    return error(c, 'Sticky note not found', 404);
  }

  await db.prepare('DELETE FROM sticky_notes WHERE id = ?').bind(id).run();

  return success(c, { message: 'Note deleted' });
});

export default stickyNoteRoutes;
