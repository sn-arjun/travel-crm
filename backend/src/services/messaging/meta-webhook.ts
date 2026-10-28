/**
 * Meta WhatsApp webhook processing (R213).
 *
 *  GET   the subscription handshake: hub.mode=subscribe, hub.verify_token (the platform's or an agency's), hub.challenge echoed.
 *  POST  X-Hub-Signature-256 is checked over the RAW body before anything is processed:
 *          - the platform app secret signs every delivery of the platform's Meta app, for any agency's number;
 *          - an agency that brought its own Meta app signs with its own app secret, and such a delivery may only
 *            touch that agency's own phone numbers (a forged payload naming another agency's number is ignored).
 *        The body is read as JSON only to learn which phone number ids it names (to pick the secret): nothing is
 *        stored or sent until a signature has matched.
 *
 * The tenant comes from the receiving phone_number_id (master tenant_channel_addresses). Inbound messages go through
 * the same ingest as every other channel (deduped on the Meta message id); statuses update the message log and the
 * campaign recipient, each (message id, status) claimed once in provider_events. Unknown numbers are acknowledged and
 * ignored: Meta retries any non-2xx.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { resolveTenantDb } from '../tenant-db';
import { ingestInbound } from '../inbound/ingest';
import { loadMetaAccount, isKnownVerifyToken, openMetaSecrets, tenantForPhoneNumberId } from './whatsapp-sender';
import { parseMetaWebhook, phoneNumberIdsOf, verifyMetaSignature, type MetaInboundMessage, type MetaStatusEvent } from './meta-whatsapp';
import { timingSafeEqual } from '../../middleware/provider-signature';

export const PROVIDER_EVENT_NAME = 'meta_whatsapp';

interface Waiter {
  waitUntil(promise: Promise<unknown>): void;
}

/** The challenge to echo, or null when the handshake must be refused. */
export async function metaHandshake(env: Env, mode: string | undefined, token: string | undefined, challenge: string | undefined): Promise<string | null> {
  if (mode !== 'subscribe' || !token || challenge === undefined || challenge === '') return null;
  const platform = env.WHATSAPP_META_VERIFY_TOKEN;
  if (platform && timingSafeEqual(platform, token)) return challenge;
  if (await isKnownVerifyToken(env, token)) return challenge;
  return null;
}

async function logUnrouted(env: Env, tenantId: string, status: string, error: string, payload: unknown): Promise<void> {
  try {
    await env.MASTER_DB
      .prepare(`INSERT INTO webhook_log (id, tenant_id, api_key, source, payload, status, error_message) VALUES (?, ?, NULL, 'meta:whatsapp', ?, ?, ?)`)
      .bind(generateId(), tenantId, JSON.stringify(payload).slice(0, 4000), status, error)
      .run();
  } catch (err) {
    console.error('[meta-whatsapp] webhook_log write failed:', err);
  }
}

export interface MetaWebhookResult {
  /** 401 for a bad signature; 200 for everything else (including numbers we do not serve). */
  status: 200 | 401;
  messages: number;
  duplicates: number;
  statuses: number;
  ignored: number;
}

