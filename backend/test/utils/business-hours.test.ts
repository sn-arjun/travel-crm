import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkBusinessHours, type BusinessHoursConfig } from '../../src/utils/business-hours';

// Helper to create a config with all weekdays enabled
function makeConfig(overrides: Partial<BusinessHoursConfig> = {}): BusinessHoursConfig {
  const defaultSchedule: BusinessHoursConfig['schedule'] = {
    mon: { start: '09:00', end: '18:00', enabled: true },
    tue: { start: '09:00', end: '18:00', enabled: true },
    wed: { start: '09:00', end: '18:00', enabled: true },
    thu: { start: '09:00', end: '18:00', enabled: true },
    fri: { start: '09:00', end: '18:00', enabled: true },
    sat: { start: '10:00', end: '14:00', enabled: false },
    sun: { start: '00:00', end: '00:00', enabled: false },
  };

  return {
    timezone: 'UTC',
    schedule: defaultSchedule,
    ...overrides,
  };
}

describe('checkBusinessHours', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return true when config is null', () => {
    expect(checkBusinessHours(null)).toBe(true);
  });

  it('should return true when config is undefined', () => {
    expect(checkBusinessHours(undefined)).toBe(true);
  });

  it('should return true during business hours on a weekday', () => {
    // Wednesday at 12:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-05T12:00:00Z')); // Wednesday

    const config = makeConfig();
    expect(checkBusinessHours(config)).toBe(true);
  });

  it('should return false outside business hours on a weekday', () => {
    // Wednesday at 20:00 UTC (after 18:00 end)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-05T20:00:00Z')); // Wednesday

    const config = makeConfig();
    expect(checkBusinessHours(config)).toBe(false);
  });

  it('should return false before business hours on a weekday', () => {
    // Wednesday at 07:00 UTC (before 09:00 start)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-05T07:00:00Z')); // Wednesday

    const config = makeConfig();
    expect(checkBusinessHours(config)).toBe(false);
  });

  it('should return false on disabled days (Saturday disabled)', () => {
    // Saturday at 12:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-08T12:00:00Z')); // Saturday

    const config = makeConfig();
    expect(checkBusinessHours(config)).toBe(false);
  });

  it('should return false on Sunday (disabled)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-09T12:00:00Z')); // Sunday

    const config = makeConfig();
    expect(checkBusinessHours(config)).toBe(false);
  });

  it('should return true on enabled Saturday within hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-08T11:00:00Z')); // Saturday

    const config = makeConfig({
      schedule: {
        ...makeConfig().schedule,
        sat: { start: '10:00', end: '14:00', enabled: true },
      },
    });
    expect(checkBusinessHours(config)).toBe(true);
  });

  it('should return false on holidays', () => {
    // Wednesday at 12:00 UTC but marked as holiday
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-05T12:00:00Z')); // Wednesday

    const config = makeConfig({
      holidays: ['2025-03-05'],
    });
    expect(checkBusinessHours(config)).toBe(false);
  });

  it('should return true on non-holiday dates when holidays are configured', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-06T12:00:00Z')); // Thursday

    const config = makeConfig({
      holidays: ['2025-03-05', '2025-12-25'],
    });
    expect(checkBusinessHours(config)).toBe(true);
  });

  it('should return true at exactly the start time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-05T09:00:00Z')); // Wednesday 09:00

    const config = makeConfig();
    expect(checkBusinessHours(config)).toBe(true);
  });

  it('should return true at exactly the end time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-05T18:00:00Z')); // Wednesday 18:00

    const config = makeConfig();
    expect(checkBusinessHours(config)).toBe(true);
  });

  it('should return false when day schedule is missing from config', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-05T12:00:00Z')); // Wednesday

    const config = makeConfig({
      schedule: {
        mon: { start: '09:00', end: '18:00', enabled: true },
        // Wed is missing
      },
    });
    expect(checkBusinessHours(config)).toBe(false);
  });

  it('should handle overnight schedule (e.g. 22:00 - 06:00)', () => {
    // Night shift: test at 23:00 should be within 22:00-06:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-05T23:00:00Z')); // Wednesday 23:00

    const config = makeConfig({
      schedule: {
        ...makeConfig().schedule,
        wed: { start: '22:00', end: '06:00', enabled: true },
      },
    });
    expect(checkBusinessHours(config)).toBe(true);
  });

  it('should handle overnight schedule at early morning (e.g. 03:00 within 22:00-06:00)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-06T03:00:00Z')); // Thursday 03:00

    const config = makeConfig({
      schedule: {
        ...makeConfig().schedule,
        thu: { start: '22:00', end: '06:00', enabled: true },
      },
    });
    expect(checkBusinessHours(config)).toBe(true);
  });

  it('should handle empty holidays array', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-05T12:00:00Z'));

    const config = makeConfig({ holidays: [] });
    expect(checkBusinessHours(config)).toBe(true);
  });
});
