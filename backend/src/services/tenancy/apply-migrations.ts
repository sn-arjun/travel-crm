import { TENANT_MIGRATIONS } from '../../db/tenant-migrations.generated';

const SAFE_TABLE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Apply the bundled tenant migrations to a D1 database from inside the Worker.
 * Recorded in the same table shape wrangler uses, so `wrangler d1 migrations apply` agrees.
 * Idempotent: migrations already recorded are skipped. Returns the names applied by this call.
 */
export async function applyTenantMigrations(db: D1Database, table = 'd1_migrations'): Promise<string[]> {
  if (!SAFE_TABLE.test(table)) throw new Error('Invalid migrations table name');
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ${table} (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    )
    .run();
  const { results } = await db.prepare(`SELECT name FROM ${table}`).all<{ name: string }>();
  const done = new Set((results ?? []).map((r) => r.name));

  const applied: string[] = [];
  for (const migration of TENANT_MIGRATIONS) {
    if (done.has(migration.name)) continue;
    await db.batch([
      ...migration.queries.map((q) => db.prepare(q)),
      db.prepare(`INSERT INTO ${table} (name) VALUES (?)`).bind(migration.name),
    ]);
    applied.push(migration.name);
  }
  return applied;
}
