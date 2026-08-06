import { Hono } from 'hono';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, error, paginated } from '../utils/response';

const documentRoutes = new Hono<AppContext>();

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ============================================================
// POST /upload — Upload document to R2 (TICKET-358)
// ============================================================

documentRoutes.post('/upload', async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
  const db = c.get('tenantDb');

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  // Support frontend aliases: leadId → entity_type=lead, itineraryId → entity_type=itinerary
  const leadId = formData.get('leadId') as string | null;
  const itineraryId = formData.get('itineraryId') as string | null;
  const entityType = leadId ? 'lead' : itineraryId ? 'itinerary' : ((formData.get('entity_type') as string) || 'general');
  const entityId = leadId || itineraryId || ((formData.get('entity_id') as string) || '');
  const category = (formData.get('category') as string) || 'other';
  const description = (formData.get('description') as string) || '';

  if (!file) {
    return error(c, 'No file provided', 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return error(c, 'File too large. Maximum 10MB', 400);
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return error(c, 'File type not allowed. Accepted: PDF, JPEG, PNG, WebP, DOCX, XLSX, CSV', 400);
  }

  const docId = generateId();
  const ext = file.name.split('.').pop() || 'bin';
  const r2Key = `tenants/${tenantId}/documents/${entityType}/${entityId || 'general'}/${docId}.${ext}`;

  // Upload to R2
  await c.env.FILE_STORAGE.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { tenantId, entityType, entityId, uploadedBy: userId },
  });

  // Create document record
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO documents (id, name, file_url, file_size, mime_type, type, category,
      related_to, related_id, description, uploaded_by, is_deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).bind(
    docId, file.name, r2Key, file.size, file.type,
    category, category, entityType, entityId,
    description, userId, now, now,
  ).run();

  return success(c, {
    id: docId,
    name: file.name,
    file_url: r2Key,
    file_size: file.size,
    mime_type: file.type,
    category,
    entity_type: entityType,
    entity_id: entityId,
  }, 201);
});

// ============================================================
// GET / — List documents (filterable by entity)
// ============================================================

documentRoutes.get('/', async (c) => {
  const db = c.get('tenantDb');
  const entityType = c.req.query('entity_type');
  const entityId = c.req.query('entity_id');
  // Support frontend aliases: leadId, itineraryId map to entity_type + entity_id
  const leadId = c.req.query('leadId');
  const itineraryId = c.req.query('itineraryId');
  const category = c.req.query('category');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = (page - 1) * limit;

  let where = 'WHERE d.is_deleted = 0';
  const params: string[] = [];

  if (leadId) {
    where += ' AND d.related_to = ? AND d.related_id = ?';
    params.push('lead', leadId);
  } else if (itineraryId) {
    where += ' AND d.related_to = ? AND d.related_id = ?';
    params.push('itinerary', itineraryId);
  } else {
    if (entityType) {
      where += ' AND d.related_to = ?';
      params.push(entityType);
    }
    if (entityId) {
      where += ' AND d.related_id = ?';
      params.push(entityId);
    }
  }
  if (category) {
    where += ' AND d.category = ?';
    params.push(category);
  }

  const countResult = await db.prepare(
    `SELECT COUNT(*) as total FROM documents d ${where}`
  ).bind(...params).first<{ total: number }>();

  const total = countResult?.total || 0;

  const rows = await db.prepare(`
    SELECT d.*, u.name as uploader_name
    FROM documents d
    LEFT JOIN users u ON d.uploaded_by = u.id
    ${where}
    ORDER BY d.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return paginated(c, rows.results || [], total, page, limit);
});

// ============================================================
// GET /:id — Get single document
// ============================================================

documentRoutes.get('/:id', async (c) => {
  const db = c.get('tenantDb');
  const docId = c.req.param('id');

  // Avoid matching /upload or other sub-routes
  if (docId === 'upload') return error(c, 'Not found', 404);

  const doc = await db.prepare(`
    SELECT d.*, u.name as uploader_name
    FROM documents d
    LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.id = ? AND d.is_deleted = 0
  `).bind(docId).first();

  if (!doc) {
    return error(c, 'Document not found', 404);
  }

  return success(c, doc);
});

// ============================================================
// GET /:id/download — Download file from R2
// ============================================================

documentRoutes.get('/:id/download', async (c) => {
  const db = c.get('tenantDb');
  const docId = c.req.param('id');

  const doc = await db.prepare(
    'SELECT file_url, name, mime_type FROM documents WHERE id = ? AND is_deleted = 0'
  ).bind(docId).first<{ file_url: string; name: string; mime_type: string }>();

  if (!doc) {
    return error(c, 'Document not found', 404);
  }

  const object = await c.env.FILE_STORAGE.get(doc.file_url);
  if (!object) {
    return error(c, 'File not found in storage', 404);
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      'Content-Type': doc.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${doc.name}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

// ============================================================
// PUT /:id — Update document metadata
// ============================================================

documentRoutes.put('/:id', async (c) => {
  const db = c.get('tenantDb');
  const docId = c.req.param('id');
  const body = await c.req.json();

  const doc = await db.prepare(
    'SELECT id FROM documents WHERE id = ? AND is_deleted = 0'
  ).bind(docId).first();

  if (!doc) {
    return error(c, 'Document not found', 404);
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.category !== undefined) { updates.push('category = ?'); values.push(body.category); }
  if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
  if (body.type !== undefined) { updates.push('type = ?'); values.push(body.type); }

  if (updates.length === 0) {
    return error(c, 'No fields to update', 400);
  }

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  values.push(docId);

  await db.prepare(
    `UPDATE documents SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  return success(c, { message: 'Document updated' });
});

// ============================================================
// DELETE /:id — Soft delete document
// ============================================================

documentRoutes.delete('/:id', async (c) => {
  const db = c.get('tenantDb');
  const docId = c.req.param('id');

  const doc = await db.prepare(
    'SELECT id FROM documents WHERE id = ? AND is_deleted = 0'
  ).bind(docId).first();

  if (!doc) {
    return error(c, 'Document not found', 404);
  }

  await db.prepare(
    "UPDATE documents SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?"
  ).bind(docId).run();

  return success(c, { message: 'Document deleted' });
});

export default documentRoutes;
