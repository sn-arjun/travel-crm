import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../../types';
import { leads } from '../../db/tenant-schema';
import { generateId } from '../../utils/uuid';
import { logActivity } from '../../utils/activity-logger';
import { logLeadActivity } from '../../utils/lead-activity-logger';
import { broadcastToTenant } from '../../utils/realtime';
import { resolveAssignee } from '../lead-assignment';
import { emitEvent } from '../automation/events';

export interface CreateLeadInput {
  contactId: string;
  title: string;
  destinations: string[];
  travelDate?: string | null;
  returnDate?: string | null;
  paxAdults?: number;
  paxChildren?: number;
  paxInfants?: number;
  budget?: number | null;
  currency?: string;
  tripType?: string | null;
  source: string;
  priority?: string | null;
  /** `null` leaves the lead unassigned; `undefined` runs source rule, then round-robin. */
  assignedTo?: string | null;
  notes?: string | null;
  passportAvailable?: boolean | null;
  travelClass?: string | null;
  hotelPreference?: string | null;
  mealPreference?: string | null;
  specialRequirements?: string | null;
  estimatedValue?: number | null;
  probability?: number | null;
  expectedCloseDate?: string | null;
}

export interface LeadActor {
  /** null when the lead comes from a public channel or an automation. */
  userId: string | null;
  clientIp?: string;
  /** First entry on the lead timeline. */
  activityNote?: string;
  /** Automation depth of whatever is creating the lead (0 for a person or a public channel). */
  depth?: number;
  /** Extra facts for automations that react to the new lead. */
  eventPayload?: Record<string, unknown>;
  /** Let follow-on automations run after the response instead of before it. */
  waiter?: { waitUntil(promise: Promise<unknown>): void };
}

/**
 * Create a lead: assignment, timeline entry, assignee notification and realtime event.
 * Used by the leads API and by every channel that turns an enquiry into a lead.
 */
export async function createLead(
  env: Env,
  tenantId: string,
  tenantDb: D1Database,
  input: CreateLeadInput,
  actor: LeadActor,
): Promise<{ id: string; assignedTo: string | null }> {
  const db = drizzle(tenantDb);

  const leaveUnassigned = input.assignedTo === null;
  const assignedTo = leaveUnassigned
    ? null
    : await resolveAssignee(tenantDb, env.CACHE, tenantId, input.source, input.assignedTo);

  const id = generateId();
  const now = new Date().toISOString();

  await db.insert(leads).values({
    id,
    contactId: input.contactId,
    title: input.title,
    destination: JSON.stringify(input.destinations),
    travelDate: input.travelDate ?? null,
    returnDate: input.returnDate ?? null,
    paxAdults: input.paxAdults ?? 1,
    paxChildren: input.paxChildren ?? 0,
    paxInfants: input.paxInfants ?? 0,
    budget: input.budget ?? null,
    currency: input.currency ?? 'INR',
    tripType: input.tripType ?? null,
    source: input.source,
    status: 'new',
    priority: input.priority ?? null,
    assignedTo: assignedTo ?? null,
    notes: input.notes ?? null,
    passportAvailable: input.passportAvailable ? 1 : (input.passportAvailable === false ? 0 : null),
    travelClass: input.travelClass ?? null,
    hotelPreference: input.hotelPreference ?? null,
    mealPreference: input.mealPreference ?? null,
    specialRequirements: input.specialRequirements ?? null,
    estimatedValue: input.estimatedValue ?? null,
    probability: input.probability ?? null,
    expectedCloseDate: input.expectedCloseDate ?? null,
    createdBy: actor.userId,
    createdAt: now,
    updatedAt: now,
  });

  await logLeadActivity(db, { leadId: id, type: 'note', content: actor.activityNote ?? 'Lead created', userId: actor.userId });
  if (actor.userId) {
    await logActivity(db, { userId: actor.userId, action: 'create', entityType: 'lead', entityId: id, ipAddress: actor.clientIp });
  }

  // Notify assignee if auto-assigned
  if (assignedTo && assignedTo !== actor.userId) {
    await notifyLeadAssignee(env, tenantDb, assignedTo, input.title, id);
  }

  await broadcastToTenant(env, tenantId, { type: 'lead_created', data: { id, title: input.title, status: 'new' } });

  await emitEvent(
    env,
    tenantId,
    tenantDb,
    {
      type: 'lead.created',
      entityType: 'lead',
      entityId: id,
      payload: { contactId: input.contactId, source: input.source, assignedTo: assignedTo ?? null, ...(actor.eventPayload ?? {}) },
      actorId: actor.userId,
      depth: actor.depth ?? 0,
    },
    actor.waiter,
  );

  return { id, assignedTo: assignedTo ?? null };
}

async function notifyLeadAssignee(
  env: Env,
  tenantDb: D1Database,
  targetUserId: string,
  leadTitle: string,
  leadId: string,
): Promise<void> {
  await tenantDb
    .prepare(
      `INSERT INTO notifications (id, user_id, title, message, type, reference_type, reference_id)
       VALUES (?, ?, 'New lead assigned', ?, 'lead_assigned', 'lead', ?)`,
    )
    .bind(generateId(), targetUserId, leadTitle, leadId)
    .run();

  const tokens = await tenantDb
    .prepare('SELECT fcm_token FROM push_tokens WHERE user_id = ? AND is_active = 1')
    .bind(targetUserId)
    .all<{ fcm_token: string }>();

  for (const token of tokens.results) {
    await env.PUSH_NOTIFICATION_QUEUE.send({
      type: 'push',
      fcmToken: token.fcm_token,
      title: 'New lead assigned',
      body: leadTitle,
      data: { type: 'lead', id: leadId },
    });
  }
}
