import { Hono } from 'hono';
import type { AppContext } from '../types';
import { success, notFound, error, forbidden, created } from '../utils/response';
import { generateId } from '../utils/uuid';
import { broadcastToTenant } from '../utils/realtime';

const notificationsRoutes = new Hono<AppContext>();

// ============================================================
// GET /api/v1/notifications
// List the current user's notifications (paginated).
// ?unread=true  → only unread
// ?count=true   → return just the unread count
// ============================================================

notificationsRoutes.get('/', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'));
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20'), 100);
  const offset = (page - 1) * limit;
  const unreadOnly = c.req.query('unread') === 'true';
  const countOnly = c.req.query('count') === 'true';

  if (countOnly) {
    const row = await tenantDb
      .prepare(`SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0`)
      .bind(userId)
      .first<{ count: number }>();
    return success(c, { count: row?.count ?? 0 });
  }

  const whereClause = unreadOnly
    ? `WHERE user_id = ? AND is_read = 0`
    : `WHERE user_id = ?`;

  const [countResult, listResult] = await Promise.all([
    tenantDb
      .prepare(`SELECT COUNT(*) AS total FROM notifications ${whereClause}`)
      .bind(userId)
      .first<{ total: number }>(),
    tenantDb
      .prepare(
        `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(userId, limit, offset)
      .all(),
  ]);

  const items = (listResult.results ?? []).map((n: any) => ({
    id: n.id,
    userId: n.user_id,
    title: n.title,
    message: n.message,
    type: n.type,
    referenceType: n.reference_type,
    referenceId: n.reference_id,
    read: n.is_read === 1,
    createdAt: n.created_at,
  }));

  return success(c, {
    items,
    total: countResult?.total ?? 0,
    page,
    limit,
  });
});

// ============================================================
// PUT /api/v1/notifications/read-all — mark all as read
// ============================================================

notificationsRoutes.post('/read-all', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  await tenantDb
    .prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`)
    .bind(userId)
    .run();

  // Broadcast badge update
  try {
    const tenantId = c.get('tenantId');
    await broadcastToTenant(c.env, tenantId, {
      type: 'notification:read',
      data: { userId },
    }, { targetUserId: userId });
  } catch {}

  return success(c, { message: 'All notifications marked as read' });
});

// ============================================================
// PUT /api/v1/notifications/:id/read — mark one as read
// ============================================================

notificationsRoutes.post('/:id/read', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const id = c.req.param('id');

  const existing = await tenantDb
    .prepare(`SELECT id FROM notifications WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<{ id: string }>();

  if (!existing) return notFound(c, 'Notification not found');

  await tenantDb
    .prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();

  // Broadcast badge update
  try {
    const tenantId = c.get('tenantId');
    await broadcastToTenant(c.env, tenantId, {
      type: 'notification:read',
      data: { notificationId: id, userId },
    }, { targetUserId: userId });
  } catch {}

  return success(c, { id });
});

// ============================================================
// DELETE /api/v1/notifications/:id — delete one notification
// ============================================================

notificationsRoutes.delete('/:id', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const id = c.req.param('id');

  const existing = await tenantDb
    .prepare(`SELECT id FROM notifications WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .first<{ id: string }>();

  if (!existing) return notFound(c, 'Notification not found');

  await tenantDb
    .prepare(`DELETE FROM notifications WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();

  return success(c, { id });
});

// ============================================================
// GET /api/v1/notifications/unread-count
// Get count of unread notifications for the current user
// ============================================================

notificationsRoutes.get('/unread-count', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  const row = await tenantDb
    .prepare(`SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0`)
    .bind(userId)
    .first<{ count: number }>();

  return success(c, { unreadCount: row?.count ?? 0 });
});

// ============================================================
// GET /api/v1/notifications/badge-counts
// Get badge counts for dashboard (unread notifications, overdue follow-ups, pending tasks, overdue invoices)
// ============================================================

notificationsRoutes.get('/badge-counts', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  try {
    const now = new Date().toISOString();

    // Unread notifications
    const notifCount = await tenantDb
      .prepare(`SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0`)
      .bind(userId)
      .first<{ count: number }>();

    // Overdue follow-ups
    const overdueFollowUps = await tenantDb
      .prepare(`
        SELECT COUNT(*) AS count FROM follow_ups
        WHERE created_by = ? AND status IN ('pending', 'missed') AND scheduled_at < ?
      `)
      .bind(userId, now)
      .first<{ count: number }>();

    // Pending tasks
    const pendingTasks = await tenantDb
      .prepare(`SELECT COUNT(*) AS count FROM tasks WHERE assigned_to = ? AND status = 'todo'`)
      .bind(userId)
      .first<{ count: number }>();

    // Overdue invoices (created by user)
    const overdueInvoices = await tenantDb
      .prepare(`
        SELECT COUNT(*) AS count FROM invoices
        WHERE created_by = ?
        AND status NOT IN ('paid', 'cancelled')
        AND due_date < date('now')
      `)
      .bind(userId)
      .first<{ count: number }>();

    return success(c, {
      unreadNotifications: notifCount?.count ?? 0,
      overdueFollowups: overdueFollowUps?.count ?? 0,
      pendingTasks: pendingTasks?.count ?? 0,
      overdueInvoices: overdueInvoices?.count ?? 0,
    });
  } catch (err) {
    console.error('Failed to get badge counts:', err);
    return error(c, 'Failed to get badge counts', 500);
  }
});

// ============================================================
// POST /api/v1/notifications/announce
// Admin announcement - send to all users or specific roles/users
// Requires admin or manager role
// ============================================================

notificationsRoutes.post('/announce', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');

  // Only admin and sales_manager can announce
  if (!['admin', 'sales_manager'].includes(role)) {
    return forbidden(c, 'Only admins and managers can send announcements');
  }

  const body = await c.req.json<{
    title: string;
    body: string;
    target?: 'all' | string; // 'all' or 'role:admin' or comma-separated user IDs
  }>();

  if (!body.title || !body.body) {
    return error(c, 'title and body are required', 400);
  }

  try {
    const target = body.target || 'all';
    let targetUserIds: string[] = [];

    if (target === 'all') {
      // Get all active users
      const allUsers = await tenantDb
        .prepare(`SELECT id FROM users WHERE is_active = 1`)
        .all<{ id: string }>();
      targetUserIds = allUsers.results?.map((u) => u.id) ?? [];
    } else if (target.startsWith('role:')) {
      // Get users by role
      const roleTarget = target.substring(5);
      const roleUsers = await tenantDb
        .prepare(`SELECT id FROM users WHERE role = ? AND is_active = 1`)
        .bind(roleTarget)
        .all<{ id: string }>();
      targetUserIds = roleUsers.results?.map((u) => u.id) ?? [];
    } else {
      // Parse comma-separated user IDs
      targetUserIds = target.split(',').filter((id) => id.trim());
    }

    const now = new Date().toISOString();
    const sentCount = targetUserIds.length;

    // Send notifications to all target users
    for (const targetUserId of targetUserIds) {
      const notifId = generateId();
      await tenantDb
        .prepare(`
          INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
          VALUES (?, ?, ?, ?, 'announcement', 0, ?)
        `)
        .bind(notifId, targetUserId, body.title, body.body, now)
        .run();

      // Queue push notification (bypasses quiet hours)
      await c.env.PUSH_NOTIFICATION_QUEUE.send({
        type: 'push',
        data: {
          userId: targetUserId,
          title: body.title,
          body: body.body,
          data: {
            type: 'announcement',
          },
        },
      });

      // Push real-time notification
      try {
        const tenantId = c.get('tenantId');
        await broadcastToTenant(c.env, tenantId, {
          type: 'notification:new',
          data: { notification: { id: notifId, title: body.title, message: body.body, type: 'announcement' } },
        }, { targetUserId: targetUserId });
      } catch {}
    }

    return created(c, {
      message: 'Announcement sent',
      sentCount,
    });
  } catch (err) {
    console.error('Failed to send announcement:', err);
    return error(c, 'Failed to send announcement', 500);
  }
});

export default notificationsRoutes;
