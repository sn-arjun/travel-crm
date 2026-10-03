import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import { eq, desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { AppContext } from '../types';
import * as schema from '../db/tenant-schema';
import { success, error } from '../utils/response';
import * as XLSX from 'xlsx';
import { FileParser } from '../services/imports/file-parser';
import { TemplateGenerator } from '../services/imports/template-generator';
import { generateId } from '../utils/uuid';

const importRoutes = new Hono<AppContext>();

// GET /api/v1/imports - List recent imports
importRoutes.get('/', async (c) => {
    const db = drizzle(c.get('tenantDb') as any, { schema });

    const jobs = await db.query.importJobs.findMany({
        orderBy: [desc(schema.importJobs.createdAt)],
        limit: 50,
    });

    return success(c, jobs);
});

// POST /api/v1/imports/upload - Upload and parse headers
importRoutes.post('/upload', async (c) => {
    const db = drizzle(c.get('tenantDb') as any, { schema });
    const userId = c.get('userId') || 'system';

    try {
        const formData = await c.req.formData();
        const file = formData.get('file');
        const importType = formData.get('importType');

        if (!file || typeof file === 'string') {
            return error(c, 'File is required', 400);
        }
        if (!importType || typeof importType !== 'string') {
            return error(c, 'importType is required', 400);
        }

        // Cast to File — CF Workers supports File in FormData at runtime
        const uploadedFile = file as unknown as { arrayBuffer(): Promise<ArrayBuffer>; name: string };
        const buffer = await uploadedFile.arrayBuffer();
        const fileExt = uploadedFile.name.split('.').pop()?.toLowerCase();

        if (fileExt !== 'csv' && fileExt !== 'xlsx' && fileExt !== 'xls') {
            return error(c, 'Invalid file type. Only CSV and Excel are supported.', 400);
        }

        // Attempt to parse headers immediately to return them to UI
        const parser = new FileParser();
        const parseResult = await parser.parseFile(buffer, uploadedFile.name);

        if (parseResult.headers.length === 0) {
            return error(c, 'No valid headers found in the file', 400);
        }

        // Upload to R2
        const fileObj = file as any;
        const fileKey = `imports/${userId}/${Date.now()}_${uploadedFile.name}`;
        await c.env.FILE_STORAGE.put(fileKey, buffer, {
            httpMetadata: { contentType: fileObj.type }
        });

        // Create tracking record
        const jobId = generateId();
        const tenantId = c.get('tenantId') || '';
        await db.insert(schema.importJobs).values({
            id: jobId,
            tenantId,
            importType,
            fileName: uploadedFile.name,
            fileUrl: fileKey,
            fileSizeBytes: fileObj.size,
            totalRows: parseResult.totalRows,
            status: 'pending',
            createdBy: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        return success(c, {
            jobId,
            headers: parseResult.headers,
            totalRows: parseResult.totalRows,
            previewData: parseResult.data.slice(0, 5) // Return first 5 rows for UI preview if needed
        });
    } catch (err: any) {
        console.error('Upload Error:', err);
        return error(c, err.message || 'File upload failed', 500);
    }
});

// POST /api/v1/imports/:id/execute - Start the import queue process
importRoutes.post(
    '/:id/execute',
    zValidator(
        'json',
        z.object({
            columnMapping: z.record(z.string(), z.string()).optional(),
            duplicateStrategy: z.enum(['skip', 'merge', 'create']).default('skip'),
        })
    ),
    async (c) => {
        const db = drizzle(c.get('tenantDb') as any, { schema });
        const jobId = c.req.param('id');
        const { columnMapping, duplicateStrategy } = c.req.valid('json');

        const job = await db.query.importJobs.findFirst({
            where: eq(schema.importJobs.id, jobId)
        });

        if (!job) return error(c, 'Import job not found', 404);
        if (job.status !== 'pending') return error(c, `Cannot execute job in ${job.status} status`, 400);

        // Save configuration
        await db.update(schema.importJobs)
            .set({
                columnMapping: columnMapping ? JSON.stringify(columnMapping) : null,
                duplicateStrategy,
                status: 'validating', // Marking as starting
                updatedAt: new Date().toISOString()
            })
            .where(eq(schema.importJobs.id, jobId));

        // Send to Queue (include tenantId so the consumer can resolve the correct DB)
        await c.env.IMPORT_QUEUE.send({
            type: 'import',
            data: { jobId, tenantId: c.get('tenantId') || '' }
        });

        return success(c, { message: 'Import queued successfully', jobId });
    }
);

// GET /api/v1/imports/:id/progress - Get progress
importRoutes.get('/:id/progress', async (c) => {
    const db = drizzle(c.get('tenantDb') as any, { schema });
    const jobId = c.req.param('id');

    const job = await db.query.importJobs.findFirst({
        where: eq(schema.importJobs.id, jobId)
    });

    if (!job) return error(c, 'Import job not found', 404);

    return success(c, job);
});

// GET /api/v1/imports/:id/errors - Get errors
importRoutes.get('/:id/errors', async (c) => {
    const db = drizzle(c.get('tenantDb') as any, { schema });
    const jobId = c.req.param('id');

    const errors = await db.query.importErrors.findMany({
        where: eq(schema.importErrors.importJobId, jobId),
        limit: 1000 // Simple cap
    });

    return success(c, errors);
});

// GET /api/v1/imports/:id/errors/download - Download errors as Excel
importRoutes.get('/:id/errors/download', async (c) => {
    const db = drizzle(c.get('tenantDb') as any, { schema });
    const jobId = c.req.param('id');

    // Resolve import type for filename
    const job = await db.query.importJobs.findFirst({
        where: eq(schema.importJobs.id, jobId),
        columns: { importType: true }
    });

    const errors = await db.query.importErrors.findMany({
        where: eq(schema.importErrors.importJobId, jobId),
        limit: 10000, // Max 10,000 rows per spec
    });

    if (errors.length === 0) {
        // Return 204 No Content per spec instead of 404
        return c.body(null, 204);
    }

    try {
        const errorData = errors.map(err => {
            let rowData = {};
            try { rowData = JSON.parse(err.rowData); } catch (e) { }
            let errMsgs = '';
            try {
                const parsedErrors = JSON.parse(err.errors);
                if (Array.isArray(parsedErrors)) {
                    errMsgs = parsedErrors.map(e => `${e.field}: ${e.message}`).join(', ');
                } else {
                    errMsgs = err.errors;
                }
            } catch (e) { errMsgs = err.errors; }

            return {
                'Row Number': err.rowNumber,
                ...rowData,
                'Errors': errMsgs
            };
        });

        const ws = XLSX.utils.json_to_sheet(errorData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Failed Rows'); // Per spec sheet name

        const u8: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        const importType = job?.importType ?? 'import';

        c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        c.header('Content-Disposition', `attachment; filename="${importType}_errors_${jobId}.xlsx"`);

        return c.body(u8.buffer as ArrayBuffer);
    } catch (err: any) {
        return error(c, err.message || 'Failed to generate error file', 500);
    }
});

// POST /api/v1/imports/:id/cancel - Cancel an in-progress import
importRoutes.post('/:id/cancel', async (c) => {
    const db = drizzle(c.get('tenantDb') as any, { schema });
    const jobId = c.req.param('id');

    const job = await db.query.importJobs.findFirst({
        where: eq(schema.importJobs.id, jobId)
    });

    if (!job) return error(c, 'Import job not found', 404);
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        return error(c, `Cannot cancel a job with status '${job.status}'`, 400);
    }

    await db.update(schema.importJobs)
        .set({ status: 'cancelled', updatedAt: new Date().toISOString() })
        .where(eq(schema.importJobs.id, jobId));

    return success(c, { message: 'Import cancelled', jobId });
});

// GET /api/v1/imports/templates/:type - Get template file
importRoutes.get('/templates/:type', async (c) => {
    const type = c.req.param('type');

    try {
        const generator = new TemplateGenerator();
        const buffer = generator.generateTemplate(type);

        c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        c.header('Content-Disposition', `attachment; filename="${type}_import_template.xlsx"`);

        return c.body(buffer.buffer as ArrayBuffer);
    } catch (err: any) {
        return error(c, err.message || 'Failed to generate template', 400);
    }
});

export default importRoutes;
