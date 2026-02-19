import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { hasPermission, type Module, type Permission, type Role } from '../constants/permissions';
import { error } from '../utils/response';

/**
 * RBAC middleware factory — restricts access by role.
 *
 * Usage:
 *   route.get('/', rbac(['admin', 'sales_manager']), handler)
 */
export function rbac(allowedRoles: Role[]): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const role = c.get('role') as Role;

    if (!role || !allowedRoles.includes(role)) {
      return error(c, 'Insufficient permissions', 403);
    }

    return next();
  };
}

/**
 * Permission-based middleware factory — checks module + permission.
 *
 * Usage:
 *   route.post('/', requirePermission('leads', 'create'), handler)
 */
export function requirePermission(
  module: Module,
  permission: Permission
): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const role = c.get('role') as Role;

    if (!role || !hasPermission(role, module, permission)) {
      return error(c, 'Insufficient permissions', 403);
    }

    return next();
  };
}
