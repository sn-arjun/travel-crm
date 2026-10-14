import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export interface TokenPayload extends JWTPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  /** Binding name of the tenant database (informational; the tenant registry stays authoritative). */
  db?: string;
}

const ACCESS_TOKEN_EXPIRY = '15m';

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  payload: { userId: string; tenantId: string; role: string; email: string; db?: string | null },
  secret: string
): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    tenantId: payload.tenantId,
    role: payload.role,
    email: payload.email,
    ...(payload.db ? { db: payload.db } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setSubject(payload.userId)
    .sign(getSecretKey(secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string
): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, getSecretKey(secret));
  return payload as TokenPayload;
}
