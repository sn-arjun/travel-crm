import { describe, expect, it } from 'vitest';

import { formatDisplayDate, parseLocalDate, toLocalDateString, toLocalDateTimeInput } from './dates';

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
