import type { Env } from '../types';

export interface RealtimeEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface BroadcastOptions {
  excludeUserId?: string;
  targetUserId?: string;
}

/**
 * Broadcast a real-time event to all connected WebSocket clients in a tenant room.
 * Non-critical — failures are silently logged, never thrown.
 */
export async function broadcastToTenant(
  env: Env,
  tenantId: string,
  event: RealtimeEvent,
  options?: BroadcastOptions,
): Promise<void> {
  try {
    const roomId = env.REALTIME.idFromName(tenantId);
    const room = env.REALTIME.get(roomId);

    if (options?.targetUserId) {
      await room.fetch('http://internal/send-to-user', {
        method: 'POST',
        body: JSON.stringify({
          ...event,
          timestamp: new Date().toISOString(),
          targetUserId: options.targetUserId,
        }),
      });
    } else {
      await room.fetch('http://internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          ...event,
          timestamp: new Date().toISOString(),
          ...(options?.excludeUserId && { excludeUserId: options.excludeUserId }),
        }),
      });
    }
  } catch (err) {
    console.error(`[realtime] broadcast failed for tenant ${tenantId}:`, event.type, err);
  }
}

/** What an agent's screen pop shows about an incoming call. */
export interface RingingCallPayload {
  callId: string;
  direction: 'inbound';
  from: string;
  to: string | null;
  routedTo: string | null;
  routedToName: string | null;
  contact: { id: string; name: string } | null;
  lead: { id: string; title: string; status: string; value: number | null } | null;
  /** The last message or call note about this caller, if any. */
  lastInteraction: { kind: 'message' | 'call_note'; text: string; at: string | null } | null;
  ringingAt: string;
}

/**
 * Screen pop (R303): `call:ringing` goes to the agent the call rings; everyone else gets `call:ringing_for` so
 * their screen can say "Ringing for <agent>". Without a routed agent nobody is rung, so nothing is pushed.
 */
export async function broadcastCallRinging(env: Env, tenantId: string, payload: RingingCallPayload): Promise<void> {
  if (!payload.routedTo) return;
  await broadcastToTenant(env, tenantId, { type: 'call:ringing', data: { ...payload } }, { targetUserId: payload.routedTo });
  await broadcastToTenant(env, tenantId, { type: 'call:ringing_for', data: { ...payload, lastInteraction: null } }, { excludeUserId: payload.routedTo });
}
