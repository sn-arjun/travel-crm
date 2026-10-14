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
import { findContactByPhone, findOpenLeadForContact } from '../services/call-routing';
import { createVoipProvider, loadVoipSettings, sealVoipSecret, credentialsAwareErrorHandler } from '../services/voip-provider';
import type { VoipSettingsRow, VoipProviderName } from '../services/voip-provider';

const voipRoutes = new Hono<AppContext>();
voipRoutes.onError(credentialsAwareErrorHandler);

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

// ── POST /token — Generate client token for browser/app calling ─
// TICKET-369

voipRoutes.post('/token', async (c) => {
  const userId = c.get('userId');
  const db = c.get('tenantDb');
  const settings = await loadVoipSettings(c.env, db);

  if (!settings) {
    return error(c, 'VoIP not configured. Please set up credentials in Settings.', 422);
  }

  try {
    const provider = createVoipProvider(c.env, settings);
    const token = await provider.generateClientToken(userId);
    return success(c, {
      token: token.token,
      identity: token.identity,
      expiresAt: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
      provider: settings.voipProvider,
    });
  } catch (e: any) {
    return error(c, e.message || 'Failed to generate VoIP token', 422);
  }
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

// ── Numbers CRUD — Provider-agnostic (TICKET-390) ───────────────
// Uses voip_numbers table (new) with fallback to twilio_numbers (legacy)

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

  return success(c, (rows.results || []).map((r: any) => ({
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
  })));
});

voipRoutes.post('/numbers/search', rbac(['admin']), async (c) => {
  const db = c.get('tenantDb');
  const body = await c.req.json() as { country?: string; areaCode?: string; contains?: string };
  const settings = await loadVoipSettings(c.env, db);

  if (!settings) {
    return error(c, 'VoIP credentials not configured', 422);
  }

  try {
    const provider = createVoipProvider(c.env, settings);
    const numbers = await provider.searchAvailableNumbers(
      body.country || 'US',
      body.areaCode,
      body.contains,
    );
    return success(c, numbers.slice(0, 20));
  } catch (e: any) {
    return error(c, e.message || 'Failed to search numbers', 502);
  }
});

voipRoutes.post('/numbers/purchase', rbac(['admin']), async (c) => {
  const db = c.get('tenantDb');
  const body = await c.req.json() as { phoneNumber: string; friendlyName?: string };
  const settings = await loadVoipSettings(c.env, db);

  if (!settings) {
    return error(c, 'VoIP credentials not configured', 422);
  }

  const baseUrl = c.req.url.replace(/\/api\/v1\/voip\/numbers\/purchase.*$/, '');

  try {
    const provider = createVoipProvider(c.env, settings);
    const result = await provider.purchaseNumber(
      body.phoneNumber,
      body.friendlyName,
      baseUrl,
    );

    // Check if first number (auto-set as default)
    let count: { cnt: number } | null;
    try {
      count = await db.prepare('SELECT COUNT(*) as cnt FROM voip_numbers').first<{ cnt: number }>();
    } catch {
      count = await db.prepare('SELECT COUNT(*) as cnt FROM twilio_numbers').first<{ cnt: number }>();
    }
    const isFirst = (count?.cnt ?? 0) === 0;

    const id = generateId();

    // Insert into voip_numbers (new table)
    try {
      await db.prepare(`
        INSERT INTO voip_numbers (id, phone_number, friendly_name, provider_number_id, provider, purpose, is_default, monthly_cost, capabilities)
        VALUES (?, ?, ?, ?, ?, 'general', ?, 0, ?)
      `).bind(
        id,
        result.phoneNumber,
        result.friendlyName,
        result.providerNumberId,
        settings.voipProvider,
        isFirst ? 1 : 0,
        JSON.stringify(result.capabilities),
      ).run();
    } catch {
      // Fallback: insert into twilio_numbers if voip_numbers doesn't exist
      await db.prepare(`
        INSERT INTO twilio_numbers (id, phone_number, friendly_name, twilio_sid, purpose, is_default, monthly_cost, capabilities)
        VALUES (?, ?, ?, ?, 'general', ?, 0, ?)
      `).bind(
        id,
        result.phoneNumber,
        result.friendlyName,
        result.providerNumberId,
        isFirst ? 1 : 0,
        JSON.stringify(result.capabilities),
      ).run();
    }

    return success(c, { id, phoneNumber: result.phoneNumber, providerNumberId: result.providerNumberId });
  } catch (e: any) {
    return error(c, e.message || 'Failed to purchase number', 502);
  }
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

  await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();

  // If we deleted the default, promote the next one
  if (existing.is_default) {
    await db.prepare(`UPDATE ${table} SET is_default = 1 WHERE id = (SELECT id FROM ${table} ORDER BY created_at ASC LIMIT 1)`).run();
  }

  return success(c, { message: 'Number released' });
});

export default voipRoutes;
