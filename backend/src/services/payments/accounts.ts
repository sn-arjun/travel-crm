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

// ----------------------------------------------------------------------------
// payment_defaults (R142, design section 4.3): the deposit for a payment link, the Stripe methods to request and the
// reference customers use for a bank transfer. One settings key, JSON.
// ----------------------------------------------------------------------------

export type DepositType = 'none' | 'percent' | 'fixed';

export interface PaymentDefaults {
  deposit: { type: DepositType; value: number | null };
  /** null = Stripe dynamic payment methods (the agency's Stripe dashboard decides). A list is sent as payment_method_types[]. */
  stripeMethodTypes: string[] | null;
  bankReference: string;
}

export const DEFAULT_BANK_REFERENCE = '{invoice_number}';

export const PAYMENT_DEFAULTS_KEY = 'payment_defaults';

export function defaultPaymentDefaults(): PaymentDefaults {
  return { deposit: { type: 'none', value: null }, stripeMethodTypes: null, bankReference: DEFAULT_BANK_REFERENCE };
}

/** Read whatever is stored into the full shape, ignoring anything malformed. */
export function normalizePaymentDefaults(raw: unknown): PaymentDefaults {
  const out = defaultPaymentDefaults();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, any>;
  const type = r.deposit?.type;
  const value = typeof r.deposit?.value === 'number' && Number.isFinite(r.deposit.value) ? r.deposit.value : null;
  if ((type === 'percent' || type === 'fixed') && value !== null && value > 0 && (type === 'fixed' || value <= 100)) {
    out.deposit = { type, value };
  }
  if (Array.isArray(r.stripeMethodTypes)) {
    const list = r.stripeMethodTypes.filter((t: unknown): t is string => typeof t === 'string' && t.length > 0);
    out.stripeMethodTypes = list.length ? Array.from(new Set(list)) : null;
  }
  if (typeof r.bankReference === 'string' && r.bankReference.trim()) out.bankReference = r.bankReference.trim().slice(0, 80);
  return out;
}

export async function loadPaymentDefaults(db: D1Database): Promise<PaymentDefaults> {
  try {
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(PAYMENT_DEFAULTS_KEY).first<{ value: string | null }>();
    return normalizePaymentDefaults(row?.value ? JSON.parse(row.value) : null);
  } catch {
    return defaultPaymentDefaults();
  }
}

/** The deposit for a total under the agency default, in major units rounded to the currency's cents, or null when none is set. */
export function depositAmount(defaults: PaymentDefaults, total: number, balanceDue: number): number | null {
  const { type, value } = defaults.deposit;
  if (type === 'none' || value === null) return null;
  const raw = type === 'percent' ? (total * value) / 100 : value;
  const rounded = Math.round(raw * 100) / 100;
  return Math.min(rounded, balanceDue);
}
