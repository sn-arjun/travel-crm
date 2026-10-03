import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
import { authMiddleware } from '../middleware/auth';
import type { AppContext } from '../types';
import {
    createVisaApplicationSchema,
    updateVisaApplicationSchema,
    visaChecklistStatusSchema
} from '../validators/visa';
import { getChecklistTemplate } from '../db/seed/visa-checklist-templates';
import { broadcastToTenant } from '../utils/realtime';
import { generateId } from '../utils/uuid';

const visaRouter = new Hono<AppContext>();
visaRouter.use('*', authMiddleware);

// Dashboard stats
visaRouter.get('/dashboard', async (c) => {
    try {
        const db = c.get('tenantDb');
        const tenantId = c.get('tenantId');
        const today = new Date().toISOString().substring(0, 10);
        const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10);

        const all = await db.prepare('SELECT status, destination_country, visa_expiry_date FROM visa_applications WHERE tenant_id = ? AND is_deleted = 0')
            .bind(tenantId).all<{ status: string; destination_country: string; visa_expiry_date?: string }>();

        const rows = all.results;
        const statusCounts: Record<string, number> = {};
        for (const r of rows) {
            statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
        }

        const expiringSoon = rows.filter((r) =>
            r.visa_expiry_date && r.visa_expiry_date >= today && r.visa_expiry_date <= in30Days
        ).length;

        const byCountry = rows.reduce<Record<string, number>>((acc, r) => {
            if (r.destination_country) acc[r.destination_country] = (acc[r.destination_country] ?? 0) + 1;
            return acc;
        }, {});

        return c.json({
            data: {
                total: rows.length,
                statusCounts,
                expiringSoon,
                byCountry,
            },
        });
    } catch (e: any) {
        console.error('Visa dashboard error:', e.message);
        return c.json({ data: { total: 0, statusCounts: {}, expiringSoon: 0, byCountry: {} } });
    }
});

// Missing documents report
visaRouter.get('/missing-documents', async (c) => {
    try {
        const db = c.get('tenantDb');
        const tenantId = c.get('tenantId');

        const results = await db.prepare(`
            SELECT va.id, va.destination_country, va.status, va.traveller_id,
                   COUNT(vci.id) as total_required,
                   SUM(CASE WHEN vci.is_received = 1 THEN 1 ELSE 0 END) as received
            FROM visa_applications va
            JOIN visa_checklist_items vci ON vci.visa_application_id = va.id AND vci.is_required = 1
            WHERE va.tenant_id = ? AND va.is_deleted = 0
              AND va.status = 'documents_collecting'
            GROUP BY va.id
            HAVING received < total_required
        `).bind(tenantId).all();

        return c.json({ data: results.results });
    } catch (e: any) {
        return c.json({ data: [] });
    }
});

