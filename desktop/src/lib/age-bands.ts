/**
 * Age bands (R149, design 4.2 and 14): the desktop side of the shared resolver. The pure functions mirror
 * `backend/src/services/pricing/age-bands.ts` and are tested with the same table (age-bands.test.ts there and here).
 *
 * A band list is ordered by minimum age; each band covers [minAge, next band's minAge), so there are no gaps and the
 * youngest band starts at 0.
 */

export interface AgeBand {
  /** Stable key stored on a line's paxType (adult, child, infant, child_6, ...). */
  key: string;
  label: string;
  minAge: number;
}

/** What age lookups need of a band. */
export type BandLike = Pick<AgeBand, 'key' | 'minAge'>;

/** paxType of a line priced per traveller whatever their age. */
export const PER_PERSON = 'per_person';

export const DEFAULT_AGE_BANDS: AgeBand[] = [
  { key: 'adult', label: 'Adult', minAge: 12 },
  { key: 'child', label: 'Child', minAge: 2 },
  { key: 'infant', label: 'Infant', minAge: 0 },
];

export const MAX_AGE_BANDS = 8;

const KEY_PATTERN = /^[a-z0-9_]{1,30}$/;

const byOldestFirst = (a: BandLike, b: BandLike) => b.minAge - a.minAge;

export type BandsErrorCode = 'empty' | 'invalidAge' | 'invalidKey' | 'sameKey' | 'sameAge' | 'tooMany' | 'noZero';

export interface ParsedBands {
  /** The usable bands, oldest first. */
  bands: AgeBand[];
  /** Set when the list cannot be saved as it is. */
  error: BandsErrorCode | null;
}

function labelFromKey(key: string): string {
  const text = key.replace(/_/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : key;
}

/** Reads a band list the way the server does: keys made from labels where missing, duplicates and a missing age 0 reported. */
export function parseBands(raw: unknown): ParsedBands {
  if (!Array.isArray(raw)) return { bands: [], error: null };
  let error: BandsErrorCode | null = null;
  const bands: AgeBand[] = [];
  const keys = new Set<string>();
  const ages = new Set<number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') { error ??= 'invalidAge'; continue; }
    const row = entry as Record<string, unknown>;
    const minAge = typeof row.minAge === 'number' ? row.minAge : Number(row.minAge);
    if (!Number.isInteger(minAge) || minAge < 0 || minAge > 120) { error ??= 'invalidAge'; continue; }
    const label = typeof row.label === 'string' ? row.label.trim().slice(0, 40) : '';
    let key = typeof row.key === 'string' ? row.key.trim() : '';
    if (!key) {
      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
      key = slug && /^[a-z]/.test(slug) ? slug : `band_${minAge}`;
    }
    if (!KEY_PATTERN.test(key) || key === PER_PERSON) { error ??= 'invalidKey'; continue; }
    if (keys.has(key)) {
      if (typeof row.key === 'string' && row.key.trim()) { error ??= 'sameKey'; continue; }
      let n = 2;
      while (keys.has(`${key}_${n}`)) n++;
      key = `${key}_${n}`;
    }
    if (ages.has(minAge)) { error ??= 'sameAge'; continue; }
    keys.add(key);
    ages.add(minAge);
    bands.push({ key, label: label || labelFromKey(key), minAge });
  }
  bands.sort(byOldestFirst);
  if (bands.length > MAX_AGE_BANDS) error ??= 'tooMany';
  if (bands.length > 0 && bands[bands.length - 1]?.minAge !== 0) error ??= 'noZero';
  if (raw.length > 0 && bands.length === 0) error ??= 'empty';
  return { bands, error };
}

/** The bands in force: the template's (or quote's) own list when it has a usable one, else the agency's. */
export function bandsFor(ownBands: unknown, agencyBands: AgeBand[]): AgeBand[] {
  const own = parseBands(ownBands);
  return own.bands.length > 0 && !own.error ? own.bands : agencyBands.slice().sort(byOldestFirst);
}

/** The key of the band an age falls in, or null for an unknown age. */
export function bandForAge(bands: BandLike[], age: number | null | undefined): string | null {
  if (age === null || age === undefined || !Number.isFinite(age) || age < 0) return null;
  return bands.slice().sort(byOldestFirst).find((b) => age >= b.minAge)?.key ?? null;
}

function parts(date: string): [number, number, number] {
  const [y = 0, m = 1, d = 1] = date.slice(0, 10).split('-').map(Number);
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
  adults?: number;
  ages?: number[];
  /** Children of unknown age: counted in the "child" band, else the band below the oldest. */
  children?: number;
  /** Infants of unknown age: counted in the "infant" band, else the youngest. */
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
 * The quantity changes that bring quote lines in line with the travellers: a band line gets the count in its band, a
 * per-person line the total, every other line is left alone. Only lines whose quantity changes are returned.
 */
export function fillQuantities(items: FillLine[], bands: BandLike[], pax: PaxInput): FillChange[] {
  const { counts, total } = countByBand(bands, pax);
  const changes: FillChange[] = [];
  for (const item of items) {
    let to: number | null = null;
    if (item.paxType === PER_PERSON) to = total;
    else if (item.paxType && Object.prototype.hasOwnProperty.call(counts, item.paxType)) to = counts[item.paxType] ?? 0;
    if (to === null) continue;
    const from = item.quantity ?? 1;
    if (from !== to) changes.push({ id: item.id, from, to });
  }
  return changes;
}

/** "12+", "6–11", "0–1": the ages a band covers within its list. */
export function bandRange(bands: BandLike[], key: string): string {
  const sorted = bands.slice().sort(byOldestFirst);
  const index = sorted.findIndex((b) => b.key === key);
  if (index < 0) return '';
  const min = sorted[index]?.minAge ?? 0;
  if (index === 0) return `${min}+`;
  const max = (sorted[index - 1]?.minAge ?? 0) - 1;
  return max <= min ? String(min) : `${min}–${max}`;
}

/** Ages typed as "8, 5 and 11" or "8 5 11" into a list; anything that is not an age from 0 to 120 is dropped. */
export function parseAgesText(text: string): number[] {
  return (text.match(/\d+/g) ?? [])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 120);
}
