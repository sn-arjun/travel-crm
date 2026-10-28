'use client';

import { create } from 'zustand';

export type RealtimeEventHandler = (data: unknown) => void;
type EventHandler = RealtimeEventHandler;

interface RealtimeState {
  ws: WebSocket | null;
  connected: boolean;
  reconnectAttempts: number;
  listeners: Map<string, Set<EventHandler>>;

  connect: (wsUrl: string, token: string, userId: string) => void;
  disconnect: () => void;
  subscribe: (eventType: string, handler: EventHandler) => () => void;
}

let pingInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

export const useRealtimeStore = create<RealtimeState>()((set, get) => ({
  ws: null,
  connected: false,
  reconnectAttempts: 0,
  listeners: new Map(),

  connect: (wsUrl: string, token: string, userId: string) => {
    const state = get();
    // Don't connect if already connected
    if (state.ws && state.connected) return;
    // Close existing connection
    if (state.ws) {
      try { state.ws.close(); } catch {}
    }

    try {
      const url = `${wsUrl}?userId=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        set({ connected: true, reconnectAttempts: 0 });
        // Start ping keepalive
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30_000);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (!message.type) return;

          // Dispatch to listeners
          const { listeners } = get();
          const handlers = listeners.get(message.type);
          if (handlers) {
            handlers.forEach((handler) => {
              try { handler(message.data ?? message); } catch (err) {
                console.error('[realtime] handler error:', err);
              }
            });
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        set({ connected: false, ws: null });
        if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
        // Auto-reconnect with exponential backoff + jitter
        const { reconnectAttempts } = get();
        const baseDelay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30_000);
        const jitter = Math.random() * 1000;
        const delay = baseDelay + jitter;
        set({ reconnectAttempts: reconnectAttempts + 1 });
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          const current = get();
          if (!current.connected && current.reconnectAttempts > 0) {
            current.connect(wsUrl, token, userId);
          }
        }, delay);
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };

      set({ ws });
    } catch (err) {
      console.error('[realtime] connect failed:', err);
    }
  },

  disconnect: () => {
    const { ws } = get();
    if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
    if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
    if (ws) {
      try { ws.close(); } catch {}
    }
    set({ ws: null, connected: false, reconnectAttempts: 0 });
  },

  subscribe: (eventType: string, handler: EventHandler) => {
    const { listeners } = get();
    if (!listeners.has(eventType)) {
      listeners.set(eventType, new Set());
    }
    listeners.get(eventType)!.add(handler);
    set({ listeners: new Map(listeners) });

    // Return unsubscribe function
    return () => {
      const current = get();
      const handlers = current.listeners.get(eventType);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          current.listeners.delete(eventType);
        }
        set({ listeners: new Map(current.listeners) });
      }
    };
  },
}));
