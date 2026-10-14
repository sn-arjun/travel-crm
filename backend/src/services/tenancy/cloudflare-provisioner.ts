import type { Env } from '../../types';
import { TENANT_MIGRATIONS } from '../../db/tenant-migrations.generated';
import { bindingNameFor } from '../tenant-db';
import { ProvisioningError, type BindingResult, type ProvisionTarget, type Region, type SqlStatement, type TenantProvisioner } from './provisioner';

const API = 'https://api.cloudflare.com/client/v4';

/** D1 placement per agency region (READINESS-PLAN 4.1 / 4.13). `jurisdiction` pins storage; a hint is best effort. */
export const REGION_PLACEMENT: Record<Region, { primary_location_hint?: string; jurisdiction?: string }> = {
  in: { primary_location_hint: 'apac' },
  eu: { jurisdiction: 'eu' },
  uk: { jurisdiction: 'eu' },
  us: { primary_location_hint: 'wnam' },
  au: { primary_location_hint: 'oc' },
  gulf: { primary_location_hint: 'apac' },
};

interface CfEnvelope<T> {
  success: boolean;
  result?: T;
  errors?: { code?: number; message?: string }[];
}

/**
 * Provisions agencies through Cloudflare's REST API (D1 create/query/delete, Workers script settings).
 * Only fetch is used; the token is sent as a bearer header and never appears in a message, log or error.
 */
export class CloudflareTenantProvisioner implements TenantProvisioner {
  constructor(
    private readonly env: Env,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private config(): { account: string; token: string } {
    const account = this.env.CF_ACCOUNT_ID;
    const token = this.env.CF_API_TOKEN;
    if (!account || !token) {
      throw new ProvisioningError('Cloudflare provisioning is not configured (CF_ACCOUNT_ID / CF_API_TOKEN)', 'NOT_CONFIGURED', 503);
    }
    return { account, token };
  }

  /** Strip anything token-shaped from text that may reach logs or responses. */
  private clean(text: string): string {
    const token = this.env.CF_API_TOKEN;
    return token ? text.split(token).join('[redacted]') : text;
  }

  private async call<T>(method: string, path: string, body?: unknown, what = 'Cloudflare request'): Promise<T> {
    const { token } = this.config();
    let res: Response;
    try {
      res = await this.fetcher(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new ProvisioningError(this.clean(`${what} failed: ${err instanceof Error ? err.message : 'network error'}`), 'CF_NETWORK', 502);
    }
    let json: CfEnvelope<T> | null = null;
    try {
      json = (await res.json()) as CfEnvelope<T>;
    } catch {
      json = null;
    }
    if (!res.ok || !json?.success) {
      const detail = json?.errors?.[0]?.message ? `: ${json.errors[0].message}` : '';
      throw new ProvisioningError(this.clean(`${what} failed (HTTP ${res.status})${detail}`), 'CF_API', 502);
    }
    return json.result as T;
  }

  private async query(databaseId: string, sql: string, params: unknown[] = []): Promise<void> {
    const { account } = this.config();
    await this.call('POST', `/accounts/${account}/d1/database/${databaseId}/query`, { sql, params }, 'D1 query');
  }

  async createDatabase(t: { tenantId: string; slug: string; region: Region }): Promise<ProvisionTarget> {
    const { account } = this.config();
    const result = await this.call<{ uuid: string }>(
      'POST',
      `/accounts/${account}/d1/database`,
      { name: `travelcrm-t-${t.slug}`, ...REGION_PLACEMENT[t.region] },
      'D1 database create',
    );
    if (!result?.uuid) throw new ProvisioningError('D1 database create returned no id', 'CF_API', 502);
    return { databaseId: result.uuid, binding: bindingNameFor(t.tenantId) };
  }

  async applyMigrations(target: ProvisionTarget): Promise<{ applied: string[] }> {
    await this.query(
      target.databaseId,
      'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    const applied: string[] = [];
    for (const migration of TENANT_MIGRATIONS) {
      // One call per migration: its statements, then the bookkeeping row. A failure aborts and the caller drops the database.
      const sql = migration.queries.map((q) => `${q.trimEnd().replace(/;+\s*$/, '')}\n;`).join('\n');
      await this.query(target.databaseId, sql);
      await this.query(target.databaseId, 'INSERT INTO d1_migrations (name) VALUES (?)', [migration.name]);
      applied.push(migration.name);
    }
    return { applied };
  }

  async execute(target: ProvisionTarget, statements: SqlStatement[]): Promise<void> {
    for (const s of statements) await this.query(target.databaseId, s.sql, s.params);
  }

  async registerBinding(target: ProvisionTarget): Promise<BindingResult> {
    const { account, token } = this.config();
    const script = this.env.CF_WORKER_SCRIPT_NAME;
    if (!script) return 'pending_deploy';
    try {
      const form = new FormData();
      form.append(
        'settings',
        JSON.stringify({
          bindings: [{ type: 'd1', name: target.binding, id: target.databaseId }],
          // Keep every binding the script already has; PATCH otherwise replaces the list.
          keep_bindings: ['d1', 'kv_namespace', 'r2_bucket', 'queue', 'ai', 'plain_text', 'secret_text', 'durable_object_namespace', 'analytics_engine', 'service'],
        }),
      );
      const res = await this.fetcher(`${API}/accounts/${account}/workers/scripts/${script}/settings`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) return 'active';
      console.warn(`[provisioner] binding registration for ${target.binding} returned HTTP ${res.status}; deploy needed`);
    } catch (err) {
      console.warn(this.clean(`[provisioner] binding registration for ${target.binding} failed: ${err instanceof Error ? err.message : 'error'}`));
    }
    return 'pending_deploy';
  }

  async dropDatabase(target: ProvisionTarget): Promise<void> {
    const { account } = this.config();
    await this.call('DELETE', `/accounts/${account}/d1/database/${target.databaseId}`, undefined, 'D1 database delete');
  }
}
