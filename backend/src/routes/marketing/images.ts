import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppContext } from '../../types';
import { requirePermission } from '../../middleware/rbac';
import { generateId } from '../../utils/uuid';
import { success, created, paginated, error, notFound } from '../../utils/response';
import { imageListSchema } from '../../validators/marketing';

const imageRoutes = new Hono<AppContext>();

// ============================================================
// LIST IMAGES
// ============================================================

imageRoutes.get(
  '/',
  requirePermission('marketing', 'view'),
  zValidator('query', imageListSchema),
  async (c) => {
    const db = c.get('tenantDb');
    const { page, limit, category, search, tags } = c.req.valid('query');
    const offset = (page - 1) * limit;
    const tenantId = c.get('tenantId');

    let query = 'SELECT * FROM image_library WHERE (tenant_id IS NULL OR tenant_id = ?)';
    const params: any[] = [tenantId];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (search) {
      query += ' AND (filename LIKE ? OR original_filename LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (tags) {
      query += ' AND tags LIKE ?';
      params.push(`%${tags}%`);
    }

    let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = await db.prepare(countQuery).bind(...params).first();
    const total = Number(countResult?.count || 0);

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const results = await db.prepare(query).bind(...params).all();
    return paginated(c, results.results || [], total, page, limit);
  }
);

// ============================================================
// UPLOAD IMAGE
// ============================================================

imageRoutes.post(
  '/upload',
  requirePermission('marketing', 'create'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');
    const db = c.get('tenantDb');

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return error(c, 'No file uploaded', 400);
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return error(c, 'Invalid file type. Allowed: JPEG, PNG, WebP', 400);
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return error(c, 'File too large. Maximum 10MB', 400);
    }

    const id = generateId();
    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `${id}.${ext}`;
    const r2Key = `${tenantId}/marketing/images/${filename}`;
    const thumbnailR2Key = `${tenantId}/marketing/images/thumb/${filename}`;

    // Upload original to R2
    const arrayBuffer = await file.arrayBuffer();
    await c.env.FILE_STORAGE.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    });

    // For thumbnails, in a production system you would resize the image.
    // For now, store the same file as thumbnail (clients can resize on display).
    await c.env.FILE_STORAGE.put(thumbnailR2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    });

    const url = `/api/v1/files/${r2Key}`;
    const thumbnailUrl = `/api/v1/files/${thumbnailR2Key}`;

    await db
      .prepare(
        `INSERT INTO image_library (
          id, tenant_id, filename, original_filename, r2_key, thumbnail_r2_key,
          url, thumbnail_url, category, file_size, mime_type, uploaded_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'uploaded', ?, ?, ?, ?)`
      )
      .bind(
        id,
        tenantId,
        filename,
        file.name,
        r2Key,
        thumbnailR2Key,
        url,
        thumbnailUrl,
        file.size,
        file.type,
        userId,
        new Date().toISOString()
      )
      .run();

    const inserted = await db.prepare('SELECT * FROM image_library WHERE id = ?').bind(id).first();
    return created(c, inserted);
  }
);

// ============================================================
// UPLOAD LOGO
// ============================================================

imageRoutes.post(
  '/upload-logo',
  requirePermission('marketing', 'create'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');
    const db = c.get('tenantDb');

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return error(c, 'No file uploaded', 400);
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return error(c, 'Invalid file type', 400);
    }

    if (file.size > 5 * 1024 * 1024) {
      return error(c, 'Logo too large. Maximum 5MB', 400);
    }

    const id = generateId();
    const ext = file.name.split('.').pop() || 'png';
    const filename = `logo_${id}.${ext}`;
    const r2Key = `${tenantId}/marketing/logos/${filename}`;

    const arrayBuffer = await file.arrayBuffer();
    await c.env.FILE_STORAGE.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    });

    const url = `/api/v1/files/${r2Key}`;

    await db
      .prepare(
        `INSERT INTO image_library (
          id, tenant_id, filename, original_filename, r2_key, url, category,
          file_size, mime_type, uploaded_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'logo', ?, ?, ?, ?)`
      )
      .bind(id, tenantId, filename, file.name, r2Key, url, file.size, file.type, userId, new Date().toISOString())
      .run();

    const inserted = await db.prepare('SELECT * FROM image_library WHERE id = ?').bind(id).first();
    return created(c, inserted);
  }
);

// ============================================================
// DELETE IMAGE (tenant images only)
// ============================================================

imageRoutes.delete(
  '/:id',
  requirePermission('marketing', 'delete'),
  async (c) => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const tenantId = c.get('tenantId');

    const image = await db
      .prepare('SELECT * FROM image_library WHERE id = ? AND tenant_id = ?')
      .bind(id, tenantId)
      .first();

    if (!image) return notFound(c, 'Image');

    // Delete from R2
    if ((image as any).r2_key) {
      await c.env.FILE_STORAGE.delete((image as any).r2_key);
    }
    if ((image as any).thumbnail_r2_key) {
      await c.env.FILE_STORAGE.delete((image as any).thumbnail_r2_key);
    }

    // Delete from DB
    await db.prepare('DELETE FROM image_library WHERE id = ?').bind(id).run();

    return success(c, { deleted: true });
  }
);

export default imageRoutes;
