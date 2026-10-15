/**
 * WhatsApp through Meta's Cloud API (R213), behind the MessagingProvider interface.
 *
 * No SDK: fetch against https://graph.facebook.com/v<version>/<phone_number_id>/messages and Web Crypto for the
 * webhook signature. The fetch implementation is injected so tests never reach Meta.
 *
 *  - Free-form text and media are accepted by Meta only inside the 24 hour customer-service window (the window
 *    opens when the customer writes). The provider does not track the window; services/messaging/whatsapp-sender.ts
 *    checks it before calling, and Meta's own refusal (error 131047) comes back as errorKind 'window'.
 *  - Templates (name + language + body parameters) are sent any time. The pricing category (utility / marketing)
 *    is a property of the approved template at Meta, not a send field: it travels in the result so metering and
 *    reports can use it.
 */

import { timingSafeEqual } from '../../middleware/provider-signature';
import type { MessageResult, MessagingProvider, WhatsAppCategory, WhatsAppTemplateOptions } from '../voip-provider';

export const DEFAULT_GRAPH_VERSION = 'v21.0';
export const GRAPH_BASE = 'https://graph.facebook.com';

export type MetaFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface MetaCredentials {
  accessToken: string;
  phoneNumberId: string;
  graphVersion?: string;
}

/** Meta error codes that matter to callers. */
const WINDOW_CODES = new Set([131047, 131051]); // re-engagement required / unsupported outside the window
const AUTH_CODES = new Set([190, 102, 10, 200]);
const RATE_CODES = new Set([4, 17, 80007, 130429, 131056]);

export function errorKindFor(status: number, code: number | undefined): NonNullable<MessageResult['errorKind']> {
  if (code !== undefined && WINDOW_CODES.has(code)) return 'window';
  if (status === 401 || status === 403 || (code !== undefined && AUTH_CODES.has(code))) return 'auth';
  if (status === 429 || (code !== undefined && RATE_CODES.has(code))) return 'rate_limited';
  if (status >= 400 && status < 500) return 'invalid_request';
  return 'provider';
}

/** WhatsApp wants the number as digits with the country code and no plus sign. */
export function metaRecipient(phone: string): string {
  return phone.replace(/^whatsapp:/i, '').replace(/\D/g, '');
}

type MediaKind = 'image' | 'video' | 'audio' | 'document';

export function mediaKindFor(url: string): MediaKind {
  const path = url.split('?')[0].toLowerCase();
  if (/\.(jpe?g|png|webp)$/.test(path)) return 'image';
  if (/\.(mp4|3gp)$/.test(path)) return 'video';
  if (/\.(mp3|ogg|aac|amr|m4a)$/.test(path)) return 'audio';
  return 'document';
}

