/**
 * R128: apply one provider delivery event (SendGrid's event webhook) to the rows that represent the email.
 *
 * A message is found by the provider message id the sender saved on its row: email_message_log.message_id
 * (agency emails, email campaigns), campaign_recipients.message_id (marketing campaigns) or message_log.external_id
 * (Communication Hub). The provider redelivers events and sends several per message, so every update is idempotent:
 *  - a status only moves forward (queued < sent < delivered < opened < clicked), a late "delivered" after an open is ignored;
 *  - opened_at / clicked_at are set once, and a campaign counter is incremented only by the write that set them
 *    (the UPDATE ... WHERE x IS NULL reports whether it changed a row), so a replayed event counts once;
 *  - a hard bounce flags the contact's email undeliverable; it never erases the address.
 */

export interface ProviderEvent {
  event?: string;
  email?: string;
  message_id?: string;
  sg_message_id?: string;
  type?: string;
  reason?: string;
  [key: string]: unknown;
}

/** SendGrid's sg_message_id is "<x-message-id>.<filter>.<n>"; the send API returns only the first part. */
export function providerMessageIds(event: ProviderEvent): string[] {
  const ids: string[] = [];
  const sg = typeof event.sg_message_id === 'string' ? event.sg_message_id : '';
  if (sg) ids.push(sg.split('.')[0]);
  if (typeof event.message_id === 'string' && event.message_id) ids.push(event.message_id);
  if (sg) ids.push(sg);
  return [...new Set(ids.filter(Boolean))];
}

const RANK: Record<string, number> = { queued: 0, pending: 0, sent: 1, processed: 1, delivered: 2, read: 3, opened: 3, clicked: 4, bounced: 5, dropped: 5, spam_report: 5, unsubscribed: 5, failed: 5 };
const rank = (status: string | null | undefined) => RANK[status ?? ''] ?? 0;

/** A hard bounce: the address does not exist or refuses mail for good. (SendGrid "blocked" is a soft, retryable one.) */
export function isHardBounce(event: ProviderEvent): boolean {
  if (event.event === 'bounce') return event.type === 'permanent' || event.type === 'bounce' || event.type === undefined;
  if (event.event === 'dropped') return /bounced address|invalid/i.test(String(event.reason ?? ''));
  return false;
}

async function changed(stmt: D1PreparedStatement): Promise<boolean> {
  const res = await stmt.run();
  return (res.meta?.changes ?? 0) > 0;
}

async function flagUndeliverable(db: D1Database, contactId: string | null, address: string, reason: string, now: string) {
  if (!contactId || !address) return;
  // Only while the contact still has this address: if the agency already corrected it, the new address is fine.
  await db
    .prepare(
      `UPDATE contacts SET email_undeliverable = 1, email_undeliverable_reason = ?, email_undeliverable_at = ?, updated_at = ?
       WHERE id = ? AND lower(email) = lower(?) AND email_undeliverable = 0`,
    )
    .bind(reason, now, now, contactId, address)
    .run();
}

async function bump(db: D1Database, table: 'email_campaigns' | 'marketing_campaigns', column: string, campaignId: string | null, now: string) {
  if (!campaignId) return;
  await db.prepare(`UPDATE ${table} SET ${column} = COALESCE(${column}, 0) + 1, updated_at = ? WHERE id = ?`).bind(now, campaignId).run();
}

