import { env, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as tenantSchema from '../src/db/tenant-schema';
import * as masterSchema from '../src/db/master-schema';

/**
 * Schema-drift guard.
 *
 * The Drizzle schema files declare columns that routes read and write. If the
 * migration chain never creates one of them, the first query touching it fails
 * at runtime with "no such column" (seen for flyers, travellers, suppliers,
 * message_templates and visa_checklist_items). This test applies the full
 * migration chain and asserts that every declared table and column exists.
 */

const testEnv = env as any;

function declaredTables(mod: Record<string, unknown>) {
    return Object.values(mod)
        .filter((v): v is SQLiteTable => v instanceof SQLiteTable)
        .map((t) => getTableConfig(t));
}

async function liveColumns(table: string): Promise<Set<string>> {
    const { results } = await testEnv.MASTER_DB.prepare(`PRAGMA table_info("${table}")`).all();
    return new Set((results as Array<{ name: string }>).map((r) => r.name));
}

async function findDrift(mod: Record<string, unknown>): Promise<string[]> {
    const drift: string[] = [];
    for (const cfg of declaredTables(mod)) {
        const live = await liveColumns(cfg.name);
        if (live.size === 0) {
            drift.push(`${cfg.name} (table missing)`);
            continue;
        }
        for (const col of cfg.columns) {
            if (!live.has(col.name)) drift.push(`${cfg.name}.${col.name}`);
        }
    }
    return drift;
}

describe('Schema drift guard', () => {
    beforeAll(async () => {
        await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    });

    it('declares a non-trivial number of tenant and master tables', () => {
        expect(declaredTables(tenantSchema).length).toBeGreaterThan(50);
        expect(declaredTables(masterSchema).length).toBeGreaterThan(0);
    });

    it('every column declared in tenant-schema.ts exists after the migration chain', async () => {
        expect(await findDrift(tenantSchema)).toEqual([]);
    });

    it('every column declared in master-schema.ts exists after the migration chain', async () => {
        expect(await findDrift(masterSchema)).toEqual([]);
    });

    it('reports a column that is not in the live table (guard self-check)', async () => {
        const live = await liveColumns('users');
        expect(live.has('email')).toBe(true);
        expect(live.has('definitely_not_a_column')).toBe(false);
    });

    // R119: the call code reads and writes these columns by name. A column listed here that no migration
    // creates would fail at runtime with "no such column" on the first inbound call, missed call or
    // extraction. Keep this list in step with the SQL in routes/calls.ts, routes/voip*.ts,
    // services/call-routing.ts, services/missed-call-handler.ts and queues/ai-extraction-queue.ts.
    const CALL_CODE_COLUMNS: Record<string, string[]> = {
        contacts: ['id', 'name', 'company', 'type', 'phone', 'email', 'is_deleted', 'updated_at'],
        leads: ['id', 'contact_id', 'title', 'status', 'assigned_to', 'estimated_value', 'lost_reason', 'is_deleted', 'created_at', 'updated_at'],
        follow_ups: ['id', 'lead_id', 'scheduled_at', 'type', 'notes', 'status', 'created_by'],
        notifications: ['id', 'user_id', 'type', 'title', 'message', 'reference_type', 'reference_id', 'is_read'],
        call_logs: [
            'id', 'contact_id', 'lead_id', 'direction', 'from_number', 'to_number', 'duration_seconds', 'status', 'outcome',
            'twilio_call_sid', 'provider_call_id', 'recording_url', 'recording_duration', 'notes', 'ivr_path', 'routed_to',
            'answered_by', 'created_by', 'created_at', 'updated_at',
        ],
    };

    it('every column the call code references exists (and the old phantom ones still do not)', async () => {
        for (const [table, columns] of Object.entries(CALL_CODE_COLUMNS)) {
            const live = await liveColumns(table);
            const missing = columns.filter((c) => !live.has(c));
            expect({ table, missing }).toEqual({ table, missing: [] });
        }
        // These never existed; the call code must not go back to them.
        expect((await liveColumns('contacts')).has('mobile')).toBe(false);
        expect((await liveColumns('contacts')).has('work_phone')).toBe(false);
        expect((await liveColumns('leads')).has('phone')).toBe(false);
        expect((await liveColumns('follow_ups')).has('due_date')).toBe(false);
        expect((await liveColumns('follow_ups')).has('assigned_to')).toBe(false);
    });

    it('call_logs.created_by is nullable (an inbound call has no creator) and provider_call_id is unique', async () => {
        const { results } = await testEnv.MASTER_DB.prepare('PRAGMA table_info("call_logs")').all();
        const createdBy = (results as Array<{ name: string; notnull: number }>).find((c) => c.name === 'created_by');
        expect(createdBy?.notnull).toBe(0);
        const { results: idx } = await testEnv.MASTER_DB.prepare('PRAGMA index_list("call_logs")').all();
        const unique = (idx as Array<{ name: string; unique: number }>).filter((i) => i.unique === 1).map((i) => i.name);
        expect(unique).toContain('call_logs_provider_call_id_uniq');
        expect(unique).toContain('call_logs_twilio_sid_idx');
    });
});
