/**
 * RealtimeRoom — Cloudflare Durable Object for WebSocket real-time updates.
 *
 * One DO instance per tenant. All connected CRM users for a tenant
 * share a single room and receive broadcasts for:
 * - lead_created, lead_updated, lead_status_changed
 * - payment_received
 * - task_assigned, task_completed
 * - notification
 */

interface WebSocketSession {
  webSocket: WebSocket;
  userId: string;
  connectedAt: number;
}

interface BroadcastEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export class RealtimeRoom {
  private sessions: Map<string, WebSocketSession> = new Map();
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      return this.handleWebSocketUpgrade(url);
    }

    // HTTP broadcast endpoint (called by Workers to push events)
    if (request.method === 'POST' && url.pathname === '/broadcast') {
      const event = (await request.json()) as BroadcastEvent & { excludeUserId?: string };
      this.broadcast(event, event.excludeUserId);
      return new Response(JSON.stringify({ success: true, clients: this.sessions.size }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // HTTP send-to-user endpoint (called by Workers to push events to specific user)
    if (request.method === 'POST' && url.pathname === '/send-to-user') {
      const body = (await request.json()) as BroadcastEvent & { targetUserId: string };
      this.sendToUser(body.targetUserId, body);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Connection count
    if (url.pathname === '/connections') {
      return new Response(JSON.stringify({ count: this.sessions.size }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Expected WebSocket or POST /broadcast', { status: 400 });
  }

  private handleWebSocketUpgrade(url: URL): Response {
    const userId = url.searchParams.get('userId');
    if (!userId) {
      return new Response('Missing userId parameter', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Not a database id: an ephemeral in-memory WebSocket connection key that is never
    // persisted, so crypto.randomUUID() is intentionally kept (UUIDv7 is for DB keys only).
    const sessionId = crypto.randomUUID();

    this.state.acceptWebSocket(server);

    this.sessions.set(sessionId, {
      webSocket: server,
      userId,
      connectedAt: Date.now(),
    });

    server.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string);

        // Handle ping/pong heartbeat
        if (message.type === 'ping') {
          server.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          return;
        }
      } catch {
        // Ignore malformed messages
      }
    });

    server.addEventListener('close', () => {
      this.sessions.delete(sessionId);
    });

    server.addEventListener('error', () => {
      this.sessions.delete(sessionId);
    });

    // Send welcome message
    server.send(
      JSON.stringify({
        type: 'connected',
        data: { sessionId, connectedClients: this.sessions.size },
        timestamp: new Date().toISOString(),
      })
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Broadcast an event to all connected clients in this tenant room.
   */
  broadcast(event: BroadcastEvent, excludeUserId?: string): void {
    const message = JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    });

    const deadSessions: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (excludeUserId && session.userId === excludeUserId) continue;

      try {
        session.webSocket.send(message);
      } catch {
        deadSessions.push(sessionId);
      }
    }

    // Clean up dead connections
    for (const id of deadSessions) {
      this.sessions.delete(id);
    }
  }

  /**
   * Send a message to a specific user.
   */
  sendToUser(userId: string, event: BroadcastEvent): void {
    const message = JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    });

    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        try {
          session.webSocket.send(message);
        } catch {
          // Connection dead, will be cleaned up on next broadcast
        }
      }
    }
  }
}
