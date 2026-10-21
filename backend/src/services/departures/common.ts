/**
 * Shared helpers of the group departures domain (R139): one error type the services throw and the routes answer,
 * cursor paging, a local-time to UTC conversion in the agency's zone, and small SQL helpers.
 */

import type { Context } from 'hono';
import { isValidTimeZone, DEFAULT_TIMEZONE } from '../../utils/tz';

/** A refusal the routes turn into `{ success: false, error: { code, message, details } }` with this status. */
export class DepartureError extends Error {
  constructor(
    public status: 400 | 404 | 409 | 422,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function departureErrorResponse(c: Context, e: DepartureError) {
  return c.json({ success: false, error: { code: e.code, message: e.message, ...(e.details && { details: e.details }) } }, e.status);
}

/** Runs a handler body and answers a DepartureError the way every route of the domain does. Anything else is the global 500. */
export async function guarded(c: Context, body: () => Promise<Response>): Promise<Response> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof DepartureError) return departureErrorResponse(c, e);
    throw e;
  }
}

export function chunk<T>(items: readonly T[], size = 50): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(',');

export const nowIso = (): string => new Date().toISOString();

/** Opaque cursor: the sort key and the id of the last row of the previous page. */
export function encodeCursor(...parts: string[]): string {
  return btoa(unescape(encodeURIComponent(parts.join('\u001f')))).replace(/=+$/, '');
}

export function decodeCursor(cursor: string | undefined, parts: number): string[] | null {
  if (!cursor) return null;
  try {
    const raw = decodeURIComponent(escape(atob(cursor)));
    const list = raw.split('\u001f');
    return list.length === parts ? list : null;
  } catch {
    return null;
  }
}

/** Offset of `timeZone` from UTC at the instant `at`, in milliseconds. */
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
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(at)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The UTC instant at which the wall clock of `timeZone` reads `date` ('YYYY-MM-DD') and `time` ('HH:MM'). Two passes cover a DST change. */
export function localDateTimeToUtcIso(timeZone: string, date: string, time: string | null | undefined): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE;
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const [hh, mm] = (time && /^\d{1,2}:\d{2}$/.test(time) ? time : '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - zoneOffsetMs(zone, new Date(guess));
  utc = guess - zoneOffsetMs(zone, new Date(utc));
  return new Date(utc).toISOString();
}

export const toBool = (v: unknown): boolean => v === 1 || v === true || v === '1';
export const fromBool = (v: boolean | undefined | null): number => (v ? 1 : 0);

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const jsonOrNull = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));
