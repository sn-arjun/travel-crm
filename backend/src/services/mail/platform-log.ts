import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import type { ProviderEvent } from './delivery-events';

/**
 * R132: the delivery log for the platform's own mail (master platform_email_log, migration 0027).
 *
 * Written by sendMail for platform_system mail (and by the local outbox path). The recipient is stored masked
 * ("p***@example.com"), never in full. SendGrid events update the row by message id; Cloudflare has no event webhook, so its
 * rows stay "accepted" (accepted by the provider; the Cloudflare dashboard shows what happened next). Rows are deleted after
 * PLATFORM_EMAIL_LOG_RETENTION_DAYS by the platform daily cron.
 */

export const PLATFORM_EMAIL_LOG_RETENTION_DAYS = 90;

export type PlatformMailStatus = 'sent' | 'fallback' | 'failed';

export interface PlatformMailEntry {
  template?: string | null;
  to: string | string[];
  provider: string;
  fallbackFrom?: string | null;
  messageId?: string | null;
  status: PlatformMailStatus;
  error?: string | null;
  note?: string | null;
}

/** "person@example.com" -> "p***@example.com". Enough to recognise a row, not enough to contact anyone. */
export function maskAddress(address: string): string {
  const m = address.trim().match(/^(?:.*<)?([^<>@\s]+)@([^<>\s]+?)>?$/);
  if (!m) return '***';
  return `${m[1].slice(0, 1)}***@${m[2].toLowerCase()}`;
}

export async function recordPlatformMail(env: Pick<Env, 'MASTER_DB'>, entry: PlatformMailEntry): Promise<void> {
  if (!env.MASTER_DB) return;
  try {
    const recipients = Array.isArray(entry.to) ? entry.to : [entry.to];
    const delivery = entry.status === 'failed' ? null : entry.provider === 'cloudflare' ? 'accepted' : entry.provider === 'outbox' || entry.provider === 'mock' ? 'accepted' : null;
    await env.MASTER_DB
      .prepare(
        `INSERT INTO platform_email_log (id, template, kind, to_masked, provider, fallback_from, message_id, status, delivery_status, error, note)
         VALUES (?, ?, 'platform_system', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        generateId(),
        entry.template ?? null,
        recipients.map(maskAddress).join(', ').slice(0, 300),
        entry.provider,
        entry.fallbackFrom ?? null,
        entry.messageId ?? null,
        entry.status,
        delivery,
        entry.error ? entry.error.slice(0, 500) : null,
        entry.note ? entry.note.slice(0, 300) : null,
      )
      .run();
  } catch (err) {
    // The log must never fail the mail it describes.
    console.error('[mail] could not write the platform email log:', err instanceof Error ? err.message : err);
  }
}

const EVENT_STATUS: Record<string, string> = {
  processed: 'processed',
  delivered: 'delivered',
  deferred: 'deferred',
  bounce: 'bounced',
  dropped: 'dropped',
};
const RANK: Record<string, number> = { accepted: 0, processed: 1, deferred: 1, delivered: 2, bounced: 3, dropped: 3 };

/**
 * Apply one SendGrid event to the platform log row that holds the message id. True when a row matched.
 * A status only moves forward (a late "processed" never undoes "delivered"); opens and clicks are not tracked for system mail.
 */
export async function applyPlatformEmailEvent(env: Pick<Env, 'MASTER_DB'>, event: ProviderEvent, ids: string[]): Promise<boolean> {
  const next = EVENT_STATUS[String(event.event ?? '')];
  for (const id of ids) {
    const row = await env.MASTER_DB
      .prepare('SELECT id, delivery_status FROM platform_email_log WHERE message_id = ? LIMIT 1')
      .bind(id)
      .first<{ id: string; delivery_status: string | null }>();
    if (!row) continue;
    if (next && (RANK[next] ?? 0) > (RANK[row.delivery_status ?? 'accepted'] ?? 0)) {
      const failed = next === 'bounced' || next === 'dropped';
      await env.MASTER_DB
        .prepare(
          `UPDATE platform_email_log SET delivery_status = ?, error = CASE WHEN ? THEN ? ELSE error END,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`,
        )
        .bind(next, failed ? 1 : 0, String(event.reason ?? '').slice(0, 500) || null, row.id)
        .run();
    }
    return true;
  }
  return false;
}

export interface PlatformEmailLogRow {
  id: string;
  template: string | null;
  to: string;
  provider: string;
  fallbackFrom: string | null;
  messageId: string | null;
  status: string;
  deliveryStatus: string | null;
  error: string | null;
  note: string | null;
  createdAt: string;
}

export async function listPlatformMail(env: Pick<Env, 'MASTER_DB'>, opts: { limit?: number; status?: string; before?: string } = {}): Promise<PlatformEmailLogRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts.status) {
    where.push('status = ?');
    binds.push(opts.status);
  }
  if (opts.before) {
    where.push('created_at < ?');
    binds.push(opts.before);
  }
  const rows = await env.MASTER_DB
    .prepare(
      `SELECT id, template, to_masked, provider, fallback_from, message_id, status, delivery_status, error, note, created_at
       FROM platform_email_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(...binds, limit)
    .all<Record<string, string | null>>();
  return (rows.results ?? []).map((r) => ({
    id: r.id as string,
    template: r.template,
    to: r.to_masked as string,
    provider: r.provider as string,
    fallbackFrom: r.fallback_from,
    messageId: r.message_id,
    status: r.status as string,
    deliveryStatus: r.delivery_status,
    error: r.error,
    note: r.note,
    createdAt: r.created_at as string,
  }));
}

/** Delete rows older than the retention period. Returns how many went. */
export async function purgePlatformMailLog(env: Pick<Env, 'MASTER_DB'>, now: Date = new Date(), days = PLATFORM_EMAIL_LOG_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
  const res = await env.MASTER_DB.prepare('DELETE FROM platform_email_log WHERE created_at < ?').bind(cutoff).run();
  return res.meta?.changes ?? 0;
}
