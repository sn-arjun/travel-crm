import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { AppContext } from '../types';
import * as schema from '../db/tenant-schema';
import { success, error } from '../utils/response';
import * as XLSX from 'xlsx';
import { generateId } from '../utils/uuid';

const exportRoutes = new Hono<AppContext>();

// GET /api/v1/exports/contacts - Export contacts
exportRoutes.get('/contacts', async (c) => {
    const tenantDb = c.get('tenantDb') as any;
    const db = drizzle(tenantDb, { schema });

    const contacts = await db.query.contacts.findMany();

    const format = c.req.query('format') === 'csv' ? 'csv' : 'xlsx';
    const ws = XLSX.utils.json_to_sheet(contacts);

    if (format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(ws);
        c.header('Content-Type', 'text/csv');
        c.header('Content-Disposition', 'attachment; filename="contacts_export.csv"');
        return c.body(csv);
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts');

    const u8: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', 'attachment; filename="contacts_export.xlsx"');

    return c.body(u8.buffer as ArrayBuffer);
});

// GET /api/v1/exports/leads - Export leads
exportRoutes.get('/leads', async (c) => {
    const tenantDb = c.get('tenantDb') as any;
    const db = drizzle(tenantDb, { schema });

    const idsParam = c.req.query('ids');

    let query = db.select({
        id: schema.leads.id,
        title: schema.leads.title,
        status: schema.leads.status,
        budget: schema.leads.budget,
        createdAt: schema.leads.createdAt,
        contactName: schema.contacts.name,
        contactEmail: schema.contacts.email,
        contactPhone: schema.contacts.phone,
    }).from(schema.leads)
        .leftJoin(schema.contacts, eq(schema.leads.contactId, schema.contacts.id));

    // Filter by specific IDs if provided (for selected export)
    if (idsParam) {
        const ids = idsParam.split(',').map(id => id.trim()).filter(Boolean);
        if (ids.length > 0) {
            query = query.where(inArray(schema.leads.id, ids)) as any;
        }
    }

    const leads = await query;

    const flatData = leads.map(l => ({
        ID: l.id,
        Title: l.title,
        Status: l.status,
        Budget: l.budget,
        ContactName: l.contactName,
        ContactEmail: l.contactEmail,
        ContactPhone: l.contactPhone,
        CreatedAt: l.createdAt
    }));

    const format = c.req.query('format') === 'csv' ? 'csv' : 'xlsx';
    const ws = XLSX.utils.json_to_sheet(flatData);

    if (format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(ws);
        c.header('Content-Type', 'text/csv');
        c.header('Content-Disposition', 'attachment; filename="leads_export.csv"');
        return c.body(csv);
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');

    const u8: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', 'attachment; filename="leads_export.xlsx"');

    return c.body(u8.buffer as ArrayBuffer);
});

// POST /api/v1/exports/invoices/bulk-pdf - Queue bulk PDF zip
exportRoutes.post('/invoices/bulk-pdf', async (c) => {
    const tenantDb = c.get('tenantDb') as any;
    const db = drizzle(tenantDb, { schema });
    const userId = c.get('userId') || 'system';
    const { invoiceIds } = await c.req.json();

    if (!invoiceIds || !Array.isArray(invoiceIds)) {
        return error(c, 'invoiceIds must be an array', 400);
    }

    const now = new Date().toISOString();
    const jobId = generateId();
    const tenantId = c.get('tenantId') || '';
    await db.insert(schema.exportJobs).values({
        id: jobId,
        tenantId,
        exportType: 'invoices',
        status: 'pending',
        createdBy: userId,
        createdAt: now,
        updatedAt: now
    });

    await c.env.EXPORT_QUEUE.send({
        type: 'export_invoices',
        jobId,
        invoiceIds,
        tenantId
    });

    // Return the full job object so Flutter can parse it as ExportJobModel
    const job = await db.query.exportJobs.findFirst({
        where: eq(schema.exportJobs.id, jobId)
    });

    return success(c, job);
});

// POST /api/v1/exports/full - Request full GDPR export
exportRoutes.post('/full', async (c) => {
    const tenantDb = c.get('tenantDb') as any;
    const db = drizzle(tenantDb, { schema });
    const userId = c.get('userId') || 'system';

    const now = new Date().toISOString();
    const jobId = generateId();
    const tenantId = c.get('tenantId') || '';
    await db.insert(schema.exportJobs).values({
        id: jobId,
        tenantId,
        exportType: 'tenant_full',
        status: 'pending',
        createdBy: userId,
        createdAt: now,
        updatedAt: now
    });

    await c.env.EXPORT_QUEUE.send({
        type: 'export_full',
        jobId,
        tenantId
    });

    // Return the full job object so Flutter can parse it as ExportJobModel
    const job = await db.query.exportJobs.findFirst({
        where: eq(schema.exportJobs.id, jobId)
    });

    return success(c, job);
});

// GET /api/v1/exports/jobs/:id - Check status and get download URL
exportRoutes.get('/jobs/:id', async (c) => {
    const tenantDb = c.get('tenantDb') as any;
    const db = drizzle(tenantDb, { schema });
    const jobId = c.req.param('id');

    const job = await db.query.exportJobs.findFirst({
        where: eq(schema.exportJobs.id, jobId)
    });

    if (!job) return error(c, 'Export job not found', 404);

    return success(c, job);
});

// GET /api/v1/exports/jobs/:id/download - Download the exported file (authenticated)
exportRoutes.get('/jobs/:id/download', async (c) => {
    const tenantDb = c.get('tenantDb') as any;
    const db = drizzle(tenantDb, { schema });
    const jobId = c.req.param('id');

    const job = await db.query.exportJobs.findFirst({
        where: eq(schema.exportJobs.id, jobId)
    });

    if (!job) return error(c, 'Export job not found', 404);
    if (job.status !== 'completed') return error(c, 'Export is not ready for download', 400);
    if (!job.fileUrl) return error(c, 'No file available for this export', 404);

    // Fetch from R2
    const object = await c.env.FILE_STORAGE.get(job.fileUrl);
    if (!object) return error(c, 'Export file not found in storage', 404);

    const fileName = job.fileUrl.split('/').pop() || `export_${jobId}.xlsx`;

    return new Response(object.body as ReadableStream, {
        headers: {
            'Content-Type': object.httpMetadata?.contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Cache-Control': 'no-cache',
        },
    });
});

export default exportRoutes;
