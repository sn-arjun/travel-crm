import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, errorMessage } from '@/lib/backend';
import { SESSION_COOKIE, isLocalHost } from '@/lib/auth';

interface LoginData {
  token: string;
  expiresAt: string;
  admin: { id: string; email: string; name: string; role: string };
}

function cookieOptions(request: NextRequest, maxAge: number) {
  return {
    httpOnly: true,
    secure: !isLocalHost(request.nextUrl.hostname),
    sameSite: 'strict' as const,
    maxAge,
    path: '/',
  };
}

// POST /api/auth: sign in through the backend (POST /admin/auth/login) and keep its token in an httpOnly cookie.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  const res = await backendFetch<LoginData>('/auth/login', {
    method: 'POST',
    token: null,
    body: JSON.stringify({ email: body.email, password: body.password }),
  });
  if (!res.ok || !res.body.data) {
    return NextResponse.json({ error: errorMessage(res.body, 'Sign in failed') }, { status: res.status >= 400 ? res.status : 401 });
  }

  const { token, expiresAt, admin } = res.body.data;
  const maxAge = Math.max(60, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  const response = NextResponse.json({ success: true, admin });
  response.cookies.set(SESSION_COOKIE, token, cookieOptions(request, maxAge));
  return response;
}

// DELETE /api/auth: revoke the token at the backend and clear the cookie.
export async function DELETE(request: NextRequest) {
  await backendFetch('/auth/logout', { method: 'POST' });
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, '', cookieOptions(request, 0));
  return response;
}

// GET /api/auth: who am I.
export async function GET() {
  const res = await backendFetch('/auth/me');
  if (!res.ok) return NextResponse.json({ error: errorMessage(res.body, 'Not signed in') }, { status: res.status });
  return NextResponse.json(res.body.data);
}
