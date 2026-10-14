/**
 * Super admin token handling for the console. The backend (POST /admin/auth/login) issues the token; the
 * console only verifies it (HS256, audience "super-admin", issuer "travelcrm-super-admin") so it can gate pages.
 * Uses Web Crypto only, so it runs in the middleware (edge) and in route handlers alike.
 */

export const SESSION_COOKIE = 'sa_token';
export const SUPER_ADMIN_AUDIENCE = 'super-admin';
export const SUPER_ADMIN_ISSUER = 'travelcrm-super-admin';
export const MIN_SECRET_LENGTH = 32;

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  aud: string | string[];
  iss: string;
  jti: string;
  iat: number;
  exp: number;
}

/** The shared signing secret. Never has a default: a missing secret is a configuration error. */
export function superAdminSecret(): string | null {
  const secret = process.env.SUPER_ADMIN_JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    console.error(
      `SUPER_ADMIN_JWT_SECRET is not set (needs ${MIN_SECRET_LENGTH}+ characters, the same value as the backend). The console cannot verify sessions.`,
    );
    return null;
  }
  return secret;
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader))) as { alg?: string };
    if (header.alg !== 'HS256') return null;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret).buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(encodedSignature).buffer as ArrayBuffer,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`).buffer as ArrayBuffer,
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as JwtPayload;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(SUPER_ADMIN_AUDIENCE) || payload.iss !== SUPER_ADMIN_ISSUER) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Secure cookies everywhere except a local console talking to localhost. */
export function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
