/**
 * VoIP Routes — Settings, Token, Number Management
 *
 * TICKET-367: VoIP Settings GET/PUT
 * TICKET-369: Client Token endpoint
 * TICKET-390: Number management (search, purchase, release)
 *
 * Provider-agnostic: supports Twilio and Plivo via VoipProvider interface.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, error } from '../utils/response';
import { rbac } from '../middleware/rbac';
import { rateLimit } from '../middleware/rate-limit';
import { findContactByPhone, findOpenLeadForContact } from '../services/call-routing';
import { createVoipProvider, loadVoipSettings, sealVoipSecret } from '../services/voip-provider';
import { voipErrorHandler } from '../services/voip/http';
import { loadTenant } from '../services/billing/subscriptions';
import { accountView, agencyCountry, decisionFor, enableCalling, getAccount } from '../services/voip/subaccounts';
import { getKyc, kycView, numberOffer, purchaseNumber, releaseTenantNumber, searchNumbers, submitKyc, type RegistryRow } from '../services/voip/numbers';
import type { VoipSettingsRow, VoipProviderName } from '../services/voip-provider';

const voipRoutes = new Hono<AppContext>();
voipRoutes.onError(voipErrorHandler);

// ── Schemas ───────────────────────────────────────────────────

const updateSettingsSchema = z.object({
  voipProvider: z.enum(['twilio', 'plivo']).optional(),
  // Generic provider credentials
  providerAccountId: z.string().optional().nullable(),
  providerAuthToken: z.string().optional().nullable(),
  providerApiKeyId: z.string().optional().nullable(),
  providerApiKeySecret: z.string().optional().nullable(),
  providerAppId: z.string().optional().nullable(),
  // Legacy Twilio-specific
  twilioAccountSid: z.string().regex(/^AC[0-9a-f]{32}$/i).optional().nullable(),
  twilioAuthToken: z.string().length(32).optional().nullable(),
  twilioApiKeySid: z.string().optional().nullable(),
  twilioApiKeySecret: z.string().optional().nullable(),
  twilioTwimlAppSid: z.string().optional().nullable(),
  // Common settings
  defaultCallerId: z.string().regex(/^\+[1-9]\d{9,14}$/).optional().nullable(),
  recordingPolicy: z.enum(['all', 'inbound', 'outbound', 'none']).optional(),
  ivrEnabled: z.boolean().optional(),
  ivrConfig: z.object({
    greeting: z.string(),
    options: z.array(z.object({
      digit: z.string().length(1),
      label: z.string(),
      action: z.enum(['queue', 'extension', 'voicemail']),
      target: z.string(),
    })),
  }).optional().nullable(),
  businessHoursEnabled: z.boolean().optional(),
  businessHours: z.object({
    timezone: z.string(),
    schedule: z.record(z.string(), z.object({
      start: z.string(),
      end: z.string(),
      enabled: z.boolean(),
    })),
  }).optional().nullable(),
  voicemailEnabled: z.boolean().optional(),
  voicemailGreetingUrl: z.string().url().optional().nullable(),
  maxRingDuration: z.number().int().min(10).max(60).optional(),
  routingStrategy: z.enum(['assigned', 'round_robin', 'least_recent']).optional(),
});

// ── Helper: load full VoIP settings ─────────────────────────────


/** Mask sensitive string: show only last 4 chars */
function maskSecret(val: string | null): string | null {
  if (!val) return null;
  return val.length > 4 ? `****${val.slice(-4)}` : '****';
}

// ── GET /settings — Retrieve VoIP settings ────────────────────

