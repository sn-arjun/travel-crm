/**
 * Which WhatsApp provider an agency sends through, and the agency's Meta account (R213).
 *
 * The choice is the tenant setting `whatsapp_provider` ('twilio' | 'meta'). With no setting, Meta is the default
 * when the platform has a Meta token and a phone number to send from (the agency's own, or the platform default);
 * otherwise Twilio, exactly as before. The access token and app secret are sealed with utils/crypto-box (R108),
 * bound to their row and column, opened only to call Graph or to check a webhook signature, never returned.
 */

import type { Env } from '../../types';
import { CredentialDecryptError, CredentialsKeyMissing, decryptSecret, encryptSecret } from '../../utils/crypto-box';
import { generateId } from '../../utils/uuid';
import type { WhatsAppCategory } from '../voip-provider';
import { MetaWhatsAppProvider } from './meta-whatsapp';

export const META_ADDRESS_CHANNEL = 'meta_whatsapp'; // tenant_channel_addresses: address = Meta phone_number_id
export const META_VERIFY_CHANNEL = 'meta_verify'; // tenant_channel_addresses: address = this agency's webhook verify token
export const PROVIDER_SETTING_KEY = 'whatsapp_provider';

export type WhatsAppProviderChoice = 'twilio' | 'meta';

export interface MetaAccountRow {
  id: string;
  phone_number_id: string;
  waba_id: string | null;
  display_phone: string | null;
  access_token_enc: string | null;
  access_token_last4: string | null;
  app_secret_enc: string | null;
  is_active: number;
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
}

export const accessTokenAad = (id: string) => `whatsapp_meta_accounts:access_token_enc:${id}`;
export const appSecretAad = (id: string) => `whatsapp_meta_accounts:app_secret_enc:${id}`;

export async function loadMetaAccount(db: D1Database): Promise<MetaAccountRow | null> {
  return db.prepare('SELECT * FROM whatsapp_meta_accounts ORDER BY created_at LIMIT 1').first<MetaAccountRow>();
}

export function isCredentialError(e: unknown): boolean {
  return e instanceof CredentialsKeyMissing || e instanceof CredentialDecryptError;
}

export async function sealMetaSecret(env: Env, plaintext: string, aad: string): Promise<string> {
  return encryptSecret(env, plaintext, aad);
}

/** The agency's own token and app secret, opened. Null for a part the agency did not save (the platform's is used). */
export async function openMetaSecrets(env: Env, row: MetaAccountRow): Promise<{ accessToken: string | null; appSecret: string | null }> {
  const accessToken = row.access_token_enc ? (await decryptSecret(env, row.access_token_enc, accessTokenAad(row.id))).value : null;
  const appSecret = row.app_secret_enc ? (await decryptSecret(env, row.app_secret_enc, appSecretAad(row.id))).value : null;
  return { accessToken, appSecret };
}

export async function readProviderSetting(db: D1Database): Promise<WhatsAppProviderChoice | null> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(PROVIDER_SETTING_KEY).first<{ value: string | null }>();
  return row?.value === 'meta' || row?.value === 'twilio' ? row.value : null;
}

export async function writeProviderSetting(db: D1Database, choice: WhatsAppProviderChoice): Promise<void> {
  await db
    .prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
              ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(PROVIDER_SETTING_KEY, choice)
    .run();
}

/** True when the platform itself can send on Meta: a token and a default phone number. */
export function platformMetaConfigured(env: Env): boolean {
  return !!env.WHATSAPP_META_TOKEN && !!env.WHATSAPP_META_PHONE_NUMBER_ID;
}

export type WhatsAppSender =
  | { provider: 'twilio' }
  | { provider: 'meta'; client: MetaWhatsAppProvider; phoneNumberId: string }
  | { provider: 'meta'; client: null; unavailable: string };

/** Effective provider for an agency: its setting, else Meta when the platform (or the agency) has it set up, else Twilio. */
export async function effectiveProvider(env: Env, db: D1Database): Promise<{ choice: WhatsAppProviderChoice; explicit: boolean }> {
  const setting = await readProviderSetting(db);
  if (setting) return { choice: setting, explicit: true };
  const account = await loadMetaAccount(db);
  const usable = !!env.WHATSAPP_META_TOKEN && ((!!account && !!account.is_active) || !!env.WHATSAPP_META_PHONE_NUMBER_ID);
  return { choice: usable ? 'meta' : 'twilio', explicit: false };
}

/** Everything a send needs. Never throws for a missing setup: `unavailable` says what is missing. */
export async function resolveWhatsAppSender(env: Env, db: D1Database): Promise<WhatsAppSender> {
  const { choice } = await effectiveProvider(env, db);
  if (choice === 'twilio') return { provider: 'twilio' };

  const account = await loadMetaAccount(db);
  if (account && !account.is_active) return { provider: 'meta', client: null, unavailable: 'WhatsApp (Meta) is switched off for this workspace' };
  let token = env.WHATSAPP_META_TOKEN || null;
  if (account) {
    try {
      token = (await openMetaSecrets(env, account)).accessToken || token;
    } catch (e) {
      if (isCredentialError(e)) return { provider: 'meta', client: null, unavailable: 'Stored WhatsApp credentials cannot be opened; save them again' };
      throw e;
    }
  }
  const phoneNumberId = account?.phone_number_id || env.WHATSAPP_META_PHONE_NUMBER_ID || null;
  if (!phoneNumberId) return { provider: 'meta', client: null, unavailable: 'WhatsApp (Meta) has no phone number: connect one in Settings > Integrations' };
  if (!token) return { provider: 'meta', client: null, unavailable: 'WhatsApp (Meta) has no access token: connect one in Settings > Integrations' };
  return {
    provider: 'meta',
    phoneNumberId,
    client: new MetaWhatsAppProvider({ accessToken: token, phoneNumberId, graphVersion: env.WHATSAPP_META_GRAPH_VERSION || undefined }),
  };
}

