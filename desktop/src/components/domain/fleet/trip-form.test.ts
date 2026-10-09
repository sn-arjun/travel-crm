import { describe, it, expect } from 'vitest';

import { safeTripDate, safeTripType } from './trip-form';

describe('trip form: values from the link that opened it', () => {
  it('reads a calendar day as that day in local time', () => {
    const date = safeTripDate('2026-12-18');
    expect(date).toBeInstanceOf(Date);
    expect([date!.getFullYear(), date!.getMonth(), date!.getDate()]).toEqual([2026, 11, 18]);
    expect(date!.getHours()).toBe(0);
  });

  it('ignores anything that is not a real day', () => {
    for (const raw of [null, undefined, '', '18-12-2026', '2026-12-18T10:00:00Z', '2026-02-31', '2026-13-01', 'tomorrow']) {
      expect(safeTripDate(raw)).toBeUndefined();
    }
  });

  it('falls back to a one-way trip for an unknown trip type', () => {
    expect(safeTripType('airport_pickup')).toBe('airport_pickup');
    expect(safeTripType('teleport')).toBe('one_way');
    expect(safeTripType(null)).toBe('one_way');
  });
});
