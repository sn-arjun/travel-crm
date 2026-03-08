/**
 * Business Hours Utility — TICKET-383
 *
 * Checks if current time is within configured business hours.
 */

export interface BusinessHoursConfig {
  timezone: string;
  schedule: Record<string, { start: string; end: string; enabled: boolean }>;
  holidays?: string[]; // YYYY-MM-DD format
}

const DAY_MAP: Record<number, string> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

/**
 * Check if the current time is within business hours.
 * Returns true if within hours (or if business hours not enabled).
 */
export function checkBusinessHours(
  config: BusinessHoursConfig | null | undefined,
): boolean {
  if (!config) return true;

  const now = new Date();

  // Convert to tenant's timezone
  const tzDate = new Date(
    now.toLocaleString('en-US', { timeZone: config.timezone }),
  );

  // Check holidays
  if (config.holidays?.length) {
    const todayStr = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}-${String(tzDate.getDate()).padStart(2, '0')}`;
    if (config.holidays.includes(todayStr)) return false;
  }

  // Get day schedule
  const dayKey = DAY_MAP[tzDate.getDay()];
  const daySchedule = config.schedule[dayKey];

  if (!daySchedule || !daySchedule.enabled) return false;

  const currentMinutes = tzDate.getHours() * 60 + tzDate.getMinutes();
  const [startH, startM] = daySchedule.start.split(':').map(Number);
  const [endH, endM] = daySchedule.end.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // Handle overnight schedules (e.g., 22:00-06:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}
