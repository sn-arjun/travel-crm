/**
 * Integrations settings (admin only).
 *
 *   GET    /integrations/channels        the numbers and mailboxes this workspace receives on
 *   POST   /integrations/channels        register one
 *   DELETE /integrations/channels/:id    stop receiving on one
 *   GET    /integrations/api-keys        website-form keys (masked)
 *   POST   /integrations/api-keys        issue a key (shown in full once)
 *   DELETE /integrations/api-keys/:id    revoke a key
 *
 * Both tables live in MASTER_DB because the public webhooks must find the tenant
 * before any tenant database is known.
 */

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { rbac } from '../middleware/rbac';
import { generateId } from '../utils/uuid';
import { CredentialsKeyMissing, hashApiKey } from '../utils/crypto-box';
import { success, created, error, notFound } from '../utils/response';
import { normalizeAddress } from '../services/inbound/ingest';
import { isAgencyGateway, testConnection } from '../services/payments/agency-gateway';
import {
  isCredentialError, listAccounts, loadAccount, openCredentials, seal, secretAad, webhookKeyFor, webhookSecretAad, webhookUrl,
  type AccountRow,
} from '../services/payments/accounts';
import { MetaWhatsAppProvider } from '../services/messaging/meta-whatsapp';
import {
  accessTokenAad, appSecretAad, effectiveProvider, isCredentialError as isWaCredentialError, loadMetaAccount, metaWebhookUrl,
  openMetaSecrets, platformMetaConfigured, registerPhoneNumberId, sealMetaSecret, unregisterPhoneNumberId, verifyTokenFor, writeProviderSetting,
  type MetaAccountRow,
} from '../services/messaging/whatsapp-sender';

const integrationRoutes = new Hono<AppContext>();

integrationRoutes.use('/*', rbac(['admin']));

// ── Receiving addresses ──────────────────────────────────────

const CHANNELS = ['whatsapp', 'sms', 'email', 'voice'] as const;

const createChannelSchema = z.object({
  channel: z.enum(CHANNELS),
  address: z.string().min(3).max(200),
  provider: z.enum(['twilio', 'plivo', 'sendgrid']).optional(),
  label: z.string().max(80).optional(),
});

interface ChannelRow {
  id: string;
  channel: string;
  address: string;
  provider: string | null;
  label: string | null;
  is_active: number;
  created_at: string;
}

function toChannel(row: ChannelRow) {
  return {
    id: row.id,
    channel: row.channel,
    address: row.address,
    provider: row.provider,
    label: row.label,
    isActive: !!row.is_active,
    createdAt: row.created_at,
  };
}

integrationRoutes.get('/channels', async (c) => {
  const rows = await c.env.MASTER_DB
    .prepare(
      `SELECT id, channel, address, provider, label, is_active, created_at
       FROM tenant_channel_addresses WHERE tenant_id = ? AND channel NOT IN ('payment_webhook', 'meta_whatsapp', 'meta_verify') ORDER BY channel, created_at`,
    )
    .bind(c.get('tenantId'))
    .all<ChannelRow>();
  return success(c, rows.results.map(toChannel));
});

