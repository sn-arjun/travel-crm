/**
 * Local-calendar date helpers.
 *
 * `Date#toISOString()` converts to UTC, so a date picked at local midnight in
 * a timezone ahead of UTC (e.g. IST) serialises as the previous day. Every
 * 'YYYY-MM-DD' string the app sends or stores must be built from local parts.
 */

import { getLocaleContext } from './locale';

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** 'YYYY-MM-DD' from the LOCAL year/month/day of `d`. */
export function toLocalDateString(d: Date): string {
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Date at local midnight for a 'YYYY-MM-DD' or ISO string (only the date part
 * is used, so '2026-10-15T00:00:00.000Z' is the 15th regardless of timezone).
 */
export function parseLocalDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 'YYYY-MM-DDTHH:mm' from local parts, for <input type="datetime-local">. */
export function toLocalDateTimeInput(d: Date): string {
  return `${toLocalDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DISPLAY_OPTIONS: Record<'short' | 'medium' | 'long', Intl.DateTimeFormatOptions> = {
  short: { day: 'numeric', month: 'short' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
};

const HAS_TIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const UTC_MIDNIGHT_RE = /^\d{4}-\d{2}-\d{2}T00:00(:00(\.0+)?)?(Z|\+00:?00)$/;
const HAS_ZONE_RE = /(Z|[+-]\d{2}:?\d{2})$/;

/**
 * True for a string that carries a real moment in time (a server TIMESTAMP such as
 * '2026-10-06T19:30:00Z' or a local '2026-10-07 14:45'), false for calendar dates ('2026-10-15')
 * and for date columns serialised at UTC midnight ('2026-10-15T00:00:00.000Z').
 */
export function isTimestampString(s: string): boolean {
  return HAS_TIME_RE.test(s) && !UTC_MIDNIGHT_RE.test(s);
}

/** Instant for a timestamp string; a zone-less 'YYYY-MM-DD HH:mm' is read as local wall-clock time. */
function parseTimestamp(s: string): Date {
  if (HAS_ZONE_RE.test(s)) return new Date(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}

/**
 * Date for display: calendar dates keep the parseLocalDate path (no day shift); timestamps are
 * converted to the viewer's local time.
 */
export function toDisplayDate(s: string): Date {
  return isTimestampString(s) ? parseTimestamp(s) : parseLocalDate(s);
}

/** 'YYYY-MM-DD' of the LOCAL day a timestamp falls on (calendar dates pass through). '' if invalid. */
export function toLocalDayKey(s: string): string {
  const d = toDisplayDate(s);
  return Number.isNaN(d.getTime()) ? '' : toLocalDateString(d);
}

/**
 * Zone to read a value in: the active user's zone (lib/locale.ts) for a timestamp that carries its own zone
 * ('...Z', '+05:30'), nothing otherwise. Calendar dates ('2026-10-15') and zone-less wall-clock times
 * ('2026-10-07 14:45') are not instants, so they never move to another zone.
 */
function zoneFor(s: string | Date): string | undefined {
  if (typeof s !== 'string') return undefined;
  return isTimestampString(s) && HAS_ZONE_RE.test(s) ? getLocaleContext().timeZone || undefined : undefined;
}

/**
 * Human display date in the active locale (e.g. '15 Oct 2026' for en-IN and en-GB, 'Oct 15, 2026' for en-US).
 * Empty string for null/undefined/invalid. A timestamp with a zone shows the day it falls on in the user's
 * time zone; calendar dates never shift.
 */
export function formatDisplayDate(
  d: Date | string | null | undefined,
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  if (d === null || d === undefined || d === '') return '';
  const date = typeof d === 'string' ? toDisplayDate(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const timeZone = zoneFor(d);
  return date.toLocaleDateString(getLocaleContext().intlLocale, timeZone ? { ...DISPLAY_OPTIONS[style], timeZone } : DISPLAY_OPTIONS[style]);
}

/**
 * Human date and time in the active locale and the user's time zone, e.g. '7 Oct 2026, 2:45 pm' (en-IN).
 * A Date object is an instant and is shown in the user's zone; a string follows the rules of formatDisplayDate.
 * Date-only values show the date alone.
 */
export function formatDisplayDateTime(d: Date | string | null | undefined): string {
  if (d === null || d === undefined || d === '') return '';
  if (typeof d === 'string' && !isTimestampString(d)) return formatDisplayDate(d);
  const date = typeof d === 'string' ? parseTimestamp(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const { intlLocale: locale, timeZone: userZone } = getLocaleContext();
  const timeZone = typeof d === 'string' ? zoneFor(d) : userZone || undefined;
  const zoned = timeZone ? { timeZone } : {};
  const day = date.toLocaleDateString(locale, { ...DISPLAY_OPTIONS.medium, ...zoned });
  const time = date
    .toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', ...zoned })
    .replace(/\s?AM$/i, ' am')
    .replace(/\s?PM$/i, ' pm');
  return `${day}, ${time}`;
}

/** Whole minutes from `a` to `b` (timestamps or local date-times); null if either is invalid. */
export function minutesBetween(a: string, b: string): number | null {
  const x = parseTimestamp(a).getTime();
  const y = parseTimestamp(b).getTime();
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.round((y - x) / 60000);
}
