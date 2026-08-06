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
