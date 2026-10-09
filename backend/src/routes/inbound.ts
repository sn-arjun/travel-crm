/**
 * Inbound gateway routes (public; mounted under /webhooks/inbound, before auth).
 *
 *   POST /twilio/message   WhatsApp + SMS from Twilio (form-encoded, X-Twilio-Signature)
 *   POST /plivo/message    WhatsApp + SMS from Plivo  (X-Plivo-Signature-V3)
 *   POST /email/:secret    SendGrid Inbound Parse (multipart)
 *   POST /web-form         Website enquiry form (tenant API key)
 *
 * A provider only tells us which number or mailbox the customer wrote to;
 * tenant_channel_addresses maps that address to the tenant.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context } from 'hono';
import type { AppContext, Env } from '../types';
import { generateId } from '../utils/uuid';
import { twilioWebhookMiddleware } from '../middleware/twilio-webhook';
import { resolveTenantDb } from '../services/tenant-db';
import { ingestInbound, normalizeAddress, parseEmailAddress, type InboundChannel } from '../services/inbound/ingest';
import { findOrCreateContact } from '../services/domain/contacts';
import { createLead } from '../services/domain/leads';

const inboundRoutes = new Hono<AppContext>();

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

interface Waiter {
  waitUntil(promise: Promise<unknown>): void;
}

/** The request's execution context, when the runtime provides one. */
function waiterOf(c: Context<AppContext>): Waiter | undefined {
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
}

async function tenantForAddress(env: Env, channel: InboundChannel, address: string): Promise<string | null> {
  if (!address) return null;
  const row = await env.MASTER_DB
    .prepare('SELECT tenant_id FROM tenant_channel_addresses WHERE channel = ? AND address = ? AND is_active = 1')
    .bind(channel, address)
    .first<{ tenant_id: string }>();
  return row?.tenant_id ?? null;
}

async function logWebhook(
  env: Env,
  entry: { tenantId: string; apiKey?: string | null; source: string; payload: unknown; status: string; error?: string },
): Promise<void> {
  try {
    await env.MASTER_DB
      .prepare(
        `INSERT INTO webhook_log (id, tenant_id, api_key, source, payload, status, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        generateId(),
        entry.tenantId,
        entry.apiKey ?? null,
        entry.source,
        JSON.stringify(entry.payload).slice(0, 8000),
        entry.status,
        entry.error ?? null,
      )
      .run();
  } catch (err) {
    console.error('[inbound] webhook_log write failed:', err);
  }
}

function formValue(body: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

/**
 * Store a provider message for whichever tenant owns the receiving address.
 * Always resolves: a provider that gets a non-2xx keeps redelivering.
 */
async function routeProviderMessage(
  env: Env,
  waiter: Waiter | undefined,
  provider: string,
  message: { channel: InboundChannel; from: string; to: string; body: string; fromName?: string; mediaUrl?: string; externalId?: string },
  rawPayload: unknown,
): Promise<void> {
  const toAddress = normalizeAddress(message.channel, message.to);
  const tenantId = await tenantForAddress(env, message.channel, toAddress);
  if (!tenantId) {
    await logWebhook(env, { tenantId: 'unrouted', source: `${provider}:${message.channel}`, payload: rawPayload, status: 'unrouted', error: `No tenant owns ${message.channel} address ${toAddress || '(empty)'}` });
    return;
  }

  const db = await resolveTenantDb(env, tenantId);
  if (!db) {
    await logWebhook(env, { tenantId, source: `${provider}:${message.channel}`, payload: rawPayload, status: 'error', error: 'Tenant database unavailable' });
    return;
  }

  try {
    await ingestInbound(env, tenantId, db, { ...message, to: toAddress, provider }, waiter);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[inbound] ${provider} ${message.channel} ingest failed:`, detail);
    await logWebhook(env, { tenantId, source: `${provider}:${message.channel}`, payload: rawPayload, status: 'error', error: detail });
  }
}

// ── Twilio: WhatsApp + SMS ───────────────────────────────────

