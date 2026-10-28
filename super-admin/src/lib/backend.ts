import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './auth';
import { derivedApiUrl } from './domain';

/**
 * Server-side client for the TravelCRM backend's super admin API. The console has no database access: every read
 * and write goes through here. The backend base URL (including /api/v1) comes from BACKEND_API_URL.
 */

const LOCAL_DEFAULT = 'http://localhost:8787/api/v1';

export function backendBaseUrl(): string {
  const fallback = process.env.ENVIRONMENT === 'production' ? derivedApiUrl() : LOCAL_DEFAULT;
  return (process.env.BACKEND_API_URL || fallback).replace(/\/+$/, '');
}

export interface BackendEnvelope<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string; details?: unknown } | string;
  pagination?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BackendResult<T = unknown> {
  ok: boolean;
  status: number;
  body: BackendEnvelope<T>;
}

export function errorMessage(body: BackendEnvelope | null | undefined, fallback: string): string {
  const err = body?.error;
  if (typeof err === 'string') return err;
  return err?.message || fallback;
}

/**
 * Call `${BACKEND_API_URL}/admin<path>` with the sa_token cookie as the Bearer token.
 * `path` starts with "/" and is relative to /admin (for example "/tenants?page=1" or "/auth/login").
 * Maps network failures and non-JSON bodies to the same { success: false, error } envelope.
 */
export async function backendFetch<T = unknown>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<BackendResult<T>> {
  const { token: explicit, headers, ...rest } = init;
  const token = explicit === undefined ? (await cookies()).get(SESSION_COOKIE)?.value : explicit;
  const merged = new Headers(headers);
  if (token) merged.set('Authorization', `Bearer ${token}`);
  if (rest.body && !merged.has('Content-Type')) merged.set('Content-Type', 'application/json');

  try {
    const res = await fetch(`${backendBaseUrl()}/admin${path}`, { ...rest, headers: merged, cache: 'no-store' });
    let body: BackendEnvelope<T>;
    try {
      body = (await res.json()) as BackendEnvelope<T>;
    } catch {
      body = { success: false, error: { message: `Backend answered ${res.status} without JSON` } };
    }
    return { ok: res.ok && body.success !== false, status: res.status, body };
  } catch (err) {
    console.error('Backend request failed:', path, err instanceof Error ? err.message : err);
    return { ok: false, status: 502, body: { success: false, error: { message: 'The backend is unreachable' } } };
  }
}

/**
 * GET `${BACKEND_API_URL}/admin<path>` with the operator's session and hand the answer back as it is (for a file): the body is
 * streamed, and only the headers that describe the file are kept. A failure becomes the console's usual { error } JSON.
 */
export async function backendStream(path: string): Promise<Response> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  try {
    const res = await fetch(`${backendBaseUrl()}/admin${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });
    if (!res.ok || !res.body) {
      let message = `Request failed (${res.status})`;
      try {
        message = errorMessage((await res.json()) as BackendEnvelope, message);
      } catch {
        /* keep the generic message */
      }
      return Response.json({ error: message }, { status: res.status >= 400 ? res.status : 502 });
    }
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['Content-Type', 'Content-Disposition', 'Content-Length']) {
      const value = res.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(res.body, { status: 200, headers });
  } catch (err) {
    console.error('Backend request failed:', path, err instanceof Error ? err.message : err);
    return Response.json({ error: 'The backend is unreachable' }, { status: 502 });
  }
}
