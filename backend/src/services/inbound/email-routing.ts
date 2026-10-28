/**
 * R131 (ADR-002 6.2): mail received by Cloudflare Email Routing, handed to the Worker's email() export.
 *
 * Where a message goes is decided by its recipient address only:
 *   reply+<token>@<EMAIL_INBOUND_DOMAIN>   the token maps to one agency and one customer thread (reply-token.ts);
 *   any other address                       tenant_channel_addresses (an agency's own receiving address), as for the
 *                                           old SendGrid Inbound Parse route.
 * Anything else, an unknown or expired token, an over-size message: rejected with setReject and logged.
 * A message is stored through ingestInbound in that one agency's database, so it can never reach another agency.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { resolveTenantDb } from '../tenant-db';
import { ingestInbound, normalizeAddress, parseEmailAddress } from './ingest';
import { htmlToPlain, parseMime, stripQuotedHistory } from '../mail/mime';
import { resolveReplyToken, tokenFromAddress } from '../mail/reply-token';
import { getEmailSettings } from '../mail/settings';

/** Largest message the Worker reads (Cloudflare accepts up to 25 MiB; we do not need that much in memory). */
export const MAX_INBOUND_BYTES = 5 * 1024 * 1024;
const MAX_BODY_CHARS = 20000;
const MAX_HTML_CHARS = 30000;

/** The part of Cloudflare's ForwardableEmailMessage this code uses. */
export interface InboundEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
}

export interface InboundEmailOutcome {
  status: 'stored' | 'duplicate' | 'rejected' | 'ignored';
  reason?: string;
  tenantId?: string;
  messageId?: string;
}

async function logInbound(env: Env, tenantId: string, status: string, payload: unknown, error?: string): Promise<void> {
  try {
    await env.MASTER_DB
      .prepare(`INSERT INTO webhook_log (id, tenant_id, api_key, source, payload, status, error_message) VALUES (?, ?, NULL, ?, ?, ?, ?)`)
      .bind(generateId(), tenantId, 'cloudflare:email', JSON.stringify(payload).slice(0, 8000), status, error ?? null)
      .run();
  } catch (err) {
    console.error('[inbound-email] webhook_log write failed:', err instanceof Error ? err.message : err);
  }
}

function reject(message: InboundEmailMessage, reason: string): InboundEmailOutcome {
  message.setReject(reason);
  return { status: 'rejected', reason };
}

/** spf=pass, dkim=pass, dmarc=pass out of an Authentication-Results header. */
function authResults(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  const value = headers.get('authentication-results') ?? '';
  for (const key of ['spf', 'dkim', 'dmarc']) {
    const m = value.match(new RegExp(`\\b${key}=([a-z]+)`, 'i'));
    if (m) out[key] = m[1].toLowerCase();
  }
  return out;
}

