import type { Context } from 'hono';
import type { AppContext, Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { AUTOMATION_DEPTH_HEADER, INTERNAL_HOST } from './api-caller';
import type { DomainEvent } from './types';

export interface EmitInput {
  type: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  actorId?: string | null;
  depth?: number;
}

/**
 * Call lifecycle events (CALL-AUTOMATION 4.2). All are emitted at depth 0 from provider callbacks or the agent's own
 * request, once per real occurrence (the callback routes claim a `provider_events` row first). Payloads:
 *  - call.ringing: callId, direction, from, to, contactId, leadId, routedTo
 *  - call.started: callId, direction, to, contactId, leadId, agentId
 *  - call.answered: callId, direction, agentId, answeredAt
 *  - call.transferred: callId, fromAgent, toAgent, toNumber, note
 *  - call.ended: callId, direction, result (completed | no_answer | busy | failed), durationSeconds, number, contactId, leadId, agentId
 *  - call.missed: from, contactId, leadId, routedTo, offerLead
 *  - call.voicemail_left: callId, from, contactId, leadId, routedTo, durationSeconds, recordingUrl
 *  - call.recording_ready: callId, durationSeconds, channels
 *  - call.transcript_ready (R306): callId, language, wordCount, voicemail
 *  - call.summary_ready (R306): callId, extractionId, contactId, leadId, routedTo, summary, destination, travelDates, paxDetails, budget, tripType, specialRequests, actionItems, draftReply
 */
export const CALL_EVENT_TYPES = [
  'call.ringing',
  'call.started',
  'call.answered',
  'call.transferred',
  'call.ended',
  'call.missed',
  'call.voicemail_left',
  'call.recording_ready',
  'call.transcript_ready',
  'call.summary_ready',
] as const;
export type CallEventType = (typeof CALL_EVENT_TYPES)[number];

/**
 * Group departure events (R143, design 9.1). Emitted by services/departures/*, once per real transition. Payloads carry ids only:
 *  - departure.status_changed: departureId, from, to, automatic?, reason?
 *  - departure.capacity_changed: departureId, from, to (more seats than before)
 *  - departure.seats_low / departure.full: departureId, tourId, code, startDate, left, capacity, threshold
 *  - seat_booking.held / confirmed / waitlisted / cancelled / expired: seatBookingId, departureId, leadId, contactId, seats, status, source
 *    (+ departureCode and confirmMode on held, confirmedBy on confirmed, previousStatus and reason on cancelled)
 *  - waitlist.offered: the seat_booking payload + offeredUntil
 */
export const DEPARTURE_EVENT_TYPES = [
  'departure.status_changed',
  'departure.capacity_changed',
  'departure.seats_low',
  'departure.full',
  'seat_booking.held',
  'seat_booking.confirmed',
  'seat_booking.waitlisted',
  'seat_booking.cancelled',
  'seat_booking.expired',
  'waitlist.offered',
] as const;
export type DepartureEventType = (typeof DEPARTURE_EVENT_TYPES)[number];

interface Waiter {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * Record an event and run the automations it triggers.
 *
 * With a `waiter` (the request's execution context) automations run after the response
 * is sent; without one they finish before this resolves. Never throws: an automation
 * failure must not fail the action that caused it.
 */
export async function emitEvent(
  env: Env,
  tenantId: string,
  db: D1Database,
  input: EmitInput,
  waiter?: Waiter,
): Promise<void> {
  const event: DomainEvent = {
    id: generateId(),
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload ?? {},
    actorId: input.actorId ?? null,
    depth: input.depth ?? 0,
  };

  try {
    await db
      .prepare(
        `INSERT INTO domain_events (id, type, entity_type, entity_id, payload, actor_id, depth) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(event.id, event.type, event.entityType, event.entityId, JSON.stringify(event.payload), event.actorId, event.depth)
      .run();
  } catch (err) {
    console.error('[automation] could not record event', event.type, err);
    return;
  }

  const run = (async () => {
    try {
      // Loaded lazily: the engine's actions import the services that emit events.
      const { processEvent } = await import('./engine');
      await processEvent(env, tenantId, db, event);
    } catch (err) {
      console.error('[automation] event processing failed', event.type, err);
    }
  })();

  if (waiter) waiter.waitUntil(run);
  else await run;
}

/** Automation depth of the current request: > 0 only for in-process calls made by an automation. */
export function requestDepth(c: Context<AppContext>): number {
  try {
    if (new URL(c.req.url).hostname !== INTERNAL_HOST) return 0;
  } catch {
    return 0;
  }
  const depth = Number(c.req.header(AUTOMATION_DEPTH_HEADER));
  return Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 0;
}

/** Emit from a route handler: actor and depth come from the request, work continues after the response. */
export async function emitFromRequest(c: Context<AppContext>, input: EmitInput): Promise<void> {
  let waiter: Waiter | undefined;
  try {
    waiter = c.executionCtx;
  } catch {
    waiter = undefined;
  }
  await emitEvent(
    c.env,
    c.get('tenantId'),
    c.get('tenantDb'),
    { ...input, actorId: input.actorId ?? c.get('userId') ?? null, depth: input.depth ?? requestDepth(c) },
    waiter,
  );
}
