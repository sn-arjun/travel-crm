/**
 * Planner Routes — Events CRUD with recurrence support.
 * Mounted at /api/v1/events
 */
import { Hono } from 'hono';
import type { AppContext } from '../types';
import { success, error } from '../utils/response';
import { expandRecurrence } from '../services/recurrence-engine';

const plannerRoutes = new Hono<AppContext>();

// ─── List Events (with date range) ──────────────────────────

plannerRoutes.get('/', async (c) => {
    try {
        const { start_date, end_date, event_type, assigned_to, view } = c.req.query();
        const userId = c.get('userId');
        const role = c.get('role');
        const db = c.get('tenantDb');

        if (!start_date || !end_date) {
            return error(c, 'start_date and end_date are required', 400);
        }

        let query = `
      SELECT e.*, u.name as assignee_name, cu.name as creator_name
      FROM events e
      LEFT JOIN users u ON e.assigned_to = u.id
      LEFT JOIN users cu ON e.created_by = cu.id
      WHERE e.is_deleted = 0
        AND e.start_at >= ? AND e.start_at <= ?
    `;
        const params: any[] = [start_date, end_date];

        // Role-based filtering
        if (view !== 'team' || role === 'salesperson') {
            query += ' AND (e.assigned_to = ? OR e.created_by = ?)';
            params.push(userId, userId);
        }

        if (event_type) {
            query += ' AND e.event_type = ?';
            params.push(event_type);
        }

        if (assigned_to) {
            query += ' AND e.assigned_to = ?';
            params.push(assigned_to);
        }

        query += ' ORDER BY e.start_at ASC LIMIT 500';

        const result = await db.prepare(query).bind(...params).all();
        const events = result.results || [];

        // Expand recurring events
        const rangeStart = new Date(start_date);
        const rangeEnd = new Date(end_date);
        const allEvents: any[] = [];

        for (const event of events) {
            if (event.recurrence_rule && !event.recurrence_parent_id) {
                const expanded = expandRecurrence(event as any, rangeStart, rangeEnd);
                allEvents.push(...expanded);
            } else {
                allEvents.push({ ...event, is_recurring: false });
            }
        }

        return success(c, allEvents);
    } catch (e: any) {
        console.error('Events list error:', e);
        return error(c, e.message || 'Failed to fetch events', 500);
    }
});

// ─── Get Single Event ───────────────────────────────────────

plannerRoutes.get('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const db = c.get('tenantDb');

        const event = await db.prepare(`
      SELECT e.*, u.name as assignee_name, cu.name as creator_name
      FROM events e
      LEFT JOIN users u ON e.assigned_to = u.id
      LEFT JOIN users cu ON e.created_by = cu.id
      WHERE e.id = ? AND e.is_deleted = 0
    `).bind(id).first();

        if (!event) return error(c, 'Event not found', 404);

        return success(c, { ...event, is_recurring: !!event.recurrence_rule });
    } catch (e: any) {
        return error(c, e.message || 'Failed to fetch event', 500);
    }
});

// ─── Create Event ───────────────────────────────────────────