export async function handleInboundEmail(
  message: InboundEmailMessage,
  env: Env,
  waiter?: { waitUntil(promise: Promise<unknown>): void },
): Promise<InboundEmailOutcome> {
  const to = parseEmailAddress(message.to).address;
  const sender = parseEmailAddress(message.from).address;
  const logPayload = { from: sender, to, size: message.rawSize };

  if (message.rawSize > MAX_INBOUND_BYTES) {
    await logInbound(env, 'unrouted', 'rejected', logPayload, 'Message too large');
    return reject(message, 'Message too large');
  }

  // 1. Who owns the recipient address?
  let tenantId: string | null = null;
  let contactId: string | null = null;
  let leadId: string | null = null;
  const token = tokenFromAddress(env, to);
  if (token) {
    // R132: the console can switch the reply+token addresses off; mail sent to one is refused while it is off.
    if (!(await getEmailSettings(env)).inboundEnabled) {
      await logInbound(env, 'unrouted', 'rejected', logPayload, 'Reply addresses are switched off in the console');
      return reject(message, 'Unknown address');
    }
    const thread = await resolveReplyToken(env, token);
    if (!thread) {
      await logInbound(env, 'unrouted', 'rejected', logPayload, 'Unknown or expired reply token');
      return reject(message, 'Unknown address');
    }
    tenantId = thread.tenantId;
    contactId = thread.contactId;
    leadId = thread.leadId ?? null;
  } else {
    const address = normalizeAddress('email', to);
    const row = address
      ? await env.MASTER_DB
          .prepare("SELECT tenant_id FROM tenant_channel_addresses WHERE channel = 'email' AND address = ? AND is_active = 1")
          .bind(address)
          .first<{ tenant_id: string }>()
      : null;
    // Only an address an agency has registered is accepted.
    if (!row?.tenant_id) {
      await logInbound(env, 'unrouted', 'rejected', logPayload, 'No agency owns this address');
      return reject(message, 'Unknown address');
    }
    tenantId = row.tenant_id;
  }

  const db = await resolveTenantDb(env, tenantId);
  if (!db) {
    await logInbound(env, tenantId, 'rejected', logPayload, 'Agency database not found');
    return reject(message, 'Unknown address');
  }

  // Auto-replies (out of office, delivery notices) are not conversation: accept and drop without a bounce.
  const autoSubmitted = (message.headers.get('auto-submitted') ?? 'no').toLowerCase();
  if (autoSubmitted !== 'no' || /bulk|junk|auto_reply/i.test(message.headers.get('precedence') ?? '')) {
    await logInbound(env, tenantId, 'ignored', logPayload, 'Automatic reply');
    return { status: 'ignored', reason: 'auto-reply', tenantId };
  }

  // 2. Read and parse.
  const bytes = new Uint8Array(await new Response(message.raw).arrayBuffer());
  if (bytes.length > MAX_INBOUND_BYTES) {
    await logInbound(env, tenantId, 'rejected', logPayload, 'Message too large');
    return reject(message, 'Message too large');
  }
  const parsed = parseMime(bytes);
  const rawText = parsed.text || htmlToPlain(parsed.html);
  const body = stripQuotedHistory(rawText).slice(0, MAX_BODY_CHARS);
  const subject = parsed.subject || message.headers.get('subject') || '';
  if (!sender || (!body && !subject)) {
    await logInbound(env, tenantId, 'ignored', logPayload, 'Empty message');
    return { status: 'ignored', reason: 'empty', tenantId };
  }

  // 3. The token names a thread of this agency: use its contact and lead only if they still exist in this agency.
  if (contactId) {
    const hit = await db.prepare('SELECT id FROM contacts WHERE id = ?').bind(contactId).first();
    if (!hit) contactId = null;
  }
  if (leadId) {
    const hit = await db.prepare('SELECT id FROM leads WHERE id = ?').bind(leadId).first();
    if (!hit) leadId = null;
  }

  const sentFrom = parseEmailAddress(message.headers.get('from') || message.from);
  const result = await ingestInbound(
    env,
    tenantId,
    db,
    {
      channel: 'email',
      from: sender,
      to,
      fromName: sentFrom.name || null,
      subject,
      body: body || '(no text)',
      externalId: message.headers.get('message-id'),
      provider: 'cloudflare-email-routing',
      contactId,
      leadId,
      metadata: {
        auth: authResults(message.headers),
        spam: message.headers.get('x-spam-status') ?? message.headers.get('x-cf-spamh-score') ?? undefined,
        in_reply_to: message.headers.get('in-reply-to') ?? undefined,
        attachments: parsed.attachmentCount || undefined,
        html: parsed.html ? parsed.html.slice(0, MAX_HTML_CHARS) : undefined,
        via_token: token ? true : undefined,
      },
    },
    waiter,
  );
  await logInbound(env, tenantId, result.duplicate ? 'duplicate' : 'stored', logPayload);
  return { status: result.duplicate ? 'duplicate' : 'stored', tenantId, messageId: result.messageId };
}
