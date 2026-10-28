'use client';

import { useRealtimeEvent } from './use-realtime-event';
import type { SeatsSummary } from '@/lib/api/departures';

/** The realtime event the API sends when the seats of a departure change (hold, confirm, cancel, expiry, move, capacity, passengers). */
export const SEATS_CHANGED_EVENT = 'departure:seats_changed';

export interface SeatsChangedEvent {
  departureId: string;
  /** What happened, e.g. `seat_booking.held`. */
  reason?: string;
  /** The seat counts after the change; absent when the API could not read them. */
  seats?: SeatsSummary;
}

/**
 * Calls `onChange` when the seats of a departure change anywhere in the agency, with the new counts so a chip or a bar can
 * redraw without a read. `only` narrows it to one departure. Ids and counts only come over the channel, never names.
 */
export function useDepartureSeatsLive(onChange: (event: SeatsChangedEvent) => void, only?: string | null): void {
  useRealtimeEvent(SEATS_CHANGED_EVENT, (data: unknown) => {
    const e = data as Partial<SeatsChangedEvent> | null;
    if (!e || typeof e.departureId !== 'string') return;
    if (only && e.departureId !== only) return;
    onChange(e as SeatsChangedEvent);
  });
}