plannerRoutes.post('/', async (c) => {
    try {
        const body = await c.req.json();
        const userId = c.get('userId');
        const db = c.get('tenantDb');

        if (!body.title || !body.event_type || !body.start_at) {
            return error(c, 'title, event_type, and start_at are required', 400);
        }

        const validTypes = ['trip_departure', 'trip_return', 'meeting', 'follow_up', 'deadline', 'reminder', 'holiday', 'call', 'task', 'other'];
        if (!validTypes.includes(body.event_type)) {
            return error(c, `Invalid event_type. Must be one of: ${validTypes.join(', ')}`, 400);
        }

        if (body.end_at && new Date(body.end_at) <= new Date(body.start_at)) {
            return error(c, 'end_at must be after start_at', 400);
        }

        const id = crypto.randomUUID();
        await db.prepare(`
      INSERT INTO events (id, title, description, event_type, start_at, end_at, all_day,
        location, color, recurrence_rule, related_lead_id, related_task_id,
        assigned_to, created_by, timezone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
            id,
            body.title,
            body.description || null,
            body.event_type,
            body.start_at,
            body.end_at || null,
            body.all_day ? 1 : 0,
            body.location || null,
            body.color || null,
            body.recurrence_rule ? JSON.stringify(body.recurrence_rule) : null,
            body.related_lead_id || null,
            body.related_task_id || null,
            body.assigned_to || userId,
            userId,
            body.timezone || 'Asia/Kolkata'
        ).run();

        const created = await db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
        return c.json({ data: created }, 201);
    } catch (e: any) {
        console.error('Event create error:', e);
        return error(c, e.message || 'Failed to create event', 500);
    }
});

// ─── Update Event ───────────────────────────────────────────

plannerRoutes.put('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const body = await c.req.json();
        const db = c.get('tenantDb');

        const existing = await db.prepare('SELECT * FROM events WHERE id = ? AND is_deleted = 0').bind(id).first();
        if (!existing) return error(c, 'Event not found', 404);

        // Handle recurring event update scope
        const scope = body.update_scope || 'all'; // this, this_and_future, all

        if (scope === 'this' && existing.recurrence_rule) {
            // Create exception event for this specific date
            const exceptionId = crypto.randomUUID();
            await db.prepare(`
        INSERT INTO events (id, title, description, event_type, start_at, end_at, all_day,
          location, color, recurrence_parent_id, assigned_to, created_by, timezone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
                exceptionId,
                body.title || existing.title,
                body.description !== undefined ? body.description : existing.description,
                body.event_type || existing.event_type,
                body.start_at || existing.start_at,
                body.end_at !== undefined ? body.end_at : existing.end_at,
                body.all_day !== undefined ? (body.all_day ? 1 : 0) : existing.all_day,
                body.location !== undefined ? body.location : existing.location,
                body.color !== undefined ? body.color : existing.color,
                existing.id,
                body.assigned_to || existing.assigned_to,
                existing.created_by,
                body.timezone || existing.timezone
            ).run();

            const created = await db.prepare('SELECT * FROM events WHERE id = ?').bind(exceptionId).first();
            return success(c, created);
        }

        if (scope === 'this_and_future' && existing.recurrence_rule) {
            // Terminate the parent recurrence at the day before the target date
            const targetDate = body.start_at || existing.start_at;
            const dayBefore = new Date(new Date(targetDate).getTime() - 86400000).toISOString().split('T')[0];
            const parentRule = typeof existing.recurrence_rule === 'string'
                ? JSON.parse(existing.recurrence_rule)
                : existing.recurrence_rule;
            const updatedRule = { ...parentRule, until: dayBefore };
            await db.prepare(
                'UPDATE events SET recurrence_rule = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).bind(JSON.stringify(updatedRule), existing.id).run();

            // Create new recurring event from target date onward with new settings
            const newId = crypto.randomUUID();
            await db.prepare(`
        INSERT INTO events (id, title, description, event_type, start_at, end_at, all_day,
          location, color, recurrence_rule, assigned_to, created_by, timezone)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
                newId,
                body.title || existing.title,
                body.description !== undefined ? body.description : existing.description,
                body.event_type || existing.event_type,
                targetDate,
                body.end_at !== undefined ? body.end_at : existing.end_at,
                body.all_day !== undefined ? (body.all_day ? 1 : 0) : existing.all_day,
                body.location !== undefined ? body.location : existing.location,
                body.color !== undefined ? body.color : existing.color,
                existing.recurrence_rule,
                body.assigned_to || existing.assigned_to,
                existing.created_by,
                body.timezone || existing.timezone
            ).run();

            const created = await db.prepare('SELECT * FROM events WHERE id = ?').bind(newId).first();
            return success(c, created);
        }

        // Default: update the event directly
        const fields: string[] = [];
        const values: any[] = [];

        const updatable: Record<string, string> = {
            title: 'title', description: 'description', event_type: 'event_type',
            start_at: 'start_at', end_at: 'end_at', all_day: 'all_day',
            location: 'location', color: 'color', recurrence_rule: 'recurrence_rule',
            assigned_to: 'assigned_to', timezone: 'timezone',
            related_lead_id: 'related_lead_id', related_task_id: 'related_task_id',
        };

        for (const [key, col] of Object.entries(updatable)) {
            if (body[key] !== undefined) {
                fields.push(`${col} = ?`);
                if (key === 'recurrence_rule' && body[key]) {
                    values.push(JSON.stringify(body[key]));
                } else if (key === 'all_day') {
                    values.push(body[key] ? 1 : 0);
                } else {
                    values.push(body[key]);
                }
            }
        }

        if (fields.length === 0) return error(c, 'No fields to update', 400);

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        await db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

        const updated = await db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
        return success(c, updated);
    } catch (e: any) {
        return error(c, e.message || 'Failed to update event', 500);
    }
});

// ─── Delete Event ───────────────────────────────────────────

plannerRoutes.delete('/:id', async (c) => {
    try {
        const { id } = c.req.param();
        const db = c.get('tenantDb');
        const body = await c.req.json().catch(() => ({}));

        const scope = body.delete_scope || 'this';

        if (scope === 'all') {
            // Delete parent and all exceptions
            const realId = id.includes('_') ? id.split('_')[0] : id;
            await db.prepare(`
        UPDATE events SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
        WHERE (id = ? OR recurrence_parent_id = ?) AND is_deleted = 0
      `).bind(realId, realId).run();
        } else {
            // Soft delete single event
            await db.prepare(`
        UPDATE events SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND is_deleted = 0
      `).bind(id).run();
        }

        return success(c, { deleted: true });
    } catch (e: any) {
        return error(c, e.message || 'Failed to delete event', 500);
    }
});

// ─── Reschedule Event (drag-drop) ───────────────────────────

plannerRoutes.patch('/:id/reschedule', async (c) => {
    try {
        const { id } = c.req.param();
        const { start_at, end_at } = await c.req.json();
        const db = c.get('tenantDb');

        if (!start_at) return error(c, 'start_at is required', 400);

        await db.prepare(`
      UPDATE events SET start_at = ?, end_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_deleted = 0
    `).bind(start_at, end_at || null, id).run();

        return success(c, { id, start_at, end_at });
    } catch (e: any) {
        return error(c, e.message || 'Failed to reschedule event', 500);
    }
});

export default plannerRoutes;