inboundRoutes.post('/twilio/message', twilioWebhookMiddleware, async (c) => {
  const body = (await c.req.parseBody()) as Record<string, unknown>;
  const from = formValue(body, 'From');
  const text = formValue(body, 'Body');
  const mediaUrl = formValue(body, 'MediaUrl0');

  if (from && (text || mediaUrl)) {
    const channel: InboundChannel = /^whatsapp:/i.test(from) ? 'whatsapp' : 'sms';
    await routeProviderMessage(
      c.env,
      waiterOf(c),
      'twilio',
      {
        channel,
        from,
        to: formValue(body, 'To'),
        body: text,
        fromName: formValue(body, 'ProfileName') || undefined,
        mediaUrl: mediaUrl || undefined,
        externalId: formValue(body, 'MessageSid', 'SmsMessageSid') || undefined,
      },
      body,
    );
  }

  return c.text(EMPTY_TWIML, 200, { 'Content-Type': 'text/xml' });
});

// ── Plivo: WhatsApp + SMS ────────────────────────────────────
// The channel comes from the webhook URL (?channel=whatsapp) configured on the number.

inboundRoutes.post('/plivo/message', twilioWebhookMiddleware, async (c) => {
  const contentType = c.req.header('Content-Type') || '';
  const body = (contentType.includes('application/json')
    ? await c.req.json().catch(() => ({}))
    : await c.req.parseBody()) as Record<string, unknown>;
  const from = formValue(body, 'From');
  const text = formValue(body, 'Text', 'Body');
  const mediaUrl = formValue(body, 'Media0', 'MediaUrl0');

  if (from && (text || mediaUrl)) {
    const channel: InboundChannel = c.req.query('channel') === 'whatsapp' ? 'whatsapp' : 'sms';
    await routeProviderMessage(
      c.env,
      waiterOf(c),
      'plivo',
      {
        channel,
        from,
        to: formValue(body, 'To'),
        body: text,
        mediaUrl: mediaUrl || undefined,
        externalId: formValue(body, 'MessageUUID', 'MessageUuid') || undefined,
      },
      body,
    );
  }

  return c.json({ success: true });
});

// ── Email: SendGrid Inbound Parse ────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

inboundRoutes.post('/email/:secret', async (c) => {
  // Inbound Parse is unsigned; the secret in the URL is what proves the caller.
  if (c.env.TEST_MODE !== 'true') {
    const expected = c.env.INBOUND_EMAIL_SECRET;
    if (!expected) return c.json({ error: 'Inbound email is not configured' }, 503);
    if (c.req.param('secret') !== expected) return c.json({ error: 'Forbidden' }, 403);
  }

  const body = (await c.req.parseBody()) as Record<string, unknown>;
  const sender = parseEmailAddress(formValue(body, 'from'));
  const text = formValue(body, 'text') || htmlToText(formValue(body, 'html'));
  const subject = formValue(body, 'subject');

  if (!sender.address || (!text && !subject)) {
    return c.json({ success: true, stored: false });
  }

  // The envelope holds the real recipients; "to" is only the display header.
  const recipients: string[] = [];
  try {
    const envelope = JSON.parse(formValue(body, 'envelope') || '{}') as { to?: string[] };
    for (const to of envelope.to ?? []) recipients.push(parseEmailAddress(to).address);
  } catch {
    // fall through to the header
  }
  for (const to of formValue(body, 'to').split(',')) {
    const address = parseEmailAddress(to).address;
    if (address) recipients.push(address);
  }

  let tenantId: string | null = null;
  let toAddress = '';
  for (const address of recipients) {
    tenantId = await tenantForAddress(c.env, 'email', address);
    if (tenantId) {
      toAddress = address;
      break;
    }
  }

  const payload = { from: sender.address, to: recipients, subject };
  if (!tenantId) {
    await logWebhook(c.env, { tenantId: 'unrouted', source: 'sendgrid:email', payload, status: 'unrouted', error: 'No tenant owns any recipient address' });
    return c.json({ success: true, stored: false });
  }

  const db = await resolveTenantDb(c.env, tenantId);
  if (!db) {
    await logWebhook(c.env, { tenantId, source: 'sendgrid:email', payload, status: 'error', error: 'Tenant database unavailable' });
    return c.json({ success: true, stored: false });
  }

  const messageIdHeader = formValue(body, 'headers').match(/^Message-ID:\s*(.+)$/im);

  try {
    const result = await ingestInbound(c.env, tenantId, db, {
      channel: 'email',
      from: sender.address,
      fromName: sender.name || undefined,
      to: toAddress,
      subject: subject || undefined,
      body: text,
      externalId: messageIdHeader ? messageIdHeader[1].trim() : undefined,
      provider: 'sendgrid',
    }, waiterOf(c));
    return c.json({ success: true, stored: !result.duplicate });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[inbound] email ingest failed:', detail);
    await logWebhook(c.env, { tenantId, source: 'sendgrid:email', payload, status: 'error', error: detail });
    return c.json({ success: true, stored: false });
  }
});

