import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import path from 'path';

// Filter out comment-only queries that D1 rejects as empty statements
function stripEmptyQueries(migrations: { name: string; queries: string[] }[]) {
    return migrations.map(m => ({
        ...m,
        queries: m.queries.filter(q => q.replace(/--[^\n]*/g, '').trim().length > 0),
    }));
}

export default async () => {
    const masterPath = path.resolve(__dirname, 'drizzle/master');
    const masterMigrations = await readD1Migrations(masterPath);
    const tenantPath = path.resolve(__dirname, 'drizzle/tenant');
    const tenantMigrations = await readD1Migrations(tenantPath);

    const mergedMigrations = stripEmptyQueries([
        ...masterMigrations.map(m => ({ ...m, name: `master_${m.name}` })),
        ...tenantMigrations.map(m => ({ ...m, name: `tenant_${m.name}` }))
    ]);

    return defineWorkersConfig({
        test: {
            poolOptions: {
                workers: {
                    singleWorker: true,
                    isolatedStorage: false,
                    wrangler: { configPath: './wrangler.toml' },
                    miniflare: {
                        bindings: {
                            TEST_MODE: 'true',
                            TEST_MIGRATIONS: mergedMigrations as any,
                        },
                    },
                },
            },
        },
    });
};
