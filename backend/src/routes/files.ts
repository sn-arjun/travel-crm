import { Hono } from 'hono';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, error } from '../utils/response';
import { uploadRateLimit } from '../middleware/rate-limit';
import { verifyPrivacyDownload } from '../services/privacy/export-contact';
import { RECORDING_ROLES, recordingPrefix, verifyRecordingLink } from '../services/voip/recordings';
import { kycPrefix } from '../services/voip/regulatory';

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

/** A single `bytes=start-end` range, as R2 wants it; anything else is served whole. */
function parseRange(header: string | undefined): { offset: number; length?: number } | null {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header ?? '');
  if (!match) return null;
  const start = Number(match[1]);
  if (match[2] === '') return { offset: start };
  const end = Number(match[2]);
  return end >= start ? { offset: start, length: end - start + 1 } : null;
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

  // R137: the agency's number documents (<tenant>/kyc/...: business registration extract, representative) are for its admins only.
  if (resolved.key.startsWith(kycPrefix(c.get('tenantId'))) && c.get('role') !== 'admin') return error(c, 'Access denied', 403);

  // R306: call recordings (<tenant>/recordings/...) play only through the short-lived link GET /calls/:id/recording issues,
  // bound to the person it was issued to. A key typed by hand, an expired link or another person's link is refused.
  const isRecording = resolved.key.startsWith(recordingPrefix(c.get('tenantId')));
  if (isRecording) {
    if (!RECORDING_ROLES.has(c.get('role') as string)) return error(c, 'Access denied', 403);
    const q = new URL(c.req.url).searchParams;
    if (!(await verifyRecordingLink(c.env, resolved.key, c.get('userId') as string, q.get('exp') ?? undefined, q.get('sig') ?? undefined))) {
      return error(c, 'This recording link has expired or is not valid', 403);
    }
  }

  const range = isRecording ? parseRange(c.req.header('Range')) : null;
  const object = await c.env.FILE_STORAGE.get(resolved.key, range ? { range } : undefined);
  if (!object) {
    return error(c, 'File not found', 404);
  }

  const headers: Record<string, string> = {
    'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': isPrivacy || isRecording ? 'no-store' : 'private, max-age=300',
  };
  if (isRecording) {
    headers['Accept-Ranges'] = 'bytes';
    headers['Content-Disposition'] = 'inline';
    if (range) {
      const start = (range as { offset?: number }).offset ?? 0;
      const length = (range as { length?: number }).length ?? object.size - start;
      headers['Content-Range'] = `bytes ${start}-${start + length - 1}/${object.size}`;
      headers['Content-Length'] = String(length);
      return new Response(object.body as ReadableStream, { status: 206, headers });
    }
  }
  return new Response(object.body as ReadableStream, { headers });
});

// ============================================================
// DELETE /:key — Delete file from R2 (admin, sales manager, or the uploader)
// ============================================================

fileRoutes.delete('/*', async (c) => {
  const resolved = resolveTenantKey(keyFromPath(c.req.path), c.get('tenantId'));
  if ('status' in resolved) return error(c, resolved.message, resolved.status);

  // R137: number documents are replaced when the agency sends them again, so the review never points at a missing file.
  if (resolved.key.startsWith(kycPrefix(c.get('tenantId')))) {
    return error(c, 'Number documents are replaced when they are sent again', 403);
  }

  // R306: recordings leave through the retention job or contact erasure, so the call record never points at a missing file.
  if (resolved.key.startsWith(recordingPrefix(c.get('tenantId')))) {
    return error(c, 'Call recordings are removed by the retention period or when a contact is erased', 403);
  }

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
