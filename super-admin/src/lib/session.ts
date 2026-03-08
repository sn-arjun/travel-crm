import { getSessionToken, verifyJwt, type JwtPayload } from './auth';

const JWT_SECRET = process.env.JWT_SECRET || 'super-admin-dev-secret-change-in-production';

/**
 * Get the current session payload from the JWT cookie.
 * Use in server components and API routes (NOT middleware).
 */
export async function getSessionPayload(): Promise<JwtPayload | null> {
  const token = await getSessionToken();
  if (!token) return null;
  return verifyJwt(token, JWT_SECRET);
}
