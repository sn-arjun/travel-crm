'use client';

import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';

/**
 * Subscribe to one or more real-time event types.
 * Auto-unsubscribes on unmount.
 */
export function useRealtimeEvent(
  eventType: string | string[],
  // Event payloads are loosely typed; handlers narrow what they need.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (data: any) => void,
) {
  const subscribe = useRealtimeStore((s) => s.subscribe);
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  const stableHandler = useCallback((data: unknown) => {
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

/** Realtime events that mean "a message arrived": the inbox list and an open thread reload on them (R135-2). */
export const MESSAGE_ARRIVED_EVENTS = ['message:received', 'notification:new'] as const;

/**
 * Call `onRefresh` when one of the events arrives. Events that land close together (an arriving message sends
 * both a notification and a message event) cause one refresh, `delayMs` after the last of them.
 */
export function useRealtimeRefresh(
  eventType: string | readonly string[],
  onRefresh: () => void,
  delayMs = 300,
) {
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const key = Array.isArray(eventType) ? eventType.join('|') : (eventType as string);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the joined key is the identity of the list
  const types = useMemo(() => key.split('|'), [key]);
  useRealtimeEvent(types, () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      refreshRef.current();
    }, delayMs);
  });
}
