import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, errorMessage } from '@/lib/backend';

/**
 * The console's only data path. Browser code calls /api/<area>/... and this handler forwards it to the backend's
 * /admin/<area>/... with the operator's token (sa_token cookie), then hands back the result:
 *   - a paged response keeps the backend envelope ({ data, pagination, ... }),
 *   - any other success returns the backend's `data` as it is,
 *   - a failure returns { error: message } with the backend's status.
 * Only the areas listed here are reachable; the middleware has already required a valid session.
 */
const ALLOWED_AREAS = new Set(['tenants', 'dashboard', 'reports', 'subscriptions', 'system', 'audit-log', 'catalogue', 'plans', 'impersonation', 'voip']);

async function forward(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.length || !ALLOWED_AREAS.has(path[0])) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const target = `/${path.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'DELETE';
  const text = hasBody ? await request.text() : '';
  const res = await backendFetch(target, { method: request.method, ...(text ? { body: text } : {}) });

  if (!res.ok) {
    return NextResponse.json({ error: errorMessage(res.body, `Request failed (${res.status})`) }, { status: res.status >= 400 ? res.status : 502 });
  }
  if (res.body.pagination) return NextResponse.json(res.body, { status: res.status });
  return NextResponse.json(res.body.data ?? { success: true }, { status: res.status });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
