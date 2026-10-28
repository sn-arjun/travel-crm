import type { Env } from '../../types';
import { tenancyMode } from '../tenant-db';
import { CloudflareTenantProvisioner } from './cloudflare-provisioner';
import { LocalTenantProvisioner, SingleModeProvisioner } from './local-provisioner';

export type Region = 'in' | 'eu' | 'uk' | 'us' | 'au' | 'gulf';
export const REGIONS = ['in', 'eu', 'uk', 'us', 'au', 'gulf'] as const;

export interface ProvisionTarget {
  /** Cloudflare D1 uuid, or the pool binding name for the local provisioner. */
  databaseId: string;
  /** Worker binding name the API will use for this agency (stored in tenants.db_binding). */
  binding: string;
}

export interface SqlStatement {
  sql: string;
  params: unknown[];
}

export type BindingResult = 'active' | 'pending_deploy';

export interface TenantProvisioner {
  createDatabase(t: { tenantId: string; slug: string; region: Region }): Promise<ProvisionTarget>;
  applyMigrations(target: ProvisionTarget): Promise<{ applied: string[] }>;
  /** Run statements (seed admin, settings), atomically where the backend allows it. */
  execute(target: ProvisionTarget, statements: SqlStatement[]): Promise<void>;
  registerBinding(target: ProvisionTarget): Promise<BindingResult>;
  /** Rollback only: leaves nothing behind that the next attempt could trip over. */
  dropDatabase(target: ProvisionTarget): Promise<void>;
}

/** A provisioning failure with an HTTP-friendly code. Messages never contain secrets. */
export class ProvisioningError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'PROVISIONING_FAILED',
    public readonly httpStatus: number = 502,
  ) {
    super(message);
    this.name = 'ProvisioningError';
  }
}

export function getProvisioner(env: Env): TenantProvisioner {
  if (env.TENANT_PROVISIONER === 'cloudflare') return new CloudflareTenantProvisioner(env);
  if (tenancyMode(env) === 'single') return new SingleModeProvisioner(env);
  return new LocalTenantProvisioner(env);
}
