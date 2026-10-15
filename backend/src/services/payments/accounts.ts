/**
 * The agency's stored gateway accounts (R207): sealing, opening and the per-agency webhook key.
 *
 * The secret key and the webhook secret are sealed with utils/crypto-box (R108), bound to their row and column.
 * They are opened only to call the gateway or to check a webhook signature; nothing returns them to a client.
 */

import type { Env } from '../../types';
import { CredentialDecryptError, CredentialsKeyMissing, decryptSecret, encryptSecret } from '../../utils/crypto-box';
import { generateId } from '../../utils/uuid';
import type { AgencyCredentials, AgencyGatewayId } from './agency-gateway';

export const WEBHOOK_KEY_CHANNEL = 'payment_webhook';

export interface AccountRow {
  id: string;
  gateway: AgencyGatewayId;
  mode: 'test' | 'live';
  key_id: string | null;
  secret_enc: string | null;
  secret_last4: string | null;
  webhook_secret_enc: string | null;
  is_active: number;
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
}

export const secretAad = (id: string) => `payment_gateway_accounts:secret_enc:${id}`;
export const webhookSecretAad = (id: string) => `payment_gateway_accounts:webhook_secret_enc:${id}`;

export async function loadAccount(db: D1Database, gateway: AgencyGatewayId): Promise<AccountRow | null> {
  return db.prepare('SELECT * FROM payment_gateway_accounts WHERE gateway = ?').bind(gateway).first<AccountRow>();
}

export async function listAccounts(db: D1Database): Promise<AccountRow[]> {
  const rows = await db.prepare('SELECT * FROM payment_gateway_accounts ORDER BY gateway').all<AccountRow>();
  return rows.results ?? [];
}

/** Open an account's credentials. Throws CredentialsKeyMissing / CredentialDecryptError when they cannot be opened. */
export async function openCredentials(env: Env, row: AccountRow): Promise<AgencyCredentials | null> {
  if (!row.secret_enc) return null;
  const secret = (await decryptSecret(env, row.secret_enc, secretAad(row.id))).value;
  const webhookSecret = row.webhook_secret_enc ? (await decryptSecret(env, row.webhook_secret_enc, webhookSecretAad(row.id))).value : null;
  return { gateway: row.gateway, keyId: row.key_id, secret, webhookSecret };
}

export async function seal(env: Env, plaintext: string, aad: string): Promise<string> {
  return encryptSecret(env, plaintext, aad);
}

export function isCredentialError(e: unknown): boolean {
  return e instanceof CredentialsKeyMissing || e instanceof CredentialDecryptError;
}

/**
 * The unguessable key in this agency's webhook URL. It lives in the master registry (tenant_channel_addresses,
 * channel payment_webhook) because a public webhook must find the agency before any tenant database is known.
 * `create` makes one when the agency has none yet.
 */
export async function webhookKeyFor(env: Env, tenantId: string, create: boolean): Promise<string | null> {
  const existing = await env.MASTER_DB
    .prepare('SELECT address FROM tenant_channel_addresses WHERE tenant_id = ? AND channel = ? AND is_active = 1 LIMIT 1')
    .bind(tenantId, WEBHOOK_KEY_CHANNEL)
    .first<{ address: string }>();
  if (existing) return existing.address;
  if (!create) return null;
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const key = `pw_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  await env.MASTER_DB
    .prepare(`INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address, provider, label) VALUES (?, ?, ?, ?, NULL, 'Payment webhook')`)
    .bind(generateId(), tenantId, WEBHOOK_KEY_CHANNEL, key)
    .run();
  return key;
}

export async function tenantForWebhookKey(env: Env, key: string): Promise<string | null> {
  const row = await env.MASTER_DB
    .prepare('SELECT tenant_id FROM tenant_channel_addresses WHERE channel = ? AND address = ? AND is_active = 1')
    .bind(WEBHOOK_KEY_CHANNEL, key)
    .first<{ tenant_id: string }>();
  return row?.tenant_id ?? null;
}

export function webhookUrl(env: Pick<Env, 'API_PUBLIC_URL'>, requestUrl: string, key: string, gateway: AgencyGatewayId): string {
  const base = (env.API_PUBLIC_URL?.trim() || new URL(requestUrl).origin).replace(/\/+$/, '');
  return `${base}/api/v1/webhooks/payments/${key}/${gateway}`;
}
