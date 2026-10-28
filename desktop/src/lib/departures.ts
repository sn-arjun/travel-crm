import { tEn, type TranslateFn } from '@/lib/i18n';
import type {
  ConfirmMode,
  DepartureStatus,
  GroupToursSettings,
  PassengerFieldDef,
  RoomTypeDef,
  SeatBookingStatus,
  SeatsSummary,
  ShowSeatsLeft,
  DepositType,
} from '@/lib/api/departures';

// Pure helpers of the group departures screens (R144): seats text, status labels, the settings override order. No React, no network.

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

// ---------------------------------------------------------------- statuses

export const DEPARTURE_STATUSES: readonly DepartureStatus[] = ['draft', 'open', 'closed', 'departed', 'completed', 'cancelled'];

/** The legal moves of a departure (the same table the API enforces): cancelled from any state before departed. */
export const STATUS_TRANSITIONS: Record<DepartureStatus, readonly DepartureStatus[]> = {
  draft: ['open', 'cancelled'],
  open: ['closed', 'cancelled'],
  closed: ['departed', 'cancelled'],
  departed: ['completed'],
  completed: [],
  cancelled: [],
};

/** The statuses the status menu offers for a departure in `from`. */
export function nextStatuses(from: DepartureStatus): readonly DepartureStatus[] {
  return STATUS_TRANSITIONS[from] ?? [];
}

const DEPARTURE_STATUS_KEYS: Record<DepartureStatus, string> = {
  draft: 'departures.status.draft',
  open: 'departures.status.open',
  closed: 'departures.status.closed',
  departed: 'departures.status.departed',
  completed: 'departures.status.completed',
  cancelled: 'departures.status.cancelled',
};

/** The button wording of each move ("Open for booking", "Cancel departure"). */
const DEPARTURE_ACTION_KEYS: Record<DepartureStatus, string> = {
  draft: 'departures.statusAction.draft',
  open: 'departures.statusAction.open',
  closed: 'departures.statusAction.closed',
  departed: 'departures.statusAction.departed',
  completed: 'departures.statusAction.completed',
  cancelled: 'departures.statusAction.cancelled',
};

const BOOKING_STATUS_KEYS: Record<SeatBookingStatus, string> = {
  held: 'departures.bookingStatus.held',
  confirmed: 'departures.bookingStatus.confirmed',
  waitlisted: 'departures.bookingStatus.waitlisted',
  cancelled: 'departures.bookingStatus.cancelled',
  expired: 'departures.bookingStatus.expired',
};

export const departureStatusLabel = (s: DepartureStatus, t: TranslateFn = tEn): string => t(DEPARTURE_STATUS_KEYS[s]);
export const departureActionLabel = (s: DepartureStatus, t: TranslateFn = tEn): string => t(DEPARTURE_ACTION_KEYS[s]);
export const bookingStatusLabel = (s: SeatBookingStatus, t: TranslateFn = tEn): string => t(BOOKING_STATUS_KEYS[s]);

export function departureStatusTone(s: DepartureStatus): Tone {
  switch (s) {
    case 'open': return 'success';
    case 'closed': return 'warning';
    case 'departed': return 'info';
    case 'completed': return 'primary';
    case 'cancelled': return 'danger';
    default: return 'neutral';
  }
}

export function bookingStatusTone(s: SeatBookingStatus): Tone {
  switch (s) {
    case 'confirmed': return 'success';
    case 'held': return 'warning';
    case 'waitlisted': return 'info';
    case 'cancelled': return 'danger';
    default: return 'neutral';
  }
}

/** Staff can hold seats while the departure is open, or closed to the public (the API refuses the other states). */
export function acceptsSeatRequests(s: DepartureStatus): boolean {
  return s === 'open' || s === 'closed';
}

// ---------------------------------------------------------------- seats

/** "12 left of 40", or "Full". */
export function seatsText(seats: SeatsSummary, t: TranslateFn = tEn): string {
  return seats.left <= 0 ? t('departures.seats.full') : t('departures.seats.left', { left: seats.left, capacity: seats.capacity });
}

/** "20 confirmed, 8 held" and, when somebody waits, ", 3 on the waitlist". */
export function seatsBreakdown(seats: SeatsSummary, t: TranslateFn = tEn): string {
  const base = t('departures.seats.breakdown', { confirmed: seats.confirmed, held: seats.held });
  return seats.waitlisted > 0 ? `${base}, ${t('departures.seats.waitlisted', { count: seats.waitlisted })}` : base;
}

