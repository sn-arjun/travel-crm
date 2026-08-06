import { drizzle } from 'drizzle-orm/d1';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../db/tenant-schema';
import * as XLSX from 'xlsx';
import type { Env } from '../types';
import { broadcastToTenant } from '../utils/realtime';

export interface ExportInvoicesMessage {
    type: 'export_invoices';
    jobId: string;
    invoiceIds: string[];
    tenantId?: string;
}

export interface ExportFullMessage {
    type: 'export_full';
    jobId: string;
    tenantId?: string;
}

export type ExportQueueMessage = ExportInvoicesMessage | ExportFullMessage;

// Helper: create an XLSX buffer from an array of objects
function toXlsxBuffer(data: Record<string, unknown>[], sheetName: string): Uint8Array {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}

function resolveTenantDb(env: Env, tenantId?: string): ReturnType<typeof drizzle> {
    if (tenantId) {
        const bindingKey = `TENANT_DB_${tenantId}` as `TENANT_DB_${string}`;
        const binding = (env as any)[bindingKey];
        if (binding) return drizzle(binding, { schema });
    }
    return drizzle(env.MASTER_DB, { schema });
}

export async function handleExportQueue(batch: MessageBatch<ExportQueueMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
        try {
            const payload = msg.body;
            // Resolve tenant DB from the queue message's tenantId
            const db = resolveTenantDb(env, payload.tenantId || undefined);
            console.log(`Processing Export Job: ${payload.jobId} [${payload.type}]`);

            // Mark job as processing
            await db.update(schema.exportJobs)
                .set({ status: 'processing', startedAt: new Date().toISOString() })
                .where(eq(schema.exportJobs.id, payload.jobId));

            let fileBuffer: ArrayBuffer;
            let fileName: string;
            let mimeType: string;
            let recordCounts: Record<string, number> = {};

            if (payload.type === 'export_invoices') {
                // Bulk invoice export — generate a single Excel workbook with invoices + line items
                const invoices = await db.query.invoices.findMany({
                    where: inArray(schema.invoices.id, payload.invoiceIds)
                });

                const invoiceIds = invoices.map(i => i.id);
                const lineItems = invoiceIds.length > 0
                    ? await db.query.invoiceItems.findMany({
                        where: inArray(schema.invoiceItems.invoiceId, invoiceIds)
                    })
                    : [];

                // Build flat invoice rows
                const invoiceRows = invoices.map(inv => ({
                    'Invoice Number': inv.invoiceNumber,
                    'Contact': inv.contactId,
                    'Status': inv.status,
                    'Due Date': inv.dueDate,
                    'Subtotal': inv.subtotal,
                    'Tax': inv.totalTax,
                    'Discount': inv.discountAmount,
                    'Total': inv.total,
                    'Paid': inv.paidAmount,
                    'Balance': inv.balanceDue,
                    'Notes': inv.notes,
                    'Created At': inv.createdAt,
                }));

                const itemRows = lineItems.map(item => ({
                    'Invoice ID': item.invoiceId,
                    'Description': item.description,
                    'Quantity': item.quantity,
                    'Unit Price': item.rate,
                    'Amount': item.amount,
                    'Tax Rate': item.taxRate,
                    'Tax Amount': item.taxAmount,
                }));

                // Build multi-sheet workbook
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoiceRows), 'Invoices');
                if (itemRows.length > 0) {
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), 'Line Items');
                }

                const u8 = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
                fileBuffer = u8.buffer as ArrayBuffer;
                fileName = `bulk_invoices_${payload.jobId}.xlsx`;
                mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                recordCounts = { invoices: invoices.length, lineItems: lineItems.length };

            } else if (payload.type === 'export_full') {
                // Full GDPR tenant data export — multi-sheet Excel workbook
                const [
                    contactsData,
                    leadsData,
                    invoicesData,
                    paymentsData,
                    suppliersData,
                    travellersData,
                    usersData,
                ] = await Promise.all([
                    db.query.contacts.findMany(),
                    db.query.leads.findMany(),
                    db.query.invoices.findMany(),
                    db.query.payments.findMany(),
                    db.query.suppliers.findMany(),
                    db.query.travellers.findMany(),
                    db.query.users.findMany(),
                ]);

                // Strip sensitive fields from users
                const safeUsers = usersData.map(u => ({
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    isActive: u.isActive,
                    createdAt: u.createdAt,
                }));

                const wb = XLSX.utils.book_new();

                const sheets: { name: string; data: any[] }[] = [
                    { name: 'Contacts', data: contactsData },
                    { name: 'Leads', data: leadsData },
                    { name: 'Invoices', data: invoicesData },
                    { name: 'Payments', data: paymentsData },
                    { name: 'Suppliers', data: suppliersData },
                    { name: 'Travellers', data: travellersData },
                    { name: 'Users', data: safeUsers },
                ];

                for (const sheet of sheets) {
                    const ws = XLSX.utils.json_to_sheet(sheet.data.length > 0 ? sheet.data : [{}]);
                    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
                    recordCounts[sheet.name.toLowerCase()] = sheet.data.length;
                }

                // Add metadata sheet
                const metadataRows = [
                    { field: 'Exported At', value: new Date().toISOString() },
                    { field: 'Export Job ID', value: payload.jobId },
                    { field: 'GDPR Compliance', value: 'true' },
                    ...Object.entries(recordCounts).map(([k, v]) => ({ field: `${k} count`, value: String(v) })),
                ];
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metadataRows), 'Metadata');

                const u8 = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
                fileBuffer = u8.buffer as ArrayBuffer;
                fileName = `tenant_full_export_${payload.jobId}.xlsx`;
                mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            } else {
                throw new Error('Unknown export type');
            }

            // Upload to R2
            const r2Key = `exports/${payload.jobId}/${fileName}`;
            await env.FILE_STORAGE.put(r2Key, fileBuffer, {
                httpMetadata: { contentType: mimeType }
            });

            // Mark job as completed
            await db.update(schema.exportJobs)
                .set({
                    status: 'completed',
                    fileUrl: r2Key,
                    fileSizeBytes: fileBuffer.byteLength,
                    recordCounts: JSON.stringify(recordCounts),
                    completedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                })
                .where(eq(schema.exportJobs.id, payload.jobId));

            // Broadcast completion
            await broadcastToTenant(env, payload.tenantId || 'default', {
                type: 'export:completed',
                data: { jobId: payload.jobId, status: 'completed', fileUrl: r2Key, recordCounts },
            });

            msg.ack();
            console.log(`Completed Export Job: ${payload.jobId}`);
        } catch (error) {
            console.error(`Error processing export message ${msg.id}:`, error);

            if (msg.body?.jobId) {
                const fallbackDb = resolveTenantDb(env, msg.body?.tenantId || undefined);
                await fallbackDb.update(schema.exportJobs)
                    .set({
                        status: 'failed',
                        completedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    })
                    .where(eq(schema.exportJobs.id, msg.body.jobId));
            }
            // Broadcast failure
            if (msg.body?.tenantId) {
                await broadcastToTenant(env, msg.body.tenantId, {
                    type: 'export:failed',
                    data: { jobId: msg.body.jobId, status: 'failed' },
                });
            }
            msg.retry();
        }
    }
}