voipRoutes.get('/settings', rbac(['admin']), async (c) => {
  const db = c.get('tenantDb');

  let row = await db.prepare('SELECT * FROM voip_settings LIMIT 1').first<Record<string, any>>();

  // Auto-create default row if absent
  if (!row) {
    const id = generateId();
    await db.prepare('INSERT INTO voip_settings (id) VALUES (?)').bind(id).run();
    row = await db.prepare('SELECT * FROM voip_settings WHERE id = ?').bind(id).first<Record<string, any>>();
  }

  if (!row) {
    return error(c, 'Failed to initialize VoIP settings', 500);
  }

  // Parse JSON fields
  let ivrConfig = row.ivr_config;
  if (ivrConfig && typeof ivrConfig === 'string') {
    try { ivrConfig = JSON.parse(ivrConfig); } catch { /* keep string */ }
  }
  let businessHours = row.business_hours;
  if (businessHours && typeof businessHours === 'string') {
    try { businessHours = JSON.parse(businessHours); } catch { /* keep string */ }
  }

  // Masks show the last four characters of the real value, so the stored (encrypted) value is opened first.
  const secrets = await loadVoipSettings(c.env, db);

  return success(c, {
    id: row.id,
    voipProvider: row.voip_provider || 'twilio',
    // Generic provider (masked)
    providerAccountId: row.provider_account_id,
    providerAuthToken: maskSecret(secrets?.providerAuthToken ?? null),
    providerApiKeyId: row.provider_api_key_id,
    providerApiKeySecret: maskSecret(secrets?.providerApiKeySecret ?? null),
    providerAppId: row.provider_app_id,
    // Legacy Twilio (masked)
    twilioAccountSid: row.twilio_account_sid,
    twilioAuthToken: maskSecret(secrets?.twilioAuthToken ?? null),
    twilioApiKeySid: row.twilio_api_key_sid,
    twilioApiKeySecret: maskSecret(secrets?.twilioApiKeySecret ?? null),
    twilioTwimlAppSid: row.twilio_twiml_app_sid,
    // Common
    defaultCallerId: row.default_caller_id,
    recordingPolicy: row.recording_policy,
    ivrEnabled: !!row.ivr_enabled,
    ivrConfig,
    businessHoursEnabled: !!row.business_hours_enabled,
    businessHours,
    voicemailEnabled: !!row.voicemail_enabled,
    voicemailGreetingUrl: row.voicemail_greeting_url,
    maxRingDuration: row.max_ring_duration,
    routingStrategy: row.routing_strategy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

// ── PUT /settings — Update VoIP settings ──────────────────────

voipRoutes.put('/settings', rbac(['admin']), zValidator('json', updateSettingsSchema), async (c) => {
  const data = c.req.valid('json');
  const db = c.get('tenantDb');

  // Ensure row exists
  let row = await db.prepare('SELECT id FROM voip_settings LIMIT 1').first<{ id: string }>();
  if (!row) {
    const id = generateId();
    await db.prepare('INSERT INTO voip_settings (id) VALUES (?)').bind(id).run();
    row = { id };
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  // Provider selection
  if (data.voipProvider !== undefined) { updates.push('voip_provider = ?'); values.push(data.voipProvider); }
  // Generic provider credentials
  if (data.providerAccountId !== undefined) { updates.push('provider_account_id = ?'); values.push(data.providerAccountId); }
  if (data.providerAuthToken !== undefined) { updates.push('provider_auth_token = ?'); values.push(await sealVoipSecret(c.env, row.id, 'provider_auth_token', data.providerAuthToken)); }
  if (data.providerApiKeyId !== undefined) { updates.push('provider_api_key_id = ?'); values.push(data.providerApiKeyId); }
  if (data.providerApiKeySecret !== undefined) { updates.push('provider_api_key_secret = ?'); values.push(await sealVoipSecret(c.env, row.id, 'provider_api_key_secret', data.providerApiKeySecret)); }
  if (data.providerAppId !== undefined) { updates.push('provider_app_id = ?'); values.push(data.providerAppId); }
  // Legacy Twilio
  if (data.twilioAccountSid !== undefined) { updates.push('twilio_account_sid = ?'); values.push(data.twilioAccountSid); }
  if (data.twilioAuthToken !== undefined) { updates.push('twilio_auth_token = ?'); values.push(await sealVoipSecret(c.env, row.id, 'twilio_auth_token', data.twilioAuthToken)); }
  if (data.twilioApiKeySid !== undefined) { updates.push('twilio_api_key_sid = ?'); values.push(data.twilioApiKeySid); }
  if (data.twilioApiKeySecret !== undefined) { updates.push('twilio_api_key_secret = ?'); values.push(await sealVoipSecret(c.env, row.id, 'twilio_api_key_secret', data.twilioApiKeySecret)); }
  if (data.twilioTwimlAppSid !== undefined) { updates.push('twilio_twiml_app_sid = ?'); values.push(data.twilioTwimlAppSid); }
  // Common
  if (data.defaultCallerId !== undefined) { updates.push('default_caller_id = ?'); values.push(data.defaultCallerId); }
  if (data.recordingPolicy !== undefined) { updates.push('recording_policy = ?'); values.push(data.recordingPolicy); }
  if (data.ivrEnabled !== undefined) { updates.push('ivr_enabled = ?'); values.push(data.ivrEnabled ? 1 : 0); }
  if (data.ivrConfig !== undefined) { updates.push('ivr_config = ?'); values.push(data.ivrConfig ? JSON.stringify(data.ivrConfig) : null); }
  if (data.businessHoursEnabled !== undefined) { updates.push('business_hours_enabled = ?'); values.push(data.businessHoursEnabled ? 1 : 0); }
  if (data.businessHours !== undefined) { updates.push('business_hours = ?'); values.push(data.businessHours ? JSON.stringify(data.businessHours) : null); }
  if (data.voicemailEnabled !== undefined) { updates.push('voicemail_enabled = ?'); values.push(data.voicemailEnabled ? 1 : 0); }
  if (data.voicemailGreetingUrl !== undefined) { updates.push('voicemail_greeting_url = ?'); values.push(data.voicemailGreetingUrl); }
  if (data.maxRingDuration !== undefined) { updates.push('max_ring_duration = ?'); values.push(data.maxRingDuration); }
  if (data.routingStrategy !== undefined) { updates.push('routing_strategy = ?'); values.push(data.routingStrategy); }

  if (updates.length === 0) {
    return success(c, { message: 'No changes' });
  }

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");

  const query = `UPDATE voip_settings SET ${updates.join(', ')} WHERE id = ?`;
  values.push(row.id);

  await db.prepare(query).bind(...values).run();

  return success(c, { message: 'VoIP settings updated' });
});

// ── GET /test-connection — Validate VoIP credentials ────────────

voipRoutes.get('/test-connection', rbac(['admin']), async (c) => {
  const db = c.get('tenantDb');
  const settings = await loadVoipSettings(c.env, db);

  if (!settings) {
    return error(c, 'VoIP not configured', 422);
  }

  try {
    const provider = createVoipProvider(c.env, settings);
    const result = await provider.testConnection();
    return success(c, result);
  } catch (e: any) {
    return success(c, { connected: false, error: e.message || 'Connection failed' });
  }
});

// ── GET /token — Generate client token for browser/app calling ─
// TICKET-369

// R307: the softphone's access token. Agent roles only; the agency must be allowed calling (country, plan) and
// have an active sub-account; the identity is derived here from the signed-in user (never from the request);
// short-lived (SOFTPHONE_TOKEN_TTL_SECONDS), so the app asks again before it runs out.
export const SOFTPHONE_TOKEN_TTL_SECONDS = 900;
const AGENT_ROLES = ['admin', 'sales_manager', 'salesperson'] as const;

const tokenRateLimit = rateLimit({ limit: 20, windowMs: 60_000, keyPrefix: 'rl:voip-token' });

function notAvailable(c: Parameters<typeof error>[0], message: string, reason: string, status = 403) {
  return error(c, message, status, { code: 'CALLING_NOT_AVAILABLE', reason });
}

voipRoutes.get('/token', rbac([...AGENT_ROLES]), tokenRateLimit, async (c) => {
  const env = c.env;
  const userId = c.get('userId');
  const tenantId = c.get('tenantId');
  const db = c.get('tenantDb');

  const tenant = await loadTenant(env, tenantId);
  if (!tenant) return error(c, 'Agency not found', 404);
  const decision = await decisionFor(env, tenant, db);
  if (!decision.allowed) return notAvailable(c, decision.message ?? 'Calling is not available for this agency.', decision.reason ?? 'not_allowed');

  const account = await getAccount(env, tenantId);
  if (!account || account.status !== 'active' || !account.sub_account_id) {
    return notAvailable(c, 'Calling is not turned on for this agency.', account?.status === 'suspended' ? 'suspended' : 'no_account');
  }

  let settings = await loadVoipSettings(env, db);
  // Tokens come from the agency's own sub-account; credentials of another account are never used for them.
  if (!settings || settings.providerAccountId !== account.sub_account_id) {
    return notAvailable(c, 'Calling is not turned on for this agency.', 'no_account', 409);
  }

  const user = await db.prepare('SELECT is_active FROM users WHERE id = ?').bind(userId).first<{ is_active: number }>();
  if (!user || !user.is_active) return error(c, 'User not found', 403);

  // The first token of an agency creates the key that signs them, inside its sub-account.
  if (!settings.providerApiKeyId || !settings.providerApiKeySecret) {
    const provider = createVoipProvider(env, settings);
    if (provider.provisionSoftphoneKey) {
      const key = await provider.provisionSoftphoneKey();
      const sealedSecret = await sealVoipSecret(env, settings.id, 'provider_api_key_secret', key.apiKeySecret);
      await db
        .prepare(`UPDATE voip_settings SET provider_api_key_id = ?, provider_api_key_secret = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`)
        .bind(key.apiKeyId, sealedSecret, settings.id)
        .run();
      settings = (await loadVoipSettings(env, db)) ?? settings;
    }
  }

  const provider = createVoipProvider(env, settings);
  const token = await provider.generateClientToken(userId, { ttlSeconds: SOFTPHONE_TOKEN_TTL_SECONDS });
  return success(c, {
    token: token.token,
    identity: token.identity,
    expiresIn: token.expiresIn,
    expiresAt: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
    provider: provider.providerName,
  });
});

// ── GET /caller-info — Identify caller by phone (TICKET-380) ──

voipRoutes.get('/caller-info', async (c) => {
  const db = c.get('tenantDb');
  const phone = c.req.query('phone');

  if (!phone) return error(c, 'Phone number required', 400);

  const contact = await findContactByPhone(db, phone);
  const lead = contact ? await findOpenLeadForContact(db, contact.id) : null;

  // Get last interaction
  let lastInteraction: string | null = null;
  if (contact) {
    const lastCall = await db.prepare(`
      SELECT created_at FROM call_logs WHERE contact_id = ? ORDER BY created_at DESC LIMIT 1
    `).bind(contact.id).first<{ created_at: string }>();
    lastInteraction = lastCall?.created_at ?? null;
  }

  return success(c, {
    isKnown: !!contact,
    contact: contact ? {
      id: contact.id,
      name: contact.name,
      company: contact.company,
      type: contact.type,
      phone: contact.phone,
      email: contact.email,
      lastInteraction,
    } : null,
    lead: lead ? {
      id: lead.id,
      title: lead.title,
      status: lead.status,
      value: lead.estimated_value,
    } : null,
  });
});

// ── Calling account (one provider sub-account per agency, R304) ──

const kycSchema = z.object({
  country: z.string().length(2).optional(),
  details: z.object({
    businessName: z.string().trim().min(1).max(200),
    address: z.string().trim().min(1).max(500),
    registrationNumber: z.string().trim().max(100).optional(),
    contactName: z.string().trim().max(200).optional(),
  }),
  files: z.array(z.object({ name: z.string().trim().min(1).max(200), url: z.string().url().max(2000) })).max(10).default([]),
});

voipRoutes.get('/account', rbac(['admin']), async (c) => {
  const env = c.env;
  const tenantId = c.get('tenantId');
  const db = c.get('tenantDb');
  const tenant = await loadTenant(env, tenantId);
  if (!tenant) return error(c, 'Agency not found', 404);
  const decision = await decisionFor(env, tenant, db);
  const policy = decision.policy;
  return success(c, {
    available: decision.allowed,
    reason: decision.reason,
    message: decision.message,
    country: decision.country,
    position: policy?.position ?? null,
    notes: policy?.notes ?? null,
    account: accountView(await getAccount(env, tenantId)),
  });
});

voipRoutes.post('/account/enable', rbac(['admin']), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { replaceOwnCredentials?: boolean };
  const { account, created } = await enableCalling(c.env, c.get('tenantId'), { db: c.get('tenantDb'), replaceOwnCredentials: body.replaceOwnCredentials === true });
  return success(c, { created, account: accountView(account) });
});

// ── Number offer and KYC ──

voipRoutes.get('/number-offer', rbac(['admin']), async (c) => {
  return success(c, await numberOffer(c.env, c.get('tenantId'), c.get('tenantDb')));
});

voipRoutes.get('/kyc', rbac(['admin']), async (c) => {
  const tenant = await loadTenant(c.env, c.get('tenantId'));
  if (!tenant) return error(c, 'Agency not found', 404);
  const country = (c.req.query('country') || (await agencyCountry(c.env, tenant, c.get('tenantDb')))).toUpperCase();
  return success(c, { country, document: kycView(await getKyc(c.env, tenant.id, country)) });
});

voipRoutes.post('/kyc', rbac(['admin']), zValidator('json', kycSchema), async (c) => {
  const data = c.req.valid('json');
  const tenant = await loadTenant(c.env, c.get('tenantId'));
  if (!tenant) return error(c, 'Agency not found', 404);
  const own = (await agencyCountry(c.env, tenant, c.get('tenantDb'))).toUpperCase();
  const country = (data.country || own).toUpperCase();
  // Documents are for the agency's own country only.
  if (!country || country !== own) return error(c, 'Documents can be submitted for your own country only.', 403, { code: 'COUNTRY_MISMATCH', country: own });
  const row = await submitKyc(c.env, tenant.id, country, { details: data.details as Record<string, string>, files: data.files });
  return success(c, { document: kycView(row) });
});

// ── Numbers CRUD — Provider-agnostic (TICKET-390), rented through the agency's sub-account (R304) ──
// voip_numbers is the agency's own list; master voip_number_registry holds ownership, rent and release.

voipRoutes.get('/numbers', rbac(['admin']), async (c) => {
  const db = c.get('tenantDb');

  // Try voip_numbers first, fall back to twilio_numbers
  let rows;
  try {
    rows = await db.prepare(`
      SELECT vn.*, u.name as assigned_name
      FROM voip_numbers vn
      LEFT JOIN users u ON vn.assigned_to = u.id
      ORDER BY vn.is_default DESC, vn.created_at ASC
    `).all();
  } catch {
    // voip_numbers table may not exist yet (migration not run)
    rows = await db.prepare(`
      SELECT tn.*, u.name as assigned_name
      FROM twilio_numbers tn
      LEFT JOIN users u ON tn.assigned_to = u.id
      ORDER BY tn.is_default DESC, tn.created_at ASC
    `).all();
  }

  // Rent state from the registry (paid-through month, a scheduled release) joined by the agency's number id.
  const registry = await c.env.MASTER_DB
    .prepare(`SELECT * FROM voip_number_registry WHERE tenant_id = ? AND status IN ('active', 'release_scheduled')`)
    .bind(c.get('tenantId'))
    .all<RegistryRow>();
  const byNumber = new Map((registry.results ?? []).map((r) => [r.tenant_number_id, r]));

  return success(c, (rows.results || []).map((r: any) => {
    const reg = byNumber.get(r.id);
    return {
      id: r.id,
      phoneNumber: r.phone_number,
      friendlyName: r.friendly_name,
      providerNumberId: r.provider_number_id || r.twilio_sid,
      provider: r.provider || 'twilio',
      assignedTo: r.assigned_to,
      assignedName: r.assigned_name,
      purpose: r.purpose,
      isDefault: !!r.is_default,
      monthlyCost: r.monthly_cost,
      capabilities: r.capabilities ? JSON.parse(r.capabilities) : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      rental: reg ? { status: reg.status, paidThrough: reg.paid_through, releaseAt: reg.release_at, releaseReason: reg.release_reason, currency: reg.currency, monthlyPrice: reg.monthly_price } : null,
    };
  }));
});

voipRoutes.post('/numbers/search', rbac(['admin']), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { country?: string; areaCode?: string; contains?: string };
  const numbers = await searchNumbers(c.env, c.get('tenantId'), c.get('tenantDb'), body);
  return success(c, numbers);
});

voipRoutes.post('/numbers/purchase', rbac(['admin']), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { phoneNumber?: string; friendlyName?: string };
  if (!body.phoneNumber) return error(c, 'phoneNumber is required', 400);
  const publicBase = c.env.API_PUBLIC_URL?.trim().replace(/\/+$/, '');
  const result = await purchaseNumber(c.env, c.get('tenantId'), c.get('tenantDb'), {
    phoneNumber: body.phoneNumber,
    friendlyName: body.friendlyName,
    idempotencyKey: c.req.header('Idempotency-Key'),
    webhookBaseUrl: publicBase || c.req.url.replace(/\/api(\/v1)?\/voip\/numbers\/purchase.*$/, ''),
  });
  return success(c, { id: result.id, phoneNumber: result.phoneNumber, providerNumberId: result.providerNumberId, replay: result.replay });
});

voipRoutes.put('/numbers/:id', rbac(['admin']), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const body = await c.req.json() as { assignedTo?: string; purpose?: string; friendlyName?: string; isDefault?: boolean };

  // Check both tables
  let table = 'voip_numbers';
  let existing;
  try {
    existing = await db.prepare('SELECT id FROM voip_numbers WHERE id = ?').bind(id).first();
  } catch {
    table = 'twilio_numbers';
    existing = await db.prepare('SELECT id FROM twilio_numbers WHERE id = ?').bind(id).first();
  }
  if (!existing) return error(c, 'Number not found', 404);

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (body.assignedTo !== undefined) { updates.push('assigned_to = ?'); values.push(body.assignedTo); }
  if (body.purpose !== undefined) { updates.push('purpose = ?'); values.push(body.purpose); }
  if (body.friendlyName !== undefined) { updates.push('friendly_name = ?'); values.push(body.friendlyName); }
  if (body.isDefault) {
    await db.prepare(`UPDATE ${table} SET is_default = 0`).run();
    updates.push('is_default = 1');
  }

  if (updates.length === 0) return success(c, { message: 'No changes' });

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')");
  values.push(id);
  await db.prepare(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  return success(c, { message: 'Number updated' });
});

/**
 * Release a number. The provider releases it BEFORE the row goes (releaseTenantNumber): routing stops, the provider
 * gives the number back, then the agency's list and the registry are cleaned. A provider failure leaves the number in place.
 */
voipRoutes.delete('/numbers/:id', rbac(['admin']), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');

  // Check both tables
  let table = 'voip_numbers';
  let existing;
  try {
    existing = await db.prepare('SELECT id, provider_number_id as provider_id, is_default FROM voip_numbers WHERE id = ?')
      .bind(id).first<{ id: string; provider_id: string; is_default: number }>();
  } catch {
    table = 'twilio_numbers';
    existing = await db.prepare('SELECT id, twilio_sid as provider_id, is_default FROM twilio_numbers WHERE id = ?')
      .bind(id).first<{ id: string; provider_id: string; is_default: number }>();
  }
  if (!existing) return error(c, 'Number not found', 404);

  const count = await db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).first<{ cnt: number }>();
  if ((count?.cnt ?? 0) <= 1) return error(c, 'Cannot delete the only phone number', 409);

  await releaseTenantNumber(c.env, c.get('tenantId'), db, id, { providerNumberId: existing.provider_id || null });

  // The registry path removed the row and promoted a default; a number that had no registry row is removed here, after its release.
  const left = await db.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first();
  if (left) {
    await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
    if (existing.is_default) {
      await db.prepare(`UPDATE ${table} SET is_default = 1 WHERE id = (SELECT id FROM ${table} ORDER BY created_at ASC LIMIT 1)`).run();
    }
  }

  return success(c, { message: 'Number released' });
});

export default voipRoutes;