/** Green while there is room, amber when about a fifth is left, red when full. */
export function seatsTone(seats: SeatsSummary): 'success' | 'warning' | 'danger' {
  if (seats.left <= 0) return 'danger';
  if (seats.capacity > 0 && seats.left <= Math.max(2, Math.ceil(seats.capacity * 0.2))) return 'warning';
  return 'success';
}

/** The chip on a calendar entry, a lead and a quote: "12 left", "Waitlist 3" (full, with people waiting) or "Full". */
export function seatsChipText(seats: SeatsSummary, t: TranslateFn = tEn): string {
  if (seats.left > 0) return t('departures.chip.left', { left: seats.left });
  return seats.waitlisted > 0 ? t('departures.chip.waitlist', { count: seats.waitlisted }) : t('departures.chip.full');
}

/** Widths (0..100) of the confirmed and held parts of a seats bar. */
export function seatsBarParts(seats: SeatsSummary): { confirmed: number; held: number } {
  if (seats.capacity <= 0) return { confirmed: 0, held: 0 };
  const pct = (n: number) => Math.min(100, Math.max(0, (n / seats.capacity) * 100));
  const confirmed = pct(seats.confirmed);
  return { confirmed, held: Math.min(pct(seats.held), 100 - confirmed) };
}

// ---------------------------------------------------------------- hold countdown

export interface HoldRemaining {
  expired: boolean;
  /** Whole minutes left (0 once expired). */
  minutes: number;
}

export function holdRemaining(expiresAt: string | null | undefined, now: Date = new Date()): HoldRemaining | null {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return null;
  const minutes = Math.floor((end - now.getTime()) / 60_000);
  return minutes <= 0 ? { expired: true, minutes: 0 } : { expired: false, minutes };
}

/** "2d 3h", "5h 10m" or "12m". */
export function durationText(totalMinutes: number, t: TranslateFn = tEn): string {
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return t('departures.duration.dh', { d: days, h: hours });
  if (hours > 0) return t('departures.duration.hm', { h: hours, m: mins });
  return t('departures.duration.m', { m: Math.max(1, mins) });
}

export function holdCountdownText(expiresAt: string | null | undefined, now: Date = new Date(), t: TranslateFn = tEn): string | null {
  const r = holdRemaining(expiresAt, now);
  if (!r) return null;
  return r.expired ? t('departures.hold.expired') : t('departures.hold.left', { time: durationText(r.minutes, t) });
}

// ---------------------------------------------------------------- settings

export interface OverrideSource {
  holdExpiryHours?: number | null;
  confirmMode?: ConfirmMode | null;
  showSeatsLeft?: ShowSeatsLeft | null;
  bookingCutoffDays?: number | null;
  extrasCutoffDays?: number | null;
  depositType?: DepositType | null;
  depositValue?: number | null;
  passengerFields?: PassengerFieldDef[] | null;
  roomTypes?: RoomTypeDef[] | null;
}

/** The first value that is set; when none is, the last one (the agency setting, which may itself be null). */
const firstSet = <T,>(...values: Array<T | null | undefined>): T => {
  for (const v of values) if (v !== null && v !== undefined) return v;
  return values[values.length - 1] as T;
};

/**
 * What applies to one departure: departure override, then tour override, then the agency setting.
 * The cut-off days, the deposit and the two lists exist on the tour only.
 */
export function effectiveSettings(departure: OverrideSource | null, tour: OverrideSource | null, settings: GroupToursSettings) {
  return {
    holdExpiryHours: firstSet(departure?.holdExpiryHours, tour?.holdExpiryHours, settings.holdExpiryHours),
    confirmMode: firstSet(departure?.confirmMode, tour?.confirmMode, settings.confirmMode),
    showSeatsLeft: firstSet(departure?.showSeatsLeft, tour?.showSeatsLeft, settings.showSeatsLeft),
    bookingCutoffDays: firstSet(departure?.bookingCutoffDays, tour?.bookingCutoffDays, settings.bookingCutoffDays),
    extrasCutoffDays: firstSet(departure?.extrasCutoffDays, tour?.extrasCutoffDays, settings.extrasCutoffDays),
    deposit: {
      type: firstSet(departure?.depositType, tour?.depositType, settings.deposit.type),
      value: firstSet(departure?.depositValue, tour?.depositValue, settings.deposit.value),
    },
    passengerFields: firstSet(departure?.passengerFields, tour?.passengerFields, settings.passengerFields),
    roomTypes: firstSet(departure?.roomTypes, tour?.roomTypes, settings.roomTypes),
  };
}

