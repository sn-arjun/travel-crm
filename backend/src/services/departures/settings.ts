/**
 * The agency's `group_tours` settings (R139, design section 4.1). One JSON value in the tenant settings table; the defaults
 * live here, so a missing row reads as the defaults and a stored value is merged over them.
 */

import { groupToursSettingsSchema, type GroupToursSettingsInput } from '../../validators/departures';

export const GROUP_TOURS_SETTINGS_KEY = 'group_tours';

export type ConfirmMode = 'manual' | 'auto_when_available' | 'on_deposit';
export type DepositType = 'none' | 'percent' | 'per_seat' | 'fixed';
export type ShowSeatsLeft = 'always' | 'below_threshold' | 'never';

export interface PassengerFieldDef {
  key: string;
  label: string;
  required: boolean;
  collectOn: 'booking' | 'self_service' | 'staff_only';
  type?: 'text' | 'date' | 'select' | 'boolean';
  options?: string[];
  custom?: boolean;
}

export interface RoomTypeDef {
  key: string;
  label: string;
  occupancy: number;
}

export interface GroupToursSettings {
  enabled: boolean;
  holdExpiryHours: number;
  confirmMode: ConfirmMode;
  markLeadWonOnConfirm: boolean;
  waitlist: { enabled: boolean; offerMode: 'suggest' | 'auto_hold'; offerHoldHours: number };
  defaultVehicleCapacity: number;
  bookingCutoffDays: number;
  extrasCutoffDays: number;
  passengerFields: PassengerFieldDef[];
  roomTypes: RoomTypeDef[];
  shareMatching: boolean;
  preferredSeat: { enabled: boolean };
  showSeatsLeft: ShowSeatsLeft;
  seatsLeftThreshold: number;
  deposit: { type: DepositType; value: number | null };
  publicBooking: { requireTerms: boolean; termsText: string; marketingOptIn: boolean };
  driverSeesPassengers: boolean;
}

/** The built-in passenger fields: the first six are asked by default, the document fields are optional and collected by the traveller. */
export function defaultPassengerFields(): PassengerFieldDef[] {
  return [
    { key: 'name', label: 'Name', required: true, collectOn: 'booking' },
    { key: 'gender', label: 'Gender', required: false, collectOn: 'booking' },
    { key: 'dateOfBirth', label: 'Date of birth', required: false, collectOn: 'booking' },
    { key: 'pickupPoint', label: 'Pickup point', required: true, collectOn: 'booking' },
    { key: 'roomType', label: 'Room type and sharing', required: false, collectOn: 'booking' },
    { key: 'meal', label: 'Meal preference', required: false, collectOn: 'booking' },
    { key: 'nationality', label: 'Nationality', required: false, collectOn: 'self_service' },
    { key: 'documentType', label: 'Document type', required: false, collectOn: 'self_service' },
    { key: 'documentNumber', label: 'Document number', required: false, collectOn: 'self_service' },
    { key: 'documentExpiry', label: 'Document expiry', required: false, collectOn: 'self_service' },
    { key: 'documentExpiry2', label: 'Second document expiry', required: false, collectOn: 'self_service' },
  ];
}

export function defaultRoomTypes(): RoomTypeDef[] {
  return [
    { key: 'double', label: 'Double', occupancy: 2 },
    { key: 'twin', label: 'Twin', occupancy: 2 },
    { key: 'triple', label: 'Triple', occupancy: 3 },
    { key: 'family', label: 'Family', occupancy: 4 },
    { key: 'single', label: 'Single', occupancy: 1 },
  ];
}

export function groupToursDefaults(): GroupToursSettings {
  return {
    enabled: false,
    holdExpiryHours: 48,
    confirmMode: 'manual',
    markLeadWonOnConfirm: true,
    waitlist: { enabled: true, offerMode: 'suggest', offerHoldHours: 24 },
    defaultVehicleCapacity: 49,
    bookingCutoffDays: 3,
    extrasCutoffDays: 7,
    passengerFields: defaultPassengerFields(),
    roomTypes: defaultRoomTypes(),
    shareMatching: true,
    preferredSeat: { enabled: false },
    showSeatsLeft: 'below_threshold',
    seatsLeftThreshold: 10,
    deposit: { type: 'none', value: null },
    publicBooking: { requireTerms: true, termsText: '', marketingOptIn: true },
    driverSeesPassengers: false,
  };
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Objects merge key by key, everything else (including lists) is replaced; undefined never overwrites. */
function mergeDeep<T>(base: T, over: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(out[k]) ? mergeDeep(out[k], v) : v;
  }
  return out as T;
}

/** The stored value merged over the defaults. A value that no longer parses reads as the defaults. */
export function mergeGroupToursSettings(stored: unknown): GroupToursSettings {
  return mergeDeep(groupToursDefaults(), isPlainObject(stored) ? stored : {});
}

export async function getGroupToursSettings(db: D1Database): Promise<GroupToursSettings> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(GROUP_TOURS_SETTINGS_KEY).first<{ value: string | null }>();
  let stored: unknown = null;
  if (row?.value) {
    try {
      stored = JSON.parse(row.value);
    } catch {
      stored = null;
    }
  }
  return mergeGroupToursSettings(stored);
}

/** Validates the partial input, merges it over the stored settings and saves the whole value. Returns the merged settings. */
export async function putGroupToursSettings(db: D1Database, input: unknown, userId: string | null): Promise<GroupToursSettings> {
  const parsed: GroupToursSettingsInput = groupToursSettingsSchema.parse(input);
  const merged = mergeDeep(await getGroupToursSettings(db), parsed);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .bind(GROUP_TOURS_SETTINGS_KEY, JSON.stringify(merged), userId, now)
    .run();
  return merged;
}

/** The first value that is set: departure override, then tour override, then the agency setting. */
export function effectiveValue<T>(departureValue: T | null | undefined, tourValue: T | null | undefined, settingValue: T): T {
  return departureValue ?? tourValue ?? settingValue;
}

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

/**
 * The values that apply to one departure: departure override ?? tour override ?? agency setting. The cut-off days exist on the
 * tour only (a departure stores the computed cut-off dates), and so do the deposit and the two lists.
 */
export function effectiveSettings(departure: OverrideSource | null, tour: OverrideSource | null, settings: GroupToursSettings) {
  return {
    holdExpiryHours: effectiveValue(departure?.holdExpiryHours, tour?.holdExpiryHours, settings.holdExpiryHours),
    confirmMode: effectiveValue(departure?.confirmMode, tour?.confirmMode, settings.confirmMode),
    showSeatsLeft: effectiveValue(departure?.showSeatsLeft, tour?.showSeatsLeft, settings.showSeatsLeft),
    bookingCutoffDays: effectiveValue(departure?.bookingCutoffDays, tour?.bookingCutoffDays, settings.bookingCutoffDays),
    extrasCutoffDays: effectiveValue(departure?.extrasCutoffDays, tour?.extrasCutoffDays, settings.extrasCutoffDays),
    deposit: {
      type: effectiveValue(departure?.depositType, tour?.depositType, settings.deposit.type),
      value: effectiveValue(departure?.depositValue, tour?.depositValue, settings.deposit.value),
    },
    passengerFields: effectiveValue(departure?.passengerFields, tour?.passengerFields, settings.passengerFields),
    roomTypes: effectiveValue(departure?.roomTypes, tour?.roomTypes, settings.roomTypes),
  };
}
