import { FLEET_TRIP_TYPE_LABELS, TRIP_STATUS_LABELS } from '@travelcrm/shared';
import { formatDisplayDate } from '@/lib/dates';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Local `YYYY-MM-DD` for an ISO timestamp, matching the date the user picked. */
export function formatTripDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local `HH:mm` for an ISO timestamp, matching the time the user entered. */
export function formatTripClock(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTripDateTime(iso?: string | null): string {
  const date = formatTripDate(iso);
  const clock = formatTripClock(iso);
  return clock ? `${date} ${clock}` : date;
}

/** en-IN 12-hour clock, e.g. "3:45 pm". */
export function formatTripTime12(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Human date and time, e.g. "4 Oct 2026, 3:45 pm". */
export function formatTripWhen(iso?: string | null): string {
  if (!iso) return '—';
  const date = formatDisplayDate(new Date(iso));
  if (!date) return '—';
  const time = formatTripTime12(iso);
  return time ? `${date}, ${time}` : date;
}

/** Short human date and time without the year, e.g. "4 Oct, 3:45 pm". */
export function formatTripWhenShort(iso?: string | null): string {
  if (!iso) return '—';
  const date = formatDisplayDate(new Date(iso), 'short');
  if (!date) return '—';
  const time = formatTripTime12(iso);
  return time ? `${date}, ${time}` : date;
}

/**
 * Trip identity for lists. UUIDv7 prefixes are time-based and look identical,
 * so a trip is named by who it carries and when it picks up.
 */
export function tripLabel(trip: {
  passengerName?: string | null;
  startLocation?: string | null;
  startTime?: string | null;
}): string {
  const who = trip.passengerName?.trim() || trip.startLocation?.trim() || 'Trip';
  return trip.startTime ? `${who} · ${formatTripWhenShort(trip.startTime)}` : who;
}

/**
 * Labels for every key the trip timeline can carry: the status values plus
 * the driver app's check-in / check-out events.
 */
export const TRIP_EVENT_LABELS: Record<string, string> = {
  assigned: TRIP_STATUS_LABELS.assigned,
  accepted: TRIP_STATUS_LABELS.accepted,
  rejected: 'Rejected',
  en_route: TRIP_STATUS_LABELS.en_route,
  check_in: 'Checked in',
  started: 'Trip started',
  check_out: 'Checked out',
  completed: TRIP_STATUS_LABELS.completed,
  cancelled: TRIP_STATUS_LABELS.cancelled,
};

function sentenceCase(key: string): string {
  const words = key.replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

export function tripEventLabel(key: string): string {
  return TRIP_EVENT_LABELS[key] ?? sentenceCase(key);
}

export type TripEventTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export function tripEventTone(key: string): TripEventTone {
  switch (key) {
    case 'completed':
      return 'success';
    case 'cancelled':
    case 'rejected':
      return 'danger';
    case 'started':
    case 'en_route':
    case 'check_in':
    case 'check_out':
      return 'info';
    case 'accepted':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** "9.9312, 76.2673" or null when either coordinate is missing. */
export function formatCoordinates(lat?: number | null, lng?: number | null): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export const TRIP_TYPE_OPTIONS = Object.entries(FLEET_TRIP_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export function tripTypeLabel(value?: string | null): string {
  if (!value) return 'One Way';
  return FLEET_TRIP_TYPE_LABELS[value as keyof typeof FLEET_TRIP_TYPE_LABELS] ?? sentenceCase(value);
}

export const TRIP_TERMINAL_STATUSES = ['completed', 'cancelled'] as const;

export function isTripActive(status?: string | null): boolean {
  return !!status && !(TRIP_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/** Map a trip status to a Tag tone. */
export function tripStatusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'started' || status === 'en_route') return 'info';
  if (status === 'accepted') return 'warning';
  return 'neutral';
}