function filenameOf(url: string): string {
  const last = url.split('?')[0].split('/').pop() || 'document';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** Positional body parameters from a variable map: numeric keys in order ("1", "2"), else insertion order. */
export function orderedParameters(variables: Record<string, string>): Array<{ type: 'text'; text: string }> {
  const keys = Object.keys(variables);
  const numeric = keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
  const ordered = numeric ? [...keys].sort((a, b) => Number(a) - Number(b)) : keys;
  return ordered.map((k) => ({ type: 'text' as const, text: String(variables[k] ?? '') }));
}

export class MetaWhatsAppProvider implements MessagingProvider {
  readonly providerName = 'meta' as const;

  constructor(
    private readonly creds: MetaCredentials,
    private readonly fetchImpl: MetaFetch = (input, init) => fetch(input, init),
  ) {}

  private url(path: string): string {
    return `${GRAPH_BASE}/${this.creds.graphVersion || DEFAULT_GRAPH_VERSION}/${path}`;
  }

  private async post(to: string, body: Record<string, unknown>, category: WhatsAppCategory): Promise<MessageResult> {
    const recipient = metaRecipient(to);
    try {
      const res = await this.fetchImpl(this.url(`${this.creds.phoneNumberId}/messages`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.creds.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, ...body }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      const wamid = json?.messages?.[0]?.id;
      if (!res.ok || !wamid) {
        const code = typeof json?.error?.code === 'number' ? json.error.code : undefined;
        return {
          providerMessageId: '',
          status: 'failed',
          to,
          channel: 'whatsapp',
          error: String(json?.error?.error_user_msg || json?.error?.message || `WhatsApp request failed (${res.status})`).slice(0, 300),
          errorKind: errorKindFor(res.status, code),
          category,
        };
      }
      return { providerMessageId: String(wamid), status: 'sent', to, channel: 'whatsapp', category };
    } catch {
      return { providerMessageId: '', status: 'failed', to, channel: 'whatsapp', error: 'Could not reach WhatsApp', errorKind: 'provider', category };
    }
  }

  async sendSms(): Promise<MessageResult> {
    throw new Error('SMS is not available on the WhatsApp (Meta) provider');
  }

  /** Free-form text, or media by URL with the message as its caption. Only valid inside the 24 hour window. */
  async sendWhatsApp(to: string, message: string, mediaUrl?: string): Promise<MessageResult> {
    if (mediaUrl) {
      const kind = mediaKindFor(mediaUrl);
      const media: Record<string, unknown> = { link: mediaUrl };
      if (message && kind !== 'audio') media.caption = message;
      if (kind === 'document') media.filename = filenameOf(mediaUrl);
      return this.post(to, { type: kind, [kind]: media }, 'service');
    }
    return this.post(to, { type: 'text', text: { body: message, preview_url: false } }, 'service');
  }

  /** An approved template: name, language and the body parameters. Allowed inside and outside the window. */
  async sendWhatsAppTemplate(to: string, templateName: string, variables: Record<string, string>, options: WhatsAppTemplateOptions = {}): Promise<MessageResult> {
    const components: Array<Record<string, unknown>> = [];
    if (options.headerMediaUrl) {
      const kind = mediaKindFor(options.headerMediaUrl);
      const header = kind === 'audio' ? 'document' : kind;
      components.push({ type: 'header', parameters: [{ type: header, [header]: { link: options.headerMediaUrl } }] });
    }
    const parameters = orderedParameters(variables);
    if (parameters.length > 0) components.push({ type: 'body', parameters });
    return this.post(
      to,
      {
        type: 'template',
        template: { name: templateName, language: { code: options.language || 'en' }, ...(components.length ? { components } : {}) },
      },
      options.category ?? 'utility',
    );
  }

  /** "Test connection": a harmless authenticated read of the phone number. Never throws; the message is safe to show. */
  async testConnection(): Promise<{ ok: boolean; message: string; displayPhone?: string }> {
    try {
      const res = await this.fetchImpl(this.url(`${this.creds.phoneNumberId}?fields=display_phone_number,verified_name`), {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.creds.accessToken}` },
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (res.ok) return { ok: true, message: json?.verified_name ? `Connected as ${json.verified_name}` : 'Connected', displayPhone: json?.display_phone_number };
      const code = typeof json?.error?.code === 'number' ? json.error.code : undefined;
      if (errorKindFor(res.status, code) === 'auth') return { ok: false, message: 'Meta rejected this access token' };
      return { ok: false, message: String(json?.error?.message || `HTTP ${res.status}`).slice(0, 200) };
    } catch {
      return { ok: false, message: 'Could not reach Meta' };
    }
  }
}

// ----------------------------------------------------------------------------
// Webhook: signature and payload
// ----------------------------------------------------------------------------

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `sha256=<hex>`: HMAC-SHA256 of the exact raw body under the Meta app secret. */
export async function metaSignature(rawBody: string, appSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  return `sha256=${toHex(new Uint8Array(sig))}`;
}

/** True only when the X-Hub-Signature-256 header is the HMAC of the raw body under one of the secrets (constant time). */
export async function verifyMetaSignature(rawBody: string, header: string | null | undefined, appSecret: string | null | undefined): Promise<boolean> {
  if (!header || !appSecret) return false;
  return timingSafeEqual(await metaSignature(rawBody, appSecret), header.trim().toLowerCase());
}

export interface MetaInboundMessage {
  kind: 'message';
  phoneNumberId: string;
  displayPhone: string | null;
  /** Message id (wamid): the idempotency key. */
  id: string;
  from: string;
  fromName: string | null;
  type: string;
  body: string;
  mediaId: string | null;
  mimeType: string | null;
  timestamp: string | null;
}

export interface MetaStatusEvent {
  kind: 'status';
  phoneNumberId: string;
  /** The wamid of OUR outbound message. */
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  recipient: string | null;
  timestamp: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export type MetaEvent = MetaInboundMessage | MetaStatusEvent;

function isoFromEpoch(value: unknown): string | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

/** The phone number ids a payload addresses (used to pick the right app secret before anything is processed). */
export function phoneNumberIdsOf(payload: any): string[] {
  const ids = new Set<string>();
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const id = change?.value?.metadata?.phone_number_id;
      if (typeof id === 'string' && id) ids.add(id);
    }
  }
  return [...ids];
}

function textOf(message: any): { body: string; mediaId: string | null; mimeType: string | null } {
  const type = String(message?.type ?? '');
  switch (type) {
    case 'text':
      return { body: String(message.text?.body ?? ''), mediaId: null, mimeType: null };
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker': {
      const media = message[type] ?? {};
      const caption = media.caption ? String(media.caption) : '';
      return { body: caption || `[${type}]`, mediaId: media.id ? String(media.id) : null, mimeType: media.mime_type ? String(media.mime_type) : null };
    }
    case 'location':
      return { body: `[location] ${message.location?.name ?? ''} ${message.location?.latitude ?? ''},${message.location?.longitude ?? ''}`.trim(), mediaId: null, mimeType: null };
    case 'contacts':
      return { body: '[contact card]', mediaId: null, mimeType: null };
    case 'button':
      return { body: String(message.button?.text ?? '[button]'), mediaId: null, mimeType: null };
    case 'interactive':
      return {
        body: String(message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? '[interactive reply]'),
        mediaId: null,
        mimeType: null,
      };
    case 'reaction':
      return { body: `[reaction] ${message.reaction?.emoji ?? ''}`.trim(), mediaId: null, mimeType: null };
    default:
      return { body: `[${type || 'unsupported'} message]`, mediaId: null, mimeType: null };
  }
}

/** Flatten a (verified) webhook payload into messages and statuses. Unknown shapes yield nothing. */
export function parseMetaWebhook(payload: any): MetaEvent[] {
  const events: MetaEvent[] = [];
  if (payload?.object !== 'whatsapp_business_account') return events;
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'messages') continue;
      const value = change.value ?? {};
      const phoneNumberId = String(value.metadata?.phone_number_id ?? '');
      if (!phoneNumberId) continue;
      const displayPhone = value.metadata?.display_phone_number ? String(value.metadata.display_phone_number) : null;
      const names = new Map<string, string>();
      for (const contact of Array.isArray(value.contacts) ? value.contacts : []) {
        if (contact?.wa_id) names.set(String(contact.wa_id), String(contact.profile?.name ?? ''));
      }
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        if (!message?.id || !message?.from) continue;
        const content = textOf(message);
        events.push({
          kind: 'message',
          phoneNumberId,
          displayPhone,
          id: String(message.id),
          from: String(message.from),
          fromName: names.get(String(message.from)) || null,
          type: String(message.type ?? ''),
          ...content,
          timestamp: isoFromEpoch(message.timestamp),
        });
      }
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        const name = String(status?.status ?? '');
        if (!status?.id || !['sent', 'delivered', 'read', 'failed'].includes(name)) continue;
        const err = Array.isArray(status.errors) ? status.errors[0] : null;
        events.push({
          kind: 'status',
          phoneNumberId,
          id: String(status.id),
          status: name as MetaStatusEvent['status'],
          recipient: status.recipient_id ? String(status.recipient_id) : null,
          timestamp: isoFromEpoch(status.timestamp),
          errorCode: err?.code !== undefined ? String(err.code) : null,
          errorMessage: err ? String(err.error_data?.details || err.message || err.title || '').slice(0, 300) || null : null,
        });
      }
    }
  }
  return events;
}
