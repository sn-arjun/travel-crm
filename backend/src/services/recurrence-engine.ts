/**
 * Recurrence Engine — expands recurring events into virtual instances.
 * 
 * Supports daily, weekly, and monthly recurrence patterns.
 * Max 366 instances per expansion to prevent runaway generation.
 */

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

function formatDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
}

function nextWeeklyOccurrence(
    current: Date,
    interval: number,
    daysOfWeek?: number[]
): Date {
    if (!daysOfWeek || daysOfWeek.length === 0) {
        return addDays(current, 7 * interval);
    }

    const currentDay = current.getDay();
    const sorted = [...daysOfWeek].sort((a, b) => a - b);

    // Find next day in the current week
    for (const day of sorted) {
        if (day > currentDay) {
            return addDays(current, day - currentDay);
        }
    }

    // Wrap to next week (considering interval)
    const daysUntilNextWeek = 7 - currentDay + sorted[0];
    return addDays(current, daysUntilNextWeek + 7 * (interval - 1));
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
                id: `${event.id}_${formatDateKey(current)}`,
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
                current = addDays(current, rule.interval || 1);
                break;
            case 'weekly':
                current = nextWeeklyOccurrence(current, rule.interval || 1, rule.days_of_week);
                break;
            case 'monthly':
                current = addMonths(current, rule.interval || 1);
                break;
            default:
                return instances; // Unknown frequency, stop
        }
    }

    return instances;
}
