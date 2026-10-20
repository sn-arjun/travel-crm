import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { sql } from 'drizzle-orm';
import { users } from '../db/tenant-schema';
import type { Env } from '../types';
import { isTestMode } from '../utils/test-mode';
import bcrypt from 'bcryptjs';
import { resolveTenantDb } from '../services/tenant-db';
import { listOutbox, clearOutbox } from '../services/mail/transactional';
import { signAccessToken } from '../utils/jwt';
import { signSuperAdminToken } from '../services/admin/session';
import { ingestInbound, type InboundChannel } from '../services/inbound/ingest';
import { simulateVoipScenario, ALL_VOIP_SCENARIOS, type VoipScenario } from '../services/voip/simulator';
import { MOCK_AUTH_TOKEN } from '../services/voip/mock-provider';
import { loadVoipSettings } from '../services/voip-provider';

const testApp = new Hono<{ Bindings: Env }>();

/**
 * CAUTION: This endpoint COMPLETELY DESTROYS the current database and seeds it.
 * It is aggressively protected and only accessible when running in specific test environments.
 */
// Plan catalogue tables (R109) are reference data seeded by migration 0015: a reset keeps them,
// otherwise every plan, price and allowance would vanish and nothing could be gated or priced.
const CATALOGUE_TABLES = new Set(['plans', 'plan_prices', 'plan_features', 'plan_allowances', 'comm_unit_costs', 'addon_products', 'catalogue_notes', 'call_country_policy']);

testApp.post('/reset', async (c) => {
    // Add an extra layer of security: Ensure the custom TEST_MODE binding is true
    if (!isTestMode(c.env)) {
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
            .filter((r) => !/^CREATE VIRTUAL/i.test(r.sql ?? '') && !r.name.includes('_fts') && !CATALOGUE_TABLES.has(r.name))
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
    if (!isTestMode(c.env)) {
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

/**
 * Give an agency a number in the platform's number registry (TEST_MODE only), as the purchase path would, so a test or a
 * local stack can register it as a voice line (R305: POST /integrations/channels refuses numbers the agency does not own).
 * Body: { tenantId, phoneNumber, country? }. Idempotent.
 */
testApp.post('/voip/own-number', async (c) => {
    if (!isTestMode(c.env)) return c.json({ error: 'Forbidden: Test mode is not active.' }, 403);
    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';
    const phoneNumber = typeof body?.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
    if (!tenantId || !/^\+[1-9][0-9]{7,14}$/.test(phoneNumber)) return c.json({ error: 'tenantId and an E.164 phoneNumber are required' }, 400);
    const country = typeof body?.country === 'string' && body.country ? body.country.toUpperCase() : 'GB';
    const { generateId } = await import('../utils/uuid');
    await c.env.MASTER_DB
        .prepare(
            `INSERT OR IGNORE INTO voip_number_registry (id, tenant_id, phone_number, country, status, idempotency_key, paid_through)
             VALUES (?, ?, ?, ?, 'active', ?, ?)`,
        )
        .bind(generateId(), tenantId, phoneNumber, country, `test-own:${tenantId}:${phoneNumber}`, new Date().toISOString().slice(0, 7))
        .run();
    return c.json({ success: true });
});

/**
 * Play a whole phone call as the provider would (TEST_MODE only): posts the signed callbacks of a scenario to the
 * real callback routes in order. inbound_*: from is the caller, to is the agency's number. outbound_*: from is
 * the agency's number, to is the customer; pass callSid (the id placeCall returned) to update that call's log.
 * Body: { scenario, to, from, durationSeconds?, callSid?, tenantId?, withRecording? }. tenantId only selects whose provider
 * token signs the callbacks; without it the platform token does.
 */
testApp.post('/voip/simulate', async (c) => {
    if (!isTestMode(c.env)) return c.json({ error: 'Forbidden: Test mode is not active.' }, 403);

    const body = await c.req.json().catch(() => null) as Record<string, unknown> | null;
    const str = (key: string): string => (body && typeof body[key] === 'string' ? (body[key] as string).trim() : '');
    const scenario = str('scenario') as VoipScenario;
    if (!ALL_VOIP_SCENARIOS.includes(scenario)) return c.json({ error: `scenario must be one of ${ALL_VOIP_SCENARIOS.join(', ')}` }, 400);
    const e164 = /^\+[1-9][0-9]{7,14}$/;
    if (!e164.test(str('to')) || !e164.test(str('from'))) {
        return c.json({ error: 'to and from must be E.164 numbers' }, 400);
    }
    const rawDuration = body?.durationSeconds;
    const durationSeconds = typeof rawDuration === 'number' && Number.isFinite(rawDuration) ? Math.min(Math.max(Math.floor(rawDuration), 0), 7200) : undefined;

    let authToken = c.env.TWILIO_AUTH_TOKEN || MOCK_AUTH_TOKEN;
    if (str('tenantId')) {
        const db = await resolveTenantDb(c.env, str('tenantId'));
        if (!db) return c.json({ error: 'Tenant not found' }, 404);
        const settings = await loadVoipSettings(c.env, db).catch(() => null);
        authToken = settings?.providerAuthToken || settings?.twilioAuthToken || authToken;
    }

    // Deliver to this same worker (dynamic import: index.ts imports this file).
    const { default: app } = await import('../index');
    const result = await simulateVoipScenario({
        scenario,
        to: str('to'),
        from: str('from'),
        durationSeconds,
        withRecording: body?.withRecording === true,
        callSid: str('callSid') || undefined,
        baseUrl: c.env.API_PUBLIC_URL?.trim().replace(/[/]+$/, '') || new URL(c.req.url).origin,
        authToken,
        send: (request) => Promise.resolve(app.fetch(request, c.env, c.executionCtx)),
    });
    return c.json({ success: true, data: result });
});

/**
 * Register a platform super admin and mint a real super admin token for it (TEST_MODE only), the same token
 * POST /admin/auth/login issues, so e2e specs can call the super admin API (e.g. POST /admin/tenants)
 * without knowing a password.
 */
testApp.post('/super-admin', async (c) => {
    if (!isTestMode(c.env)) return c.json({ error: 'Forbidden: Test mode is not active.' }, 403);
    const id = '01960000-0000-7000-8000-0000000000f2';
    const email = 'e2e-super@platform.test';
    const name = 'E2E Super Admin';
    await c.env.MASTER_DB
        .prepare(`INSERT OR REPLACE INTO super_admins (id, email, name, password_hash, role, is_active) VALUES (?, ?, ?, 'unused', 'super_admin', 1)`)
        .bind(id, email, name)
        .run();
    const issued = await signSuperAdminToken(c.env, { id, email, name, role: 'super_admin' });
    if (!issued) return c.json({ error: 'Super admin secret unavailable' }, 503);
    return c.json({ success: true, data: { email, accessToken: issued.token } });
});

/** Local outbox: system emails captured instead of sent (TEST_MODE only). */
testApp.get('/outbox', async (c) => {
    if (!isTestMode(c.env)) return c.json({ error: 'Not found' }, 404);
    const to = c.req.query('to') || undefined;
    const emails = await listOutbox(c.env, to);
    return c.json({ success: true, data: emails });
});

testApp.delete('/outbox', async (c) => {
    if (!isTestMode(c.env)) return c.json({ error: 'Not found' }, 404);
    const cleared = await clearOutbox(c.env);
    return c.json({ success: true, data: { cleared } });
});

export default testApp;
