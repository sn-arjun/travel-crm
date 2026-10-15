import { Hono } from 'hono';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, error } from '../utils/response';
import { uploadRateLimit } from '../middleware/rate-limit';
import { verifyPrivacyDownload } from '../services/privacy/export-contact';

const fileRoutes = new Hono<AppContext>();

/** Roles that may delete any file of their agency. Anyone else may delete only what they uploaded. */
const FILE_ADMIN_ROLES = ['admin', 'sales_manager'];

/**
 * Decode and validate a client-supplied object key. Returns the key, or a status describing why not.
 * A key must start with the caller's `${tenantId}/`; keys of other tenants answer 403 (the batch spec
 * asks for 403; a missing object under the own prefix is 404 only after this check).
 */
export function resolveTenantKey(
  rawPath: string,
  tenantId: string
): { key: string } | { status: 400 | 403; message: string } {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return { status: 400, message: 'Invalid file key' };
  }
  if (!decoded || decoded.startsWith('/') || decoded.includes('..') || decoded.includes('\\') || decoded.includes('\0')) {
    return { status: 400, message: 'Invalid file key' };
  }
  if (!tenantId || !decoded.startsWith(`${tenantId}/`)) {
    return { status: 403, message: 'Access denied' };
  }
  return { key: decoded };
}

function keyFromPath(path: string): string {
  const idx = path.indexOf('/files/');
  return idx >= 0 ? path.slice(idx + '/files/'.length) : '';
}

// ============================================================
// POST /upload — Upload file to R2 (TICKET-088)
// ============================================================

fileRoutes.post('/upload', uploadRateLimit, async (c) => {
  const tenantId = c.get('tenantId');
  const userId = c.get('userId');
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
    customMetadata: { uploaderId: userId ?? '' },
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
// GET /:key — Serve file from R2 (own tenant's keys only)
// ============================================================

fileRoutes.get('/*', async (c) => {
  const resolved = resolveTenantKey(keyFromPath(c.req.path), c.get('tenantId'));
  if ('status' in resolved) return error(c, resolved.message, resolved.status);

  // R208: privacy exports (<tenant>/privacy/...) are admin-only and need the signed, short-lived link the export returned.
  const isPrivacy = resolved.key.startsWith(`${c.get('tenantId')}/privacy/`);
  if (isPrivacy) {
    if (c.get('role') !== 'admin') return error(c, 'Access denied', 403);
    const q = new URL(c.req.url).searchParams;
    if (!(await verifyPrivacyDownload(c.env, resolved.key, q.get('exp') ?? undefined, q.get('sig') ?? undefined))) {
      return error(c, 'This download link has expired or is not valid', 403);
    }
  }

  const object = await c.env.FILE_STORAGE.get(resolved.key);
  if (!object) {
    return error(c, 'File not found', 404);
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': isPrivacy ? 'no-store' : 'private, max-age=300',
    },
  });
});

// ============================================================
// DELETE /:key — Delete file from R2 (admin, sales manager, or the uploader)
// ============================================================

fileRoutes.delete('/*', async (c) => {
  const resolved = resolveTenantKey(keyFromPath(c.req.path), c.get('tenantId'));
  if ('status' in resolved) return error(c, resolved.message, resolved.status);

  const head = await c.env.FILE_STORAGE.head(resolved.key);
  if (!head) return error(c, 'File not found', 404);

  const role = c.get('role') as string;
  const isUploader = !!head.customMetadata?.uploaderId && head.customMetadata.uploaderId === c.get('userId');
  if (!FILE_ADMIN_ROLES.includes(role) && !isUploader) {
    return error(c, 'Insufficient permissions to delete this file', 403);
  }

  await c.env.FILE_STORAGE.delete(resolved.key);

  return success(c, { message: 'File deleted' });
});

export default fileRoutes;