// ----------------------------------------------------------------------------
// Categories and metering ledger
// ----------------------------------------------------------------------------

/** CRM template categories that Meta treats as promotional; everything else is transactional (utility). */
const MARKETING_CATEGORIES = new Set(['offer', 'wish', 'greeting', 'marketing', 'promotion']);

/** Choose the Meta category for a CRM template: utility wherever it qualifies (a fraction of marketing's price). */
export function metaCategoryForTemplate(crmCategory: string | null | undefined): WhatsAppCategory {
  return crmCategory && MARKETING_CATEGORIES.has(crmCategory.toLowerCase()) ? 'marketing' : 'utility';
}

/**
 * Record which Meta category a paid send fell in: one metered_events row per message (channel whatsapp_utility or
 * whatsapp_marketing), the ledger that marketing-to-balance billing (R206) and cost reports read. The allowance
 * itself is taken by the caller (one unit of 'whatsapp', exactly as with Twilio). Service replies are free and are
 * not recorded. Idempotent on the Meta message id. Returns true when a row was written.
 */
export async function recordWhatsAppCategory(env: Env, tenantId: string, category: WhatsAppCategory, wamid: string): Promise<boolean> {
  if (category === 'service' || !wamid) return false;
  const res = await env.MASTER_DB
    .prepare('INSERT OR IGNORE INTO metered_events (event_key, tenant_id, channel, units) VALUES (?, ?, ?, 1)')
    .bind(`wa:${wamid}`, tenantId, `whatsapp_${category}`)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

// ----------------------------------------------------------------------------
// Master registry (webhook routing)
// ----------------------------------------------------------------------------

export async function tenantForPhoneNumberId(env: Env, phoneNumberId: string): Promise<string | null> {
  const row = await env.MASTER_DB
    .prepare('SELECT tenant_id FROM tenant_channel_addresses WHERE channel = ? AND address = ? AND is_active = 1')
    .bind(META_ADDRESS_CHANNEL, phoneNumberId)
    .first<{ tenant_id: string }>();
  return row?.tenant_id ?? null;
}

/** Point a phone number id at this agency. Returns false when another agency already owns it. */
export async function registerPhoneNumberId(env: Env, tenantId: string, phoneNumberId: string, label: string | null): Promise<boolean> {
  const taken = await env.MASTER_DB
    .prepare('SELECT tenant_id FROM tenant_channel_addresses WHERE channel = ? AND address = ?')
    .bind(META_ADDRESS_CHANNEL, phoneNumberId)
    .first<{ tenant_id: string }>();
  if (taken) return taken.tenant_id === tenantId;
  // An agency has one Meta number: drop its previous registration.
  await env.MASTER_DB.prepare('DELETE FROM tenant_channel_addresses WHERE tenant_id = ? AND channel = ?').bind(tenantId, META_ADDRESS_CHANNEL).run();
  await env.MASTER_DB
    .prepare(`INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address, provider, label) VALUES (?, ?, ?, ?, 'meta', ?)`)
    .bind(generateId(), tenantId, META_ADDRESS_CHANNEL, phoneNumberId, label)
    .run();
  return true;
}

export async function unregisterPhoneNumberId(env: Env, tenantId: string): Promise<void> {
  await env.MASTER_DB.prepare('DELETE FROM tenant_channel_addresses WHERE tenant_id = ? AND channel = ?').bind(tenantId, META_ADDRESS_CHANNEL).run();
}

/** The agency's webhook verify token (typed into its Meta app's webhook settings); made on first use. */
export async function verifyTokenFor(env: Env, tenantId: string, create: boolean): Promise<string | null> {
  const existing = await env.MASTER_DB
    .prepare('SELECT address FROM tenant_channel_addresses WHERE tenant_id = ? AND channel = ? AND is_active = 1 LIMIT 1')
    .bind(tenantId, META_VERIFY_CHANNEL)
    .first<{ address: string }>();
  if (existing) return existing.address;
  if (!create) return null;
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const token = `mv_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  await env.MASTER_DB
    .prepare(`INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address, provider, label) VALUES (?, ?, ?, ?, 'meta', 'WhatsApp webhook verify token')`)
    .bind(generateId(), tenantId, META_VERIFY_CHANNEL, token)
    .run();
  return token;
}

export async function isKnownVerifyToken(env: Env, token: string): Promise<boolean> {
  const row = await env.MASTER_DB
    .prepare('SELECT 1 AS hit FROM tenant_channel_addresses WHERE channel = ? AND address = ? AND is_active = 1')
    .bind(META_VERIFY_CHANNEL, token)
    .first();
  return !!row;
}

export function metaWebhookUrl(env: Pick<Env, 'API_PUBLIC_URL'>, requestUrl: string): string {
  const base = (env.API_PUBLIC_URL?.trim() || new URL(requestUrl).origin).replace(/\/+$/, '');
  return `${base}/api/v1/webhooks/inbound/meta/whatsapp`;
}
