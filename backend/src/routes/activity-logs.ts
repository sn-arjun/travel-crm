import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, and, sql } from 'drizzle-orm';
import type { AppContext } from '../types';
import { activityLogs, users } from '../db/tenant-schema';
import { rbac } from '../middleware/rbac';
import { success, paginated } from '../utils/response';

const activityLogRoutes = new Hono<AppContext>();

// ============================================================
// GET / — List activity logs (admin only, paginated)
// ============================================================

activityLogRoutes.get('/', rbac(['admin']), async (c) => {
  const db = drizzle(c.get('tenantDb'));

  const page = Number(c.req.query('page') || '1');
  const limit = Math.min(Number(c.req.query('limit') || '50'), 100);
  const offset = (page - 1) * limit;

  const action = c.req.query('action');
  const entityType = c.req.query('entityType');
  const userId = c.req.query('userId');

  const conditions = [];
  if (action) conditions.push(eq(activityLogs.action, action));
  if (entityType) conditions.push(eq(activityLogs.entityType, entityType));
  if (userId) conditions.push(eq(activityLogs.userId, userId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, countResult] = await Promise.all([
    db
      .select({
        id: activityLogs.id,
        userId: activityLogs.userId,
        userName: users.name,
        action: activityLogs.action,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        details: activityLogs.details,
        ipAddress: activityLogs.ipAddress,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(where)
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(activityLogs)
      .where(where),
  ]);

  return paginated(c, logs, countResult[0]?.count || 0, page, limit);
});

// ============================================================
// GET /user/:id — Activity logs for a specific user
// ============================================================

activityLogRoutes.get('/user/:id', rbac(['admin']), async (c) => {
  const userId = c.req.param('id');
  const db = drizzle(c.get('tenantDb'));
  const limit = Math.min(Number(c.req.query('limit') || '50'), 100);

  const logs = await db
    .select()
    .from(activityLogs)
    .where(eq(activityLogs.userId, userId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);

  return success(c, logs);
});

// ============================================================
// GET /entity/:type/:id — Activity logs for a specific entity
// ============================================================

activityLogRoutes.get('/entity/:type/:id', rbac(['admin']), async (c) => {
  const entityType = c.req.param('type');
  const entityId = c.req.param('id');
  const db = drizzle(c.get('tenantDb'));
  const limit = Math.min(Number(c.req.query('limit') || '50'), 100);

  const logs = await db
    .select()
    .from(activityLogs)
    .where(and(eq(activityLogs.entityType, entityType), eq(activityLogs.entityId, entityId)))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);

  return success(c, logs);
});

export default activityLogRoutes;