integrationRoutes.post('/channels', zValidator('json', createChannelSchema), async (c) => {
  const body = c.req.valid('json');
  const tenantId = c.get('tenantId');
  const address = normalizeAddress(body.channel, body.address);

  const isEmail = body.channel === 'email';
  if (isEmail ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) : !/^\+\d{8,15}$/.test(address)) {
    return error(c, isEmail ? 'Enter a valid email address' : 'Enter a valid phone number with country code', 400);
  }

  // R305: a phone number the platform rents from the provider belongs to the agency that bought it (voip_number_registry,
  // written only by the purchase path). A voice line can only be registered if this agency owns it there, and no channel
  // can claim a number another agency (or nobody) holds there: the same answer in every case, so nothing leaks.
  if (!isEmail) {
    const owner = await c.env.MASTER_DB
      .prepare(`SELECT tenant_id FROM voip_number_registry WHERE phone_number = ? AND status <> 'released' LIMIT 1`)
      .bind(address)
      .first<{ tenant_id: string }>();
    if (body.channel === 'voice' && owner?.tenant_id !== tenantId) {
      return error(c, 'This number is not on your account. Buy a number from Calling settings; numbers cannot be added by hand.', 409, { code: 'NUMBER_NOT_OWNED' });
    }
    if (owner && owner.tenant_id !== tenantId) {
      return error(c, 'This address is registered to another workspace', 409);
    }
  }

  const taken = await c.env.MASTER_DB
    .prepare('SELECT tenant_id FROM tenant_channel_addresses WHERE channel = ? AND address = ?')
    .bind(body.channel, address)
    .first<{ tenant_id: string }>();
  if (taken) {
    // Never reveal which workspace holds an address.
    return error(
      c,
      taken.tenant_id === tenantId ? 'This address is already registered' : 'This address is registered to another workspace',
      409,
    );
  }

  const id = generateId();
  await c.env.MASTER_DB
    .prepare(
      `INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address, provider, label) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, tenantId, body.channel, address, body.provider ?? null, body.label?.trim() || null)
    .run();

  const row = await c.env.MASTER_DB
    .prepare('SELECT id, channel, address, provider, label, is_active, created_at FROM tenant_channel_addresses WHERE id = ?')
    .bind(id)
    .first<ChannelRow>();
  return created(c, toChannel(row!));
});

integrationRoutes.delete('/channels/:id', async (c) => {
  const result = await c.env.MASTER_DB
    .prepare('DELETE FROM tenant_channel_addresses WHERE id = ? AND tenant_id = ?')
    .bind(c.req.param('id'), c.get('tenantId'))
    .run();
  if (!result.meta.changes) return notFound(c, 'Address');
  return success(c, { deleted: true });
});

// ── Website-form API keys ────────────────────────────────────

interface ApiKeyRow {
  id: string;
  key_prefix: string | null;
  label: string | null;
  is_active: number;
  created_at: string;
}

/** Display form of a key: the stored 8-character prefix only (the full key exists once, at creation). */
function maskKey(prefix: string | null): string {
  return prefix ? `${prefix}…` : '…';
}

function newApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `tcrm_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

integrationRoutes.get('/api-keys', async (c) => {
  const rows = await c.env.MASTER_DB
    .prepare('SELECT id, key_prefix, label, is_active, created_at FROM tenant_api_keys WHERE tenant_id = ? AND is_active = 1 ORDER BY created_at')
    .bind(c.get('tenantId'))
    .all<ApiKeyRow>();
  return success(
    c,
    rows.results.map((row) => ({ id: row.id, label: row.label, maskedKey: maskKey(row.key_prefix), createdAt: row.created_at })),
  );
});

integrationRoutes.post('/api-keys', zValidator('json', z.object({ label: z.string().max(80).optional() })), async (c) => {
  const { label } = c.req.valid('json');
  const id = generateId();
  const apiKey = newApiKey();
  // Only the hash and an 8-character prefix are stored; api_key stays '' (legacy column).
  await c.env.MASTER_DB
    .prepare("INSERT INTO tenant_api_keys (id, tenant_id, api_key, key_hash, key_prefix, label, is_active) VALUES (?, ?, '', ?, ?, ?, 1)")
    .bind(id, c.get('tenantId'), await hashApiKey(apiKey), apiKey.slice(0, 8), label?.trim() || null)
    .run();
  // The full key is returned only here; afterwards it is shown masked.
  return created(c, { id, label: label?.trim() || null, apiKey, maskedKey: maskKey(apiKey.slice(0, 8)) });
});

integrationRoutes.delete('/api-keys/:id', async (c) => {
  const result = await c.env.MASTER_DB
    .prepare('UPDATE tenant_api_keys SET is_active = 0 WHERE id = ? AND tenant_id = ? AND is_active = 1')
    .bind(c.req.param('id'), c.get('tenantId'))
    .run();
  if (!result.meta.changes) return notFound(c, 'API key');
  return success(c, { revoked: true });
});

// ── Payment gateways: the agency's OWN Razorpay or Stripe (R207) ─────────────
//   GET    /integrations/payment-gateways               connected accounts (secrets never returned: last 4 only)
//   PUT    /integrations/payment-gateways/:gateway      connect or update (keys pasted by the agency)
//   POST   /integrations/payment-gateways/:gateway/test "Test connection" (an authenticated read at the gateway)
//   DELETE /integrations/payment-gateways/:gateway      disconnect
// The webhook URL to paste into the gateway's dashboard is returned with each account.

const keyField = z.string().trim().min(8).max(200);

const connectGatewaySchema = z.object({
  mode: z.enum(['test', 'live']),
  keyId: z.string().trim().min(3).max(120).optional(),
  keySecret: keyField.optional(),
  webhookSecret: keyField.optional(),
  isActive: z.boolean().optional(),
});

function last4(value: string | null | undefined): string | null {
  return value ? value.slice(-4) : null;
}

function accountView(c: Context<AppContext>, row: AccountRow, key: string | null) {
  return {
    gateway: row.gateway,
    mode: row.mode,
    isActive: !!row.is_active,
    keyConfigured: !!row.secret_enc,
    keyIdLast4: last4(row.key_id),
    secretLast4: row.secret_last4,
    webhookSecretConfigured: !!row.webhook_secret_enc,
    lastTestedAt: row.last_tested_at,
    webhookUrl: key ? webhookUrl(c.env, c.req.url, key, row.gateway) : null,
  };
}

integrationRoutes.get('/payment-gateways', async (c) => {
  const rows = await listAccounts(c.get('tenantDb'));
  const key = rows.length ? await webhookKeyFor(c.env, c.get('tenantId'), true) : null;
  return success(c, { accounts: rows.map((row) => accountView(c, row, key)) });
});

integrationRoutes.put('/payment-gateways/:gateway', zValidator('json', connectGatewaySchema), async (c) => {
  const gateway = c.req.param('gateway');
  if (!isAgencyGateway(gateway)) return notFound(c, 'Payment gateway');
  const body = c.req.valid('json');
  const db = c.get('tenantDb');
  const existing = await loadAccount(db, gateway);

  const keyId = body.keyId ?? existing?.key_id ?? null;
  if (gateway === 'razorpay') {
    if (!keyId) return error(c, 'Enter the Razorpay key id', 400);
    if (!/^rzp_(test|live)_/.test(keyId)) return error(c, 'A Razorpay key id starts with rzp_test_ or rzp_live_', 400);
    if (keyId.startsWith('rzp_live_') !== (body.mode === 'live')) return error(c, `This key id is for ${body.mode === 'live' ? 'test' : 'live'} mode`, 400);
  } else if (body.keySecret) {
    if (!/^(sk|rk)_(test|live)_/.test(body.keySecret)) return error(c, 'A Stripe secret key starts with sk_test_, sk_live_ or rk_', 400);
    if (/_live_/.test(body.keySecret) !== (body.mode === 'live')) return error(c, `This key is for ${body.mode === 'live' ? 'test' : 'live'} mode`, 400);
  }
  if (!existing?.secret_enc && !body.keySecret) return error(c, 'Enter the secret key', 400);
  if (body.webhookSecret && gateway === 'stripe' && !body.webhookSecret.startsWith('whsec_')) {
    return error(c, 'A Stripe webhook signing secret starts with whsec_', 400);
  }

  const id = existing?.id ?? generateId();
  try {
    const secretEnc = body.keySecret ? await seal(c.env, body.keySecret, secretAad(id)) : existing!.secret_enc;
    const webhookEnc = body.webhookSecret ? await seal(c.env, body.webhookSecret, webhookSecretAad(id)) : existing?.webhook_secret_enc ?? null;
    const secretLast4 = body.keySecret ? last4(body.keySecret) : existing!.secret_last4;
    const active = body.isActive === undefined ? existing?.is_active ?? 1 : body.isActive ? 1 : 0;
    if (existing) {
      await db
        .prepare(
          `UPDATE payment_gateway_accounts SET mode = ?, key_id = ?, secret_enc = ?, secret_last4 = ?, webhook_secret_enc = ?, is_active = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(body.mode, keyId, secretEnc, secretLast4, webhookEnc, active, new Date().toISOString(), id)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO payment_gateway_accounts (id, gateway, mode, key_id, secret_enc, secret_last4, webhook_secret_enc, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, gateway, body.mode, keyId, secretEnc, secretLast4, webhookEnc, active)
        .run();
    }
  } catch (e) {
    if (e instanceof CredentialsKeyMissing) return error(c, 'Credential encryption keys are not configured', 503, { code: 'CREDENTIALS_UNAVAILABLE' });
    throw e;
  }

  const key = await webhookKeyFor(c.env, c.get('tenantId'), true);
  const row = (await loadAccount(db, gateway))!;
  return success(c, accountView(c, row, key));
});

integrationRoutes.post('/payment-gateways/:gateway/test', async (c) => {
  const gateway = c.req.param('gateway');
  if (!isAgencyGateway(gateway)) return notFound(c, 'Payment gateway');
  const db = c.get('tenantDb');
  const row = await loadAccount(db, gateway);
  if (!row) return notFound(c, 'Payment gateway');
  let creds;
  try {
    creds = await openCredentials(c.env, row);
  } catch (e) {
    if (isCredentialError(e)) return error(c, 'Stored keys cannot be opened; enter them again', 503, { code: 'CREDENTIALS_UNAVAILABLE' });
    throw e;
  }
  if (!creds) return error(c, 'No keys saved', 400);
  const result = await testConnection(creds);
  if (result.ok) await db.prepare('UPDATE payment_gateway_accounts SET last_tested_at = ? WHERE id = ?').bind(new Date().toISOString(), row.id).run();
  return success(c, result);
});

integrationRoutes.delete('/payment-gateways/:gateway', async (c) => {
  const gateway = c.req.param('gateway');
  if (!isAgencyGateway(gateway)) return notFound(c, 'Payment gateway');
  const result = await c.get('tenantDb').prepare('DELETE FROM payment_gateway_accounts WHERE gateway = ?').bind(gateway).run();
  if (!result.meta.changes) return notFound(c, 'Payment gateway');
  return success(c, { deleted: true });
});

// ── WhatsApp through Meta's Cloud API (R213) ─────────────────────────────────
//   GET    /integrations/whatsapp              provider in use + the agency's Meta number (secrets never returned: last 4 only)
//   PUT    /integrations/whatsapp/provider     choose twilio | meta
//   PUT    /integrations/whatsapp/meta         connect or update the agency's own WhatsApp number
//   POST   /integrations/whatsapp/meta/test    "Test connection" (an authenticated read at Meta)
//   DELETE /integrations/whatsapp/meta         disconnect
// The webhook URL and verify token to paste into the Meta app's WhatsApp configuration come with the account.

const connectMetaSchema = z.object({
  phoneNumberId: z.string().trim().regex(/^\d{5,25}$/, 'The phone number id is the numeric id shown in Meta WhatsApp Manager').optional(),
  wabaId: z.string().trim().regex(/^\d{5,25}$/, 'The WhatsApp Business Account id is numeric').optional(),
  displayPhone: z.string().trim().max(40).optional(),
  accessToken: z.string().trim().min(16).max(1000).optional(),
  appSecret: z.string().trim().min(16).max(200).optional(),
  isActive: z.boolean().optional(),
});

async function whatsappView(c: Context<AppContext>, row: MetaAccountRow | null) {
  const db = c.get('tenantDb');
  const choice = await effectiveProvider(c.env, db);
  const token = row ? await verifyTokenFor(c.env, c.get('tenantId'), true) : null;
  return {
    provider: choice.choice,
    providerExplicit: choice.explicit,
    platformConfigured: platformMetaConfigured(c.env),
    platformTokenAvailable: !!c.env.WHATSAPP_META_TOKEN,
    account: row
      ? {
          phoneNumberId: row.phone_number_id,
          wabaId: row.waba_id,
          displayPhone: row.display_phone,
          isActive: !!row.is_active,
          tokenConfigured: !!row.access_token_enc,
          tokenLast4: row.access_token_last4,
          appSecretConfigured: !!row.app_secret_enc,
          lastTestedAt: row.last_tested_at,
        }
      : null,
    webhookUrl: metaWebhookUrl(c.env, c.req.url),
    verifyToken: token,
  };
}

integrationRoutes.get('/whatsapp', async (c) => {
  return success(c, await whatsappView(c, await loadMetaAccount(c.get('tenantDb')).catch(() => null)));
});

integrationRoutes.put('/whatsapp/provider', zValidator('json', z.object({ provider: z.enum(['twilio', 'meta']) })), async (c) => {
  const { provider } = c.req.valid('json');
  const db = c.get('tenantDb');
  const account = await loadMetaAccount(db).catch(() => null);
  if (provider === 'meta' && !account && !platformMetaConfigured(c.env)) {
    return error(c, 'Connect your WhatsApp number on Meta first', 400);
  }
  await writeProviderSetting(db, provider);
  return success(c, await whatsappView(c, account));
});

integrationRoutes.put('/whatsapp/meta', zValidator('json', connectMetaSchema), async (c) => {
  const body = c.req.valid('json');
  const db = c.get('tenantDb');
  const tenantId = c.get('tenantId');
  const existing = await loadMetaAccount(db);

  const phoneNumberId = body.phoneNumberId ?? existing?.phone_number_id;
  if (!phoneNumberId) return error(c, 'Enter the WhatsApp phone number id', 400);
  if (!existing?.access_token_enc && !body.accessToken && !c.env.WHATSAPP_META_TOKEN) {
    return error(c, 'Enter the access token from your Meta app', 400);
  }

  const id = existing?.id ?? generateId();
  try {
    if (!(await registerPhoneNumberId(c.env, tenantId, phoneNumberId, body.displayPhone?.trim() || existing?.display_phone || null))) {
      // Never reveal which workspace holds the number.
      return error(c, 'This WhatsApp number is registered to another workspace', 409);
    }
    const tokenEnc = body.accessToken ? await sealMetaSecret(c.env, body.accessToken, accessTokenAad(id)) : existing?.access_token_enc ?? null;
    const secretEnc = body.appSecret ? await sealMetaSecret(c.env, body.appSecret, appSecretAad(id)) : existing?.app_secret_enc ?? null;
    const last4 = body.accessToken ? body.accessToken.slice(-4) : existing?.access_token_last4 ?? null;
    const active = body.isActive === undefined ? existing?.is_active ?? 1 : body.isActive ? 1 : 0;
    const now = new Date().toISOString();
    if (existing) {
      await db
        .prepare(
          `UPDATE whatsapp_meta_accounts SET phone_number_id = ?, waba_id = ?, display_phone = ?, access_token_enc = ?, access_token_last4 = ?, app_secret_enc = ?, is_active = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(phoneNumberId, body.wabaId ?? existing.waba_id, body.displayPhone?.trim() ?? existing.display_phone, tokenEnc, last4, secretEnc, active, now, id)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO whatsapp_meta_accounts (id, phone_number_id, waba_id, display_phone, access_token_enc, access_token_last4, app_secret_enc, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, phoneNumberId, body.wabaId ?? null, body.displayPhone?.trim() || null, tokenEnc, last4, secretEnc, active)
        .run();
    }
  } catch (e) {
    if (e instanceof CredentialsKeyMissing) return error(c, 'Credential encryption keys are not configured', 503, { code: 'CREDENTIALS_UNAVAILABLE' });
    throw e;
  }
  return success(c, await whatsappView(c, await loadMetaAccount(db)));
});

integrationRoutes.post('/whatsapp/meta/test', async (c) => {
  const db = c.get('tenantDb');
  const row = await loadMetaAccount(db);
  if (!row) return notFound(c, 'WhatsApp account');
  let token: string | null = null;
  try {
    token = (await openMetaSecrets(c.env, row)).accessToken ?? c.env.WHATSAPP_META_TOKEN ?? null;
  } catch (e) {
    if (isWaCredentialError(e)) return error(c, 'Stored token cannot be opened; enter it again', 503, { code: 'CREDENTIALS_UNAVAILABLE' });
    throw e;
  }
  if (!token) return error(c, 'No access token saved', 400);
  const result = await new MetaWhatsAppProvider({ accessToken: token, phoneNumberId: row.phone_number_id, graphVersion: c.env.WHATSAPP_META_GRAPH_VERSION || undefined }).testConnection();
  if (result.ok) {
    await db
      .prepare('UPDATE whatsapp_meta_accounts SET last_tested_at = ?, display_phone = COALESCE(display_phone, ?) WHERE id = ?')
      .bind(new Date().toISOString(), result.displayPhone ?? null, row.id)
      .run();
  }
  return success(c, { ok: result.ok, message: result.message });
});

integrationRoutes.delete('/whatsapp/meta', async (c) => {
  const db = c.get('tenantDb');
  const result = await db.prepare('DELETE FROM whatsapp_meta_accounts').run();
  if (!result.meta.changes) return notFound(c, 'WhatsApp account');
  await unregisterPhoneNumberId(c.env, c.get('tenantId'));
  // Without an account, Meta only works on the platform's number; otherwise fall back to Twilio.
  const choice = await effectiveProvider(c.env, db);
  if (choice.choice === 'meta' && !platformMetaConfigured(c.env)) await writeProviderSetting(db, 'twilio');
  return success(c, { deleted: true });
});

export default integrationRoutes;
