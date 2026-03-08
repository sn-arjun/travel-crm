/**
 * Call Routing Service — TICKET-377, TICKET-379
 *
 * Resolves inbound call routing: known contact → assigned agent,
 * round-robin, least-recent, or voicemail fallback.
 */

import type { VoipSettingsRow } from './voip-provider';

export interface RoutingResult {
  type: 'assigned_agent' | 'round_robin' | 'least_recent' | 'voicemail' | 'default';
  targetUserId?: string;
  targetIdentity?: string;
  contactId?: string;
  leadId?: string;
  reason: string;
}

/**
 * Normalize a phone number to last 10 digits for matching.
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/[\s\-\(\)\+]/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Resolve inbound call routing based on caller number and tenant settings.
 */
export async function resolveInboundRouting(
  db: D1Database,
  fromNumber: string,
  settings: Pick<VoipSettingsRow, 'routingStrategy'>,
): Promise<RoutingResult> {
  const phoneSuffix = normalizePhone(fromNumber);

  // 1. Try to match known contact by phone
  const contact = await db.prepare(`
    SELECT c.id, c.name, c.assigned_to, c.type
    FROM contacts c
    WHERE c.is_deleted = 0
      AND (c.phone LIKE ? OR c.mobile LIKE ? OR c.work_phone LIKE ?)
    ORDER BY
      CASE c.type WHEN 'customer' THEN 1 WHEN 'lead' THEN 2 ELSE 3 END,
      c.updated_at DESC
    LIMIT 1
  `).bind(`%${phoneSuffix}`, `%${phoneSuffix}`, `%${phoneSuffix}`).first<{
    id: string;
    name: string;
    assigned_to: string | null;
    type: string;
  }>();

  // 2. Try matching lead if no contact
  let leadMatch: { id: string; title: string; assigned_to: string | null } | null = null;
  if (!contact) {
    leadMatch = await db.prepare(`
      SELECT l.id, l.title, l.assigned_to
      FROM leads l
      WHERE l.is_deleted = 0
        AND l.phone LIKE ?
      ORDER BY l.updated_at DESC
      LIMIT 1
    `).bind(`%${phoneSuffix}`).first<{
      id: string;
      title: string;
      assigned_to: string | null;
    }>();
  }

  const contactId = contact?.id ?? undefined;
  const leadId = leadMatch?.id ?? undefined;
  const assignedTo = contact?.assigned_to ?? leadMatch?.assigned_to ?? null;

  // 3. If we have an assigned agent, try routing to them
  if (assignedTo) {
    // Check agent is active
    const agent = await db.prepare(
      'SELECT id, name FROM users WHERE id = ? AND is_active = 1',
    ).bind(assignedTo).first<{ id: string; name: string }>();

    if (agent) {
      return {
        type: 'assigned_agent',
        targetUserId: agent.id,
        targetIdentity: `user_${agent.id}`,
        contactId,
        leadId,
        reason: `Routed to assigned agent ${agent.name}`,
      };
    }
  }

  // 4. Fallback: apply routing strategy
  const strategy = settings.routingStrategy || 'round_robin';

  if (strategy === 'round_robin') {
    const agent = await getNextRoundRobinAgent(db);
    if (agent) {
      return {
        type: 'round_robin',
        targetUserId: agent.id,
        targetIdentity: `user_${agent.id}`,
        contactId,
        leadId,
        reason: `Round-robin: routed to ${agent.name}`,
      };
    }
  }

  if (strategy === 'least_recent') {
    const agent = await getLeastRecentAgent(db);
    if (agent) {
      return {
        type: 'least_recent',
        targetUserId: agent.id,
        targetIdentity: `user_${agent.id}`,
        contactId,
        leadId,
        reason: `Least-recent: routed to ${agent.name}`,
      };
    }
  }

  // 5. No agents available — voicemail
  return {
    type: 'voicemail',
    contactId,
    leadId,
    reason: 'No agents available, routing to voicemail',
  };
}

async function getNextRoundRobinAgent(db: D1Database): Promise<{ id: string; name: string } | null> {
  // Find agent who was least recently routed to
  const agent = await db.prepare(`
    SELECT u.id, u.name
    FROM users u
    WHERE u.is_active = 1 AND u.role IN ('admin', 'sales_manager', 'salesperson')
    ORDER BY (
      SELECT MAX(cl.created_at) FROM call_logs cl
      WHERE cl.routed_to = u.id AND cl.direction = 'inbound'
    ) ASC NULLS FIRST
    LIMIT 1
  `).first<{ id: string; name: string }>();
  return agent ?? null;
}

async function getLeastRecentAgent(db: D1Database): Promise<{ id: string; name: string } | null> {
  // Find agent with fewest calls in last 24 hours
  const agent = await db.prepare(`
    SELECT u.id, u.name
    FROM users u
    LEFT JOIN call_logs cl ON cl.routed_to = u.id
      AND cl.direction = 'inbound'
      AND cl.created_at >= datetime('now', '-24 hours')
    WHERE u.is_active = 1 AND u.role IN ('admin', 'sales_manager', 'salesperson')
    GROUP BY u.id, u.name
    ORDER BY COUNT(cl.id) ASC
    LIMIT 1
  `).first<{ id: string; name: string }>();
  return agent ?? null;
}
