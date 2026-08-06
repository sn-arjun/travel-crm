import { describe, it, expect } from 'vitest';
import { resolveDateRange } from '../../src/utils/date-range';

describe('resolveDateRange', () => {
  it('should return today range for "today" preset', () => {
    const result = resolveDateRange('today');
    const from = new Date(result.from);
    const to = new Date(result.to);

    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(from.getSeconds()).toBe(0);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(to.getSeconds()).toBe(59);

    // Both should be same day
    expect(from.getDate()).toBe(to.getDate());
    expect(from.getMonth()).toBe(to.getMonth());
  });

  it('should return yesterday range for "yesterday" preset', () => {
    const result = resolveDateRange('yesterday');
    const from = new Date(result.from);
    const to = new Date(result.to);
    const today = new Date();

    // Yesterday should be one day before today
    const expectedDate = new Date(today);
    expectedDate.setDate(expectedDate.getDate() - 1);

    expect(from.getDate()).toBe(expectedDate.getDate());
    expect(to.getDate()).toBe(expectedDate.getDate());
    expect(from.getHours()).toBe(0);
    expect(to.getHours()).toBe(23);
  });

  it('should return this week range for "this_week" preset (Monday start)', () => {
    const result = resolveDateRange('this_week');
    const from = new Date(result.from);
    const to = new Date(result.to);

    // Week starts on Monday (day 1)
    expect(from.getDay()).toBe(1); // Monday
    expect(to.getDay()).toBe(0); // Sunday (end of week)
  });

  it('should return last week range for "last_week" preset', () => {
    const result = resolveDateRange('last_week');
    const from = new Date(result.from);
    const to = new Date(result.to);

    // Last week should be entirely before this week
    const thisWeek = resolveDateRange('this_week');
    const thisWeekFrom = new Date(thisWeek.from);

    expect(to.getTime()).toBeLessThan(thisWeekFrom.getTime());
    expect(from.getDay()).toBe(1); // Monday
    expect(to.getDay()).toBe(0); // Sunday
  });

  it('should return this month range for "this_month" preset', () => {
    const result = resolveDateRange('this_month');
    const from = new Date(result.from);
    const to = new Date(result.to);
    const now = new Date();

    expect(from.getDate()).toBe(1); // First day of month
    expect(from.getMonth()).toBe(now.getMonth());
    expect(to.getMonth()).toBe(now.getMonth());
  });

  it('should return last month range for "last_month" preset', () => {
    const result = resolveDateRange('last_month');
    const from = new Date(result.from);
    const to = new Date(result.to);
    const now = new Date();

    // Should be the month before current
    const expectedMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    expect(from.getMonth()).toBe(expectedMonth);
    expect(from.getDate()).toBe(1); // First day
    expect(to.getMonth()).toBe(expectedMonth); // Same month
  });

  it('should return this quarter range for "this_quarter" preset', () => {
    const result = resolveDateRange('this_quarter');
    const from = new Date(result.from);
    const to = new Date(result.to);

    // Quarter start months: 0 (Jan), 3 (Apr), 6 (Jul), 9 (Oct)
    expect([0, 3, 6, 9]).toContain(from.getMonth());
    expect(from.getDate()).toBe(1);
  });

  it('should return last quarter range for "last_quarter" preset', () => {
    const result = resolveDateRange('last_quarter');
    const from = new Date(result.from);

    // Should start on the first of a quarter month
    expect([0, 3, 6, 9]).toContain(from.getMonth());
    expect(from.getDate()).toBe(1);

    // Should be before this quarter
    const thisQuarter = resolveDateRange('this_quarter');
    const thisQuarterFrom = new Date(thisQuarter.from);
    expect(from.getTime()).toBeLessThan(thisQuarterFrom.getTime());
  });

  it('should return this year range for "this_year" preset', () => {
    const result = resolveDateRange('this_year');
    const from = new Date(result.from);
    const to = new Date(result.to);
    const now = new Date();

    expect(from.getMonth()).toBe(0); // January
    expect(from.getDate()).toBe(1);
    expect(from.getFullYear()).toBe(now.getFullYear());
    expect(to.getMonth()).toBe(11); // December
    expect(to.getFullYear()).toBe(now.getFullYear());
  });

  it('should return last year range for "last_year" preset', () => {
    const result = resolveDateRange('last_year');
    const from = new Date(result.from);
    const to = new Date(result.to);
    const now = new Date();

    expect(from.getFullYear()).toBe(now.getFullYear() - 1);
    expect(from.getMonth()).toBe(0);
    expect(from.getDate()).toBe(1);
    expect(to.getFullYear()).toBe(now.getFullYear() - 1);
    expect(to.getMonth()).toBe(11);
  });

  it('should handle custom range with valid dates', () => {
    const result = resolveDateRange('custom', '2024-01-15', '2024-02-15');
    const from = new Date(result.from);
    const to = new Date(result.to);

    expect(from.getFullYear()).toBe(2024);
    expect(from.getMonth()).toBe(0); // January
    expect(from.getDate()).toBe(15);
    expect(to.getMonth()).toBe(1); // February
    expect(to.getDate()).toBe(15);
  });

  it('should throw for custom range without dates', () => {
    expect(() => resolveDateRange('custom')).toThrow(
      'Custom date range requires customFrom and customTo'
    );
  });

  it('should throw for custom range with only from date', () => {
    expect(() => resolveDateRange('custom', '2024-01-15')).toThrow(
      'Custom date range requires customFrom and customTo'
    );
  });

  it('should default to this month for unknown presets', () => {
    const result = resolveDateRange('unknown_preset');
    const thisMonth = resolveDateRange('this_month');

    expect(result.from).toBe(thisMonth.from);
    expect(result.to).toBe(thisMonth.to);
  });

  it('should return ISO 8601 strings', () => {
    const result = resolveDateRange('today');
    // ISO string ends with Z or has timezone offset
    expect(result.from).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(result.to).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