// ── Website enquiry form ─────────────────────────────────────

function toCount(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

/**
 * An enquiry form is an explicit request for a quote, so it becomes a contact
 * (reused when the phone or email is already known) and a lead straight away.
 */
export async function handleWebForm(c: Context<AppContext>): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const text = (key: string): string => (typeof body[key] === 'string' ? (body[key] as string).trim() : '');
  const apiKey = text('api_key');
  if (!apiKey) return c.json({ error: 'api_key is required' }, 400);

  const masterDb = c.env.MASTER_DB;
  const keyRecord = await masterDb
    .prepare('SELECT tenant_id FROM tenant_api_keys WHERE api_key = ? AND is_active = 1')
    .bind(apiKey)
    .first<{ tenant_id: string }>();
  if (!keyRecord) return c.json({ error: 'Invalid API key' }, 401);

  const tenantId = keyRecord.tenant_id;

  // Rate limiting: max 100 requests per API key per hour
  const recentRequests = await masterDb
    .prepare(`SELECT COUNT(*) as cnt FROM webhook_log WHERE api_key = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hour')`)
    .bind(apiKey)
    .first<{ cnt: number }>();
  if ((recentRequests?.cnt || 0) >= 100) return c.json({ error: 'Rate limit exceeded (100/hour)' }, 429);

  const name = text('name');
  const email = text('email');
  const phone = text('phone');
  if (!name && !email && !phone) return c.json({ error: 'name, email or phone is required' }, 400);

  const source = text('source') || 'website';

  try {
    const db = await resolveTenantDb(c.env, tenantId);
    if (!db) return c.json({ error: 'Tenant database not configured' }, 500);

    const contact = await findOrCreateContact(db, { name, email, phone, source });
    if (!contact) return c.json({ error: 'name, email or phone is required' }, 400);

    const destination = text('destination');
    const message = text('message');
    const budget = Number(body.budget);
    const utm = { utm_source: text('utm_source'), utm_medium: text('utm_medium'), utm_campaign: text('utm_campaign') };

    const lead = await createLead(
      c.env,
      tenantId,
      db,
      {
        contactId: contact.id,
        title: `${destination || 'New'} enquiry: ${contact.name}`,
        destinations: destination ? [destination] : [],
        travelDate: text('travel_date') || text('travel_dates') || null,
        returnDate: text('return_date') || null,
        paxAdults: toCount(body.adults, 1) || 1,
        paxChildren: toCount(body.children, 0),
        budget: Number.isFinite(budget) && budget > 0 ? budget : null,
        source,
        priority: 'hot',
        notes: message || null,
      },
      { userId: null, activityNote: 'Lead created from the website enquiry form' },
    );

    const summary = [
      destination && `Destination: ${destination}`,
      (text('travel_date') || text('travel_dates')) && `Travel: ${text('travel_date') || text('travel_dates')}`,
      message,
    ].filter(Boolean).join('\n') || 'Website enquiry';

    await ingestInbound(c.env, tenantId, db, {
      channel: 'web_form',
      from: phone || email,
      fromName: name || undefined,
      body: summary,
      contactId: contact.id,
      leadId: lead.id,
      provider: 'web_form',
      metadata: Object.fromEntries(Object.entries(utm).filter(([, v]) => v)),
    });

    await logWebhook(c.env, { tenantId, apiKey, source, payload: body, status: 'success' });
    return c.json({ success: true, lead_id: lead.id, contact_id: contact.id });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[inbound] web form failed:', detail);
    await logWebhook(c.env, { tenantId, apiKey, source, payload: body, status: 'error', error: detail });
    return c.json({ error: 'Failed to create lead' }, 500);
  }
}

inboundRoutes.use('/web-form', cors({ origin: '*' }));
inboundRoutes.post('/web-form', handleWebForm);

export default inboundRoutes;
