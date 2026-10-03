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

interface DocumentRow {
  id: string;
  name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  type: string | null;
  category: string | null;
  description: string | null;
  related_to: string | null;
  related_id: string | null;
  uploaded_by: string | null;
  uploader_name?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function toDocumentDto(row: DocumentRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    category: row.category ?? undefined,
    tags: [],
    leadId: row.related_to === 'lead' ? row.related_id ?? undefined : undefined,
    itineraryId: row.related_to === 'itinerary' ? row.related_id ?? undefined : undefined,
    mimeType: row.mime_type ?? '',
    size: row.file_size ?? 0,
    uploadedBy: row.uploaded_by ?? '',
    uploaderName: row.uploader_name ?? undefined,
    uploadedAt: row.created_at ?? '',
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? row.created_at ?? '',
    // Additive keys for the Flutter CRM app (packages/shared DocumentModel is snake_case
    // and requires file_url).
    fileUrl: row.file_url ?? '',
    file_url: row.file_url ?? '',
    file_size: row.file_size ?? undefined,
    mime_type: row.mime_type ?? undefined,
    type: row.type ?? undefined,
    related_to: row.related_to ?? undefined,
    related_id: row.related_id ?? undefined,
    uploaded_by: row.uploaded_by ?? undefined,
    uploader_name: row.uploader_name ?? undefined,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? row.created_at ?? undefined,
  };
}

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
  const name = (formData.get('name') as string) || file.name;

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
    docId, name, r2Key, file.size, file.type,
    category, category, entityType, entityId,
    description, userId, now, now,
  ).run();

  return success(c, toDocumentDto({
    id: docId,
    name,
    file_url: r2Key,
    file_size: file.size,
    mime_type: file.type,
    type: category,
    category,
    description,
    related_to: entityType,
    related_id: entityId,
    uploaded_by: userId,
    created_at: now,
    updated_at: now,
  }), 201);
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
  const search = c.req.query('search');
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
  if (search) {
    where += ' AND d.name LIKE ?';
    params.push(`%${search}%`);
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

  const documents = (rows.results || []).map((row) => toDocumentDto(row as unknown as DocumentRow));
  return paginated(c, documents, total, page, limit);
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

  return success(c, toDocumentDto(doc as unknown as DocumentRow));
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

  if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
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

  const updated = await db.prepare(`
    SELECT d.*, u.name as uploader_name
    FROM documents d
    LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.id = ?
  `).bind(docId).first();

  return success(c, toDocumentDto(updated as unknown as DocumentRow));
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
