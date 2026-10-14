/**
 * RealtimeRoom — Cloudflare Durable Object for WebSocket real-time updates.
 *
 * One DO instance per tenant. All connected CRM users for a tenant share a single room and receive
 * broadcasts for lead/payment/task/notification events.
 *
 * Uses the WebSocket Hibernation API: sockets are accepted with state.acceptWebSocket(ws, tags), events are
 * delivered to the class handlers (webSocketMessage / webSocketClose / webSocketError), per-socket data lives
 * in the socket attachment and sockets are listed with state.getWebSockets(). Nothing is held in memory per
 * connection, so an idle room is evicted and not billed for duration. The desktop's 30-second
 * {"type":"ping"} is answered by an auto-response pair, which does not wake the object.
 */

interface SocketAttachment {
  userId: string;
  connectedAt: number;
}

interface BroadcastEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/** Exactly what the desktop sends (JSON.stringify({ type: 'ping' })) and what it expects back. */
export const PING_REQUEST = JSON.stringify({ type: 'ping' });
export const PONG_RESPONSE = JSON.stringify({ type: 'pong' });

export class RealtimeRoom {
  private state: DurableObjectState;
  /** How many messages reached webSocketMessage (auto-responded pings do not). Observed by tests. */
  messageHandlerCalls = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_REQUEST, PONG_RESPONSE));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(url);
    }

    // HTTP broadcast endpoint (called by Workers to push events)
    if (request.method === 'POST' && url.pathname === '/broadcast') {
      const event = (await request.json()) as BroadcastEvent & { excludeUserId?: string };
      const clients = this.broadcast(event, event.excludeUserId);
      return new Response(JSON.stringify({ success: true, clients }), {
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
      return new Response(JSON.stringify({ count: this.state.getWebSockets().length }), {
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

    // The user tag lets sendToUser() list only that user's sockets.
    this.state.acceptWebSocket(server, [`user:${userId}`]);
    const attachment: SocketAttachment = { userId, connectedAt: Date.now() };
    server.serializeAttachment(attachment);

    // Not a database id: an ephemeral connection label that is never persisted.
    const sessionId = crypto.randomUUID();
    server.send(
      JSON.stringify({
        type: 'connected',
        data: { sessionId, connectedClients: this.state.getWebSockets().length },
        timestamp: new Date().toISOString(),
      }),
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  // --- Hibernation handlers (the auto-response handles pings without reaching here) ---

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.messageHandlerCalls++;
    if (typeof message !== 'string') return;
    try {
      const parsed = JSON.parse(message);
      // A ping with extra fields does not match the auto-response pair; answer it here.
      if (parsed?.type === 'ping') ws.send(PONG_RESPONSE);
    } catch {
      // Ignore malformed messages
    }
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): Promise<void> {
    try {
      ws.close(code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000, 'closing');
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    try {
      ws.close(1011, 'error');
    } catch {
      // already closed
    }
  }

  /** Broadcast an event to all connected clients in this tenant room. Returns how many sockets got it. */
  broadcast(event: BroadcastEvent, excludeUserId?: string): number {
    const message = JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    });

    let delivered = 0;
    for (const ws of this.state.getWebSockets()) {
      if (excludeUserId && (ws.deserializeAttachment() as SocketAttachment | null)?.userId === excludeUserId) continue;
      try {
        ws.send(message);
        delivered++;
      } catch {
        // dead socket: the runtime delivers webSocketClose/Error and drops it
      }
    }
    return delivered;
  }

  /** Send a message to a specific user. */
  sendToUser(userId: string, event: BroadcastEvent): void {
    const message = JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    });

    for (const ws of this.state.getWebSockets(`user:${userId}`)) {
      try {
        ws.send(message);
      } catch {
        // dead socket
      }
    }
  }
}