export async function handleMetaWebhook(env: Env, waiter: Waiter | undefined, rawBody: string, signature: string | null | undefined): Promise<MetaWebhookResult> {
  const result: MetaWebhookResult = { status: 200, messages: 0, duplicates: 0, statuses: 0, ignored: 0 };

  let payload: any = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = null;
  }

  // 1. Signature, before any side effect.
  const platformOk = await verifyMetaSignature(rawBody, signature, env.WHATSAPP_META_APP_SECRET);
  const ownTenants = new Set<string>();
  if (!platformOk) {
    for (const phoneNumberId of payload ? phoneNumberIdsOf(payload) : []) {
      const tenantId = await tenantForPhoneNumberId(env, phoneNumberId);
      if (!tenantId || ownTenants.has(tenantId)) continue;
      const db = await resolveTenantDb(env, tenantId);
      const account = db ? await loadMetaAccount(db).catch(() => null) : null;
      if (!account || account.phone_number_id !== phoneNumberId) continue;
      let secret: string | null = null;
      try {
        secret = (await openMetaSecrets(env, account)).appSecret;
      } catch {
        secret = null;
      }
      if (await verifyMetaSignature(rawBody, signature, secret)) ownTenants.add(tenantId);
    }
    if (ownTenants.size === 0) return { ...result, status: 401 };
  }
  if (!payload) return result;

  // 2. Route each event by the receiving number and process it.
  for (const event of parseMetaWebhook(payload)) {
    const tenantId = await tenantForPhoneNumberId(env, event.phoneNumberId);
    if (!tenantId) {
      result.ignored++;
      await logUnrouted(env, 'unrouted', 'unrouted', `No tenant owns WhatsApp phone number id ${event.phoneNumberId}`, { kind: event.kind, id: event.id, phone_number_id: event.phoneNumberId });
      continue;
    }
    if (!platformOk && !ownTenants.has(tenantId)) {
      result.ignored++;
      await logUnrouted(env, tenantId, 'error', 'Signed with another workspace\'s app secret', { kind: event.kind, id: event.id });
      continue;
    }
    const db = await resolveTenantDb(env, tenantId);
    if (!db) {
      result.ignored++;
      await logUnrouted(env, tenantId, 'error', 'Tenant database unavailable', { kind: event.kind, id: event.id });
      continue;
    }
    try {
      if (event.kind === 'message') {
        const stored = await storeInbound(env, waiter, tenantId, db, event);
        if (stored) result.messages++;
        else result.duplicates++;
      } else if (await applyStatus(db, event)) {
        result.statuses++;
      } else {
        result.duplicates++;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[meta-whatsapp] ${event.kind} ${event.id} failed:`, detail);
      await logUnrouted(env, tenantId, 'error', detail, { kind: event.kind, id: event.id });
    }
  }
  return result;
}

/** True when a new message was stored, false for a redelivery. */
async function storeInbound(env: Env, waiter: Waiter | undefined, tenantId: string, db: D1Database, message: MetaInboundMessage): Promise<boolean> {
  const out = await ingestInbound(
    env,
    tenantId,
    db,
    {
      channel: 'whatsapp',
      from: `+${message.from}`,
      to: message.displayPhone ? `+${message.displayPhone.replace(/\D/g, '')}` : null,
      fromName: message.fromName,
      body: message.body,
      externalId: message.id,
      provider: 'meta',
      receivedAt: message.timestamp,
      metadata: {
        phone_number_id: message.phoneNumberId,
        message_type: message.type,
        ...(message.mediaId ? { media_id: message.mediaId, mime_type: message.mimeType } : {}),
      },
    },
    waiter,
  );
  return !out.duplicate;
}

/**
 * Apply one delivery status. The (message id, status) pair is claimed in provider_events first, so a redelivered
 * status changes nothing. Status never moves backwards (a late "sent" after "read" is ignored). Returns false for a
 * repeat or for a message we do not hold.
 */
async function applyStatus(db: D1Database, event: MetaStatusEvent): Promise<boolean> {
  const message = await db.prepare(`SELECT id FROM message_log WHERE external_id = ? AND COALESCE(direction, 'outgoing') != 'incoming' LIMIT 1`).bind(event.id).first<{ id: string }>();
  const recipient = await db
    .prepare('SELECT id, campaign_id FROM whatsapp_campaign_recipients WHERE provider_message_id = ? LIMIT 1')
    .bind(event.id)
    .first<{ id: string; campaign_id: string }>();
  if (!message && !recipient) return false;

  const claim = await db
    .prepare('INSERT OR IGNORE INTO provider_events (provider, provider_call_id, event, sequence) VALUES (?, ?, ?, ?)')
    .bind(PROVIDER_EVENT_NAME, event.id, event.status, '')
    .run();
  if ((claim.meta.changes ?? 0) === 0) return false;

  const at = event.timestamp ?? new Date().toISOString();
  const failure = event.status === 'failed' ? [event.errorCode, event.errorMessage].filter(Boolean).join(': ') || 'Delivery failed' : null;

  if (message) {
    if (event.status === 'sent') {
      await db.prepare(`UPDATE message_log SET status = 'sent', sent_at = COALESCE(sent_at, ?) WHERE id = ? AND status IN ('queued', 'sent')`).bind(at, message.id).run();
    } else if (event.status === 'delivered') {
      await db.prepare(`UPDATE message_log SET status = 'delivered', delivered_at = COALESCE(delivered_at, ?) WHERE id = ? AND status != 'read'`).bind(at, message.id).run();
    } else if (event.status === 'read') {
      await db.prepare(`UPDATE message_log SET status = 'read', read_at = COALESCE(read_at, ?), delivered_at = COALESCE(delivered_at, ?) WHERE id = ?`).bind(at, at, message.id).run();
    } else {
      await db.prepare(`UPDATE message_log SET status = 'failed', error_message = ? WHERE id = ? AND status NOT IN ('delivered', 'read')`).bind(failure, message.id).run();
    }
  }

  if (recipient) {
    if (event.status === 'delivered') {
      await db.prepare(`UPDATE whatsapp_campaign_recipients SET status = 'delivered', delivered_at = COALESCE(delivered_at, ?) WHERE id = ? AND status != 'read'`).bind(at, recipient.id).run();
    } else if (event.status === 'read') {
      await db.prepare(`UPDATE whatsapp_campaign_recipients SET status = 'read', read_at = COALESCE(read_at, ?), delivered_at = COALESCE(delivered_at, ?) WHERE id = ?`).bind(at, at, recipient.id).run();
    } else if (event.status === 'failed') {
      await db.prepare(`UPDATE whatsapp_campaign_recipients SET status = 'failed', error_message = ? WHERE id = ? AND status NOT IN ('delivered', 'read')`).bind(failure, recipient.id).run();
    }
    if (event.status !== 'sent') {
      await db
        .prepare(
          `UPDATE whatsapp_campaigns SET
             delivered_count = (SELECT COUNT(*) FROM whatsapp_campaign_recipients WHERE campaign_id = ? AND status IN ('delivered', 'read')),
             read_count = (SELECT COUNT(*) FROM whatsapp_campaign_recipients WHERE campaign_id = ? AND status = 'read'),
             failed_count = (SELECT COUNT(*) FROM whatsapp_campaign_recipients WHERE campaign_id = ? AND status = 'failed'),
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
           WHERE id = ?`,
        )
        .bind(recipient.campaign_id, recipient.campaign_id, recipient.campaign_id, recipient.campaign_id)
        .run();
    }
  }
  return true;
}
