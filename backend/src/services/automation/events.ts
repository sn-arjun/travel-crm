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
