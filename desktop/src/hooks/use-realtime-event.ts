'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';

/**
 * Subscribe to one or more real-time event types.
 * Auto-unsubscribes on unmount.
 */
export function useRealtimeEvent(
  eventType: string | string[],
  handler: (data: any) => void,
) {
  const subscribe = useRealtimeStore((s) => s.subscribe);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const stableHandler = useCallback((data: any) => {
    handlerRef.current(data);
  }, []);

  useEffect(() => {
    const types = Array.isArray(eventType) ? eventType : [eventType];
    const unsubscribes = types.map((t) => subscribe(t, stableHandler));
    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [eventType, subscribe, stableHandler]);
}

/**
 * Get the current WebSocket connection status.
 */
export function useRealtimeConnected(): boolean {
  return useRealtimeStore((s) => s.connected);
}
