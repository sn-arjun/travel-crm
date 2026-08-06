import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRealtimeStore } from './realtime-store';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send = vi.fn();

  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  });

  // Simulate open
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  // Simulate message
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  // Simulate error
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  // Simulate close without calling ws.close() (server-initiated)
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  static instances: MockWebSocket[] = [];
  static reset() {
    MockWebSocket.instances = [];
  }
  static latest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
}

describe('useRealtimeStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.reset();
    vi.stubGlobal('WebSocket', MockWebSocket);

    // Reset store state
    useRealtimeStore.setState({
      ws: null,
      connected: false,
      reconnectAttempts: 0,
      listeners: new Map(),
    });
  });

  afterEach(() => {
    // Disconnect to clear timers
    useRealtimeStore.getState().disconnect();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('connect', () => {
    it('should create a WebSocket connection with correct URL', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'my-token', 'user-123');

      expect(MockWebSocket.instances).toHaveLength(1);
      const ws = MockWebSocket.latest()!;
      expect(ws.url).toBe(
        'wss://example.com/ws?userId=user-123&token=my-token',
      );
    });

    it('should set connected to true on WebSocket open', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();

      const state = useRealtimeStore.getState();
      expect(state.connected).toBe(true);
      expect(state.reconnectAttempts).toBe(0);
    });

    it('should store the WebSocket instance', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const state = useRealtimeStore.getState();
      expect(state.ws).toBeDefined();
      expect(state.ws).toBe(MockWebSocket.latest());
    });

    it('should not create a new connection if already connected', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();

      // Try connecting again
      connect('wss://example.com/ws', 'token', 'user-1');

      // Should still only have 1 WebSocket instance
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('should close existing non-connected ws before creating new one', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws1 = MockWebSocket.latest()!;
      // Don't open ws1 — simulate stuck connection

      // Manually set ws in state without connected flag
      useRealtimeStore.setState({ ws: ws1 as any, connected: false });

      connect('wss://example.com/ws', 'token2', 'user-2');

      expect(ws1.close).toHaveBeenCalled();
    });

    it('should URL-encode userId and token', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'tok en&val', 'user id');

      const ws = MockWebSocket.latest()!;
      expect(ws.url).toContain('userId=user%20id');
      expect(ws.url).toContain('token=tok%20en%26val');
    });
  });

  describe('disconnect', () => {
    it('should close the WebSocket', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();

      useRealtimeStore.getState().disconnect();

      expect(ws.close).toHaveBeenCalled();
    });

    it('should set connected to false and ws to null', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();

      useRealtimeStore.getState().disconnect();

      const state = useRealtimeStore.getState();
      expect(state.connected).toBe(false);
      expect(state.ws).toBeNull();
      expect(state.reconnectAttempts).toBe(0);
    });

    it('should be safe to call when not connected', () => {
      expect(() => {
        useRealtimeStore.getState().disconnect();
      }).not.toThrow();
    });
  });

  describe('subscribe', () => {
    it('should add a handler for an event type', () => {
      const handler = vi.fn();
      const { subscribe } = useRealtimeStore.getState();

      subscribe('test-event', handler);

      const listeners = useRealtimeStore.getState().listeners;
      expect(listeners.has('test-event')).toBe(true);
      expect(listeners.get('test-event')!.size).toBe(1);
    });

    it('should support multiple handlers for the same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const { subscribe } = useRealtimeStore.getState();

      subscribe('evt', handler1);
      subscribe('evt', handler2);

      const listeners = useRealtimeStore.getState().listeners;
      expect(listeners.get('evt')!.size).toBe(2);
    });

    it('should return an unsubscribe function', () => {
      const handler = vi.fn();
      const { subscribe } = useRealtimeStore.getState();

      const unsubscribe = subscribe('evt', handler);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should remove handler when unsubscribe is called', () => {
      const handler = vi.fn();
      const { subscribe } = useRealtimeStore.getState();

      const unsubscribe = subscribe('evt', handler);
      unsubscribe();

      const listeners = useRealtimeStore.getState().listeners;
      expect(listeners.has('evt')).toBe(false);
    });

    it('should remove only the specific handler on unsubscribe', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const { subscribe } = useRealtimeStore.getState();

      const unsub1 = subscribe('evt', handler1);
      subscribe('evt', handler2);

      unsub1();

      const listeners = useRealtimeStore.getState().listeners;
      expect(listeners.get('evt')!.size).toBe(1);
      expect(listeners.get('evt')!.has(handler2)).toBe(true);
    });

    it('should clean up event type entry when last handler is removed', () => {
      const handler = vi.fn();
      const { subscribe } = useRealtimeStore.getState();

      const unsubscribe = subscribe('evt', handler);
      unsubscribe();

      const listeners = useRealtimeStore.getState().listeners;
      expect(listeners.has('evt')).toBe(false);
    });
  });

  describe('message handling', () => {
    it('should dispatch messages to subscribed handlers', () => {
      const handler = vi.fn();
      const { connect, subscribe } = useRealtimeStore.getState();

      subscribe('notification', handler);
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();
      ws.simulateMessage({ type: 'notification', data: { id: 1 } });

      expect(handler).toHaveBeenCalledWith({ id: 1 });
    });

    it('should not dispatch messages without a type field', () => {
      const handler = vi.fn();
      const { connect, subscribe } = useRealtimeStore.getState();

      subscribe('anything', handler);
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();
      ws.simulateMessage({ data: 'no type field' });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should dispatch full message when data field is missing', () => {
      const handler = vi.fn();
      const { connect, subscribe } = useRealtimeStore.getState();

      subscribe('ping', handler);
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();
      ws.simulateMessage({ type: 'ping' });

      // When message.data is undefined, handler gets message itself
      expect(handler).toHaveBeenCalledWith({ type: 'ping' });
    });

    it('should not throw for messages with no matching subscribers', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();

      expect(() => {
        ws.simulateMessage({ type: 'unsubscribed-event', data: {} });
      }).not.toThrow();
    });

    it('should handle malformed JSON gracefully', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();

      // Manually trigger onmessage with bad JSON
      expect(() => {
        if (ws.onmessage) {
          ws.onmessage(new MessageEvent('message', { data: 'not json{{{' }));
        }
      }).not.toThrow();
    });

    it('should handle handler errors without crashing', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('handler boom');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { connect, subscribe } = useRealtimeStore.getState();
      subscribe('evt', errorHandler);
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();

      expect(() => {
        ws.simulateMessage({ type: 'evt', data: {} });
      }).not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe('reconnection', () => {
    it('should set connected to false on WebSocket close', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();

      expect(useRealtimeStore.getState().connected).toBe(true);

      ws.simulateClose();

      expect(useRealtimeStore.getState().connected).toBe(false);
    });

    it('should increment reconnectAttempts on close', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();
      ws.simulateClose();

      expect(useRealtimeStore.getState().reconnectAttempts).toBe(1);
    });

    it('should attempt to reconnect after close with exponential backoff', () => {
      // We need to use spyOn for Math.random to make delay predictable
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws1 = MockWebSocket.latest()!;
      ws1.simulateOpen();

      // Close the connection to trigger reconnect
      // We need to prevent the close handler from triggering the store's
      // auto-close so set the close mock to only update readyState
      ws1.close = vi.fn(() => {
        ws1.readyState = MockWebSocket.CLOSED;
      });
      ws1.simulateClose();

      // First reconnect: delay = 1000 * 2^0 + 0 = 1000ms
      expect(MockWebSocket.instances).toHaveLength(1); // no new ws yet
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    });

    it('should start ping keepalive on open', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();

      // Advance 30 seconds for first ping
      vi.advanceTimersByTime(30_000);

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));
    });

    it('should stop ping keepalive on disconnect', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.close = vi.fn(); // prevent close from triggering onclose handler
      ws.simulateOpen();

      useRealtimeStore.getState().disconnect();

      // Reset send mock
      ws.send.mockClear();

      // Advance time - pings should not fire
      vi.advanceTimersByTime(60_000);

      expect(ws.send).not.toHaveBeenCalled();
    });

    it('should reset reconnectAttempts on disconnect', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.close = vi.fn(() => {
        ws.readyState = MockWebSocket.CLOSED;
      });
      ws.simulateOpen();
      ws.simulateClose();

      expect(useRealtimeStore.getState().reconnectAttempts).toBe(1);

      useRealtimeStore.getState().disconnect();

      expect(useRealtimeStore.getState().reconnectAttempts).toBe(0);
    });
  });

  describe('ping keepalive', () => {
    it('should not send ping when WebSocket is not open', () => {
      const { connect } = useRealtimeStore.getState();
      connect('wss://example.com/ws', 'token', 'user-1');

      const ws = MockWebSocket.latest()!;
      ws.simulateOpen();

      // Set readyState to CLOSING
      ws.readyState = MockWebSocket.CLOSING;

      ws.send.mockClear();
      vi.advanceTimersByTime(30_000);

      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});
