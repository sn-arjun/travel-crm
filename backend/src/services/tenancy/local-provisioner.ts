import type { Env } from '../../types';
import { applyTenantMigrations } from './apply-migrations';
import { ProvisioningError, type ProvisionTarget, type SqlStatement, type TenantProvisioner, type BindingResult, type Region } from './provisioner';

function dbFor(env: Env, binding: string): D1Database {
  const db = (env as unknown as Record<string, unknown>)[binding] as D1Database | undefined;
  if (!db || typeof db.prepare !== 'function') {
    throw new ProvisioningError(`Database binding ${binding} is not available`, 'BINDING_MISSING', 502);
  }
  return db;
}

async function runStatements(db: D1Database, statements: SqlStatement[]): Promise<void> {
  if (statements.length === 0) return;
  await db.batch(statements.map((s) => db.prepare(s.sql).bind(...s.params)));
}

/** Pool bindings present in the environment, in numeric order: TENANT_DB_POOL_1, _2, ... */
export function poolBindings(env: Env): string[] {
  return Object.keys(env as unknown as Record<string, unknown>)
    .filter((k) => /^TENANT_DB_POOL_\d+$/.test(k))
    .sort((a, b) => Number(a.split('_').pop()) - Number(b.split('_').pop()));
}

/** Empty a pool database completely so the slot can be claimed again. Best effort, repeated until clean. */
async function wipeDatabase(db: D1Database): Promise<void> {
  for (let pass = 0; pass < 4; pass++) {
    const { results } = await db
      .prepare(`SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`)
      .all<{ type: string; name: string; sql: string | null }>();
    const objects = results ?? [];
    if (objects.length === 0) return;
    const virtual = objects.filter((o) => o.type === 'table' && /^\s*CREATE\s+VIRTUAL/i.test(o.sql ?? ''));
    const plain = objects.filter((o) => o.type === 'table' && !virtual.includes(o));
    const order = [
      ...objects.filter((o) => o.type === 'trigger').map((o) => `DROP TRIGGER IF EXISTS "${o.name}"`),
      ...objects.filter((o) => o.type === 'view').map((o) => `DROP VIEW IF EXISTS "${o.name}"`),
      ...virtual.map((o) => `DROP TABLE IF EXISTS "${o.name}"`),
      ...plain.map((o) => `DROP TABLE IF EXISTS "${o.name}"`),
    ];
    for (const sql of order) {
      try {
        await db.prepare(sql).run();
      } catch {
        // a shadow table of a virtual table, or a table still referenced; the next pass retries
      }
    }
  }
  const { results } = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`)
    .all();
  if ((results ?? []).length > 0) {
    throw new ProvisioningError('Could not clear the pool database during rollback', 'ROLLBACK_INCOMPLETE', 502);
  }
}

/** Claims the first free TENANT_DB_POOL_n. For local development and tests. */
export class LocalTenantProvisioner implements TenantProvisioner {
  constructor(protected readonly env: Env) {}

  async createDatabase(t: { tenantId: string; slug: string; region: Region }): Promise<ProvisionTarget> {
    const existing = await this.env.MASTER_DB
      .prepare(`SELECT db_binding FROM tenants WHERE id = ?`)
      .bind(t.tenantId)
      .first<{ db_binding: string | null }>();
    if (existing?.db_binding) return { databaseId: existing.db_binding, binding: existing.db_binding };

    for (const binding of poolBindings(this.env)) {
      try {
        // The unique index on tenants.db_binding makes the claim atomic: two concurrent
        // provisioning calls can never take the same pool database.
        await this.env.MASTER_DB
          .prepare(`UPDATE tenants SET db_binding = ?, d1_database_id = ? WHERE id = ?`)
          .bind(binding, binding, t.tenantId)
          .run();
        return { databaseId: binding, binding };
      } catch (err) {
        if (/UNIQUE|constraint/i.test(err instanceof Error ? err.message : String(err))) continue; // taken by another agency
        throw err;
      }
    }
    throw new ProvisioningError(
      'No free local tenant database is left in the pool (TENANT_DB_POOL_n). Local development only.',
      'POOL_EXHAUSTED',
      409,
    );
  }

  async applyMigrations(target: ProvisionTarget): Promise<{ applied: string[] }> {
    return { applied: await applyTenantMigrations(dbFor(this.env, target.binding)) };
  }

  async execute(target: ProvisionTarget, statements: SqlStatement[]): Promise<void> {
    await runStatements(dbFor(this.env, target.binding), statements);
  }

  async registerBinding(_target: ProvisionTarget): Promise<BindingResult> {
    return 'active';
  }

  async dropDatabase(target: ProvisionTarget): Promise<void> {
    await wipeDatabase(dbFor(this.env, target.binding));
  }
}

/** TENANCY_MODE=single: every agency shares MASTER_DB, which already holds the tenant schema. Dev parity only. */
export class SingleModeProvisioner implements TenantProvisioner {
  constructor(private readonly env: Env) {}

  async createDatabase(_t: { tenantId: string; slug: string; region: Region }): Promise<ProvisionTarget> {
    return { databaseId: 'MASTER_DB', binding: 'MASTER_DB' };
  }

  async applyMigrations(_target: ProvisionTarget): Promise<{ applied: string[] }> {
    return { applied: [] };
  }

  async execute(_target: ProvisionTarget, statements: SqlStatement[]): Promise<void> {
    await runStatements(this.env.MASTER_DB, statements);
  }

  async registerBinding(_target: ProvisionTarget): Promise<BindingResult> {
    return 'active';
  }

  async dropDatabase(_target: ProvisionTarget): Promise<void> {
    // Nothing to drop: the shared database is not ours. Seeding runs as one atomic batch, so a failed seed leaves no rows.
  }
}
