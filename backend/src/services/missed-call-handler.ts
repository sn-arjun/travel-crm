/**
 * Missed Call Handler — TICKET-381, TICKET-382
 *
 * Tells the person the call rang (and the administrators) that it was missed. What happens next
 * (a call-back task, a lead for an unknown caller) is decided by the automations listening for "call.missed".
 */

import { generateId } from '../utils/uuid';

interface MissedCallParams {
  callLogId: string;
  fromNumber: string;
  routedTo: string | null;
  contactId: string | null;
  leadId: string | null;
}

export async function handleMissedCall(
  db: D1Database,
  env: { PUSH_NOTIFICATION_QUEUE?: Queue },
  params: MissedCallParams,
): Promise<void> {
  const { callLogId, fromNumber, routedTo, contactId } = params;

  let callerName = fromNumber;
  if (contactId) {
    const contact = await db.prepare('SELECT name FROM contacts WHERE id = ?')
      .bind(contactId).first<{ name: string }>();
    if (contact?.name) callerName = contact.name;
  }

  const admins = await db.prepare(
    "SELECT id FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?",
  ).bind(routedTo || '').all<{ id: string }>();
  const recipients = [...(routedTo ? [routedTo] : []), ...admins.results.map((admin) => admin.id)];

  // One notification per person per call: a repeated callback (or the dial result and the status callback
  // both reporting the same miss) never tells anyone twice.
  let routedWasTold = false;
  for (const userId of recipients) {
    const inserted = await db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message, reference_type, reference_id, is_read)
      SELECT ?, ?, 'missed_call', 'Missed call', ?, 'call', ?, 0
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications WHERE user_id = ? AND type = 'missed_call' AND reference_type = 'call' AND reference_id = ?
      )
    `).bind(generateId(), userId, `Missed call from ${callerName}`, callLogId, userId, callLogId).run();
    if (userId === routedTo && (inserted.meta.changes ?? 0) > 0) routedWasTold = true;
  }

  if (routedTo && routedWasTold && env.PUSH_NOTIFICATION_QUEUE) {
    try {
      await env.PUSH_NOTIFICATION_QUEUE.send({
        type: 'push',
        data: {
          userId: routedTo,
          title: 'Missed Call',
          body: callerName === fromNumber ? fromNumber : `${callerName} (${fromNumber})`,
          data: { type: 'missed_call', callLogId },
        },
      });
    } catch (e) {
      console.error('Failed to queue push notification:', e);
    }
  }
}
