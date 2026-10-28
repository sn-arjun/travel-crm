import { describe, expect, it } from 'vitest';

import {
  formatDisplayDate, formatDisplayDateTime, isTimestampString, minutesBetween, parseLocalDate,
  toLocalDateString, toLocalDateTimeInput, toLocalDayKey,
} from './dates';

// Built from local components, so these hold in any TZ the suite runs under
// (verified with TZ=Asia/Kolkata and TZ=America/Los_Angeles).
describe('toLocalDateString', () => {
  it('keeps the local day for local midnight', () => {
    expect(toLocalDateString(new Date(2026, 9, 15))).toBe('2026-10-15');
    expect(toLocalDateString(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
  });
  it('keeps the local day late in the evening', () => {
    expect(toLocalDateString(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });
  it('zero-pads', () => {
    expect(toLocalDateString(new Date(2026, 2, 5))).toBe('2026-03-05');
  });
});

describe('parseLocalDate', () => {
  it('round-trips with toLocalDateString', () => {
    for (const s of ['2026-10-15', '2024-02-29', '1990-01-01', '2026-12-31']) {
      expect(toLocalDateString(parseLocalDate(s))).toBe(s);
    }
  });
  it('uses only the date part of ISO strings', () => {
    const d = parseLocalDate('2026-10-15T00:00:00.000Z');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 15]);
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });
});

describe('toLocalDateTimeInput', () => {
  it('formats local date and time', () => {
    expect(toLocalDateTimeInput(new Date(2026, 9, 15, 9, 5))).toBe('2026-10-15T09:05');
  });
});

describe('formatDisplayDate', () => {
  it('returns empty for nullish and invalid', () => {
    expect(formatDisplayDate(null)).toBe('');
    expect(formatDisplayDate(undefined)).toBe('');
    expect(formatDisplayDate('not a date')).toBe('');
  });
  it('formats in en-IN', () => {
    expect(formatDisplayDate('2026-10-15')).toMatch(/15 Oct 2026/);
    expect(formatDisplayDate(new Date(2026, 9, 15), 'short')).toMatch(/15 Oct/);
    expect(formatDisplayDate('2026-10-15', 'long')).toMatch(/15 October 2026/);
  });
});

// 2026-10-06T19:30:00Z is 01:00 on 7 Oct in Asia/Kolkata and 12:30 on 6 Oct in America/Los_Angeles.
describe('timestamps vs calendar dates', () => {
  const TS = '2026-10-06T19:30:00Z';
  const tz = process.env.TZ;

  it('tells timestamps from date-only values', () => {
    expect(isTimestampString(TS)).toBe(true);
    expect(isTimestampString('2026-10-07 14:45')).toBe(true);
    expect(isTimestampString('2026-10-15')).toBe(false);
    expect(isTimestampString('2026-10-15T00:00:00.000Z')).toBe(false);
  });

  it('formatDisplayDate converts a timestamp to the local day', () => {
    if (tz === 'Asia/Kolkata') expect(formatDisplayDate(TS)).toBe('7 Oct 2026');
    if (tz === 'America/Los_Angeles') expect(formatDisplayDate(TS)).toBe('6 Oct 2026');
    expect(toLocalDayKey(TS)).toBe(toLocalDateString(new Date(TS)));
  });

  it('formatDisplayDate never shifts date-only values', () => {
    expect(formatDisplayDate('2026-10-07')).toBe('7 Oct 2026');
    expect(formatDisplayDate('2026-10-07T00:00:00.000Z')).toBe('7 Oct 2026');
    expect(toLocalDayKey('2026-10-07')).toBe('2026-10-07');
  });

  it('formatDisplayDateTime shows local date and time', () => {
    if (tz === 'Asia/Kolkata') expect(formatDisplayDateTime(TS)).toBe('7 Oct 2026, 1:00 am');
    if (tz === 'America/Los_Angeles') expect(formatDisplayDateTime(TS)).toBe('6 Oct 2026, 12:30 pm');
    expect(formatDisplayDateTime('2026-10-07 14:45')).toBe('7 Oct 2026, 2:45 pm');
    expect(formatDisplayDateTime('2026-10-07')).toBe('7 Oct 2026');
    expect(formatDisplayDateTime(null)).toBe('');
  });

  it('minutesBetween measures local date-times', () => {
    expect(minutesBetween('2026-10-07 14:45', '2026-10-07 18:15')).toBe(210);
    expect(minutesBetween('2026-10-07 14:45', 'nope')).toBeNull();
  });
});