/** Apply the event to the first of the three tables that holds the message id. False when this workspace does not know it. */
export async function applyEmailEvent(db: D1Database, event: ProviderEvent, ids: string[]): Promise<boolean> {
  const now = new Date().toISOString();
  const type = String(event.event ?? '');
  const reason = String(event.reason ?? 'Unknown');
  const hard = isHardBounce(event);

  for (const id of ids) {
    // 1. email_message_log: agency emails and email campaigns
    const log = await db
      .prepare('SELECT id, campaign_id, contact_id, recipient_email, status, opened_at, clicked_at FROM email_message_log WHERE message_id = ? LIMIT 1')
      .bind(id)
      .first<{ id: string; campaign_id: string | null; contact_id: string; recipient_email: string; status: string; opened_at: string | null; clicked_at: string | null }>();
    if (log) {
      const set: string[] = [];
      const binds: unknown[] = [];
      const setStatus = (next: string, terminal = false) => {
        if (terminal ? log.status !== next : rank(next) > rank(log.status)) {
          set.push('status = ?');
          binds.push(next);
        }
      };
      switch (type) {
        case 'processed': setStatus('sent'); break;
        case 'delivered': setStatus('delivered'); break;
        case 'open':
          setStatus('opened');
          if (!log.opened_at && (await changed(db.prepare('UPDATE email_message_log SET opened_at = ? WHERE id = ? AND opened_at IS NULL').bind(now, log.id)))) {
            await bump(db, 'email_campaigns', 'opened_count', log.campaign_id, now);
          }
          break;
        case 'click':
          setStatus('clicked');
          if (!log.clicked_at && (await changed(db.prepare('UPDATE email_message_log SET clicked_at = ? WHERE id = ? AND clicked_at IS NULL').bind(now, log.id)))) {
            await bump(db, 'email_campaigns', 'clicked_count', log.campaign_id, now);
          }
          break;
        case 'bounce':
        case 'dropped': {
          const next = type === 'bounce' ? 'bounced' : 'dropped';
          const first = log.status !== next && log.status !== 'bounced';
          setStatus(next, true);
          set.push(type === 'bounce' ? 'bounce_reason = ?' : 'failure_reason = ?');
          binds.push(reason);
          if (type === 'bounce' && first && (await changed(db.prepare("UPDATE email_message_log SET status = 'bounced' WHERE id = ? AND status <> 'bounced'").bind(log.id)))) {
            await bump(db, 'email_campaigns', 'bounced_count', log.campaign_id, now);
          }
          if (hard) await flagUndeliverable(db, log.contact_id, log.recipient_email || String(event.email ?? ''), reason, now);
          break;
        }
        case 'spam_report': setStatus('spam_report', true); break;
        case 'unsubscribe':
          if (log.status !== 'unsubscribed' && (await changed(db.prepare("UPDATE email_message_log SET status = 'unsubscribed' WHERE id = ? AND status <> 'unsubscribed'").bind(log.id)))) {
            await bump(db, 'email_campaigns', 'unsubscribed_count', log.campaign_id, now);
          }
          break;
        default:
          return true; // known message, event we do not track
      }
      if (set.length > 0) {
        await db.prepare(`UPDATE email_message_log SET ${set.join(', ')}, updated_at = ? WHERE id = ?`).bind(...binds, now, log.id).run();
      }
      return true;
    }

    // 2. campaign_recipients: marketing campaigns
    const rec = await db
      .prepare('SELECT id, campaign_id, contact_id, email, status, opened_at, clicked_at FROM campaign_recipients WHERE message_id = ? LIMIT 1')
      .bind(id)
      .first<{ id: string; campaign_id: string; contact_id: string | null; email: string | null; status: string; opened_at: string | null; clicked_at: string | null }>();
    if (rec) {
      switch (type) {
        case 'delivered':
          if (rank(rec.status) < rank('delivered')) {
            await db.prepare("UPDATE campaign_recipients SET status = 'delivered', delivered_at = ? WHERE id = ?").bind(now, rec.id).run();
          }
          break;
        case 'open':
          if (!rec.opened_at && (await changed(db.prepare('UPDATE campaign_recipients SET opened_at = ? WHERE id = ? AND opened_at IS NULL').bind(now, rec.id)))) {
            await bump(db, 'marketing_campaigns', 'opened_count', rec.campaign_id, now);
          }
          break;
        case 'click':
          if (!rec.clicked_at && (await changed(db.prepare('UPDATE campaign_recipients SET clicked_at = ? WHERE id = ? AND clicked_at IS NULL').bind(now, rec.id)))) {
            await bump(db, 'marketing_campaigns', 'clicked_count', rec.campaign_id, now);
          }
          break;
        case 'bounce':
        case 'dropped':
          if (await changed(db.prepare("UPDATE campaign_recipients SET status = 'failed', error_message = ? WHERE id = ? AND status <> 'failed'").bind(reason, rec.id))) {
            await bump(db, 'marketing_campaigns', 'failed_count', rec.campaign_id, now);
          }
          if (hard) await flagUndeliverable(db, rec.contact_id, rec.email || String(event.email ?? ''), reason, now);
          break;
        default:
          break;
      }
      return true;
    }

    // 3. message_log: Communication Hub emails
    const msg = await db
      .prepare("SELECT id, contact_id, status, read_at FROM message_log WHERE external_id = ? AND channel = 'email' LIMIT 1")
      .bind(id)
      .first<{ id: string; contact_id: string | null; status: string; read_at: string | null }>();
    if (msg) {
      switch (type) {
        case 'delivered':
          if (rank(msg.status) < rank('delivered')) {
            await db.prepare("UPDATE message_log SET status = 'delivered', delivered_at = ? WHERE id = ?").bind(now, msg.id).run();
          }
          break;
        case 'open':
          if (!msg.read_at) {
            await db.prepare("UPDATE message_log SET status = CASE WHEN status = 'failed' THEN status ELSE 'read' END, read_at = ? WHERE id = ? AND read_at IS NULL").bind(now, msg.id).run();
          }
          break;
        case 'bounce':
        case 'dropped':
          await db.prepare("UPDATE message_log SET status = 'failed', error_message = ? WHERE id = ? AND status <> 'failed'").bind(reason, msg.id).run();
          if (hard) {
            const address = String(event.email ?? '');
            await flagUndeliverable(db, msg.contact_id, address, reason, now);
          }
          break;
        default:
          break;
      }
      return true;
    }
  }
  return false;
}
