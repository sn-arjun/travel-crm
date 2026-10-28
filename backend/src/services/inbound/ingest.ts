/**
 * Inbound gateway: one path for every received message.
 *
 * Provider webhooks (WhatsApp, SMS, email) and the website form are normalised to an
 * InboundMessage and stored in message_log as `incoming`, matched to a contact and to
 * the contact's open lead, announced to the team, and broadcast to connected clients.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { normalizePhone } from '../../utils/phone';
import { broadcastToTenant } from '../../utils/realtime';
import { notify } from '../notification-service';
import { findContactByIdentity } from '../domain/contacts';
import { emitEvent } from '../automation/events';

export type InboundChannel = 'whatsapp' | 'sms' | 'email' | 'web_form';

export interface InboundMessage {
  channel: InboundChannel;
  /** Sender phone (any format) or email address. */
  from: string;
  /** The tenant number or mailbox that received it. */
  to?: string | null;
  fromName?: string | null;
  body: string;
  subject?: string | null;
  mediaUrl?: string | null;
  /** Provider message id; redeliveries with the same id are ignored. */
  externalId?: string | null;
  provider?: string | null;
  receivedAt?: string | null;
  /** Set when the caller already resolved these (website form). */
  contactId?: string | null;
  leadId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface IngestResult {
  messageId: string;
  contactId: string | null;
  leadId: string | null;
  duplicate: boolean;
}

const CHANNEL_LABELS: Record<InboundChannel, string> = {
  whatsapp: 'WhatsApp message',
  sms: 'SMS',
  email: 'email',
  web_form: 'website enquiry',
};

// Leads in these statuses no longer collect new conversation.
const CLOSED_LEAD_STATUSES = ['won', 'lost', 'booking_confirmed', 'completed'];

/** "Priya Nair <priya@example.com>" -> { name: "Priya Nair", address: "priya@example.com" } */
export function parseEmailAddress(raw: string): { name: string; address: string } {
  const value = (raw ?? '').trim();
  const angled = value.match(/^(.*)<([^<>]+)>\s*$/);
  if (angled) {
    return {
      name: angled[1].trim().replace(/^"|"$/g, '').trim(),
      address: angled[2].trim().toLowerCase(),
    };
  }
  return { name: '', address: value.toLowerCase() };
}

/** Canonical stored form of a channel address: E.164 for phones, lower case for email. */
export function normalizeAddress(channel: InboundChannel | 'voice', raw: string): string {
  const value = (raw ?? '').trim().replace(/^whatsapp:/i, '');
  if (!value) return '';
  if (channel === 'email' || value.includes('@')) return parseEmailAddress(value).address;
  return normalizePhone(value);
}

