import { describe, it, expect } from 'vitest';
import { resolveDateRange } from '../../src/utils/date-range';

// Fixed instants. Tenant zone is Asia/Kolkata (UTC+05:30, no DST).
//   2026-10-06T19:00:00Z = Tue 7 Oct 2026, 00:30 IST   (UTC date is still 6 Oct)
//   2026-10-07T18:00:00Z = Wed 7 Oct 2026, 23:30 IST
const IST_0030 = new Date('2026-10-06T19:00:00Z'); // Wed 7 Oct 2026 local
const IST_2330 = new Date('2026-10-07T18:00:00Z'); // Wed 7 Oct 2026 local
const TZ = 'Asia/Kolkata';

describe('resolveDateRange (tenant-local, fixed clock)', () => {
  it('today covers the local day at 00:30 IST (not the UTC day)', () => {
    const r = resolveDateRange('today', undefined, undefined, TZ, IST_0030);
    expect(r.fromDate).toBe('2026-10-07');
    expect(r.toDate).toBe('2026-10-07');
    expect(r.from).toBe('2026-10-06T18:30:00.000Z');
    expect(r.to).toBe('2026-10-07T18:29:59.999Z');
  });

  it('today is the same range at 23:30 IST', () => {
    const r = resolveDateRange('today', undefined, undefined, TZ, IST_2330);
    expect(r.fromDate).toBe('2026-10-07');
    expect(r.from).toBe('2026-10-06T18:30:00.000Z');
    expect(r.to).toBe('2026-10-07T18:29:59.999Z');
  });

  it('a result just before and just after local midnight resolve to different days', () => {
    const before = resolveDateRange('today', undefined, undefined, TZ, new Date('2026-10-06T18:29:59Z'));
    const after = resolveDateRange('today', undefined, undefined, TZ, new Date('2026-10-06T18:30:00Z'));
    expect(before.fromDate).toBe('2026-10-06');
    expect(after.fromDate).toBe('2026-10-07');
  });

  it('yesterday', () => {
    const r = resolveDateRange('yesterday', undefined, undefined, TZ, IST_0030);
    expect(r.fromDate).toBe('2026-10-06');
    expect(r.toDate).toBe('2026-10-06');
  });

  it('this_week starts on Monday and ends on Sunday', () => {
    const r = resolveDateRange('this_week', undefined, undefined, TZ, IST_0030);
    expect(r.fromDate).toBe('2026-10-05'); // Monday
    expect(r.toDate).toBe('2026-10-11'); // Sunday
  });

  it('last_week is the week before', () => {
    const r = resolveDateRange('last_week', undefined, undefined, TZ, IST_0030);
    expect(r.fromDate).toBe('2026-09-28');
    expect(r.toDate).toBe('2026-10-04');
  });

  it('a Sunday-night UTC instant that is Monday locally belongs to the new week', () => {
    // 2026-10-04T19:00Z = Mon 5 Oct 00:30 IST
    const r = resolveDateRange('this_week', undefined, undefined, TZ, new Date('2026-10-04T19:00:00Z'));
    expect(r.fromDate).toBe('2026-10-05');
  });

  it('this_month / last_month', () => {
    const t = resolveDateRange('this_month', undefined, undefined, TZ, IST_0030);
    expect([t.fromDate, t.toDate]).toEqual(['2026-10-01', '2026-10-31']);
    expect(t.from).toBe('2026-09-30T18:30:00.000Z');
    expect(t.to).toBe('2026-10-31T18:29:59.999Z');
    const l = resolveDateRange('last_month', undefined, undefined, TZ, IST_0030);
    expect([l.fromDate, l.toDate]).toEqual(['2026-09-01', '2026-09-30']);
  });

  it('this_month at 00:30 IST on the 1st is the new month even though UTC is still the old one', () => {
    const r = resolveDateRange('this_month', undefined, undefined, TZ, new Date('2026-09-30T19:00:00Z'));
    expect(r.fromDate).toBe('2026-10-01');
  });

  it('last_month across a year boundary', () => {
    const l = resolveDateRange('last_month', undefined, undefined, TZ, new Date('2026-01-10T06:00:00Z'));
    expect([l.fromDate, l.toDate]).toEqual(['2025-12-01', '2025-12-31']);
  });

  it('quarters', () => {
    const t = resolveDateRange('this_quarter', undefined, undefined, TZ, IST_0030);
    expect([t.fromDate, t.toDate]).toEqual(['2026-10-01', '2026-12-31']);
    const l = resolveDateRange('last_quarter', undefined, undefined, TZ, IST_0030);
    expect([l.fromDate, l.toDate]).toEqual(['2026-07-01', '2026-09-30']);
    const wrap = resolveDateRange('last_quarter', undefined, undefined, TZ, new Date('2026-02-10T06:00:00Z'));
    expect([wrap.fromDate, wrap.toDate]).toEqual(['2025-10-01', '2025-12-31']);
  });

  it('years', () => {
    const t = resolveDateRange('this_year', undefined, undefined, TZ, IST_0030);
    expect([t.fromDate, t.toDate]).toEqual(['2026-01-01', '2026-12-31']);
    const l = resolveDateRange('last_year', undefined, undefined, TZ, IST_0030);
    expect([l.fromDate, l.toDate]).toEqual(['2025-01-01', '2025-12-31']);
  });

  it('custom date-only range is read as local days (inclusive)', () => {
    const r = resolveDateRange('custom', '2024-01-15', '2024-02-15', TZ, IST_0030);
    expect(r.fromDate).toBe('2024-01-15');
    expect(r.toDate).toBe('2024-02-15');
    expect(r.from).toBe('2024-01-14T18:30:00.000Z');
    expect(r.to).toBe('2024-02-15T18:29:59.999Z');
  });

  it('custom range with instants is kept as given', () => {
    const r = resolveDateRange('custom', '2024-01-15T00:00:00.000Z', '2024-02-15T10:00:00.000Z', TZ, IST_0030);
    expect(r.from).toBe('2024-01-15T00:00:00.000Z');
    expect(r.to).toBe('2024-02-15T10:00:00.000Z');
  });

  it('throws for custom range without dates', () => {
    expect(() => resolveDateRange('custom')).toThrow('Custom date range requires customFrom and customTo');
    expect(() => resolveDateRange('custom', '2024-01-15')).toThrow('Custom date range requires customFrom and customTo');
  });

  it('defaults to this month for unknown presets', () => {
    const a = resolveDateRange('unknown_preset', undefined, undefined, TZ, IST_0030);
    const b = resolveDateRange('this_month', undefined, undefined, TZ, IST_0030);
    expect(a).toEqual(b);
  });

  it('defaults to the Asia/Kolkata zone when none is given', () => {
    const r = resolveDateRange('today', undefined, undefined, undefined, IST_0030);
    expect(r.fromDate).toBe('2026-10-07');
  });

  it('works for a zone behind UTC', () => {
    // 2026-10-07T03:00Z = 6 Oct 23:00 in New York (EDT, UTC-4)
    const r = resolveDateRange('today', undefined, undefined, 'America/New_York', new Date('2026-10-07T03:00:00Z'));
    expect(r.fromDate).toBe('2026-10-06');
    expect(r.from).toBe('2026-10-06T04:00:00.000Z');
  });

  it('returns ISO 8601 strings', () => {
    const r = resolveDateRange('today', undefined, undefined, TZ, IST_0030);
    expect(r.from).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(r.to).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
