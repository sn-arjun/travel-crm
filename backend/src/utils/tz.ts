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

// ---------------------------------------------------------------------------
// Tenant-local calendar helpers ("today" = the tenant's local day, not UTC)
// ---------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');
const fmtUtcDate = (t: Date) =>
  `${String(t.getUTCFullYear()).padStart(4, '0')}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;

function resolveZone(timeZone: string | null | undefined): string {
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
}

/** Calendar parts of `now` as observed in `timeZone`. */
function localParts(timeZone: string, now: Date): { year: number; month: number; day: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(now)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day };
}

/** 'YYYY-MM-DD' of the local calendar day that `now` falls in, in `timeZone`. */
export function localDateString(timeZone: string, now: Date = new Date()): string {
  const { year, month, day } = localParts(timeZone, now);
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

/** Add `n` (may be negative) calendar days to a 'YYYY-MM-DD' string. Pure calendar arithmetic. */
export function addDaysLocal(dateString: string, n: number): string {
  const [y, m, d] = dateString.slice(0, 10).split('-').map(Number);
  return fmtUtcDate(new Date(Date.UTC(y, m - 1, d + n)));
}

/** UTC ISO instant at which local midnight of 'YYYY-MM-DD' occurs in `timeZone`. */
export function localDateStartUtcIso(timeZone: string, dateString: string): string {
  const [y, m, d] = dateString.slice(0, 10).split('-').map(Number);
  return localMidnightUtc(resolveZone(timeZone), y, m, d).toISOString();
}

/**
 * Calendar month containing `now` in `timeZone` (monthOffset -1 = previous month).
 * startDate/endDate are inclusive local dates; [startIso, endIso) is the UTC window.
 */
export function localMonthWindow(
  timeZone: string,
  now: Date = new Date(),
  monthOffset = 0,
): { startDate: string; endDate: string; startIso: string; endIso: string } {
  const tz = resolveZone(timeZone);
  const { year, month } = localParts(tz, now);
  const first = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const nextFirst = new Date(Date.UTC(year, month + monthOffset, 1));
  const startDate = fmtUtcDate(first);
  const endDate = fmtUtcDate(new Date(nextFirst.getTime() - 86400000));
  return {
    startDate,
    endDate,
    startIso: localDateStartUtcIso(tz, startDate),
    endIso: localDateStartUtcIso(tz, fmtUtcDate(nextFirst)),
  };
}

/** 'MM-DD' of the local day (birthday / anniversary matching). */
export function localMonthDay(timeZone: string, now: Date = new Date()): string {
  return localDateString(timeZone, now).slice(5, 10);
}

/**
 * Tenant calendar timezone from settings (key 'timezone' preferred, then 'company_timezone');
 * falls back to Asia/Kolkata. Not cached across calls (settings can change) - use
 * tenantTimeZone(c) inside a request handler for per-request caching.
 */
export async function getTenantTimeZone(db: D1Database): Promise<string> {
  try {
    const row = (await db
      .prepare(
        `SELECT value FROM settings WHERE key IN ('timezone', 'company_timezone') AND value IS NOT NULL AND value != ''
         ORDER BY CASE key WHEN 'timezone' THEN 0 ELSE 1 END LIMIT 1`,
      )
      .first()) as { value: string } | null;
    if (row && isValidTimeZone(row.value)) return row.value;
  } catch {
    // settings table unavailable - fall through to default
  }
  return DEFAULT_TIMEZONE;
}

type TzCtx = { req: { raw: Request }; get: (k: 'tenantDb') => D1Database };
const requestZoneCache = new WeakMap<object, Promise<string>>();

/** Per-request cached tenant timezone for a Hono context. */
export function tenantTimeZone(c: TzCtx): Promise<string> {
  const key = c.req.raw as unknown as object;
  let p = requestZoneCache.get(key);
  if (!p) {
    p = getTenantTimeZone(c.get('tenantDb'));
    requestZoneCache.set(key, p);
  }
  return p;
}

/** Wall-clock reading of `now` in `timeZone`: local date, day of week (0 = Sunday) and time. */
export function localClock(
  timeZone: string,
  now: Date = new Date(),
): { date: string; dow: number; hour: number; minute: number } {
  const tz = resolveZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const num = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const date = localDateString(tz, now);
  const [y, m, d] = date.split('-').map(Number);
  return { date, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), hour: num('hour') % 24, minute: num('minute') };
}

/** Whole calendar days from 'YYYY-MM-DD' `from` to `to` (negative if `to` is earlier). */
export function daysBetweenLocal(from: string, to: string): number {
  const [fy, fm, fd] = from.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = to.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/**
 * SQLite datetime modifier ('+05:30') for the zone's UTC offset at `now`,
 * e.g. strftime('%Y-%m', created_at, '+05:30') groups a UTC timestamp by local month.
 */
export function sqlOffsetModifier(timeZone: string, now: Date = new Date()): string {
  const tz = resolveZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(now);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return m ? `${m[1]}${m[2]}:${m[3]}` : '+00:00';
}

/** Tenant timezone and its local 'YYYY-MM-DD' today for the current request. */
export async function tenantToday(c: TzCtx, now: Date = new Date()): Promise<{ timeZone: string; today: string }> {
  const timeZone = await tenantTimeZone(c);
  return { timeZone, today: localDateString(timeZone, now) };
}

// ---------------------------------------------------------------------------
// Per-user time zone (R202)
// ---------------------------------------------------------------------------

/**
 * The zone to show times in: the user's own (users.timezone) when valid, else the agency's (settings key
 * 'timezone', then 'company_timezone'), else Asia/Kolkata. `settings` is the key/value map of the settings table.
 */
export function tenantTz(
  settings: Record<string, string | null | undefined>,
  user?: { timezone?: string | null } | null,
): string {
  for (const candidate of [user?.timezone, settings.timezone, settings.company_timezone]) {
    const tz = candidate?.trim();
    if (isValidTimeZone(tz)) return tz;
  }
  return DEFAULT_TIMEZONE;
}

/** The signed-in user's zone when set, else the agency's. Pass the request's tenant database and user id. */
export async function getUserTimeZone(db: D1Database, userId: string | null | undefined): Promise<string> {
  if (userId) {
    try {
      const row = await db.prepare('SELECT timezone FROM users WHERE id = ?').bind(userId).first<{ timezone: string | null }>();
      if (isValidTimeZone(row?.timezone?.trim())) return row!.timezone!.trim();
    } catch {
      // users.timezone missing on an unmigrated database: use the agency zone
    }
  }
  return getTenantTimeZone(db);
}
