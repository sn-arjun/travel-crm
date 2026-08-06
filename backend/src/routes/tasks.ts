/**
 * Tasks Routes — Tasks CRUD, subtasks, comments, status transitions.
 * Mounted at /api/v1/tasks
 */
import { Hono } from 'hono';
import type { AppContext } from '../types';
import { success, error } from '../utils/response';
import { broadcastToTenant } from '../utils/realtime';

const taskRoutes = new Hono<AppContext>();

// ─── Valid status transitions ───────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
    'todo': ['in_progress', 'done'],
    'in_progress': ['done', 'todo'],
    'done': ['in_progress', 'todo'],
};

// ─── List Tasks ─────────────────────────────────────────────

taskRoutes.get('/', async (c) => {
    try {
        const { status, priority, category, assigned_to, related_lead_id,
            due_date_from, due_date_to, overdue, view, page, limit: lim, search } = c.req.query();
        const userId = c.get('userId');
        const role = c.get('role');
        const db = c.get('tenantDb');

        let query = `
      SELECT t.*, u.name as assignee_name, l.title as lead_title,
        (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.is_deleted = 0) as subtask_count,
        (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.status = 'done' AND st.is_deleted = 0) as completed_subtask_count
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN leads l ON t.related_lead_id = l.id
      WHERE t.is_deleted = 0 AND t.parent_task_id IS NULL
    `;
        const params: any[] = [];

        // Role-based filtering
        if (view !== 'all' || role === 'salesperson') {
            query += ' AND t.assigned_to = ?';
            params.push(userId);
        }

        if (search) { query += ' AND t.title LIKE ?'; params.push(`%${search}%`); }
        if (status) { query += ' AND t.status = ?'; params.push(status); }
        if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
        if (category) { query += ' AND t.category = ?'; params.push(category); }
        if (assigned_to) { query += ' AND t.assigned_to = ?'; params.push(assigned_to); }
        if (related_lead_id) { query += ' AND t.related_lead_id = ?'; params.push(related_lead_id); }
        if (due_date_from) { query += ' AND t.due_date >= ?'; params.push(due_date_from); }
        if (due_date_to) { query += ' AND t.due_date <= ?'; params.push(due_date_to); }
        if (overdue === 'true') {
            const today = new Date().toISOString().split('T')[0];
            query += " AND t.due_date < ? AND t.status != 'done'";
            params.push(today);
        }

        query += ' ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC';

        const limit = parseInt(lim || '20');
        const offset = (parseInt(page || '1') - 1) * limit;
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const result = await db.prepare(query).bind(...params).all();
        return success(c, result.results || []);
    } catch (e: any) {
        console.error('Tasks list error:', e);
        return error(c, e.message || 'Failed to fetch tasks', 500);
    }
});

// ─── Get Single Task ────────────────────────────────────────

taskRoutes.get('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const db = c.get('tenantDb');

        const task = await db.prepare(`
      SELECT t.*, u.name as assignee_name, l.title as lead_title,
        (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.is_deleted = 0) as subtask_count,
        (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.status = 'done' AND st.is_deleted = 0) as completed_subtask_count
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN leads l ON t.related_lead_id = l.id
      WHERE t.id = ? AND t.is_deleted = 0
    `).bind(id).first();

        if (!task) return error(c, 'Task not found', 404);
        return success(c, task);
    } catch (e: any) {
        return error(c, e.message || 'Failed to fetch task', 500);
    }
});

// ─── Create Task ────────────────────────────────────────────

taskRoutes.post('/', async (c) => {
    try {
        const body = await c.req.json();
        const userId = c.get('userId');
        const db = c.get('tenantDb');

        if (!body.title) return error(c, 'Title is required', 400);

        const taskId = crypto.randomUUID();
        await db.prepare(`
      INSERT INTO tasks (id, title, description, status, priority, category, due_date,
        assigned_to, related_lead_id, parent_task_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
            taskId,
            body.title,
            body.description || null,
            body.status || 'todo',
            body.priority || 'medium',
            body.category || 'general',
            body.due_date || null,
            body.assigned_to || userId,
            body.related_lead_id || null,
            body.parent_task_id || null,
            userId
        ).run();

        // Auto-create calendar event if due_date is set
        if (body.due_date) {
            const eventId = crypto.randomUUID();
            await db.prepare(`
        INSERT INTO events (id, title, event_type, start_at, all_day, related_task_id,
          assigned_to, created_by, color)
        VALUES (?, ?, 'deadline', ?, 1, ?, ?, ?, '#F44336')
      `).bind(
                eventId,
                `Task: ${body.title}`,
                body.due_date,
                taskId,
                body.assigned_to || userId,
                userId
            ).run();
        }

        const created = await db.prepare(`
      SELECT t.*, u.name as assignee_name
      FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = ?
    `).bind(taskId).first();

        // Notify assignee if different from creator
        const assigneeId = body.assigned_to || userId;
        if (assigneeId !== userId) {
            const notifId = crypto.randomUUID();
            await db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read)
        VALUES (?, ?, 'task_assigned', ?, ?, ?, 0)
      `).bind(
                notifId,
                assigneeId,
                'New Task Assigned',
                `You have been assigned: ${body.title}`,
                JSON.stringify({ task_id: taskId })
            ).run().catch(() => { /* notifications table may not exist in older tenants */ });
        }

        // Broadcast real-time event
        try {
            const tenantId = c.get('tenantId');
            await broadcastToTenant(c.env, tenantId, {
                type: 'task:assigned',
                data: { taskId, task: created, assigneeId: assigneeId },
            });
        } catch {}

        return c.json({ data: created }, 201);
    } catch (e: any) {
        console.error('Task create error:', e);
        return error(c, e.message || 'Failed to create task', 500);
    }
});

