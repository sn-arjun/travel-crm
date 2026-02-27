import { subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';

export function resolveDateRange(preset: string, customFrom?: string, customTo?: string) {
    const now = new Date();

    switch (preset) {
        case 'today':
            return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
        case 'yesterday': {
            const y = subDays(now, 1);
            return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString() };
        }
        case 'this_week':
            return { from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), to: endOfWeek(now, { weekStartsOn: 1 }).toISOString() };
        case 'last_week': {
            const lw = subDays(now, 7);
            return { from: startOfWeek(lw, { weekStartsOn: 1 }).toISOString(), to: endOfWeek(lw, { weekStartsOn: 1 }).toISOString() };
        }
        case 'this_month':
            return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() };
        case 'last_month': {
            // Go to 1st of month, subtract 1 day to get into last month
            const startOfCurrentMonth = startOfMonth(now);
            const lm = subDays(startOfCurrentMonth, 1);
            return { from: startOfMonth(lm).toISOString(), to: endOfMonth(lm).toISOString() };
        }
        case 'this_quarter':
            return { from: startOfQuarter(now).toISOString(), to: endOfQuarter(now).toISOString() };
        case 'last_quarter': {
            const startOfCurrentQuarter = startOfQuarter(now);
            const lq = subDays(startOfCurrentQuarter, 1);
            return { from: startOfQuarter(lq).toISOString(), to: endOfQuarter(lq).toISOString() };
        }
        case 'this_year':
            return { from: startOfYear(now).toISOString(), to: endOfYear(now).toISOString() };
        case 'last_year': {
            const startOfCurrentYear = startOfYear(now);
            const ly = subDays(startOfCurrentYear, 1);
            return { from: startOfYear(ly).toISOString(), to: endOfYear(ly).toISOString() };
        }
        case 'custom':
            if (!customFrom || !customTo) {
                throw new Error('Custom date range requires customFrom and customTo');
            }
            return { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() };
        default:
            // Default to this month
            return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() };
    }
}
