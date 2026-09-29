function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Local `YYYY-MM-DD` for an ISO timestamp, matching the date the user picked. */
export function formatTripDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local `HH:mm` for an ISO timestamp, matching the time the user entered. */
export function formatTripClock(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTripDateTime(iso?: string | null): string {
  const date = formatTripDate(iso);
  const clock = formatTripClock(iso);
  return clock ? `${date} ${clock}` : date;
}
