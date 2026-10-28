/**
 * Structured logging: one JSON object per line through console, so Workers Logs can index the fields.
 *
 * Never pass request bodies, tokens, passwords, phone numbers or email addresses. As a safety net,
 * fields whose name looks sensitive are dropped, and request paths have id/token-like segments masked.
 */
import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key|otp|phone|email|body|credential|signature/i;
const MAX_STRING = 500;

function cleanValue(v: unknown): unknown {
  if (v instanceof Error) return { name: v.name, message: v.message.slice(0, MAX_STRING) };
  if (typeof v === 'string') return v.length > MAX_STRING ? `${v.slice(0, MAX_STRING)}...` : v;
  return v;
}

/** Drops sensitive-looking keys and truncates long strings. */
export function sanitizeFields(fields: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || SENSITIVE_KEY.test(k)) continue;
    out[k] = cleanValue(v);
  }
  return out;
}

/** Masks path segments that carry ids or tokens (uuids, digits, long opaque strings). */
export function safePath(path: string): string {
  return path
    .split('/')
    .map((seg) => (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(seg) || /^\d+$/.test(seg) || /^[A-Za-z0-9_-]{20,}$/.test(seg) ? ':id' : seg))
    .join('/');
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...sanitizeFields(fields) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * Assigns the request id (cf-ray, else a random id), exposes it as X-Request-Id and logs one line per
 * request: method, masked path, status, duration, tenant and user ids.
 */
export const requestLogger: MiddlewareHandler<AppContext> = async (c, next) => {
  const start = Date.now();
  const requestId = c.req.header('cf-ray') || crypto.randomUUID();
  c.set('requestId', requestId);
  try {
    await next();
  } finally {
    c.header('X-Request-Id', requestId);
    const status = c.res?.status ?? 500;
    log(status >= 500 ? 'error' : 'info', 'http.request', {
      requestId,
      tenantId: c.get('tenantId'),
      userId: c.get('userId'),
      method: c.req.method,
      path: safePath(c.req.path),
      status,
      ms: Date.now() - start,
    });
  }
};
