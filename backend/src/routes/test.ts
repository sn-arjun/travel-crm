import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm';
import { users } from '../db/tenant-schema';
import type { Env } from '../types';
import bcrypt from 'bcryptjs';

const testApp = new Hono<{ Bindings: Env }>();

/**
 * CAUTION: This endpoint COMPLETELY DESTROYS the current database and seeds it.
 * It is aggressively protected and only accessible when running in specific test environments.
 */
testApp.post('/reset', async (c) => {
    // Add an extra layer of security: Ensure the custom TEST_MODE binding is true
    if (c.env.TEST_MODE !== 'true') {
        return c.json({ error: 'Forbidden: Test mode is not active.' }, 403);
    }

    const db = drizzle(c.env.MASTER_DB);

    // 1. Wipe all data (SQLite PRAGMA or DROP TABLE sequence might be needed, but for D1 dropping/recreating via migrations is pure. 
    // For the sake of E2E speed, let's just delete from all known tables in sequence)
    try {
        const tables = [
            'tenant_users', 'shared_contacts', 'activities',
            'invoice_items', 'payments', 'invoices',
            'hotel_voucher_details', 'transport_voucher_details', 'flight_voucher_details', 'activity_voucher_details', 'vouchers',
            'reconciliations', 'supplier_ledger', 'supplier_documents', 'rate_cards', 'suppliers',
            'visa_checklist_items', 'visa_documents', 'visa_notes', 'visa_applications',
            'traveller_documents', 'travellers',
            'leads', 'contacts', 'expiry_alerts_log', 'users', 'tenants'
        ];

        // Disable foreign keys temporarily for aggressive wiping
        await db.run(sql`PRAGMA foreign_keys = OFF`);
        for (const table of tables) {
            try {
                await db.run(sql.raw(`DELETE FROM ${table}`));
            } catch (e: any) {
                // Ignore errors if the table doesn't exist yet
                if (!e.message.includes('no such table')) {
                    console.error(`Error deleting from ${table}:`, e.message);
                }
            }
        }
        await db.run(sql`PRAGMA foreign_keys = ON`);

        // 2. Seed Tenant and Admin User (use INSERT OR REPLACE for idempotency in shared-storage test envs)
        const tenantId = '00000000-0000-0000-0000-000000000000';
        await db.run(sql`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, created_at, updated_at) VALUES (${tenantId}, 'Test Agency', 'test-agency', 'pro', 'active', datetime('now'), datetime('now'))`);

        // Seed standard E2E Admin user
        const adminPassword = await bcrypt.hash('password123', 10);
        await db.run(sql`INSERT OR REPLACE INTO users (id, email, password_hash, role, name, is_active, language, created_at, updated_at) VALUES ('11111111-1111-1111-1111-111111111111', 'admin@e2e.test', ${adminPassword}, 'admin', 'E2E Admin', 1, 'en', datetime('now'), datetime('now'))`);

        await db.run(sql`INSERT OR REPLACE INTO tenant_users (id, tenant_id, email, user_id, role, is_active, created_at) VALUES ('22222222-2222-2222-2222-222222222222', ${tenantId}, 'admin@e2e.test', '11111111-1111-1111-1111-111111111111', 'admin', 1, datetime('now'))`);

        // Seed salesperson user for RBAC testing
        const spPassword = await bcrypt.hash('password123', 10);
        await db.run(sql`INSERT OR REPLACE INTO users (id, email, password_hash, role, name, is_active, language, created_at, updated_at) VALUES ('33333333-3333-3333-3333-333333333333', 'sales@e2e.test', ${spPassword}, 'salesperson', 'E2E Salesperson', 1, 'en', datetime('now'), datetime('now'))`);
        await db.run(sql`INSERT OR REPLACE INTO tenant_users (id, tenant_id, email, user_id, role, is_active, created_at) VALUES ('44444444-4444-4444-4444-444444444444', ${tenantId}, 'sales@e2e.test', '33333333-3333-3333-3333-333333333333', 'salesperson', 1, datetime('now'))`);

        // Seed view_only user for RBAC testing
        const voPassword = await bcrypt.hash('password123', 10);
        await db.run(sql`INSERT OR REPLACE INTO users (id, email, password_hash, role, name, is_active, language, created_at, updated_at) VALUES ('55555555-5555-5555-5555-555555555555', 'viewer@e2e.test', ${voPassword}, 'view_only', 'E2E Viewer', 1, 'en', datetime('now'), datetime('now'))`);
        await db.run(sql`INSERT OR REPLACE INTO tenant_users (id, tenant_id, email, user_id, role, is_active, created_at) VALUES ('66666666-6666-6666-6666-666666666666', ${tenantId}, 'viewer@e2e.test', '55555555-5555-5555-5555-555555555555', 'view_only', 1, datetime('now'))`);

        // [ui-remake] Additionally seed the DEMO tenant used by the desktop
        // Playwright suite. desktop/e2e/helpers/auth.ts hardcodes these values,
        // so without this seed the entire desktop E2E layer cannot use /reset
        // and no run is deterministic. Purely additive — the e2e.test tenant
        // above is untouched so backend/test/*.test.ts keeps passing.
        const demoTenantId = '01960000-0000-7000-8000-000000000001';
        await db.run(sql`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, max_users, created_at, updated_at) VALUES (${demoTenantId}, 'Demo Travels', 'demo', 'enterprise', 'active', 25, datetime('now'), datetime('now'))`);

        const demoAdminId = '01960000-0000-7000-8000-0000000000a1';
        const demoAdminPassword = await bcrypt.hash('Admin@123', 10);
        await db.run(sql`INSERT OR REPLACE INTO users (id, email, password_hash, role, name, is_active, language, created_at, updated_at) VALUES (${demoAdminId}, 'admin@demo.com', ${demoAdminPassword}, 'admin', 'Demo Admin', 1, 'en', datetime('now'), datetime('now'))`);
        await db.run(sql`INSERT OR REPLACE INTO tenant_users (id, tenant_id, email, user_id, role, is_active, created_at) VALUES ('01960000-0000-7000-8000-0000000000a2', ${demoTenantId}, 'admin@demo.com', ${demoAdminId}, 'admin', 1, datetime('now'))`);

        return c.json({ success: true, message: 'Test database reset and seeded successfully' });
    } catch (error: any) {
        console.error("Reset endpoint caught error:", error?.message, error?.cause);
        return c.json({ error: error?.message, cause: error?.cause?.message || String(error?.cause) }, 500);
    }
});

export default testApp;
