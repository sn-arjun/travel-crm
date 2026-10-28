import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { invalidateTenantCache } from '../tenant-db';
import { getProvisioner, ProvisioningError, type ProvisionTarget, type Region, type TenantProvisioner } from './provisioner';
import { seedTenant } from './seed-tenant';

export type ProvisionStep = 'creating_db' | 'migrating' | 'seeding' | 'binding';

export interface TenantRow {
  id: string;
  company_name: string;
  subdomain: string;
  plan: string;
  region: string;
  country: string | null;
  owner_email: string | null;
  owner_name: string | null;
  d1_database_id: string | null;
  db_binding: string | null;
  provisioning_status: string;
  settings: string | null;
}

export type ProvisionOutcome =
  | { ok: true; status: 'active' | 'pending_deploy'; userId: string; temporaryPassword: string; adminEmail: string }
  | { ok: false; step: ProvisionStep; code: string; message: string; httpStatus: number; purged: boolean };

async function setStatus(env: Env, tenantId: string, status: string, error: string | null = null): Promise<void> {
  await env.MASTER_DB
    .prepare(`UPDATE tenants SET provisioning_status = ?, provisioning_error = ?, updated_at = ? WHERE id = ?`)
    .bind(status, error, new Date().toISOString(), tenantId)
    .run();
}

/** Remove the half-created agency's master rows entirely (used when nothing can be retried). */
export async function purgeTenantRows(env: Env, tenantId: string): Promise<void> {
  await env.MASTER_DB.batch([
    env.MASTER_DB.prepare(`DELETE FROM tenant_users WHERE tenant_id = ?`).bind(tenantId),
    env.MASTER_DB.prepare(`DELETE FROM subscriptions WHERE tenant_id = ?`).bind(tenantId),
    env.MASTER_DB.prepare(`DELETE FROM tenants WHERE id = ?`).bind(tenantId),
  ]);
  await invalidateTenantCache(env, tenantId);
}

/**
 * Walk the provisioning steps for one agency row: create database -> migrate -> seed -> register binding.
 * Safe to call again after a failure: a failed run rolls its database back (and releases the binding), and the
 * next run starts clean from the first step. Never throws; failures come back as `ok: false`.
 */
export async function runProvisioning(
  env: Env,
  tenant: TenantRow,
  opts: { provisioner?: TenantProvisioner } = {},
): Promise<ProvisionOutcome> {
  const provisioner = opts.provisioner ?? getProvisioner(env);
  const adminEmail = (tenant.owner_email ?? '').toLowerCase();
  let step: ProvisionStep = 'creating_db';
  let target: ProvisionTarget | null = null;

  try {
    // A previous failed run may have left a database whose drop also failed: clear it before creating another.
    if (tenant.d1_database_id && tenant.provisioning_status === 'failed') {
      await provisioner.dropDatabase({ databaseId: tenant.d1_database_id, binding: tenant.db_binding ?? tenant.d1_database_id });
      await env.MASTER_DB.prepare(`UPDATE tenants SET d1_database_id = NULL, db_binding = NULL WHERE id = ?`).bind(tenant.id).run();
    }

    await setStatus(env, tenant.id, 'creating_db');
    target = await provisioner.createDatabase({ tenantId: tenant.id, slug: tenant.subdomain, region: (tenant.region || 'in') as Region });
    await env.MASTER_DB
      .prepare(`UPDATE tenants SET d1_database_id = ?, db_binding = ? WHERE id = ?`)
      .bind(target.databaseId, target.binding === 'MASTER_DB' ? null : target.binding, tenant.id)
      .run();

    step = 'migrating';
    await setStatus(env, tenant.id, 'migrating');
    await provisioner.applyMigrations(target);

    step = 'seeding';
    await setStatus(env, tenant.id, 'seeding');
    const seeded = await seedTenant(provisioner, target, {
      adminEmail,
      adminName: tenant.owner_name ?? 'Administrator',
      company: tenant.company_name,
      country: tenant.country ?? '',
      currency: readSetting(tenant.settings, 'currency') ?? 'INR',
      timezone: readSetting(tenant.settings, 'timezone') ?? 'Asia/Kolkata',
      taxSystem: readSetting(tenant.settings, 'taxSystem') ?? 'gst',
      language: readSetting(tenant.settings, 'language') ?? undefined,
    });

    step = 'binding';
    await setStatus(env, tenant.id, 'binding');
    const status = await provisioner.registerBinding(target);

    // Done: open the agency for sign-in and make it visible to /auth/resolve-tenant.
    const tenantStatus = tenant.plan === 'trial' ? 'trial' : 'active';
    const now = new Date().toISOString();
    await env.MASTER_DB.batch([
      env.MASTER_DB
        .prepare(`INSERT OR REPLACE INTO tenant_users (id, tenant_id, email, user_id, role, is_active) VALUES (?, ?, ?, ?, 'admin', 1)`)
        .bind(generateId(), tenant.id, adminEmail, seeded.userId),
      env.MASTER_DB
        .prepare(`UPDATE tenants SET status = ?, provisioning_status = ?, provisioning_error = NULL, updated_at = ? WHERE id = ?`)
        .bind(tenantStatus, status, now, tenant.id),
    ]);
    await invalidateTenantCache(env, tenant.id);

    return { ok: true, status, userId: seeded.userId, temporaryPassword: seeded.temporaryPassword, adminEmail };
  } catch (err) {
    const code = err instanceof ProvisioningError ? err.code : 'PROVISIONING_FAILED';
    const httpStatus = err instanceof ProvisioningError ? err.httpStatus : 502;
    const message = err instanceof Error ? err.message : 'Provisioning failed';
    console.error(`[provisioning] ${tenant.subdomain} failed at ${step}: ${code}`);

    // Roll the database back so the next attempt does not trip over it.
    let dropped = true;
    if (target) {
      try {
        await provisioner.dropDatabase(target);
      } catch {
        dropped = false;
        console.error(`[provisioning] ${tenant.subdomain}: rollback drop failed; it is retried on the next attempt`);
      }
    }

    // Nothing to retry when no slot exists: leave no tenants row behind.
    if (code === 'POOL_EXHAUSTED') {
      await purgeTenantRows(env, tenant.id);
      return { ok: false, step, code, message, httpStatus, purged: true };
    }

    if (dropped) {
      await env.MASTER_DB.prepare(`UPDATE tenants SET d1_database_id = NULL, db_binding = NULL WHERE id = ?`).bind(tenant.id).run();
    }
    await setStatus(env, tenant.id, 'failed', `${step}: ${message}`.slice(0, 500));
    await invalidateTenantCache(env, tenant.id);
    return { ok: false, step, code, message, httpStatus, purged: false };
  }
}

function readSetting(json: string | null, key: string): string | null {
  if (!json) return null;
  try {
    const value = (JSON.parse(json) as Record<string, unknown>)[key];
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
}
