/**
 * Timezone helpers (no dependencies — Intl only).
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** True if the runtime recognises the IANA zone name. */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timeZone` from UTC at the given instant, in milliseconds. */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(at)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  // Drop sub-second noise from `at` so the difference is exact.
  const atSeconds = Math.floor(at.getTime() / 1000) * 1000;
  return asUtc - atSeconds;
}

/** UTC instant for local midnight (00:00) of the given calendar date in `timeZone`. */
function localMidnightUtc(timeZone: string, year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  // Two passes handle DST transitions around midnight.
  let utc = guess - zoneOffsetMs(timeZone, new Date(guess));
  utc = guess - zoneOffsetMs(timeZone, new Date(utc));
  return new Date(utc);
}

/**
 * UTC window [startIso, endIso) covering the calendar day that `now` falls in,
 * as observed in `timeZone`. Falls back to Asia/Kolkata for invalid zones.
 */
export function localDayWindowUtc(
  timeZone: string,
  now: Date = new Date(),
): { startIso: string; endIso: string } {
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(now)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const start = localMidnightUtc(tz, p.year, p.month, p.day);
  // Next calendar day (Date.UTC normalises month/day overflow).
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const end = localMidnightUtc(tz, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
