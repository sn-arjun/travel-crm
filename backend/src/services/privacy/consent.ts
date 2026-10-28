import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { signUnsubscribeToken, type UnsubscribeChannel } from '../../utils/unsubscribe-token';

/**
 * R208: consent records and the one question every marketing send asks: may this contact be marketed to on this channel?
 *
 * contact_consents is append-only: a change of mind is a new row, never an edit. The latest row for the purpose that applies
 * to the channel (the channel itself or 'any') decides. contacts.opted_out stays the fast switch that older code (automation
 * recipes, segments) reads, so every withdrawal also sets it; recording a grant clears it again.
 */

export const CONSENT_CHANNELS = ['email', 'whatsapp', 'sms', 'call', 'any'] as const;
export const CONSENT_PURPOSES = ['marketing', 'service', 'recording'] as const;
export const CONSENT_SOURCES = ['form', 'import', 'manual', 'unsubscribe_link', 'chatbot'] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];
export type ConsentSource = (typeof CONSENT_SOURCES)[number];
export type ConsentStatus = 'granted' | 'withdrawn';

export interface ConsentInput {
  contactId: string;
  channel?: ConsentChannel;
  purpose?: ConsentPurpose;
  status: ConsentStatus;
  source: ConsentSource;
  evidence?: Record<string, unknown> | null;
  capturedBy?: string | null;
}

/** Appends one consent row. Returns its id. */
export async function recordConsent(db: D1Database, input: ConsentInput): Promise<string> {
  const id = generateId();
  await db
    .prepare(
      `INSERT INTO contact_consents (id, contact_id, channel, purpose, status, source, captured_at, evidence, captured_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.contactId,
      input.channel ?? 'any',
      input.purpose ?? 'marketing',
      input.status,
      input.source,
      new Date().toISOString(),
      input.evidence ? JSON.stringify(input.evidence) : null,
      input.capturedBy ?? null
    )
    .run();
  return id;
}

/**
 * Records a marketing withdrawal and switches the contact's opted_out flag on (idempotent: a second withdrawal
 * for the same channel while already withdrawn adds no row).
 */
export async function withdrawMarketing(
  db: D1Database,
  contactId: string,
  channel: ConsentChannel,
  source: ConsentSource,
  opts: { reason?: string | null; label?: string | null; capturedBy?: string | null; evidence?: Record<string, unknown> | null } = {}
): Promise<{ changed: boolean }> {
  const latest = await latestMarketingConsent(db, contactId, channel);
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE contacts SET opted_out = 1, opted_out_at = COALESCE(opted_out_at, ?), opt_out_channel = ?, opt_out_reason = COALESCE(?, opt_out_reason), updated_at = ?
       WHERE id = ?`
    )
    .bind(now, opts.label ?? channel, opts.reason ?? null, now, contactId)
    .run();
  if (latest === 'withdrawn') return { changed: false };
  await recordConsent(db, { contactId, channel, status: 'withdrawn', source, evidence: opts.evidence, capturedBy: opts.capturedBy });
  return { changed: true };
}

/** Records a marketing grant and clears the opted_out flag. */
export async function grantMarketing(
  db: D1Database,
  contactId: string,
  channel: ConsentChannel,
  source: ConsentSource,
  opts: { capturedBy?: string | null; evidence?: Record<string, unknown> | null } = {}
): Promise<void> {
  await recordConsent(db, { contactId, channel, status: 'granted', source, evidence: opts.evidence, capturedBy: opts.capturedBy });
  const now = new Date().toISOString();
  await db
    .prepare('UPDATE contacts SET opted_out = 0, opted_out_at = NULL, opt_out_channel = NULL, opt_out_reason = NULL, updated_at = ? WHERE id = ? AND erased_at IS NULL')
    .bind(now, contactId)
    .run();
}

