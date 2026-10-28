import { eq } from 'drizzle-orm';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import type { Env } from '../types';
import { resolveTenantDb as resolveTenantD1 } from '../services/tenant-db';
import { loadLocaleContext } from '../utils/money';
import * as schema from '../db/tenant-schema';
import { FileParser } from '../services/imports/file-parser';
import { ImportValidator } from '../services/imports/import-validator';
import { DuplicateDetector, type DuplicateStrategy } from '../services/imports/duplicate-detector';
import { RowInserter } from '../services/imports/row-inserter';
import { broadcastToTenant } from '../utils/realtime';
import { generateId } from '../utils/uuid';

export interface ImportJobMessage {
    jobId: string;
    tenantId?: string;
}

export async function handleImportQueue(batch: MessageBatch<any>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
        try {
            const payload = msg.body?.data ?? msg.body;
            await handleImportJob(payload as ImportJobMessage, env);
            msg.ack();
        } catch (error) {
            console.error(`Import queue message failed:`, error);
            msg.retry();
        }
    }
}

type TenantDb = DrizzleD1Database<typeof schema>;

/** Tenant database for a queue message. Null (job dropped, never run on MASTER_DB) when the tenant does not resolve. */
async function resolveTenantDb(env: Env, tenantId?: string): Promise<TenantDb | null> {
    if (!tenantId) return null;
    const binding = await resolveTenantD1(env, tenantId);
    return binding ? drizzle(binding, { schema }) : null;
}

export async function handleImportJob(data: ImportJobMessage, env: Env): Promise<void> {
    const jobId = data.jobId;
    // Use tenantId from the queue message to resolve the correct tenant DB
    const rawDb = data.tenantId ? await resolveTenantD1(env, data.tenantId) : null;
    const db: TenantDb | null = rawDb ? drizzle(rawDb, { schema }) : null;
    if (!db || !rawDb) {
        console.error(`Import job ${jobId}: tenant ${data.tenantId} has no resolvable database; dropped`);
        return;
    }

    const job = await db.query.importJobs.findFirst({
        where: eq(schema.importJobs.id, jobId)
    });

    if (!job || job.status !== 'pending' && job.status !== 'validating') {
        console.log(`Job ${jobId} not found or not in pending state.`);
        return;
    }

    try {
        // 1. Mark as importing
        await db.update(schema.importJobs)
            .set({ status: 'importing', startedAt: new Date().toISOString() })
            .where(eq(schema.importJobs.id, jobId));

        // 2. Fetch file from R2
        const fileUrl = job.fileUrl; // This assumes it's an R2 key (e.g., 'imports/123/sheet.xlsx')
        const object = await env.FILE_STORAGE.get(fileUrl);
        if (!object) {
            throw new Error(`File not found in storage: ${fileUrl}`);
        }
        const buffer = await object.arrayBuffer();

        // 3. Initialize Services
        const agencyCurrency = (await loadLocaleContext(rawDb)).currency;
        const parser = new FileParser();
        const validator = new ImportValidator();
        const duplicateDetector = new DuplicateDetector();
        const rowInserter = new RowInserter(agencyCurrency);

        // 4. Parse file
        const parseResult = await parser.parseFile(buffer, job.fileName);
        const parsedData = parseResult.data;

        let successCount = 0;
        let errorCount = 0;
        let duplicateCount = 0;

        const mapping = job.columnMapping ? JSON.parse(job.columnMapping) : undefined;
        const strategy = job.duplicateStrategy as DuplicateStrategy;

        // 5. Process Rows
        for (let i = 0; i < parsedData.length; i++) {
            const rawRow = parsedData[i];
            const rowNum = i + 2; // +1 for 0-index, +1 for header row

            const validationRes = await validator.validateRow(job.importType, rawRow, mapping);

            if (!validationRes.isValid) {
                errorCount++;
                await db.insert(schema.importErrors).values({
                    id: generateId(),
                    importJobId: jobId,
                    rowNumber: rowNum,
                    rowData: JSON.stringify(rawRow),
                    errors: JSON.stringify(validationRes.errors)
                });
                continue;
            }

            const dupCheck = await duplicateDetector.checkDuplicate(db, job.importType, validationRes.validData, strategy);

            if (dupCheck.isDuplicate) {
                duplicateCount++;
                if (dupCheck.action === 'skip') {
                    continue; // We successfully skipped it without error
                }
            }

            // Action is either create or merge
            const inserted = await rowInserter.insertRow(
                db,
                job.importType,
                validationRes.validData,
                dupCheck.action,
                dupCheck.duplicateId,
                job.createdBy,
                job.tenantId
            );

            if (inserted) {
                successCount++;
            } else {
                // Technically shouldn't happen unless skipped which is caught above
            }

            // Update progress every 100 rows to prevent overwhelming the DB, or just update at the end for small files
            if (i > 0 && i % 100 === 0) {
                await db.update(schema.importJobs)
                    .set({ processedRows: i + 1 })
                    .where(eq(schema.importJobs.id, jobId));
                // Broadcast progress
                await broadcastToTenant(env, data.tenantId || 'default', {
                    type: 'import:progress',
                    data: { jobId, processed: i + 1, total: parsedData.length, status: 'importing' },
                });
            }
        }

        // 6. Complete
        await db.update(schema.importJobs)
            .set({
                status: 'completed',
                completedAt: new Date().toISOString(),
                totalRows: parsedData.length,
                processedRows: parsedData.length,
                successCount,
                errorCount,
                duplicateCount
            })
            .where(eq(schema.importJobs.id, jobId));

        // Broadcast completion
        await broadcastToTenant(env, data.tenantId || 'default', {
            type: 'import:completed',
            data: { jobId, total: parsedData.length, successCount, errorCount, duplicateCount, status: 'completed' },
        });

    } catch (error: any) {
        console.error(`Import job ${jobId} failed completely:`, error);
        await db.update(schema.importJobs)
            .set({
                status: 'failed',
                completedAt: new Date().toISOString(),
                // Cannot reliably set error count here if it fails critically before parsing finishes
            })
            .where(eq(schema.importJobs.id, jobId));

        // Broadcast failure
        await broadcastToTenant(env, data.tenantId || 'default', {
            type: 'import:failed',
            data: { jobId, status: 'failed', error: error.message || 'Import failed' },
        });

        // Optionally create a general error row
        await db.insert(schema.importErrors).values({
            id: generateId(),
            importJobId: jobId,
            rowNumber: 0, // 0 for general error
            rowData: '{}',
            errors: JSON.stringify([{ field: 'system', message: error.message || 'Critical failure during import' }])
        });
    }
}
