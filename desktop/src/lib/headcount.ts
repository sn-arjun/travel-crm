/**
 * Head count of a coach trip (R145). Pure functions, so the check-in panel can update its figures at once when a tick is made
 * and the server's answer (GET .../headcount) only confirms them. Mirrors backend/src/services/fleet/coach-trips.ts: heads are seats,
 * a passenger without a stop (or with a stop no longer on the trip) counts under "no stop".
 */

import type { BoardingStatus, TripHeadcount, TripPassenger, TripStop } from '@travelcrm/shared';

type CountedPassenger = Pick<TripPassenger, 'id' | 'tripStopId' | 'seats' | 'boarding' | 'documentsChecked'>;
type CountedStop = Pick<TripStop, 'id' | 'name' | 'sortOrder'>;

const emptyCount = () => ({ expected: 0, boarded: 0, noShow: 0, pending: 0 });

/** Heads expected, boarded, no-show and still pending, overall and per stop (stops in their order, "no stop" last when used). */
export function computeHeadcount(passengers: readonly CountedPassenger[], stops: readonly CountedStop[]): TripHeadcount {
  const stopIds = new Set(stops.map((s) => s.id));
  const per = new Map<string | null, ReturnType<typeof emptyCount>>();
  const total = { ...emptyCount(), documentsChecked: 0 };
  for (const p of passengers) {
    const key = p.tripStopId && stopIds.has(p.tripStopId) ? p.tripStopId : null;
    const slot = per.get(key) ?? emptyCount();
    const n = p.seats;
    slot.expected += n;
    total.expected += n;
    if (p.boarding === 'boarded') { slot.boarded += n; total.boarded += n; }
    else if (p.boarding === 'no_show') { slot.noShow += n; total.noShow += n; }
    else { slot.pending += n; total.pending += n; }
    if (p.documentsChecked) total.documentsChecked += 1;
    per.set(key, slot);
  }
  const ordered = [...stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const byStop: TripHeadcount['byStop'] = ordered.map((s) => ({ stopId: s.id, name: s.name, sortOrder: s.sortOrder, ...(per.get(s.id) ?? emptyCount()) }));
  const loose = per.get(null);
  if (loose) byStop.push({ stopId: null, name: null, sortOrder: ordered.length, ...loose });
  return { ...total, byStop };
}

/** Shares of the bar, in whole percent that add up to 100 when anyone is expected (the largest part takes the rounding). */
export function headcountShares(h: Pick<TripHeadcount, 'expected' | 'boarded' | 'noShow'>): { boarded: number; noShow: number; pending: number } {
  if (h.expected <= 0) return { boarded: 0, noShow: 0, pending: 0 };
  const boarded = Math.round((h.boarded / h.expected) * 100);
  const noShow = Math.round((h.noShow / h.expected) * 100);
  const pending = Math.max(0, 100 - boarded - noShow);
  return { boarded, noShow, pending };
}

/** Everyone expected at the stop is marked, boarded or no-show. A stop nobody is expected at is not "complete": there is nothing to count. */
export function isCountComplete(h: Pick<TripHeadcount, 'expected' | 'pending'>): boolean {
  return h.expected > 0 && h.pending === 0;
}

/** What pressing "Boarded" or "No-show" does: it sets that status, and pressing the one already set takes it back to pending. */
export function nextBoarding(current: BoardingStatus, pressed: 'boarded' | 'no_show'): BoardingStatus {
  return current === pressed ? 'pending' : pressed;
}

/** The passenger list with one tick applied at once (before the server answers). Other people are returned unchanged. */
export function withTick<T extends CountedPassenger>(
  passengers: readonly T[],
  id: string,
  change: { boarding?: BoardingStatus; documentsChecked?: boolean },
): T[] {
  return passengers.map((p) => (p.id !== id ? p : { ...p, ...(change.boarding !== undefined && { boarding: change.boarding }), ...(change.documentsChecked !== undefined && { documentsChecked: change.documentsChecked }) }));
}

/** An id for one tick; the server ignores a repeat of it, which is what makes a retry safe. */
export function newOpId(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
