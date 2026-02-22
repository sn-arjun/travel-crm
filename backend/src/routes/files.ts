import { Hono } from 'hono';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, error } from '../utils/response';

const fileRoutes = new Hono<AppContext>();

// ============================================================
// POST /upload — Upload file to R2 (TICKET-088)
// ============================================================

fileRoutes.post('/upload', async (c) => {
  const tenantId = c.get('tenantId');
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return error(c, 'No file provided', 400);
  }

  // Validate file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    return error(c, 'File too large. Maximum 5MB', 400);
  }

  // Validate file type (images only for now)
  if (!file.type.startsWith('image/')) {
    return error(c, 'Only image files are accepted', 400);
  }

  const key = `${tenantId}/${generateId()}-${file.name}`;

  await c.env.FILE_STORAGE.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return success(c, {
    key,
    url: `/api/v1/files/${encodeURIComponent(key)}`,
    name: file.name,
    size: file.size,
    contentType: file.type,
  });
});

// ============================================================
// GET /:key — Serve file from R2
// ============================================================

fileRoutes.get('/*', async (c) => {
  const key = c.req.path.replace('/api/v1/files/', '');
  const decodedKey = decodeURIComponent(key);

  const object = await c.env.FILE_STORAGE.get(decodedKey);
  if (!object) {
    return error(c, 'File not found', 404);
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
});

// ============================================================
// DELETE /:key — Delete file from R2
// ============================================================

fileRoutes.delete('/*', async (c) => {
  const key = c.req.path.replace('/api/v1/files/', '');
  const decodedKey = decodeURIComponent(key);

  await c.env.FILE_STORAGE.delete(decodedKey);

  return success(c, { message: 'File deleted' });
});

export default fileRoutes;
