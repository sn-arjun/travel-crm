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
});
