import { cookies } from 'next/headers';
import { SESSION_COOKIE, superAdminSecret, verifyJwt, type JwtPayload } from './auth';

/** The signed-in operator from the sa_token cookie, or null. For server components and route handlers (not middleware). */
export async function getSessionPayload(): Promise<JwtPayload | null> {
  const secret = superAdminSecret();
  if (!secret) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyJwt(token, secret);
}
