/**
 * Support (impersonation) sessions. A super admin starts one from the operator console; the backend issues an
 * ordinary agency access token with three extra claims: imp (the operator's id), impName (display name) and
 * sid (the session id). The token lives 30 minutes and has no refresh token. Nothing here verifies the token;
 * the server does that on every request. This only reads the claims to show the banner.
 */

export interface SupportSession {
  /** Operator's display name. */
  name: string;
  /** Impersonation session id. */
  sessionId: string;
  /** The agency (tenant) the token belongs to. */
  tenantId: string;
  /** Token expiry as epoch milliseconds, or null if the token has no exp claim. */
  expiresAt: number | null;
}

function base64UrlToString(part: string): string {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/');
  const withPad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(withPad);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The support session carried by an access token, or null for a normal session. */
export function readSupportSession(accessToken: string | null | undefined): SupportSession | null {
  if (!accessToken) return null;
  const parts = accessToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(base64UrlToString(parts[1] ?? '')) as { imp?: unknown; impName?: unknown; sid?: unknown; exp?: unknown; tenantId?: unknown };
    if (typeof claims.imp !== 'string' || !claims.imp) return null;
    return {
      name: typeof claims.impName === 'string' && claims.impName ? claims.impName : 'support',
      tenantId: typeof claims.tenantId === 'string' ? claims.tenantId : '',
      sessionId: typeof claims.sid === 'string' ? claims.sid : '',
      expiresAt: typeof claims.exp === 'number' ? claims.exp * 1000 : null,
    };
  } catch {
    return null;
  }
}
