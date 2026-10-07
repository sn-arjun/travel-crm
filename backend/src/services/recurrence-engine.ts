/**
 * Recurrence Engine — expands recurring events into virtual instances.
 * 
 * Supports daily, weekly, and monthly recurrence patterns.
 * Max 366 instances per expansion to prevent runaway generation.
 */

import { DEFAULT_TIMEZONE, isValidTimeZone, localDateString, localDateStartUtcIso, localClock } from '../utils/tz';

interface RecurrenceRule {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    end_date?: string;
    days_of_week?: number[]; // 0=Sun, 6=Sat
}

interface EventRow {
    id: string;
    title: string;
    description: string | null;
    event_type: string;
    start_at: string;
    end_at: string | null;
    all_day: number;
    location: string | null;
    color: string | null;
    recurrence_rule: string | null;
    recurrence_parent_id: string | null;
    related_lead_id: string | null;
    related_task_id: string | null;
    assigned_to: string;
    created_by: string;
    timezone: string;
    is_deleted: number;
    created_at: string;
    updated_at: string;
    // Joined fields
    assignee_name?: string;
    creator_name?: string;
}

interface ExpandedEvent extends EventRow {
    is_recurring: boolean;
    original_start_at?: string;
}

// All calendar arithmetic is done in the event's own timezone (default Asia/Kolkata), so an event at
// 00:30 IST recurs on the right local weekday/date even though its UTC date is the day before.

function formatDateKey(d: Date, tz: string): string {
    return localDateString(tz, d).replace(/-/g, '');
}

/** Shift `date` by whole local calendar days, keeping the local time of day. */
function addDays(date: Date, days: number, tz: string): Date {
    return shiftLocalCalendar(date, tz, 0, days);
}

function addMonths(date: Date, months: number, tz: string): Date {
    return shiftLocalCalendar(date, tz, months, 0);
}

function shiftLocalCalendar(date: Date, tz: string, months: number, days: number): Date {
    const local = localDateString(tz, date);
    const [y, m, d] = local.split('-').map(Number);
    const msIntoDay = date.getTime() - new Date(localDateStartUtcIso(tz, local)).getTime();
    const target = new Date(Date.UTC(y, m - 1 + months, d + days));
    const targetLocal = `${String(target.getUTCFullYear()).padStart(4, '0')}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(target.getUTCDate()).padStart(2, '0')}`;
    return new Date(new Date(localDateStartUtcIso(tz, targetLocal)).getTime() + msIntoDay);
}

function nextWeeklyOccurrence(
    current: Date,
    interval: number,
    daysOfWeek: number[] | undefined,
    tz: string
): Date {
    if (!daysOfWeek || daysOfWeek.length === 0) {
        return addDays(current, 7 * interval, tz);
    }

    const currentDay = localClock(tz, current).dow;
    const sorted = [...daysOfWeek].sort((a, b) => a - b);

    // Find next day in the current week
    for (const day of sorted) {
        if (day > currentDay) {
            return addDays(current, day - currentDay, tz);
        }
    }

    // Wrap to next week (considering interval)
    const daysUntilNextWeek = 7 - currentDay + sorted[0];
    return addDays(current, daysUntilNextWeek + 7 * (interval - 1), tz);
}

/**
 * Expands a recurring event into virtual instances within the given date range.
 * Each instance gets a synthetic ID: `{parentId}_YYYYMMDD`.
 */
export function expandRecurrence(
    event: EventRow,
    rangeStart: Date,
    rangeEnd: Date
): ExpandedEvent[] {
    if (!event.recurrence_rule) return [];

    let rule: RecurrenceRule;
    try {
        rule = JSON.parse(event.recurrence_rule);
    } catch {
        return [];
    }

    const instances: ExpandedEvent[] = [];
    const tz = isValidTimeZone(event.timezone) ? event.timezone : DEFAULT_TIMEZONE;
    let current = new Date(event.start_at);
    const duration = event.end_at
        ? new Date(event.end_at).getTime() - new Date(event.start_at).getTime()
        : 0;

    const maxDate = rule.end_date ? new Date(rule.end_date) : rangeEnd;
    const limit = maxDate < rangeEnd ? maxDate : rangeEnd;

    const MAX_INSTANCES = 366;

    while (current <= limit && instances.length < MAX_INSTANCES) {
        if (current >= rangeStart) {
            const endAt = duration
                ? new Date(current.getTime() + duration).toISOString()
                : null;

            instances.push({
                ...event,
                id: `${event.id}_${formatDateKey(current, tz)}`,
                recurrence_parent_id: event.id,
                start_at: current.toISOString(),
                end_at: endAt,
                is_recurring: true,
                original_start_at: event.start_at,
            });
        }

        // Advance to next occurrence
        switch (rule.frequency) {
            case 'daily':
                current = addDays(current, rule.interval || 1, tz);
                break;
            case 'weekly':
                current = nextWeeklyOccurrence(current, rule.interval || 1, rule.days_of_week, tz);
                break;
            case 'monthly':
                current = addMonths(current, rule.interval || 1, tz);
                break;
            default:
                return instances; // Unknown frequency, stop
        }
    }

    return instances;
}
