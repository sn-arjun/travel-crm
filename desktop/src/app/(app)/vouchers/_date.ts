/** Formats a picker Date (local midnight) as YYYY-MM-DD without the UTC shift `toISOString()` introduces. */
export function toDateOnly(d?: Date): string | undefined {
  if (!d) return undefined;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Parses a stored YYYY-MM-DD as a local date so the picker shows the same calendar day. */
export function fromDateOnly(s?: string): Date | undefined {
  if (!s) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
}
