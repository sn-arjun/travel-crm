/**
 * Missed Call Handler — TICKET-381, TICKET-382
 *
 * Handles missed call detection, push notifications,
 * and optional auto-lead creation from unknown callers.
 */

import { generateId } from '../utils/uuid';

interface MissedCallParams {
  callLogId: string;
  fromNumber: string;
  routedTo: string | null;
  contactId: string | null;
  leadId: string | null;
}

/**
 * Handle a missed inbound call: send notifications, optionally create lead.
 */
export async function handleMissedCall(
  db: D1Database,
  env: { NOTIFICATION_QUEUE?: Queue },
  params: MissedCallParams,
  autoCreateLeadEnabled: boolean,
): Promise<void> {
  const { callLogId, fromNumber, routedTo, contactId, leadId } = params;

  // Get contact name if known
  let callerName = fromNumber;
  if (contactId) {
    const contact = await db.prepare('SELECT name FROM contacts WHERE id = ?')
      .bind(contactId).first<{ name: string }>();
    if (contact?.name) callerName = contact.name;
  }

  // 1. Create in-app notification for routed_to agent
  if (routedTo) {
    const notifId = generateId();
    await db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
      VALUES (?, ?, 'missed_call', ?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    `).bind(
      notifId,
      routedTo,
      'Missed Call',
      `Missed call from ${callerName}`,
      JSON.stringify({ callLogId, fromNumber, contactId }),
    ).run();

    // Queue push notification
    if (env.NOTIFICATION_QUEUE) {
      try {
        await env.NOTIFICATION_QUEUE.send({
          type: 'push_notification',
          userId: routedTo,
          title: 'Missed Call',
          body: `${callerName} (${fromNumber})`,
          data: { type: 'missed_call', callLogId },
        });
      } catch (e) {
        console.error('Failed to queue push notification:', e);
      }
    }
  }

  // 2. Also notify all admin users
  const admins = await db.prepare(
    "SELECT id FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?",
  ).bind(routedTo || '').all();

  for (const admin of admins.results || []) {
    const notifId = generateId();
    await db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
      VALUES (?, ?, 'missed_call', ?, ?, ?, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    `).bind(
      notifId,
      (admin as any).id,
      'Missed Call',
      `Missed call from ${callerName}`,
      JSON.stringify({ callLogId, fromNumber, contactId }),
    ).run();
  }

  // 3. Auto-create lead from unknown caller
  if (autoCreateLeadEnabled && !contactId && !leadId) {
    await autoCreateLeadFromMissedCall(db, fromNumber, callLogId, routedTo);
  }
}

/**
 * Auto-create a contact and lead from an unknown missed caller.
 * Deduplicates against leads created from missed calls in the last 24 hours.
 */
async function autoCreateLeadFromMissedCall(
  db: D1Database,
  fromNumber: string,
  callLogId: string,
  routedTo: string | null,
): Promise<{ contactId: string; leadId: string } | null> {
  // Dedup: check if a lead from this phone was auto-created recently
  const phoneSuffix = fromNumber.replace(/[\s\-\(\)\+]/g, '').slice(-10);
  const existingLead = await db.prepare(`
    SELECT id FROM leads
    WHERE phone LIKE ? AND source = 'missed_call'
      AND created_at >= datetime('now', '-24 hours')
    LIMIT 1
  `).bind(`%${phoneSuffix}`).first();

  if (existingLead) return null;

  // Create contact
  const contactId = generateId();
  await db.prepare(`
    INSERT INTO contacts (id, name, phone, type, source, created_by, assigned_to)
    VALUES (?, ?, ?, 'customer', 'missed_call', ?, ?)
  `).bind(
    contactId,
    `Unknown Caller`,
    fromNumber,
    routedTo || 'system',
    routedTo,
  ).run();

  // Create lead
  const leadId = generateId();
  await db.prepare(`
    INSERT INTO leads (id, title, phone, contact_id, source, status, assigned_to, created_by)
    VALUES (?, ?, ?, ?, 'missed_call', 'new', ?, ?)
  `).bind(
    leadId,
    `Missed Call - ${fromNumber}`,
    fromNumber,
    contactId,
    routedTo,
    routedTo || 'system',
  ).run();

  // Link call log to new entities
  await db.prepare(
    'UPDATE call_logs SET contact_id = ?, lead_id = ? WHERE id = ?',
  ).bind(contactId, leadId, callLogId).run();

  return { contactId, leadId };
}