/** The status of the newest marketing record that applies to the channel (the channel itself or 'any'), or null when none. */
export async function latestMarketingConsent(db: D1Database, contactId: string, channel: ConsentChannel): Promise<ConsentStatus | null> {
  const row = await db
    .prepare(
      `SELECT status FROM contact_consents
       WHERE contact_id = ? AND purpose = 'marketing' AND channel IN (?, 'any')
       ORDER BY captured_at DESC, id DESC LIMIT 1`
    )
    .bind(contactId, channel)
    .first<{ status: ConsentStatus }>();
  return row?.status ?? null;
}

/**
 * Why a marketing message must NOT go to this contact on this channel, or null when it may.
 * Checked at send time (not only when a campaign is built) so an unsubscribe that lands mid-campaign is honoured.
 */
export async function marketingBlockedReason(db: D1Database, contactId: string | null | undefined, channel: ConsentChannel): Promise<string | null> {
  if (!contactId) return null; // an ad-hoc recipient with no contact record has nothing recorded to check
  const contact = await db
    .prepare('SELECT opted_out, is_deleted, erased_at FROM contacts WHERE id = ?')
    .bind(contactId)
    .first<{ opted_out: number | null; is_deleted: number | null; erased_at: string | null }>();
  if (!contact) return 'contact not found';
  if (contact.erased_at) return 'contact erased';
  if (contact.is_deleted) return 'contact deleted';
  if (contact.opted_out) return 'opted out';
  if ((await latestMarketingConsent(db, contactId, channel)) === 'withdrawn') return 'marketing consent withdrawn';
  return null;
}

const SQL_CHANNELS: ReadonlySet<string> = new Set(['email', 'whatsapp', 'sms']);

/**
 * SQL condition (to AND into a contacts query) that keeps out contacts whose latest marketing record for the
 * channel is a withdrawal. `alias` is the contacts table alias in the caller's query; both arguments are
 * checked against a fixed list because they are spliced into the statement.
 */
export function marketingConsentSql(channel: 'email' | 'whatsapp' | 'sms', alias = 'contacts'): string {
  if (!SQL_CHANNELS.has(channel) || !/^[a-z_]+$/i.test(alias)) throw new Error('invalid consent filter');
  return `NOT EXISTS (
    SELECT 1 FROM contact_consents k
    WHERE k.contact_id = ${alias}.id AND k.purpose = 'marketing' AND k.status = 'withdrawn' AND k.channel IN ('${channel}', 'any')
      AND NOT EXISTS (
        SELECT 1 FROM contact_consents g
        WHERE g.contact_id = k.contact_id AND g.purpose = 'marketing' AND g.status = 'granted' AND g.channel IN ('${channel}', 'any')
          AND (g.captured_at > k.captured_at OR (g.captured_at = k.captured_at AND g.id > k.id))
      )
  )`;
}

// ------------------------------------------------------------------
// Unsubscribe links
// ------------------------------------------------------------------

/** Public base of the API (where the unsubscribe page lives). */
export function unsubscribeBase(env: Pick<Env, 'API_PUBLIC_URL' | 'APP_URL'>, requestOrigin?: string): string {
  return (env.API_PUBLIC_URL?.trim() || requestOrigin || env.APP_URL || 'http://localhost:8787').replace(/\/+$/, '');
}

export async function unsubscribeUrl(
  env: Env,
  tenantId: string,
  contactId: string,
  channel: UnsubscribeChannel,
  requestOrigin?: string
): Promise<string> {
  const token = await signUnsubscribeToken(env, { tenantId, contactId, channel });
  return `${unsubscribeBase(env, requestOrigin)}/api/v1/public/unsubscribe/${token}`;
}

/** The footer line every marketing message carries. */
export function unsubscribeFooterText(url: string): string {
  return `To stop receiving marketing messages from us, unsubscribe here: ${url}`;
}

export function unsubscribeFooterHtml(url: string): string {
  return `<p style="font-size:12px;color:#666;margin-top:24px">To stop receiving marketing messages from us, <a href="${url}">unsubscribe</a>.</p>`;
}
