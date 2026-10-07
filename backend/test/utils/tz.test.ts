import { describe, it, expect } from 'vitest';
import {
  localDateString,
  addDaysLocal,
  localMonthWindow,
  localMonthDay,
  localDateStartUtcIso,
  localDayWindowUtc,
  getTenantTimeZone,
  DEFAULT_TIMEZONE,
  daysBetweenLocal,
  sqlOffsetModifier,
} from '../../src/utils/tz';

// 2026-10-06T19:00:00Z = 00:30 IST on 7 Oct; 2026-10-07T18:00:00Z = 23:30 IST on 7 Oct.
const IST_0030 = new Date('2026-10-06T19:00:00Z');
const IST_2330 = new Date('2026-10-07T18:00:00Z');
const IST_0500_UTC_DAY_BEFORE = new Date('2026-10-06T23:59:00Z'); // 05:29 IST 7 Oct

describe('localDateString', () => {
  it('returns the local day on both sides of local midnight (IST)', () => {
    expect(localDateString('Asia/Kolkata', new Date('2026-10-06T18:29:59Z'))).toBe('2026-10-06');
    expect(localDateString('Asia/Kolkata', new Date('2026-10-06T18:30:00Z'))).toBe('2026-10-07');
    expect(localDateString('Asia/Kolkata', IST_0030)).toBe('2026-10-07');
    expect(localDateString('Asia/Kolkata', IST_0500_UTC_DAY_BEFORE)).toBe('2026-10-07');
    expect(localDateString('Asia/Kolkata', IST_2330)).toBe('2026-10-07');
  });

  it('differs from the UTC date during the first 5.5 hours of the IST day', () => {
    expect(IST_0030.toISOString().slice(0, 10)).toBe('2026-10-06');
    expect(localDateString('Asia/Kolkata', IST_0030)).toBe('2026-10-07');
  });

  it('works for zones behind UTC and falls back for invalid zones', () => {
    expect(localDateString('America/New_York', new Date('2026-10-07T03:00:00Z'))).toBe('2026-10-06');
    expect(localDateString('Not/AZone', IST_0030)).toBe('2026-10-07'); // Asia/Kolkata fallback
    expect(DEFAULT_TIMEZONE).toBe('Asia/Kolkata');
  });
});

describe('addDaysLocal', () => {
  it('does pure calendar arithmetic across month and year boundaries', () => {
    expect(addDaysLocal('2026-10-07', 1)).toBe('2026-10-08');
    expect(addDaysLocal('2026-10-07', -7)).toBe('2026-09-30');
    expect(addDaysLocal('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysLocal('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysLocal('2028-03-01', -1)).toBe('2028-02-29');
    expect(addDaysLocal('2026-10-07', 30)).toBe('2026-11-06');
    expect(addDaysLocal('2026-10-07T10:00:00Z', 0)).toBe('2026-10-07');
  });
});

describe('localMonthWindow', () => {
  it('returns inclusive local dates and the UTC window for the month', () => {
    const w = localMonthWindow('Asia/Kolkata', IST_0030);
    expect(w.startDate).toBe('2026-10-01');
    expect(w.endDate).toBe('2026-10-31');
    expect(w.startIso).toBe('2026-09-30T18:30:00.000Z');
    expect(w.endIso).toBe('2026-10-31T18:30:00.000Z');
  });

  it('puts an instant just after UTC month end in the next local month', () => {
    // 2026-09-30T19:00Z = 00:30 IST on 1 Oct
    const w = localMonthWindow('Asia/Kolkata', new Date('2026-09-30T19:00:00Z'));
    expect(w.startDate).toBe('2026-10-01');
    const utcMonth = new Date('2026-09-30T19:00:00Z').toISOString().slice(0, 7);
    expect(utcMonth).toBe('2026-09');
  });

  it('supports the previous month and year rollover', () => {
    const prev = localMonthWindow('Asia/Kolkata', new Date('2026-01-10T06:00:00Z'), -1);
    expect(prev.startDate).toBe('2025-12-01');
    expect(prev.endDate).toBe('2025-12-31');
    expect(prev.endIso).toBe('2025-12-31T18:30:00.000Z');
  });

  it('handles February in a leap year', () => {
    const w = localMonthWindow('Asia/Kolkata', new Date('2028-02-15T06:00:00Z'));
    expect(w.endDate).toBe('2028-02-29');
  });
});

describe('daysBetweenLocal / sqlOffsetModifier', () => {
  it('counts whole calendar days', () => {
    expect(daysBetweenLocal('2026-10-07', '2026-10-07')).toBe(0);
    expect(daysBetweenLocal('2026-10-07', '2026-10-08')).toBe(1);
    expect(daysBetweenLocal('2026-10-07', '2026-10-06')).toBe(-1);
    expect(daysBetweenLocal('2026-12-25', '2027-01-05')).toBe(11);
  });
  it('gives the SQLite offset modifier of the zone', () => {
    expect(sqlOffsetModifier('Asia/Kolkata', new Date('2026-10-07T00:00:00Z'))).toBe('+05:30');
    expect(sqlOffsetModifier('America/New_York', new Date('2026-07-01T00:00:00Z'))).toBe('-04:00');
    expect(sqlOffsetModifier('UTC', new Date('2026-07-01T00:00:00Z'))).toBe('+00:00');
  });
});

describe('misc helpers', () => {
  it('localMonthDay gives MM-DD of the local day', () => {
    expect(localMonthDay('Asia/Kolkata', IST_0030)).toBe('10-07');
  });

  it('localDateStartUtcIso gives local midnight as a UTC instant', () => {
    expect(localDateStartUtcIso('Asia/Kolkata', '2026-10-07')).toBe('2026-10-06T18:30:00.000Z');
  });

  it('localDayWindowUtc stays consistent with localDateString', () => {
    const w = localDayWindowUtc('Asia/Kolkata', IST_0030);
    expect(w.startIso).toBe('2026-10-06T18:30:00.000Z');
    expect(w.endIso).toBe('2026-10-07T18:30:00.000Z');
  });

  it('getTenantTimeZone prefers timezone over company_timezone and falls back', async () => {
    const mk = (row: { value: string } | null, fail = false) =>
      ({
        prepare: () => ({
          first: async () => {
            if (fail) throw new Error('no settings table');
            return row;
          },
        }),
      }) as unknown as D1Database;
    expect(await getTenantTimeZone(mk({ value: 'America/New_York' }))).toBe('America/New_York');
    expect(await getTenantTimeZone(mk({ value: 'bogus' }))).toBe('Asia/Kolkata');
    expect(await getTenantTimeZone(mk(null))).toBe('Asia/Kolkata');
    expect(await getTenantTimeZone(mk(null, true))).toBe('Asia/Kolkata');
  });
});