// ─── Update Task ────────────────────────────────────────────

taskRoutes.put('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const body = await c.req.json();
        const userId = c.get('userId');
        const db = c.get('tenantDb');

        const existing = await db.prepare('SELECT * FROM tasks WHERE id = ? AND is_deleted = 0').bind(id).first();
        if (!existing) return error(c, 'Task not found', 404);

        const fields: string[] = [];
        const values: any[] = [];

        const updatable: Record<string, string> = {
            title: 'title', description: 'description', status: 'status',
            priority: 'priority', category: 'category', due_date: 'due_date',
            assigned_to: 'assigned_to', related_lead_id: 'related_lead_id',
        };

        for (const [key, col] of Object.entries(updatable)) {
            if (body[key] !== undefined) {
                fields.push(`${col} = ?`);
                values.push(body[key]);
            }
        }

        if (fields.length === 0) return error(c, 'No fields to update', 400);
        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        await db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

        // Sync calendar event if due_date changed
        if (body.due_date !== undefined) {
            const existingEvent = await db.prepare(
                'SELECT id FROM events WHERE related_task_id = ? AND is_deleted = 0'
            ).bind(id).first();

            if (body.due_date && existingEvent) {
                await db.prepare(
                    'UPDATE events SET start_at = ?, title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
                ).bind(body.due_date, `Task: ${body.title || existing.title}`, existingEvent.id).run();
            } else if (body.due_date && !existingEvent) {
                const eventId = crypto.randomUUID();
                await db.prepare(`
          INSERT INTO events (id, title, event_type, start_at, all_day, related_task_id,
            assigned_to, created_by, color)
          VALUES (?, ?, 'deadline', ?, 1, ?, ?, ?, '#F44336')
        `).bind(eventId, `Task: ${body.title || existing.title}`, body.due_date,
                    id, body.assigned_to || existing.assigned_to, userId
                ).run();
            } else if (!body.due_date && existingEvent) {
                await db.prepare('UPDATE events SET is_deleted = 1 WHERE id = ?').bind(existingEvent.id).run();
            }
        }

        const updated = await db.prepare(`
      SELECT t.*, u.name as assignee_name
      FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.id = ?
    `).bind(id).first();

        // Notify on reassignment
        if (body.assigned_to && body.assigned_to !== existing.assigned_to) {
            const taskTitle = body.title || existing.title;
            // Notify new assignee
            const notifNew = crypto.randomUUID();
            await db.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read)
        VALUES (?, ?, 'task_assigned', ?, ?, ?, 0)
      `).bind(notifNew, body.assigned_to, 'Task Assigned to You',
                `You have been assigned: ${taskTitle}`,
                JSON.stringify({ task_id: id })
            ).run().catch(() => { /* ignore */ });

            // Notify old assignee if they had the task
            if (existing.assigned_to && existing.assigned_to !== userId) {
                const notifOld = crypto.randomUUID();
                await db.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, data, is_read)
          VALUES (?, ?, 'task_reassigned', ?, ?, ?, 0)
        `).bind(notifOld, existing.assigned_to, 'Task Reassigned',
                    `Task "${taskTitle}" has been reassigned`,
                    JSON.stringify({ task_id: id })
                ).run().catch(() => { /* ignore */ });
            }
        }

        // Broadcast real-time event
        try {
            const tenantId = c.get('tenantId');
            if (body.status && body.status !== existing.status) {
                await broadcastToTenant(c.env, tenantId, {
                    type: 'task:status_changed',
                    data: { taskId: id, oldStatus: existing.status, newStatus: body.status, task: updated },
                });
            }
            if (body.assigned_to && body.assigned_to !== existing.assigned_to) {
                await broadcastToTenant(c.env, tenantId, {
                    type: 'task:assigned',
                    data: { taskId: id, task: updated, assigneeId: body.assigned_to },
                });
            }
        } catch {}

        return success(c, updated);
    } catch (e: any) {
        return error(c, e.message || 'Failed to update task', 500);
    }
});

