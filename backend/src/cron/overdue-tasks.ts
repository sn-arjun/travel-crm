/**
 * Overdue Task Cron Job
 * Runs daily at 9 AM and 6 PM to detect and notify about overdue tasks.
 */
import type { Env } from '../types';

export async function processOverdueTasks(env: Env) {
    try {
        // For single-tenant setup, use the main DB
        const db = (env as any).DB || (env as any).TENANT_DB;
        if (!db) {
            console.error('No database available for overdue task processing');
            return;
        }

        const today = new Date().toISOString().split('T')[0];

        const overdueTasks = await db.prepare(`
      SELECT t.*, u.name as assignee_name, u.id as assignee_id
      FROM tasks t
      JOIN users u ON t.assigned_to = u.id
      WHERE t.due_date < ?
        AND t.status != 'done'
        AND t.is_deleted = 0
        AND (t.overdue_notified_date IS NULL OR t.overdue_notified_date != ?)
    `).bind(today, today).all();

        const results = overdueTasks.results || [];
        console.log(`Found ${results.length} overdue tasks to process`);

        for (const task of results) {
            const t = task as any;

            // Create in-app notification for assignee
            const notifId = crypto.randomUUID();
            await db.prepare(`
        INSERT INTO notifications (id, user_id, title, body, type, entity_type, entity_id, is_read)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).bind(
                notifId,
                t.assignee_id,
                'Task Overdue',
                `"${t.title}" was due ${t.due_date}`,
                'task_overdue',
                'task',
                t.id
            ).run();

            // Mark as notified today
            await db.prepare(
                'UPDATE tasks SET overdue_notified_date = ? WHERE id = ?'
            ).bind(today, t.id).run();
        }

        console.log(`Processed ${results.length} overdue task notifications`);
    } catch (err) {
        console.error('Error processing overdue tasks:', err);
    }
}
