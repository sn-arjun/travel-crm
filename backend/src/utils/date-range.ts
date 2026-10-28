import { DEFAULT_TIMEZONE, localDateString, addDaysLocal, localDateStartUtcIso } from './tz';

export interface ResolvedDateRange {
    /** UTC ISO instant of local midnight at the start of the range (inclusive). */
    from: string;
    /** UTC ISO instant of the last millisecond of the range's final local day (inclusive). */
    to: string;
    /** Inclusive local calendar dates 'YYYY-MM-DD' (additive; for date-only columns). */
    fromDate: string;
    toDate: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

function ymd(y: number, m: number, d: number) {
    return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

/** Last calendar day of month `m` (1-12) of year `y`. */
function lastDayOfMonth(y: number, m: number) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Resolve a date preset to a range in the TENANT's calendar (default Asia/Kolkata), not the server's.
 * `now` is injectable so tests can use fixed instants.
 */
export function resolveDateRange(
    preset: string,
    customFrom?: string,
    customTo?: string,
    timeZone: string = DEFAULT_TIMEZONE,
    now: Date = new Date(),
): ResolvedDateRange {
    const today = localDateString(timeZone, now);
    const [y, m] = today.split('-').map(Number);

    const build = (fromDate: string, toDate: string): ResolvedDateRange => ({
        from: localDateStartUtcIso(timeZone, fromDate),
        to: new Date(new Date(localDateStartUtcIso(timeZone, addDaysLocal(toDate, 1))).getTime() - 1).toISOString(),
        fromDate,
        toDate,
    });

    // Monday-based week containing a local date
    const weekOf = (date: string) => {
        const [yy, mm, dd] = date.split('-').map(Number);
        const dow = (new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay() + 6) % 7; // Mon = 0
        const start = addDaysLocal(date, -dow);
        return build(start, addDaysLocal(start, 6));
    };
    const monthOf = (yy: number, mm: number) => {
        // normalise month overflow (mm may be 0 or 13)
        const n = new Date(Date.UTC(yy, mm - 1, 1));
        const ny = n.getUTCFullYear();
        const nm = n.getUTCMonth() + 1;
        return build(ymd(ny, nm, 1), ymd(ny, nm, lastDayOfMonth(ny, nm)));
    };
    const quarterOf = (yy: number, mm: number) => {
        const n = new Date(Date.UTC(yy, mm - 1, 1));
        const ny = n.getUTCFullYear();
        const qStart = Math.floor(n.getUTCMonth() / 3) * 3 + 1;
        return build(ymd(ny, qStart, 1), ymd(ny, qStart + 2, lastDayOfMonth(ny, qStart + 2)));
    };

    switch (preset) {
        case 'today':
            return build(today, today);
        case 'yesterday': {
            const yd = addDaysLocal(today, -1);
            return build(yd, yd);
        }
        case 'this_week':
            return weekOf(today);
        case 'last_week':
            return weekOf(addDaysLocal(today, -7));
        case 'this_month':
            return monthOf(y, m);
        case 'last_month':
            return monthOf(y, m - 1);
        case 'this_quarter':
            return quarterOf(y, m);
        case 'last_quarter':
            return quarterOf(y, m - 3);
        case 'this_year':
            return build(ymd(y, 1, 1), ymd(y, 12, 31));
        case 'last_year':
            return build(ymd(y - 1, 1, 1), ymd(y - 1, 12, 31));
        case 'custom': {
            if (!customFrom || !customTo) {
                throw new Error('Custom date range requires customFrom and customTo');
            }
            if (DATE_ONLY.test(customFrom) && DATE_ONLY.test(customTo)) {
                return build(customFrom, customTo);
            }
            const from = new Date(customFrom);
            const to = new Date(customTo);
            return {
                from: from.toISOString(),
                to: to.toISOString(),
                fromDate: localDateString(timeZone, from),
                toDate: localDateString(timeZone, to),
            };
        }
        default:
            // Default to this month
            return monthOf(y, m);
    }
}
