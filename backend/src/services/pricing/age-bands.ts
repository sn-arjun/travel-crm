/**
 * Age bands (R149, design 4.2 and 14): the one resolver behind seat-booking passengers, template lines and quote quantities.
 *
 * A band list is ordered by minimum age; each band covers [minAge, next band's minAge), so there are no gaps and the youngest
 * band starts at 0. The agency's list lives in the setting `pricing.age_bands`; a template or a quote may carry its own.
 * `desktop/src/lib/age-bands.ts` mirrors the pure functions here and has the same tests.
 */

export interface AgeBand {
  /** Stable key stored on `itinerary_items.pax_type` and `tour_prices.key` (adult, child, infant, child_6, ...). */
  key: string;
  label: string;
  minAge: number;
}

/** pax_type value of a line that is priced per traveller whatever their age. */
/** What age lookups need of a band. */
export type BandLike = Pick<AgeBand, 'key' | 'minAge'>;

export const PER_PERSON = 'per_person';

export const AGE_BANDS_SETTING_KEY = 'pricing.age_bands';

export const DEFAULT_AGE_BANDS: AgeBand[] = [
  { key: 'adult', label: 'Adult', minAge: 12 },
  { key: 'child', label: 'Child', minAge: 2 },
  { key: 'infant', label: 'Infant', minAge: 0 },
];

const MAX_BANDS = 8;
const KEY_PATTERN = /^[a-z0-9_]{1,30}$/;

const byOldestFirst = (a: BandLike, b: BandLike) => b.minAge - a.minAge;

function labelFromKey(key: string): string {
  const text = key.replace(/_/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : key;
}

export interface ParsedBands {
  /** The usable bands, oldest first. Empty when nothing usable was given. */
  bands: AgeBand[];
  /** Set when the list cannot be saved as it is. Reading leniently still returns the usable rows. */
  error: string | null;
}

/**
 * Reads a band list from stored or submitted JSON. Rows without a key get one from the label; rows without a label get one from
 * the key. Duplicate keys or ages, a list without an age-0 band, or more than 8 bands are reported in `error`.
 */
export function parseBands(raw: unknown): ParsedBands {
  if (!Array.isArray(raw)) return { bands: [], error: raw === null || raw === undefined ? null : 'The age bands must be a list' };
  let error: string | null = null;
  const bands: AgeBand[] = [];
  const keys = new Set<string>();
  const ages = new Set<number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') { error ??= 'Each age band needs a label and a minimum age'; continue; }
    const row = entry as Record<string, unknown>;
    const minAge = typeof row.minAge === 'number' ? row.minAge : Number(row.minAge);
    if (!Number.isInteger(minAge) || minAge < 0 || minAge > 120) { error ??= 'The minimum age of a band must be a whole number from 0 to 120'; continue; }
    const label = typeof row.label === 'string' ? row.label.trim().slice(0, 40) : '';
    let key = typeof row.key === 'string' ? row.key.trim() : '';
    if (!key) {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
      key = slug && /^[a-z]/.test(slug) ? slug : `band_${minAge}`;
    }
    if (!KEY_PATTERN.test(key) || key === PER_PERSON) { error ??= 'A band key may only use lowercase letters, digits and underscores'; continue; }
    if (keys.has(key)) {
      if (typeof row.key === 'string' && row.key.trim()) { error ??= 'Two bands share the same key'; continue; }
      let n = 2;
      while (keys.has(`${key}_${n}`)) n++;
      key = `${key}_${n}`;
    }
    if (ages.has(minAge)) { error ??= 'Two bands start at the same age'; continue; }
    keys.add(key);
    ages.add(minAge);
    bands.push({ key, label: label || labelFromKey(key), minAge });
  }
  bands.sort(byOldestFirst);
  if (bands.length > MAX_BANDS) error ??= `Use at most ${MAX_BANDS} age bands`;
  if (bands.length > 0 && bands[bands.length - 1].minAge !== 0) error ??= 'The youngest band must start at age 0';
  if (raw.length > 0 && bands.length === 0) error ??= 'Add at least one age band';
  return { bands, error };
}

/** The agency list a stored value stands for: the stored bands when they are usable, else the built-in three. */
export function agencyBandsFrom(stored: unknown): AgeBand[] {
  const parsed = parseBands(stored);
  return parsed.bands.length > 0 && !parsed.error ? parsed.bands : DEFAULT_AGE_BANDS.map((b) => ({ ...b }));
}

/** The bands in force: the template's (or quote's) own list when it has a usable one, else the agency's. */
export function bandsFor(ownBands: unknown, agencyBands: AgeBand[]): AgeBand[] {
  const own = parseBands(ownBands);
  return own.bands.length > 0 && !own.error ? own.bands : agencyBands.slice().sort(byOldestFirst);
}

