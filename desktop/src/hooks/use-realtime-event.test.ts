import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRealtimeEvent, useRealtimeConnected, useRealtimeRefresh, MESSAGE_ARRIVED_EVENTS } from './use-realtime-event';
import { useRealtimeStore } from '@/stores/realtime-store';

describe('useRealtimeEvent', () => {
  beforeEach(() => {
    // Reset the store listeners
    useRealtimeStore.setState({
      ws: null,
      connected: false,
      reconnectAttempts: 0,
      listeners: new Map(),
    });
  });

  it('should subscribe to a single event type', () => {
    const handler = vi.fn();

    renderHook(() => useRealtimeEvent('test-event', handler));

    const listeners = useRealtimeStore.getState().listeners;
    expect(listeners.has('test-event')).toBe(true);
    expect(listeners.get('test-event')!.size).toBe(1);
  });

  it('should subscribe to multiple event types', () => {
    const handler = vi.fn();

    renderHook(() =>
      useRealtimeEvent(['event-a', 'event-b', 'event-c'], handler),
    );

    const listeners = useRealtimeStore.getState().listeners;
    expect(listeners.has('event-a')).toBe(true);
    expect(listeners.has('event-b')).toBe(true);
    expect(listeners.has('event-c')).toBe(true);
  });

  it('should unsubscribe on unmount', () => {
    const handler = vi.fn();

    const { unmount } = renderHook(() =>
      useRealtimeEvent('test-event', handler),
    );

    expect(useRealtimeStore.getState().listeners.has('test-event')).toBe(true);

    unmount();

    expect(useRealtimeStore.getState().listeners.has('test-event')).toBe(false);
  });

  it('should unsubscribe from all event types on unmount', () => {
    const handler = vi.fn();

    const { unmount } = renderHook(() =>
      useRealtimeEvent(['event-a', 'event-b'], handler),
    );

    expect(useRealtimeStore.getState().listeners.has('event-a')).toBe(true);
    expect(useRealtimeStore.getState().listeners.has('event-b')).toBe(true);

    unmount();

    expect(useRealtimeStore.getState().listeners.has('event-a')).toBe(false);
    expect(useRealtimeStore.getState().listeners.has('event-b')).toBe(false);
  });

  it('should call handler when event is dispatched', () => {
    const handler = vi.fn();

    renderHook(() => useRealtimeEvent('notification', handler));

    // Manually trigger the handler via the store's subscribe mechanism
    const listeners = useRealtimeStore.getState().listeners;
    const handlers = listeners.get('notification');
    expect(handlers).toBeDefined();

    handlers!.forEach((h) => h({ payload: 'test' }));

    expect(handler).toHaveBeenCalledWith({ payload: 'test' });
  });

  it('should use the latest handler via ref', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { rerender } = renderHook(
      ({ handler }) => useRealtimeEvent('evt', handler),
      { initialProps: { handler: handler1 } },
    );

    rerender({ handler: handler2 });

    // Trigger the stored handler - should call handler2 (latest) due to ref pattern
    const listeners = useRealtimeStore.getState().listeners;
    const handlers = listeners.get('evt');
    handlers!.forEach((h) => h({ data: 'x' }));

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledWith({ data: 'x' });
  });
});

describe('useRealtimeConnected', () => {
  beforeEach(() => {
    useRealtimeStore.setState({
      ws: null,
      connected: false,
      reconnectAttempts: 0,
      listeners: new Map(),
    });
  });

  it('should return false when not connected', () => {
    const { result } = renderHook(() => useRealtimeConnected());
    expect(result.current).toBe(false);
  });

  it('should return true when connected', () => {
    useRealtimeStore.setState({ connected: true });

    const { result } = renderHook(() => useRealtimeConnected());
    expect(result.current).toBe(true);
  });

  it('should update when connection status changes', () => {
    const { result } = renderHook(() => useRealtimeConnected());

    expect(result.current).toBe(false);

    act(() => {
      useRealtimeStore.setState({ connected: true });
    });

    expect(result.current).toBe(true);

    act(() => {
      useRealtimeStore.setState({ connected: false });
    });

    expect(result.current).toBe(false);
  });
});

describe('useRealtimeRefresh (R135-2)', () => {
  beforeEach(() => {
    useRealtimeStore.setState({ ws: null, connected: false, reconnectAttempts: 0, listeners: new Map() });
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  const fire = (type: string) => useRealtimeStore.getState().listeners.get(type)!.forEach((h) => h({}));

  it('refreshes once when a message arrives, even though the bell and the message event both fire', () => {
    const refresh = vi.fn();
    renderHook(() => useRealtimeRefresh(MESSAGE_ARRIVED_EVENTS, refresh));
    act(() => {
      fire('notification:new');
      fire('message:received');
      vi.advanceTimersByTime(400);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh for unrelated events and stops after unmount', () => {
    const refresh = vi.fn();
    const { unmount } = renderHook(() => useRealtimeRefresh(MESSAGE_ARRIVED_EVENTS, refresh));
    expect(useRealtimeStore.getState().listeners.has('badge_counts:update')).toBe(false);
    act(() => {
      fire('message:received');
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