visaRouter.get('/', async (c) => {
    try {
        const db = c.get('tenantDb');
        const tenantId = c.get('tenantId');
        const leadId = c.req.query('lead_id');
        const travellerId = c.req.query('traveller_id');
        const status = c.req.query('status');
        const search = c.req.query('search');
        const destinationCountry = c.req.query('destination_country');
        const page = parseInt(c.req.query('page') ?? '1', 10);
        const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);
        const offset = (page - 1) * limit;
        const sortBy = c.req.query('sort_by') ?? 'created_at';
        const sortOrder = c.req.query('sort_order') === 'asc' ? 'ASC' : 'DESC';
        const allowedSort: Record<string, string> = {
            created_at: 'created_at',
            destination_country: 'destination_country',
            status: 'status',
            expected_date: 'expected_date',
        };
        const orderCol = allowedSort[sortBy] ?? 'created_at';

        let query = 'SELECT * FROM visa_applications WHERE tenant_id = ? AND is_deleted = 0';
        const params: any[] = [tenantId];

        if (leadId) { query += ' AND lead_id = ?'; params.push(leadId); }
        if (travellerId) { query += ' AND traveller_id = ?'; params.push(travellerId); }
        if (status) { query += ' AND status = ?'; params.push(status); }
        if (destinationCountry) { query += ' AND destination_country = ?'; params.push(destinationCountry); }
        if (search) {
            query += ' AND destination_country LIKE ?';
            params.push(`%${search}%`);
        }

        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const countResult = await db.prepare(countQuery).bind(...params).first<{ total: number }>();
        const total = countResult?.total ?? 0;

        query += ` ORDER BY ${orderCol} ${sortOrder} LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const results = await db.prepare(query).bind(...params).all();
        return c.json({
            data: {
                data: results.results,
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            },
        });
    } catch (e: any) {
        console.error('Visa list error:', e.message);
        return c.json({ data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
    }
});

visaRouter.post('/', zValidator('json', createVisaApplicationSchema), async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const id = generateId();
    const now = new Date().toISOString();

    await db.prepare(`
    INSERT INTO visa_applications (
      id, tenant_id, traveller_id, lead_id, country, destination_country, visa_type,
      status, expected_date, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
        id, tenantId, body.travellerId, body.leadId || null, body.destinationCountry,
        body.destinationCountry, body.visaType, body.status || 'not_started', body.expectedDate || null,
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
            generateId(), tenantId, id, tItem.name, tItem.description,
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

// Status transition with validation
visaRouter.put('/:id/status', async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');
    const id = c.req.param('id');
    const body = await c.req.json<{
        status: string;
        visaNumber?: string;
        visaIssueDate?: string;
        visaExpiryDate?: string;
        rejectionReason?: string;
    }>();
    const now = new Date().toISOString();

    const validTransitions: Record<string, string[]> = {
        not_started: ['documents_collecting'],
        documents_collecting: ['applied'],
        applied: ['processing', 'rejected'],
        processing: ['approved', 'rejected'],
        approved: [],
        rejected: [],
    };

    const current = await db.prepare('SELECT status FROM visa_applications WHERE id = ? AND tenant_id = ? AND is_deleted = 0')
        .bind(id, tenantId).first<{ status: string }>();

    if (!current) return c.json({ error: 'Visa application not found' }, 404);

    const allowed = validTransitions[current.status] ?? [];
    if (!allowed.includes(body.status)) {
        return c.json({ error: `Cannot transition from ${current.status} to ${body.status}` }, 422);
    }

    if (body.status === 'approved' && (!body.visaNumber || !body.visaIssueDate || !body.visaExpiryDate)) {
        return c.json({ error: 'visa_number, visa_issue_date, and visa_expiry_date are required for approval' }, 422);
    }
    if (body.status === 'rejected' && !body.rejectionReason) {
        return c.json({ error: 'rejection_reason is required when rejecting' }, 422);
    }

    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const params: any[] = [body.status, now];

    if (body.status === 'approved') {
        updates.push('visa_number = ?', 'visa_issue_date = ?', 'visa_expiry_date = ?');
        params.push(body.visaNumber, body.visaIssueDate, body.visaExpiryDate);
    }
    if (body.status === 'rejected') {
        updates.push('rejection_reason = ?');
        params.push(body.rejectionReason);
    }

    params.push(id, tenantId);
    await db.prepare(`UPDATE visa_applications SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`)
        .bind(...params).run();

    // Auto-generate system note
    try {
        await db.prepare(`
            INSERT INTO visa_notes (id, tenant_id, visa_application_id, content, created_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            generateId(), tenantId, id,
            `Status changed from ${current.status} to ${body.status}`,
            userId, now, now
        ).run();
    } catch { /* ignore */ }

    // Broadcast real-time event
    try {
        await broadcastToTenant(c.env, tenantId, {
            type: 'visa:status_changed',
            data: { visaId: id, oldStatus: current.status, newStatus: body.status },
        });
    } catch {}

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

// ============================================================
// POST /:id/documents — Upload a document for a visa application
// ============================================================

visaRouter.post('/:id/documents', async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const userId = c.get('userId');
    const visaId = c.req.param('id');

    // Verify visa application exists
    const visa = await db.prepare(
        'SELECT id FROM visa_applications WHERE id = ? AND tenant_id = ? AND is_deleted = 0'
    ).bind(visaId, tenantId).first();

    if (!visa) return c.json({ error: 'Visa application not found' }, 404);

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const documentType = (formData.get('document_type') as string) || 'other';

    if (!file) {
        return c.json({ error: 'No file provided' }, 400);
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        return c.json({ error: 'File too large. Maximum 10MB' }, 400);
    }

    const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedTypes.includes(file.type)) {
        return c.json({ error: 'File type not allowed. Accepted: PDF, JPEG, PNG, WebP, DOCX' }, 400);
    }

    const docId = generateId();
    const ext = file.name.split('.').pop() || 'bin';
    const r2Key = `tenants/${tenantId}/visa/${visaId}/${docId}.${ext}`;

    // Upload to R2
    await c.env.FILE_STORAGE.put(r2Key, file.stream(), {
        httpMetadata: { contentType: file.type },
        customMetadata: { tenantId, visaApplicationId: visaId, uploadedBy: userId },
    });

    const now = new Date().toISOString();
    await db.prepare(`
        INSERT INTO visa_documents (id, tenant_id, visa_application_id, document_type, file_name, file_url, file_size, mime_type, uploaded_by, created_at, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).bind(
        docId, tenantId, visaId, documentType, file.name, r2Key, file.size, file.type, userId, now
    ).run();

    return c.json({
        data: {
            id: docId,
            visaApplicationId: visaId,
            documentType,
            fileName: file.name,
            fileUrl: r2Key,
            fileSize: file.size,
            mimeType: file.type,
            uploadedBy: userId,
            createdAt: now,
        },
    }, 201);
});

// ============================================================
// GET /:id/documents — List documents for a visa application
// ============================================================

visaRouter.get('/:id/documents', async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const visaId = c.req.param('id');

    const results = await db.prepare(`
        SELECT vd.*, u.name as uploader_name
        FROM visa_documents vd
        LEFT JOIN users u ON vd.uploaded_by = u.id
        WHERE vd.visa_application_id = ? AND vd.tenant_id = ? AND vd.is_deleted = 0
        ORDER BY vd.created_at DESC
    `).bind(visaId, tenantId).all();

    return c.json({ data: results.results || [] });
});

// ============================================================
// GET /:id/documents/:docId/download — Download a visa document from R2
// ============================================================

visaRouter.get('/:id/documents/:docId/download', async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const docId = c.req.param('docId');

    const doc = await db.prepare(
        'SELECT file_url, file_name, mime_type FROM visa_documents WHERE id = ? AND tenant_id = ? AND is_deleted = 0'
    ).bind(docId, tenantId).first<{ file_url: string; file_name: string; mime_type: string }>();

    if (!doc) {
        return c.json({ error: 'Document not found' }, 404);
    }

    const object = await c.env.FILE_STORAGE.get(doc.file_url);
    if (!object) {
        return c.json({ error: 'File not found in storage' }, 404);
    }

    return new Response(object.body as ReadableStream, {
        headers: {
            'Content-Type': doc.mime_type || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${doc.file_name}"`,
            'Cache-Control': 'private, max-age=3600',
        },
    });
});

// ============================================================
// DELETE /:id/documents/:docId — Soft delete a visa document
// ============================================================

visaRouter.delete('/:id/documents/:docId', async (c) => {
    const db = c.get('tenantDb');
    const tenantId = c.get('tenantId');
    const visaId = c.req.param('id');
    const docId = c.req.param('docId');

    const doc = await db.prepare(
        'SELECT id FROM visa_documents WHERE id = ? AND visa_application_id = ? AND tenant_id = ? AND is_deleted = 0'
    ).bind(docId, visaId, tenantId).first();

    if (!doc) {
        return c.json({ error: 'Document not found' }, 404);
    }

    await db.prepare(
        'UPDATE visa_documents SET is_deleted = 1 WHERE id = ? AND tenant_id = ?'
    ).bind(docId, tenantId).run();

    return c.json({ success: true });
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

    const noteId = generateId();
    await db.prepare(`
    INSERT INTO visa_notes (id, tenant_id, visa_application_id, content, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(noteId, tenantId, id, content, userId, now, now).run();

    return c.json({ id: noteId }, 201);
});

export default visaRouter;
