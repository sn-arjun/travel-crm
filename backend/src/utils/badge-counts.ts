/**
 * Compute badge counts for a specific user.
 * Used by both the REST endpoint and real-time broadcasts.
 */
export async function computeBadgeCounts(
  db: D1Database,
  userId: string,
): Promise<{
  unreadNotifications: number;
  pendingTasks: number;
  overdueFollowups: number;
  overdueInvoices: number;
}> {
  const now = new Date().toISOString();

  const [notifs, tasks, followUps, invoices] = await Promise.all([
    db
      .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0')
      .bind(userId)
      .first<{ c: number }>(),
    db
      .prepare("SELECT COUNT(*) AS c FROM tasks WHERE assigned_to = ? AND status = 'todo'")
      .bind(userId)
      .first<{ c: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM follow_ups WHERE created_by = ? AND status IN ('pending', 'missed') AND scheduled_at < ?",
      )
      .bind(userId, now)
      .first<{ c: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS c FROM invoices WHERE created_by = ? AND status NOT IN ('paid', 'cancelled') AND due_date < date('now')",
      )
      .bind(userId)
      .first<{ c: number }>(),
  ]);

  return {
    unreadNotifications: notifs?.c ?? 0,
    pendingTasks: tasks?.c ?? 0,
    overdueFollowups: followUps?.c ?? 0,
    overdueInvoices: invoices?.c ?? 0,
  };
}
