import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { error } from '../utils/response';

const PUBLIC_PATHS = [
  '/api/v1/health',
  '/api/v1/auth/resolve-tenant',
  '/api/v1/auth/login',
  '/api/v1/auth/send-otp',
  '/api/v1/auth/verify-otp',
  '/api/v1/auth/refresh-token',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/setup-account',
];

export const authMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  const path = new URL(c.req.url).pathname;

  // Skip auth for public paths
  if (PUBLIC_PATHS.includes(path)) {
    return next();
  }

  // Skip auth for WebSocket upgrade
  if (path === '/api/v1/ws') {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return error(c, 'Missing or invalid authorization header', 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token, c.env.JWT_SECRET);

    c.set('userId', payload.userId);
    c.set('tenantId', payload.tenantId);
    c.set('role', payload.role);
    c.set('userName', payload.email);
    c.set('jwtPayload', payload);

    return next();
  } catch {
    return error(c, 'Invalid or expired token', 401);
  }
};