function preview(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export async function ingestInbound(
  env: Env,
  tenantId: string,
  db: D1Database,
  message: InboundMessage,
  /** The request's execution context: reading the message then happens after the provider is answered. */
  waiter?: { waitUntil(promise: Promise<unknown>): void },
): Promise<IngestResult> {
  const from = normalizeAddress(message.channel, message.from);
  const to = message.to ? normalizeAddress(message.channel, message.to) : null;
  const isEmailSender = from.includes('@');

  // Providers retry on timeouts: the same provider id must not create a second row.
  if (message.externalId) {
    const existing = await db
      .prepare(`SELECT id, contact_id, lead_id FROM message_log WHERE external_id = ? AND direction = 'incoming' LIMIT 1`)
      .bind(message.externalId)
      .first<{ id: string; contact_id: string | null; lead_id: string | null }>();
    if (existing) {
      return { messageId: existing.id, contactId: existing.contact_id, leadId: existing.lead_id, duplicate: true };
    }
  }

  let contactId = message.contactId ?? null;
  let contactName = '';
  if (contactId) {
    const row = await db.prepare('SELECT name FROM contacts WHERE id = ?').bind(contactId).first<{ name: string }>();
    contactName = row?.name ?? '';
  } else if (from) {
    const match = await findContactByIdentity(db, isEmailSender ? { email: from } : { phone: from });
    if (match) {
      contactId = match.id;
      contactName = match.name;
    }
  }

  // Attach to the contact's lead only when there is exactly one open lead to attach to.
  let leadId = message.leadId ?? null;
  let leadOwner: string | null = null;
  if (leadId) {
    const row = await db.prepare('SELECT assigned_to FROM leads WHERE id = ?').bind(leadId).first<{ assigned_to: string | null }>();
    leadOwner = row?.assigned_to ?? null;
  } else if (contactId) {
    const open = await db
      .prepare(
        `SELECT id, assigned_to FROM leads
         WHERE contact_id = ? AND COALESCE(is_deleted, 0) = 0
           AND status NOT IN (${CLOSED_LEAD_STATUSES.map(() => '?').join(', ')})
         ORDER BY created_at DESC LIMIT 2`,
      )
      .bind(contactId, ...CLOSED_LEAD_STATUSES)
      .all<{ id: string; assigned_to: string | null }>();
    if (open.results.length === 1) {
      leadId = open.results[0].id;
      leadOwner = open.results[0].assigned_to;
    }
  }

  const messageId = generateId();
  const receivedAt = message.receivedAt ?? new Date().toISOString();
  const metadata = {
    ...(message.metadata ?? {}),
    ...(message.provider ? { provider: message.provider } : {}),
    ...(message.fromName ? { from_name: message.fromName } : {}),
  };

  await db
    .prepare(
      `INSERT INTO message_log (id, contact_id, lead_id, channel, subject, content, direction, media_url, metadata,
                                status, external_id, from_address, to_address, sent_at, delivered_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'incoming', ?, ?, 'delivered', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      messageId,
      contactId,
      leadId,
      message.channel,
      message.subject ?? null,
      message.body,
      message.mediaUrl ?? null,
      Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
      message.externalId ?? null,
      from || null,
      to,
      receivedAt,
      receivedAt,
      receivedAt,
    )
    .run();

  const senderLabel = contactName || message.fromName || from || 'Unknown sender';
  const text = preview(message.subject ? `${message.subject}: ${message.body}` : message.body);

  if (leadId) {
    await db
      .prepare(`INSERT INTO lead_activities (id, lead_id, type, content, metadata) VALUES (?, ?, ?, ?, ?)`)
      .bind(
        generateId(),
        leadId,
        message.channel === 'web_form' ? 'note' : message.channel,
        `Received ${CHANNEL_LABELS[message.channel]}: ${text}`,
        JSON.stringify({ direction: 'incoming', message_id: messageId }),
      )
      .run();
  }

  // The lead owner hears about it; without one, everyone who triages new enquiries does.
  let recipients: string[] = [];
  if (leadOwner) {
    recipients = [leadOwner];
  } else {
    const triage = await db
      .prepare(`SELECT id FROM users WHERE role IN ('admin', 'sales_manager') AND is_active = 1`)
      .all<{ id: string }>();
    recipients = triage.results.map((u) => u.id);
  }

  for (const userId of recipients) {
    await notify(env, db, {
      userId,
      title: `New ${CHANNEL_LABELS[message.channel]}`,
      body: `${senderLabel}: ${text}`,
      type: 'message_received',
      entityType: contactId ? 'contact' : 'message',
      entityId: contactId ?? messageId,
    });
    await broadcastToTenant(
      env,
      tenantId,
      { type: 'notification:new', data: { reason: 'message_received' } },
      { targetUserId: userId },
    );
  }

  await broadcastToTenant(env, tenantId, {
    type: 'message:received',
    data: { id: messageId, channel: message.channel, contactId, leadId, from: senderLabel, preview: text },
  });

  await emitEvent(
    env,
    tenantId,
    db,
    { type: 'message.received', entityType: 'message', entityId: messageId, payload: { channel: message.channel, contactId, leadId, from: from || null } },
    waiter,
  );

  return { messageId, contactId, leadId, duplicate: false };
}