// ─── Update Task Status ─────────────────────────────────────

taskRoutes.patch('/:id/status', async (c) => {
    try {
        const { id } = c.req.param();
        const { status } = await c.req.json();
        const db = c.get('tenantDb');

        if (!status) return error(c, 'Status is required', 400);

        const task = await db.prepare('SELECT * FROM tasks WHERE id = ? AND is_deleted = 0').bind(id).first();
        if (!task) return error(c, 'Task not found', 404);

        const allowed = VALID_TRANSITIONS[task.status as string] || [];
        if (!allowed.includes(status)) {
            return error(c, `Cannot transition from ${task.status} to ${status}`, 400);
        }

        const completedAt = status === 'done' ? new Date().toISOString() : null;
        await db.prepare(`
      UPDATE tasks SET status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(status, completedAt, id).run();

        // Update linked calendar event color
        if (status === 'done') {
            await db.prepare(
                "UPDATE events SET color = '#4CAF50', updated_at = CURRENT_TIMESTAMP WHERE related_task_id = ? AND is_deleted = 0"
            ).bind(id).run();
        } else {
            await db.prepare(
                "UPDATE events SET color = '#F44336', updated_at = CURRENT_TIMESTAMP WHERE related_task_id = ? AND is_deleted = 0"
            ).bind(id).run();
        }

        const updated = { id, status, completed_at: completedAt };

        // Broadcast real-time event
        try {
            const tenantId = c.get('tenantId');
            await broadcastToTenant(c.env, tenantId, {
                type: status === 'done' ? 'task:completed' : 'task:status_changed',
                data: { taskId: id, oldStatus: task.status, newStatus: status, task: updated },
            });
        } catch {}

        return success(c, updated);
    } catch (e: any) {
        return error(c, e.message || 'Failed to update task status', 500);
    }
});

// ─── Delete Task ────────────────────────────────────────────

taskRoutes.delete('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const db = c.get('tenantDb');

        // Soft delete task and its subtasks
        await db.prepare(`
      UPDATE tasks SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
      WHERE (id = ? OR parent_task_id = ?) AND is_deleted = 0
    `).bind(id, id).run();

        // Soft delete linked calendar event
        await db.prepare(
            'UPDATE events SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE related_task_id = ? AND is_deleted = 0'
        ).bind(id).run();

        return success(c, { deleted: true });
    } catch (e: any) {
        return error(c, e.message || 'Failed to delete task', 500);
    }
});

// ─── Get Subtasks ───────────────────────────────────────────

taskRoutes.get('/:id/subtasks', async (c) => {
    try {
        const { id } = c.req.param();
        const db = c.get('tenantDb');

        const result = await db.prepare(`
      SELECT t.*, u.name as assignee_name
      FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.parent_task_id = ? AND t.is_deleted = 0
      ORDER BY t.created_at ASC
    `).bind(id).all();

        return success(c, result.results || []);
    } catch (e: any) {
        return error(c, e.message || 'Failed to fetch subtasks', 500);
    }
});

// ─── Task Comments ──────────────────────────────────────────

taskRoutes.post('/:taskId/comments', async (c) => {
    try {
        const { taskId } = c.req.param();
        const { content } = await c.req.json();
        const userId = c.get('userId');
        const userName = c.get('userName');
        const db = c.get('tenantDb');

        if (!content || content.length > 2000) {
            return error(c, 'Content required, max 2000 characters', 400);
        }

        // Ensure task_comments table exists (may be missing in older tenant DBs)
        await db.prepare(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      )
    `).run();

        const id = crypto.randomUUID();
        await db.prepare(`
      INSERT INTO task_comments (id, task_id, user_id, content)
      VALUES (?, ?, ?, ?)
    `).bind(id, taskId, userId, content).run();

        return c.json({
            data: {
                id, task_id: taskId, user_id: userId,
                content, user_name: userName,
                created_at: new Date().toISOString(),
            }
        }, 201);
    } catch (e: any) {
        return error(c, e.message || 'Failed to add comment', 500);
    }
});

