export function getPreviousPeriod(from: string, to: string): { from: string; to: string } {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const duration = toDate.getTime() - fromDate.getTime();

    // Previous period ends just before the current one starts
    const prevTo = new Date(fromDate.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - duration);

    return {
        from: prevFrom.toISOString(),
        to: prevTo.toISOString()
    };
}

export function computeChanges(current: Record<string, number>, previous: Record<string, number>) {
    const changes: Record<string, { absolute: number; percent: number; direction: 'up' | 'down' | 'flat' }> = {};

    for (const key of Object.keys(current)) {
        const curr = current[key] || 0;
        const prev = previous[key] || 0;

        // We only compute change for numeric fields
        if (typeof curr !== 'number' || typeof prev !== 'number') {
            continue;
        }

        const absolute = curr - prev;
        const percent = prev !== 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0);

        changes[key] = {
            absolute,
            percent: Math.round(percent * 100) / 100,
            direction: absolute > 0 ? 'up' : (absolute < 0 ? 'down' : 'flat')
        };
    }

    return changes;
}
