import { describe, it, expect } from 'vitest';
import { getPreviousPeriod, computeChanges } from '../../src/utils/period-comparison';

describe('getPreviousPeriod', () => {
  it('should return the previous period of the same duration', () => {
    // Current period: Jan 1 - Jan 31 (31 days)
    const result = getPreviousPeriod(
      '2025-01-01T00:00:00.000Z',
      '2025-01-31T23:59:59.999Z'
    );

    const prevFrom = new Date(result.from);
    const prevTo = new Date(result.to);

    // Previous period should end just before current period starts
    expect(prevTo.getTime()).toBe(new Date('2025-01-01T00:00:00.000Z').getTime() - 1);

    // Duration of previous period should equal current period duration
    const currentDuration =
      new Date('2025-01-31T23:59:59.999Z').getTime() -
      new Date('2025-01-01T00:00:00.000Z').getTime();
    const prevDuration = prevTo.getTime() - prevFrom.getTime();
    expect(prevDuration).toBe(currentDuration);
  });

  it('should handle a single day period', () => {
    const result = getPreviousPeriod(
      '2025-03-05T00:00:00.000Z',
      '2025-03-05T23:59:59.999Z'
    );

    const prevFrom = new Date(result.from);
    const prevTo = new Date(result.to);

    // Previous period should be the day before
    expect(prevTo.getTime()).toBe(new Date('2025-03-05T00:00:00.000Z').getTime() - 1);
  });

  it('should handle weekly periods', () => {
    const result = getPreviousPeriod(
      '2025-03-03T00:00:00.000Z', // Monday
      '2025-03-09T23:59:59.999Z'  // Sunday
    );

    const prevFrom = new Date(result.from);
    const prevTo = new Date(result.to);

    // Previous week should end just before this week starts
    expect(prevTo.getTime()).toBe(new Date('2025-03-03T00:00:00.000Z').getTime() - 1);
  });

  it('should return valid ISO strings', () => {
    const result = getPreviousPeriod(
      '2025-01-01T00:00:00.000Z',
      '2025-01-31T23:59:59.999Z'
    );

    expect(result.from).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(result.to).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should handle cross-year periods', () => {
    const result = getPreviousPeriod(
      '2025-01-01T00:00:00.000Z',
      '2025-06-30T23:59:59.999Z'
    );

    const prevFrom = new Date(result.from);
    // Previous 6-month period should be in 2024
    expect(prevFrom.getFullYear()).toBe(2024);
  });
});

describe('computeChanges', () => {
  it('should compute positive change (up direction)', () => {
    const current = { revenue: 150 };
    const previous = { revenue: 100 };
    const result = computeChanges(current, previous);

    expect(result.revenue).toEqual({
      absolute: 50,
      percent: 50,
      direction: 'up',
    });
  });

  it('should compute negative change (down direction)', () => {
    const current = { revenue: 80 };
    const previous = { revenue: 100 };
    const result = computeChanges(current, previous);

    expect(result.revenue).toEqual({
      absolute: -20,
      percent: -20,
      direction: 'down',
    });
  });

  it('should compute flat change (no difference)', () => {
    const current = { revenue: 100 };
    const previous = { revenue: 100 };
    const result = computeChanges(current, previous);

    expect(result.revenue).toEqual({
      absolute: 0,
      percent: 0,
      direction: 'flat',
    });
  });

  it('should handle zero previous value (100% increase)', () => {
    const current = { revenue: 50 };
    const previous = { revenue: 0 };
    const result = computeChanges(current, previous);

    expect(result.revenue).toEqual({
      absolute: 50,
      percent: 100,
      direction: 'up',
    });
  });

  it('should handle both zero values (flat)', () => {
    const current = { revenue: 0 };
    const previous = { revenue: 0 };
    const result = computeChanges(current, previous);

    expect(result.revenue).toEqual({
      absolute: 0,
      percent: 0,
      direction: 'flat',
    });
  });

  it('should handle multiple metrics', () => {
    const current = { revenue: 200, leads: 50, bookings: 10 };
    const previous = { revenue: 100, leads: 60, bookings: 10 };
    const result = computeChanges(current, previous);

    expect(result.revenue.direction).toBe('up');
    expect(result.leads.direction).toBe('down');
    expect(result.bookings.direction).toBe('flat');
  });

  it('should round percent to 2 decimal places', () => {
    const current = { revenue: 133 };
    const previous = { revenue: 100 };
    const result = computeChanges(current, previous);

    // 33% exactly
    expect(result.revenue.percent).toBe(33);
  });

  it('should handle fractional percentages', () => {
    const current = { revenue: 101 };
    const previous = { revenue: 300 };
    const result = computeChanges(current, previous);

    // (101-300)/300 * 100 = -66.333...
    expect(result.revenue.percent).toBe(-66.33);
    expect(result.revenue.direction).toBe('down');
  });

  it('should only include keys from current', () => {
    const current = { revenue: 100 };
    const previous = { revenue: 50, oldMetric: 20 };
    const result = computeChanges(current, previous);

    expect(result).toHaveProperty('revenue');
    expect(result).not.toHaveProperty('oldMetric');
  });

  it('should handle missing keys in previous (treat as 0)', () => {
    const current = { revenue: 100, newMetric: 30 };
    const previous = { revenue: 80 };
    const result = computeChanges(current, previous);

    expect(result.newMetric).toEqual({
      absolute: 30,
      percent: 100,
      direction: 'up',
    });
  });

  it('should handle large numbers', () => {
    const current = { revenue: 10000000 };
    const previous = { revenue: 5000000 };
    const result = computeChanges(current, previous);

    expect(result.revenue.absolute).toBe(5000000);
    expect(result.revenue.percent).toBe(100);
    expect(result.revenue.direction).toBe('up');
  });
});
