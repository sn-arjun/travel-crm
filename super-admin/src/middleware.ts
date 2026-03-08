import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth'];
const JWT_SECRET = process.env.JWT_SECRET || 'super-admin-dev-secret-change-in-production';

// Inline JWT verification for middleware (can't import from lib/auth due to edge constraints)
function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function verifyJwtInMiddleware(token: string): Promise<{ admin_id: string; email: string; name: string; role: string; exp: number } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const secretBytes = new TextEncoder().encode(JWT_SECRET);
    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = base64UrlDecode(encodedSignature);
    const inputBytes = new TextEncoder().encode(signingInput);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer as ArrayBuffer,
      inputBytes.buffer as ArrayBuffer,
    );

    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedPayload))
    );

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    // If logged in and visiting /login, redirect to dashboard
    if (pathname === '/login') {
      const token = request.cookies.get('sa_token')?.value;
      if (token) {
        const payload = await verifyJwtInMiddleware(token);
        if (payload) {
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }
      }
    }
    return NextResponse.next();
  }

  // Allow static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // Check for JWT cookie
  const token = request.cookies.get('sa_token')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Verify JWT
  const payload = await verifyJwtInMiddleware(token);
  if (!payload) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('sa_token');
    return response;
  }

  // Pass admin info to downstream via headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-admin-id', payload.admin_id);
  requestHeaders.set('x-admin-email', payload.email);
  requestHeaders.set('x-admin-name', payload.name);
  requestHeaders.set('x-admin-role', payload.role);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