taskRoutes.get('/:taskId/comments', async (c) => {
    try {
        const { taskId } = c.req.param();
        const db = c.get('tenantDb');

        // Ensure task_comments table exists (may be missing in older tenant DBs)
        await db.prepare(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      )
    `).run();

        const result = await db.prepare(`
      SELECT tc.*, u.name as user_name, u.avatar_url
      FROM task_comments tc
      JOIN users u ON tc.user_id = u.id
      WHERE tc.task_id = ?
      ORDER BY tc.created_at ASC
    `).bind(taskId).all();

        return success(c, result.results || []);
    } catch (e: any) {
        return error(c, e.message || 'Failed to fetch comments', 500);
    }
});

taskRoutes.put('/:taskId/comments/:commentId', async (c) => {
    try {
        const { taskId, commentId } = c.req.param();
        const { content } = await c.req.json();
        const userId = c.get('userId');
        const db = c.get('tenantDb');

        const comment = await db.prepare(
            'SELECT * FROM task_comments WHERE id = ? AND task_id = ?'
        ).bind(commentId, taskId).first();

        if (!comment) return error(c, 'Comment not found', 404);
        if (comment.user_id !== userId) return error(c, 'Only the author can edit this comment', 403);

        await db.prepare(
            'UPDATE task_comments SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(content, commentId).run();

        return success(c, { id: commentId, content });
    } catch (e: any) {
        return error(c, e.message || 'Failed to update comment', 500);
    }
});

taskRoutes.delete('/:taskId/comments/:commentId', async (c) => {
    try {
        const { taskId, commentId } = c.req.param();
        const userId = c.get('userId');
        const role = c.get('role');
        const db = c.get('tenantDb');

        const comment = await db.prepare(
            'SELECT * FROM task_comments WHERE id = ? AND task_id = ?'
        ).bind(commentId, taskId).first();

        if (!comment) return error(c, 'Comment not found', 404);
        if (comment.user_id !== userId && role !== 'admin' && role !== 'manager' && role !== 'sales_manager') {
            return error(c, 'Only the author or a manager can delete this comment', 403);
        }

        await db.prepare('DELETE FROM task_comments WHERE id = ?').bind(commentId).run();
        return success(c, { deleted: true });
    } catch (e: any) {
        return error(c, e.message || 'Failed to delete comment', 500);
    }
});

// ─── Lead Tasks (tasks linked to a specific lead) ───────────

taskRoutes.get('/leads/:leadId/tasks', async (c) => {
    try {
        const { leadId } = c.req.param();
        const db = c.get('tenantDb');

        const result = await db.prepare(`
      SELECT t.*, u.name as assignee_name
      FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.related_lead_id = ? AND t.is_deleted = 0
      ORDER BY CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC
    `).bind(leadId).all();

        return success(c, result.results || []);
    } catch (e: any) {
        return error(c, e.message || 'Failed to fetch lead tasks', 500);
    }
});

// ─── Dashboard Tasks Summary ────────────────────────────────

taskRoutes.get('/dashboard/summary', async (c) => {
    try {
        const userId = c.get('userId');
        const role = c.get('role');
        const db = c.get('tenantDb');
        const today = new Date().toISOString().split('T')[0];

        const isManager = role === 'admin' || role === 'manager' || role === 'sales_manager';
        const userFilter = isManager ? '' : 'AND t.assigned_to = ?';

        // Today's tasks
        const todayParams = isManager ? [today] : [today, userId];
        const todayTasks = await db.prepare(`
      SELECT t.*, u.name as assignee_name FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.due_date = ? AND t.is_deleted = 0 ${userFilter}
      ORDER BY t.priority DESC, t.created_at ASC
      LIMIT 10
    `).bind(...todayParams).all();

        // Overdue count
        const overdueParams = isManager ? [today] : [today, userId];
        const overdueResult = await db.prepare(`
      SELECT COUNT(*) as count FROM tasks t
      WHERE t.due_date < ? AND t.status != 'done' AND t.is_deleted = 0
      ${userFilter}
    `).bind(...overdueParams).first();

        // Status counts
        const statusParams = isManager ? [] : [userId];
        const statusQuery = `
      SELECT status, COUNT(*) as count FROM tasks t
      WHERE t.is_deleted = 0 AND t.status != 'done'
      ${userFilter}
      GROUP BY status
    `;
        const statusResult = statusParams.length > 0
            ? await db.prepare(statusQuery).bind(...statusParams).all()
            : await db.prepare(statusQuery).all();

        // Completed today
        const completedParams = isManager ? [`${today}%`] : [`${today}%`, userId];
        const completedResult = await db.prepare(`
      SELECT COUNT(*) as count FROM tasks t
      WHERE t.completed_at LIKE ? AND t.is_deleted = 0
      ${userFilter}
    `).bind(...completedParams).first();

        const byStatus: Record<string, number> = {};
        for (const row of (statusResult.results || [])) {
            byStatus[(row as any).status] = (row as any).count;
        }

        return success(c, {
            today_tasks: todayTasks.results || [],
            overdue_count: (overdueResult as any)?.count || 0,
            completed_today: (completedResult as any)?.count || 0,
            by_status: byStatus,
        });
    } catch (e: any) {
        return error(c, e.message || 'Failed to fetch task summary', 500);
    }
});

export default taskRoutes;
