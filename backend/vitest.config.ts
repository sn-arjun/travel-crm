import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import path from 'path';

export default async () => {
    const masterPath = path.resolve(__dirname, 'drizzle/master');
    const masterMigrations = await readD1Migrations(masterPath);
    const tenantPath = path.resolve(__dirname, 'drizzle/tenant');
    const tenantMigrations = await readD1Migrations(tenantPath);

    const mergedMigrations = [
        ...masterMigrations.map(m => ({ ...m, name: `master_${m.name}` })),
        ...tenantMigrations.map(m => ({ ...m, name: `tenant_${m.name}` }))
    ];

    return defineWorkersConfig({
        test: {
            poolOptions: {
                workers: {
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
