import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';

/**
 * R128: the pieces every agency email shares.
 *  - suppression: an address that hard-bounced is flagged on the contact and never sent to again;
 *  - reply-to: customer replies reach the agency, not the no-reply sender;
 *  - a log row per email, with the provider's message id written back so delivery events find it.
 */

/** Is this address flagged undeliverable on any contact of the agency? */
export async function isEmailUndeliverable(tenantDb: D1Database, email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const row = await tenantDb
    .prepare('SELECT 1 AS hit FROM contacts WHERE lower(email) = lower(?) AND email_undeliverable = 1 LIMIT 1')
    .bind(email.trim())
    .first<{ hit: number }>();
  return !!row;
}

/**
 * Where a customer's reply should go: the agency's own receiving address when it has one (replies then land in the
 * inbox), otherwise the email of the user who sent the message. Undefined when neither is known.
 */
export async function resolveReplyTo(env: Env, tenantDb: D1Database, tenantId: string, userId?: string | null): Promise<string | undefined> {
  try {
    const agency = await env.MASTER_DB
      .prepare("SELECT address FROM tenant_channel_addresses WHERE tenant_id = ? AND channel = 'email' AND is_active = 1 ORDER BY created_at, id LIMIT 1")
      .bind(tenantId)
      .first<{ address: string }>();
    if (agency?.address) return agency.address;
  } catch {
    // no master registry (single-tenant stack): fall through to the user
  }
  if (userId) {
    const user = await tenantDb.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first<{ email: string | null }>();
    if (user?.email) return user.email;
  }
  return undefined;
}

export interface AgencyEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: string; type: string }>;
  contactId?: string | null;
}

export interface QueueAgencyEmailResult {
  queued: boolean;
  reason?: 'undeliverable';
  logId?: string;
}

/**
 * Queue one email from an agency to a customer: suppression check, reply-to, an email_message_log row (when the
 * recipient is a contact) and the EMAIL_QUEUE job that sends it and writes the provider message id back.
 */
export async function queueAgencyEmail(
  env: Env,
  tenantDb: D1Database,
  ctx: { tenantId: string; userId?: string | null },
  mail: AgencyEmail,
): Promise<QueueAgencyEmailResult> {
  if (await isEmailUndeliverable(tenantDb, mail.to)) return { queued: false, reason: 'undeliverable' };

  const replyTo = await resolveReplyTo(env, tenantDb, ctx.tenantId, ctx.userId);

  let logId: string | undefined;
  if (mail.contactId) {
    logId = generateId();
    const now = new Date().toISOString();
    await tenantDb
      .prepare(
        `INSERT INTO email_message_log (id, campaign_id, contact_id, recipient_email, status, created_at, updated_at)
         VALUES (?, NULL, ?, ?, 'queued', ?, ?)`,
      )
      .bind(logId, mail.contactId, mail.to, now, now)
      .run();
  }

  await env.EMAIL_QUEUE.send({
    type: 'email',
    data: {
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.attachments,
      replyTo,
      tenantId: ctx.tenantId,
      emailLogId: logId,
    },
  });
  return { queued: true, logId };
}

/** Escape text for the HTML of an email body. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain text to HTML paragraphs (blank line = new paragraph, single newline = line break), escaped. */
export function textToHtml(text: string | null | undefined): string {
  return String(text ?? '')
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

/** A small, client-safe HTML layout for an agency's email to its customer: heading, paragraphs, optional button. */
export function agencyEmailHtml(parts: { heading: string; bodyHtml: string; button?: { label: string; url: string } }): string {
  const button = parts.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(parts.button.url)}" style="background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(parts.button.label)}</a></p>`
    : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2937;max-width:560px"><h2 style="margin:0 0 16px">${escapeHtml(parts.heading)}</h2>${parts.bodyHtml}${button}</div>`;
}
