import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, superAdminSecret, verifyJwt } from '@/lib/auth';

// Pages and APIs that work without a session. The login API is the only unauthenticated API.
const PUBLIC_PATHS = ['/login', '/api/auth'];
// Files in public/ that may be fetched without a session (explicit list, no extension sniffing).
const PUBLIC_FILES = new Set(['/favicon.ico', '/file.svg', '/globe.svg', '/next.svg', '/vercel.svg', '/window.svg']);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next/') || PUBLIC_FILES.has(pathname)) return NextResponse.next();

  const secret = superAdminSecret();
  if (!secret) {
    return new NextResponse('The console is not configured (SUPER_ADMIN_JWT_SECRET is missing).', { status: 500 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifyJwt(token, secret) : null;

  if (isPublicPath(pathname)) {
    // Already signed in: skip the login page.
    if (pathname === '/login' && payload) return NextResponse.redirect(new URL('/dashboard', request.url));
    return NextResponse.next();
  }

  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    const response = NextResponse.redirect(new URL('/login', request.url));
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
