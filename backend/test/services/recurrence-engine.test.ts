import { describe, it, expect } from 'vitest';
import { expandRecurrence } from '../../src/services/recurrence-engine';

// Helper to create a minimal event row
function makeEvent(overrides: Record<string, any> = {}): any {
  return {
    id: 'event-001',
    title: 'Team Meeting',
    description: null,
    event_type: 'meeting',
    start_at: '2025-03-03T10:00:00.000Z', // Monday
    end_at: '2025-03-03T11:00:00.000Z',
    all_day: 0,
    location: null,
    color: null,
    recurrence_rule: null,
    recurrence_parent_id: null,
    related_lead_id: null,
    related_task_id: null,
    assigned_to: 'user-1',
    created_by: 'user-1',
    timezone: 'UTC',
    is_deleted: 0,
    created_at: '2025-03-01T00:00:00.000Z',
    updated_at: '2025-03-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('expandRecurrence', () => {
  it('should return empty array for event without recurrence rule', () => {
    const event = makeEvent({ recurrence_rule: null });
    const result = expandRecurrence(
      event,
      new Date('2025-03-01'),
      new Date('2025-03-31')
    );
    expect(result).toEqual([]);
  });

  it('should return empty array for invalid JSON in recurrence rule', () => {
    const event = makeEvent({ recurrence_rule: 'not-valid-json' });
    const result = expandRecurrence(
      event,
      new Date('2025-03-01'),
      new Date('2025-03-31')
    );
    expect(result).toEqual([]);
  });

  // ─── Daily Recurrence ─────────────────────────────────────────

  it('should expand daily recurrence', () => {
    const event = makeEvent({
      recurrence_rule: JSON.stringify({
        frequency: 'daily',
        interval: 1,
      }),
    });

    // Event starts at 10:00, so rangeEnd must be at least 10:00 on the last day
    const result = expandRecurrence(
      event,
      new Date('2025-03-03T00:00:00Z'),
      new Date('2025-03-07T23:59:59Z')
    );

    // Mar 3, 4, 5, 6, 7 = 5 instances
    expect(result.length).toBe(5);
    expect(result[0].is_recurring).toBe(true);
    expect(result[0].recurrence_parent_id).toBe('event-001');
  });

  it('should expand daily recurrence with interval of 2', () => {
    const event = makeEvent({
      recurrence_rule: JSON.stringify({
        frequency: 'daily',
        interval: 2,
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-03-03T00:00:00Z'),
      new Date('2025-03-10T23:59:59Z')
    );

    // Mar 3, 5, 7, 9 = 4 instances
    expect(result.length).toBe(4);
  });

  it('should generate synthetic IDs in format parentId_YYYYMMDD', () => {
    const event = makeEvent({
      recurrence_rule: JSON.stringify({
        frequency: 'daily',
        interval: 1,
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-03-03T00:00:00Z'),
      new Date('2025-03-04T23:59:59Z')
    );

    expect(result.length).toBe(2);
    expect(result[0].id).toBe('event-001_20250303');
    expect(result[1].id).toBe('event-001_20250304');
  });

  it('should preserve event duration in expanded instances', () => {
    const event = makeEvent({
      start_at: '2025-03-03T10:00:00.000Z',
      end_at: '2025-03-03T11:30:00.000Z',
      recurrence_rule: JSON.stringify({
        frequency: 'daily',
        interval: 1,
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-03-03T00:00:00Z'),
      new Date('2025-03-04T23:59:59Z')
    );

    expect(result.length).toBeGreaterThanOrEqual(1);

    // First instance
    const start1 = new Date(result[0].start_at);
    const end1 = new Date(result[0].end_at!);
    expect(end1.getTime() - start1.getTime()).toBe(90 * 60 * 1000); // 90 minutes
  });

  // ─── Weekly Recurrence ────────────────────────────────────────

  it('should expand weekly recurrence', () => {
    const event = makeEvent({
      start_at: '2025-03-03T10:00:00.000Z', // Monday
      recurrence_rule: JSON.stringify({
        frequency: 'weekly',
        interval: 1,
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-03-01T00:00:00Z'),
      new Date('2025-03-31T23:59:59Z')
    );

    // Every Monday in March: 3, 10, 17, 24, 31 = 5 instances
    expect(result.length).toBe(5);
  });

  it('should expand weekly recurrence with specific days of week', () => {
    const event = makeEvent({
      start_at: '2025-03-03T10:00:00.000Z', // Monday
      recurrence_rule: JSON.stringify({
        frequency: 'weekly',
        interval: 1,
        days_of_week: [1, 3, 5], // Mon, Wed, Fri
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-03-03T00:00:00Z'),
      new Date('2025-03-09T23:59:59Z') // Mon-Sun
    );

    // Mon Mar 3, Wed Mar 5, Fri Mar 7 = 3 instances
    expect(result.length).toBe(3);
  });

  it('should expand bi-weekly recurrence', () => {
    const event = makeEvent({
      start_at: '2025-03-03T10:00:00.000Z', // Monday
      recurrence_rule: JSON.stringify({
        frequency: 'weekly',
        interval: 2,
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-03-01T00:00:00Z'),
      new Date('2025-03-31T23:59:59Z')
    );

    // Every other Monday: Mar 3, 17, 31 = 3 instances
    expect(result.length).toBe(3);
  });

  // ─── Monthly Recurrence ───────────────────────────────────────

  it('should expand monthly recurrence', () => {
    const event = makeEvent({
      start_at: '2025-01-15T10:00:00.000Z', // Jan 15
      recurrence_rule: JSON.stringify({
        frequency: 'monthly',
        interval: 1,
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-06-30T23:59:59Z')
    );

    // Jan 15, Feb 15, Mar 15, Apr 15, May 15, Jun 15 = 6 instances
    expect(result.length).toBe(6);
  });

  it('should expand monthly recurrence with interval of 3', () => {
    const event = makeEvent({
      start_at: '2025-01-10T10:00:00.000Z',
      recurrence_rule: JSON.stringify({
        frequency: 'monthly',
        interval: 3,
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-12-31T23:59:59Z')
    );

    // Jan 10, Apr 10, Jul 10, Oct 10 = 4 instances
    expect(result.length).toBe(4);
  });

  // ─── End Date ─────────────────────────────────────────────────

  it('should respect recurrence end_date', () => {
    const event = makeEvent({
      recurrence_rule: JSON.stringify({
        frequency: 'daily',
        interval: 1,
        end_date: '2025-03-05T23:59:59Z',
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-03-03T00:00:00Z'),
      new Date('2025-03-31T23:59:59Z')
    );

    // Should stop at end_date Mar 5: Mar 3, 4, 5 = 3 instances
    expect(result.length).toBe(3);
  });

  // ─── Max Instances Limit ──────────────────────────────────────

  it('should limit to 366 instances maximum', () => {
    const event = makeEvent({
      start_at: '2020-01-01T10:00:00.000Z',
      recurrence_rule: JSON.stringify({
        frequency: 'daily',
        interval: 1,
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2020-01-01T00:00:00Z'),
      new Date('2025-12-31T23:59:59Z') // ~6 years range
    );

    expect(result.length).toBeLessThanOrEqual(366);
  });

  // ─── Range Filtering ──────────────────────────────────────────

  it('should only include instances within the given range', () => {
    const event = makeEvent({
      start_at: '2025-03-03T10:00:00.000Z',
      recurrence_rule: JSON.stringify({
        frequency: 'daily',
        interval: 1,
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-03-05T00:00:00Z'),
      new Date('2025-03-07T23:59:59Z')
    );

    // Only Mar 5, 6, 7 should be included
    expect(result.length).toBe(3);
    for (const instance of result) {
      const d = new Date(instance.start_at);
      expect(d.getTime()).toBeGreaterThanOrEqual(new Date('2025-03-05T00:00:00Z').getTime());
      expect(d.getTime()).toBeLessThanOrEqual(new Date('2025-03-07T23:59:59Z').getTime());
    }
  });

  it('should set original_start_at on expanded instances', () => {
    const event = makeEvent({
      start_at: '2025-03-03T10:00:00.000Z',
      recurrence_rule: JSON.stringify({
        frequency: 'daily',
        interval: 1,
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-03-03T00:00:00Z'),
      new Date('2025-03-05T23:59:59Z')
    );

    for (const instance of result) {
      expect(instance.original_start_at).toBe('2025-03-03T10:00:00.000Z');
    }
  });

  it('should handle event with no end_at (duration 0)', () => {
    const event = makeEvent({
      end_at: null,
      recurrence_rule: JSON.stringify({
        frequency: 'daily',
        interval: 1,
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-03-03T00:00:00Z'),
      new Date('2025-03-05T23:59:59Z')
    );

    expect(result.length).toBe(3);
    expect(result[0].end_at).toBeNull();
  });

  it('should handle unknown frequency by stopping expansion', () => {
    const event = makeEvent({
      recurrence_rule: JSON.stringify({
        frequency: 'yearly',
        interval: 1,
      }),
    });

    const result = expandRecurrence(
      event,
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-12-31T23:59:59Z')
    );

    // 'yearly' is not a recognized frequency, so after first occurrence it returns
    // The event starts Mar 3 which is within range, so 1 instance then stop
    expect(result.length).toBeLessThanOrEqual(1);
  });
});
