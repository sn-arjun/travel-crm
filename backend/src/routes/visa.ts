import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import type { AppContext } from '../types';
import {
    createVisaApplicationSchema,
    updateVisaApplicationSchema,
    visaChecklistStatusSchema
} from '../validators/visa';
import { getChecklistTemplate } from '../db/seed/visa-checklist-templates';

const visaRouter = new Hono<AppContext>();
visaRouter.use('*', authMiddleware);

visaRouter.get('/', async (c) => {
    try {
        const db = c.get('tenantDb');
        const tenantId = c.get('tenantId');
        const leadId = c.req.query('lead_id');
        const status = c.req.query('status');

        let query = 'SELECT * FROM visa_applications WHERE tenant_id = ? AND is_deleted = 0';
        const params: any[] = [tenantId];

        if (leadId) { query += ' AND lead_id = ?'; params.push(leadId); }
        if (status) { query += ' AND status = ?'; params.push(status); }

        query += ' ORDER BY created_at DESC';

        const results = await db.prepare(query).bind(...params).all();
        return c.json({ data: results.results });
    } catch (e: any) {
        console.error('Visa list error:', e.message);
        return c.json({ data: [] });
    }
});

visaRouter.post('/', zValidator('json', createVisaApplicationSchema), async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.prepare(`
    INSERT INTO visa_applications (
      id, tenant_id, traveller_id, lead_id, destination_country, visa_type,
      status, expected_date, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
        id, tenantId, body.travellerId, body.leadId || null, body.destinationCountry,
        body.visaType, body.status || 'not_started', body.expectedDate || null,
        userId, now, now
    ).run();

    // Auto-generate checklist
    const templates = getChecklistTemplate(body.destinationCountry, body.visaType);
    for (let i = 0; i < templates.length; i++) {
        const tItem = templates[i];
        await db.prepare(`
      INSERT INTO visa_checklist_items (
        id, tenant_id, visa_application_id, document_name, description, 
        is_required, is_received, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).bind(
            crypto.randomUUID(), tenantId, id, tItem.name, tItem.description,
            tItem.required ? 1 : 0, i, now, now
        ).run();
    }

    return c.json({ data: { id, ...body } }, 201);
});

visaRouter.get('/:id', async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const id = c.req.param('id');

    const visa = await db.prepare('SELECT * FROM visa_applications WHERE id = ? AND tenant_id = ? AND is_deleted = 0')
        .bind(id, tenantId).first();

    if (!visa) return c.json({ error: 'Visa application not found' }, 404);

    const checklist = await db.prepare('SELECT * FROM visa_checklist_items WHERE visa_application_id = ? AND tenant_id = ? ORDER BY sort_order ASC')
        .bind(id, tenantId).all();

    const documents = await db.prepare('SELECT * FROM visa_documents WHERE visa_application_id = ? AND tenant_id = ? AND is_deleted = 0')
        .bind(id, tenantId).all();

    const notes = await db.prepare('SELECT * FROM visa_notes WHERE visa_application_id = ? AND tenant_id = ? AND is_deleted = 0 ORDER BY created_at DESC')
        .bind(id, tenantId).all();

    return c.json({
        data: {
            ...visa,
            checklist: checklist.results,
            documents: documents.results,
            notes: notes.results
        }
    });
});

visaRouter.put('/:id', zValidator('json', updateVisaApplicationSchema), async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const id = c.req.param('id');
    const body = c.req.valid('json');
    const now = new Date().toISOString();

    const updates: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(body)) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        updates.push(`${snakeKey} = ?`);
        params.push(value);
    }

    if (updates.length > 0) {
        updates.push('updated_at = ?');
        params.push(now);
        params.push(id, tenantId);

        await db.prepare(`UPDATE visa_applications SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`)
            .bind(...params).run();
    }

    const updated = await db.prepare('SELECT * FROM visa_applications WHERE id = ? AND tenant_id = ?')
        .bind(id, tenantId).first();

    return c.json({ data: updated });
});

visaRouter.delete('/:id', async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const id = c.req.param('id');

    await db.prepare('UPDATE visa_applications SET is_deleted = 1, updated_at = ? WHERE id = ? AND tenant_id = ?')
        .bind(new Date().toISOString(), id, tenantId).run();

    return c.json({ success: true });
});

// Update Checklist Item Status
visaRouter.put('/:id/checklist/:itemId', zValidator('json', visaChecklistStatusSchema), async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const { id, itemId } = c.req.param();
    const { isReceived, notes } = c.req.valid('json');
    const userId = c.get('userId');
    const now = new Date().toISOString();

    let query = 'UPDATE visa_checklist_items SET is_received = ?, received_date = ?, received_by = ?, updated_at = ?';
    const params: any[] = [isReceived ? 1 : 0, isReceived ? now : null, isReceived ? userId : null, now];

    if (notes !== undefined) {
        query += ', notes = ?';
        params.push(notes);
    }

    query += ' WHERE id = ? AND visa_application_id = ? AND tenant_id = ?';
    params.push(itemId, id, tenantId);

    await db.prepare(query).bind(...params).run();

    // Check if all required items are received, auto-update master status to documents_collecting or applied
    const checklist = await db.prepare('SELECT is_required, is_received FROM visa_checklist_items WHERE visa_application_id = ? AND tenant_id = ?')
        .bind(id, tenantId).all();

    const allRequiredReceived = checklist.results
        .filter((i: any) => i.is_required === 1)
        .every((i: any) => i.is_received === 1);

    if (allRequiredReceived) {
        // Optionally auto-update status if currently 'not_started' or 'documents_collecting'
        const visa = await db.prepare('SELECT status FROM visa_applications WHERE id = ? AND tenant_id = ?').bind(id, tenantId).first();
        if (visa && (visa.status === 'not_started' || visa.status === 'documents_collecting')) {
            await db.prepare('UPDATE visa_applications SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
                .bind('applied', now, id, tenantId).run();
        }
    } else {
        const visa = await db.prepare('SELECT status FROM visa_applications WHERE id = ? AND tenant_id = ?').bind(id, tenantId).first();
        if (visa && visa.status === 'not_started') {
            await db.prepare('UPDATE visa_applications SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
                .bind('documents_collecting', now, id, tenantId).run();
        }
    }

    return c.json({ success: true, allRequiredReceived });
});

// Add Timeline Note
visaRouter.post('/:id/notes', async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const id = c.req.param('id');
    const { content } = await c.req.json();
    const userId = c.get('userId');
    const now = new Date().toISOString();

    if (!content) return c.json({ error: 'Content is required' }, 400);

    const noteId = crypto.randomUUID();
    await db.prepare(`
    INSERT INTO visa_notes (id, tenant_id, visa_application_id, content, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(noteId, tenantId, id, content, userId, now, now).run();

    return c.json({ id: noteId }, 201);
});

export default visaRouter;