/** True when the agency (or tour) lists the passenger field `key` at all; staff can fill it whoever is asked on the public page. */
export function passengerFieldOn(fields: readonly PassengerFieldDef[], key: string): boolean {
  return fields.some((f) => f.key === key);
}

/** The field definition for `key`, if the list has it. */
export function passengerField(fields: readonly PassengerFieldDef[], key: string): PassengerFieldDef | undefined {
  return fields.find((f) => f.key === key);
}

/** A stable key for a custom field from its label: letters, digits and underscores, starting with a letter ("Passport no." -> "passport_no"). */
export function customFieldKey(label: string, taken: readonly string[] = []): string {
  const base = label
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const start = /^[a-z]/.test(base) ? base : `field_${base}`.replace(/_$/, '');
  const root = (start || 'field').slice(0, 36);
  let key = root;
  for (let n = 2; taken.includes(key); n++) key = `${root}_${n}`;
  return key;
}

// ---------------------------------------------------------------- dates and ages (calendar dates, no zones)

/** [year, month, day] of a 'YYYY-MM-DD' string (anything unreadable is 0). */
function ymd(s: string): [number, number, number] {
  const p = s.slice(0, 10).split('-').map((x) => Number(x) || 0);
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
}

function parseIsoDate(s: string): Date {
  const [y, m, d] = ymd(s);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function addDaysIso(date: string, days: number): string {
  const d = parseIsoDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `count` dates starting on `start`, `everyDays` apart (a weekly departure is 7). */
export function datesEvery(start: string, everyDays: number, count: number): string[] {
  const step = Math.max(1, Math.floor(everyDays));
  return Array.from({ length: Math.max(0, Math.min(60, Math.floor(count))) }, (_, i) => addDaysIso(start, i * step));
}

/** Whole years on `onDate` for someone born on `dob` (both 'YYYY-MM-DD'). */
export function ageOn(dob: string, onDate: string): number {
  const [by, bm, bd] = ymd(dob);
  const [y, m, d] = ymd(onDate);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return Math.max(0, age);
}

/** The built-in age bands (adult 12+, child 2-11, infant under 2); the API re-derives the band with the agency's own list on save. */
export function defaultBandKey(age: number | null): 'adult' | 'child' | 'infant' | null {
  if (age === null || !Number.isFinite(age)) return null;
  if (age >= 12) return 'adult';
  return age >= 2 ? 'child' : 'infant';
}

// ---------------------------------------------------------------- errors

const ERROR_KEYS: Record<string, string> = {
  SEATS_UNAVAILABLE: 'departures.errors.seatsUnavailable',
  SEATS_IN_USE: 'departures.errors.seatsInUse',
  ILLEGAL_TRANSITION: 'departures.errors.illegalTransition',
  DEPARTURE_NOT_OPEN: 'departures.errors.departureNotOpen',
  ALREADY_BOOKED: 'departures.errors.alreadyBooked',
  CODE_TAKEN: 'departures.errors.codeTaken',
  REASON_REQUIRED: 'departures.errors.reasonRequired',
  TOUR_ARCHIVED: 'departures.errors.tourArchived',
  CONTACT_REQUIRED: 'departures.errors.contactRequired',
  DEPARTURE_CANCELLED: 'departures.errors.departureCancelled',
  CAPACITY_FROM_VEHICLES: 'departures.errors.capacityFromVehicles',
  HAS_DEPARTURES: 'departures.errors.hasDepartures',
};

/**
 * The words to show for a failed call: a known error code gets a translated sentence, anything else the API's own message,
 * and a call that never got an answer the generic `fallbackKey`.
 */
export function departureErrorText(err: unknown, t: TranslateFn = tEn, fallbackKey = 'departures.errors.generic'): string {
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code ?? '') : '';
  const known = ERROR_KEYS[code];
  if (known) return t(known);
  const message = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message ?? '') : '';
  return message.trim() && !/^HTTP \d+$/.test(message) ? message : t(fallbackKey);
}

const BAND_KEYS: Record<string, string> = {
  adult: 'departures.bands.adult',
  child: 'departures.bands.child',
  infant: 'departures.bands.infant',
};

/** The name of an age band: the three built-in ones are translated, an agency's own bands show their key. */
export function bandLabel(key: string, t: TranslateFn = tEn): string {
  const k = BAND_KEYS[key];
  return k ? t(k) : key;
}
