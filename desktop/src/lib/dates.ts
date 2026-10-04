/**
 * Local-calendar date helpers.
 *
 * `Date#toISOString()` converts to UTC, so a date picked at local midnight in
 * a timezone ahead of UTC (e.g. IST) serialises as the previous day. Every
 * 'YYYY-MM-DD' string the app sends or stores must be built from local parts.
 */

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

/** Human display date in en-IN. Empty string for null/undefined/invalid. */
export function formatDisplayDate(
  d: Date | string | null | undefined,
  style: 'short' | 'medium' | 'long' = 'medium',
): string {
  if (d === null || d === undefined || d === '') return '';
  const date = typeof d === 'string' ? parseLocalDate(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', DISPLAY_OPTIONS[style]);
}