/** The key of the band an age falls in (age >= minAge of the oldest band that fits), or null for an unknown age. */
export function bandForAge(bands: BandLike[], age: number | null | undefined): string | null {
  if (age === null || age === undefined || !Number.isFinite(age) || age < 0) return null;
  const sorted = bands.slice().sort(byOldestFirst);
  return sorted.find((b) => age >= b.minAge)?.key ?? null;
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

/** Whole years on `onDate` for someone born on `dob` (both 'YYYY-MM-DD'). */
export function ageOn(dob: string, onDate: string): number {
  const [by, bm, bd] = parts(dob);
  const [y, m, d] = parts(onDate);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Age in years with the fraction since the last birthday, for display ("11.9"). */
export function ageOnFractional(dob: string, onDate: string): number {
  const whole = ageOn(dob, onDate);
  const [by, bm, bd] = parts(dob);
  const lastBirthday = Date.UTC(by + whole, bm - 1, bd);
  const nextBirthday = Date.UTC(by + whole + 1, bm - 1, bd);
  const [y, m, d] = parts(onDate);
  return whole + (Date.UTC(y, m - 1, d) - lastBirthday) / (nextBirthday - lastBirthday);
}

export interface PaxInput {
  /** Travellers counted as adults without an age. */
  adults?: number;
  /** Ages (whole or fractional years) of the other travellers. */
  ages?: number[];
  /** Children whose age is not known: counted in the "child" band, else the band below the oldest. */
  children?: number;
  /** Infants whose age is not known: counted in the "infant" band, else the youngest. */
  infants?: number;
}

const wholeCount = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** The band that holds travellers counted as adults: the one keyed adult, else the oldest. */
export function adultBandKey(bands: BandLike[]): string | null {
  return bands.find((b) => b.key === 'adult')?.key ?? bands.slice().sort(byOldestFirst)[0]?.key ?? null;
}

/** Travellers per band key, plus the total. Every band is present, with 0 when nobody falls in it. */
export function countByBand(bands: BandLike[], pax: PaxInput): { counts: Record<string, number>; total: number } {
  const sorted = bands.slice().sort(byOldestFirst);
  const counts: Record<string, number> = Object.fromEntries(sorted.map((b) => [b.key, 0]));
  let total = 0;
  const add = (key: string | null, n: number) => {
    if (!key || n <= 0) return;
    counts[key] = (counts[key] ?? 0) + n;
    total += n;
  };
  add(adultBandKey(sorted), wholeCount(pax.adults));
  for (const age of pax.ages ?? []) add(bandForAge(sorted, age), 1);
  const childKey = sorted.find((b) => b.key === 'child')?.key ?? sorted[1]?.key ?? sorted[0]?.key ?? null;
  const infantKey = sorted.find((b) => b.key === 'infant')?.key ?? sorted[sorted.length - 1]?.key ?? null;
  add(childKey, wholeCount(pax.children));
  add(infantKey, wholeCount(pax.infants));
  return { counts, total };
}

export interface FillLine {
  id: string;
  paxType?: string | null;
  quantity?: number | null;
}

export interface FillChange {
  id: string;
  from: number;
  to: number;
}

/**
 * The quantity changes that bring quote lines in line with the travellers: a line on a band gets the count in that band, a
 * per-person line gets the total, every other line (no pax type, or a band the list does not have) is left alone. Only lines
 * whose quantity changes are returned.
 */
export function fillQuantities(items: FillLine[], bands: BandLike[], pax: PaxInput): FillChange[] {
  const { counts, total } = countByBand(bands, pax);
  const changes: FillChange[] = [];
  for (const item of items) {
    let to: number | null = null;
    if (item.paxType === PER_PERSON) to = total;
    else if (item.paxType && Object.prototype.hasOwnProperty.call(counts, item.paxType)) to = counts[item.paxType];
    if (to === null) continue;
    const from = item.quantity ?? 1;
    if (from !== to) changes.push({ id: item.id, from, to });
  }
  return changes;
}

// ---------------------------------------------------------------- the agency's list

export async function loadAgencyBands(db: D1Database): Promise<AgeBand[]> {
  let stored: unknown = null;
  try {
    const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(AGE_BANDS_SETTING_KEY).first<{ value: string | null }>();
    stored = row?.value ? JSON.parse(row.value) : null;
  } catch {
    stored = null;
  }
  return agencyBandsFrom(stored);
}

/** Reads a JSON column holding a band list (itinerary_templates.age_bands, itineraries.age_bands). */
export function bandsFromColumn(value: string | null | undefined): AgeBand[] | null {
  if (!value) return null;
  try {
    const parsed = parseBands(JSON.parse(value));
    return parsed.bands.length > 0 && !parsed.error ? parsed.bands : null;
  } catch {
    return null;
  }
}
