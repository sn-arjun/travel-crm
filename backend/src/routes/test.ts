import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm';
import { users } from '../db/tenant-schema';
import type { Env } from '../types';
import bcrypt from 'bcryptjs';
import { resolveTenantDb } from '../services/tenant-db';
import { ingestInbound, type InboundChannel } from '../services/inbound/ingest';

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
        // Discover every real table (local dev shares one DB between master and tenant
        // schemas, so a hardcoded list misses tables that reference users/tenants).
        const found = await db.all<{ name: string; sql: string | null }>(
            sql`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'`,
        );
        let pending = found
            .filter((r) => !/^CREATE VIRTUAL/i.test(r.sql ?? '') && !r.name.includes('_fts'))
            .map((r) => r.name);

        // PRAGMA foreign_keys does not persist across D1 statements, so delete in
        // repeated passes: children succeed first, parents succeed once children are gone.
        for (let pass = 0; pass < 10 && pending.length > 0; pass++) {
            const failed: string[] = [];
            let lastError = '';
            for (const table of pending) {
                try {
                    await db.run(sql.raw(`DELETE FROM "${table}"`));
                } catch (e: any) {
                    if (/FOREIGN KEY/i.test(e?.message ?? '') || /FOREIGN KEY/i.test(e?.cause?.message ?? '')) {
                        failed.push(table);
                        lastError = e.message;
                    } else {
                        console.error(`Error deleting from ${table}:`, e.message);
                    }
                }
            }
            if (failed.length === pending.length) {
                console.error(`Reset could not clear: ${failed.join(', ')} — ${lastError}`);
                break;
            }
            pending = failed;
        }

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

/**
 * Simulate a message arriving on a channel, exactly as the provider webhooks store it.
 * Used by tests and demos; no provider account or signature is involved.
 */
testApp.post('/inbound', async (c) => {
    if (c.env.TEST_MODE !== 'true') {
        return c.json({ error: 'Forbidden: Test mode is not active.' }, 403);
    }

    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    const str = (key: string): string => (body && typeof body[key] === 'string' ? (body[key] as string).trim() : '');
    const channel = str('channel') as InboundChannel;
    if (!['whatsapp', 'sms', 'email'].includes(channel)) {
        return c.json({ error: 'channel must be whatsapp, sms or email' }, 400);
    }
    if (!str('tenantId') || !str('from') || !str('body')) {
        return c.json({ error: 'tenantId, from and body are required' }, 400);
    }

    const db = await resolveTenantDb(c.env, str('tenantId'));
    if (!db) return c.json({ error: 'Tenant not found' }, 404);

    const result = await ingestInbound(c.env, str('tenantId'), db, {
        channel,
        from: str('from'),
        to: str('to') || undefined,
        fromName: str('fromName') || undefined,
        subject: str('subject') || undefined,
        body: str('body'),
        externalId: str('externalId') || undefined,
        provider: 'simulator',
    });

    return c.json({ success: true, data: result });
});

export default testApp;
