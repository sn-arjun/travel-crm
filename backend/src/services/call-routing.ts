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
 * The contact a phone number belongs to: last 10 digits of contacts.phone (the only phone column contacts
 * has), ignoring spaces, dashes, brackets and a leading +. Customers win over other contact types.
 */
export async function findContactByPhone(
  db: D1Database,
  phone: string,
): Promise<{ id: string; name: string; company: string | null; type: string; phone: string | null; email: string | null } | null> {
  const suffix = normalizePhone(phone);
  if (suffix.length < 5) return null;
  return db.prepare(`
    SELECT c.id, c.name, c.company, c.type, c.phone, c.email
    FROM contacts c
    WHERE c.is_deleted = 0
      AND c.phone IS NOT NULL
      AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE ?
    ORDER BY
      CASE c.type WHEN 'customer' THEN 1 WHEN 'lead' THEN 2 ELSE 3 END,
      c.updated_at DESC
    LIMIT 1
  `).bind(`%${suffix}`).first();
}

/** A contact's newest lead that is still open (leads carry no phone of their own; they belong to a contact). */
export async function findOpenLeadForContact(
  db: D1Database,
  contactId: string,
): Promise<{ id: string; title: string; status: string; estimated_value: number | null; assigned_to: string | null } | null> {
  return db.prepare(`
    SELECT l.id, l.title, l.status, l.estimated_value, l.assigned_to
    FROM leads l
    WHERE l.is_deleted = 0
      AND l.contact_id = ?
      AND l.status NOT IN ('lost', 'won', 'completed')
    ORDER BY l.updated_at DESC, l.created_at DESC
    LIMIT 1
  `).bind(contactId).first();
}

/**
 * Resolve inbound call routing based on caller number and tenant settings.
 */
export async function resolveInboundRouting(
  db: D1Database,
  fromNumber: string,
  settings: Pick<VoipSettingsRow, 'routingStrategy'>,
): Promise<RoutingResult> {
  // 1. Match a known contact, then that contact's newest open lead. The lead's owner is the agent the call
  //    goes to first (contacts have no owner column).
  const contact = await findContactByPhone(db, fromNumber);
  const leadMatch = contact ? await findOpenLeadForContact(db, contact.id) : null;

  const contactId = contact?.id ?? undefined;
  const leadId = leadMatch?.id ?? undefined;
  const assignedTo = leadMatch?.assigned_to ?? null;

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

  // 'assigned' (the default) already tried the owner above; with no usable owner it shares the load
  // between active agents rather than sending the caller to voicemail.
  if (strategy === 'round_robin' || strategy === 'assigned') {
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
