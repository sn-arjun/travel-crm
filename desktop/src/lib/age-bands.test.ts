import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AGE_BANDS, PER_PERSON, ageOn, ageOnFractional, bandForAge, bandRange, bandsFor, countByBand, fillQuantities, parseAgesText, parseBands, resolveBands,
} from './age-bands';

// The same table as backend/test/age-bands.test.ts ("pure resolver"): both sides must agree.

const FOUR_BANDS = [
  { key: 'adult', label: 'Adult', minAge: 12 },
  { key: 'child_6', label: 'Child 6 to 11', minAge: 6 },
  { key: 'child_4', label: 'Child 4 to 5', minAge: 4 },
  { key: 'child_0', label: 'Child 0 to 3', minAge: 0 },
];

describe('age bands resolver', () => {
  it('puts the boundary ages in the right default band', () => {
    expect(bandForAge(DEFAULT_AGE_BANDS, 11.9)).toBe('child');
    expect(bandForAge(DEFAULT_AGE_BANDS, 12)).toBe('adult');
    expect(bandForAge(DEFAULT_AGE_BANDS, 2)).toBe('child');
    expect(bandForAge(DEFAULT_AGE_BANDS, 1.99)).toBe('infant');
    expect(bandForAge(DEFAULT_AGE_BANDS, 0)).toBe('infant');
    expect(bandForAge(DEFAULT_AGE_BANDS, 64)).toBe('adult');
    expect(bandForAge(DEFAULT_AGE_BANDS, null)).toBeNull();
    expect(bandForAge(DEFAULT_AGE_BANDS, -1)).toBeNull();
  });

  it('works with a four-band list and gives bands without a key keys of their own', () => {
    const parsed = parseBands(FOUR_BANDS);
    expect(parsed.error).toBeNull();
    expect(parsed.bands.map((b) => b.minAge)).toEqual([12, 6, 4, 0]);
    const [adult, c6, c4, c0] = parsed.bands.map((b) => b.key);
    expect(parsed.bands.map((b) => b.key)).toEqual(['adult', 'child_6', 'child_4', 'child_0']);
    expect([11.9, 6, 5.99, 4, 3.5, 0, 12].map((a) => bandForAge(parsed.bands, a))).toEqual([c6, c6, c4, c4, c0, c0, adult]);
    const keyed = parseBands([{ label: 'Adult', minAge: 12 }, { label: 'Child', minAge: 6 }, { label: 'Child', minAge: 0 }]);
    expect(new Set(keyed.bands.map((b) => b.key)).size).toBe(3);
  });

  it('rejects band lists with no age-0 band, a repeated age or a repeated key', () => {
    expect(parseBands([{ label: 'Adult', minAge: 12 }, { label: 'Child', minAge: 2 }]).error).toBe('noZero');
    expect(parseBands([{ label: 'A', minAge: 12 }, { label: 'B', minAge: 12 }, { label: 'C', minAge: 0 }]).error).toBe('sameAge');
    expect(parseBands([{ key: 'x', minAge: 12 }, { key: 'x', minAge: 0 }]).error).toBe('sameKey');
    expect(parseBands([{ label: 'A', minAge: 'abc' }]).error).toBeTruthy();
  });

  it('measures age on the travel date, whole and fractional', () => {
    expect(ageOn('2020-07-11', '2032-07-10')).toBe(11);
    expect(ageOn('2020-07-10', '2032-07-10')).toBe(12);
    expect(ageOn('2016-03-01', '2026-12-18')).toBe(10);
    expect(ageOnFractional('2020-07-11', '2032-07-10')).toBeGreaterThan(11.99);
    expect(ageOnFractional('2020-07-11', '2032-07-10')).toBeLessThan(12);
    expect(ageOnFractional('2020-01-01', '2026-01-01')).toBe(6);
  });

  it('uses the template list over the agency list', () => {
    const own = parseBands(FOUR_BANDS).bands;
    expect(bandsFor(own, DEFAULT_AGE_BANDS)).toEqual(own);
    expect(bandsFor(null, DEFAULT_AGE_BANDS).map((b) => b.key)).toEqual(['adult', 'child', 'infant']);
    expect(bandsFor('garbage', DEFAULT_AGE_BANDS).map((b) => b.key)).toEqual(['adult', 'child', 'infant']);
  });

  it('fills band lines from the count in the band, per-person lines from the total and leaves other lines', () => {
    const lines = [
      { id: 'a', paxType: 'adult', quantity: 1 },
      { id: 'c', paxType: 'child', quantity: 1 },
      { id: 'i', paxType: 'infant', quantity: 1 },
      { id: 'p', paxType: PER_PERSON, quantity: 1 },
      { id: 'f', paxType: null, quantity: 3 },
      { id: 'u', paxType: 'teen', quantity: 4 },
    ];
    expect(fillQuantities(lines, DEFAULT_AGE_BANDS, { adults: 2, ages: [8, 5] })).toEqual([
      { id: 'a', from: 1, to: 2 },
      { id: 'c', from: 1, to: 2 },
      { id: 'i', from: 1, to: 0 },
      { id: 'p', from: 1, to: 4 },
    ]);
    expect(countByBand(DEFAULT_AGE_BANDS, { adults: 1, ages: [40, 13, 1] }).counts).toEqual({ adult: 3, child: 0, infant: 1 });
    expect(countByBand(DEFAULT_AGE_BANDS, { adults: 2, children: 2, infants: 1 }).counts).toEqual({ adult: 2, child: 2, infant: 1 });
  });
});

describe('display helpers', () => {
  it('names the ages a band covers', () => {
    expect(bandRange(FOUR_BANDS, 'adult')).toBe('12+');
    expect(bandRange(FOUR_BANDS, 'child_6')).toBe('6–11');
    expect(bandRange(FOUR_BANDS, 'child_4')).toBe('4–5');
    expect(bandRange(FOUR_BANDS, 'child_0')).toBe('0–3');
    expect(bandRange(DEFAULT_AGE_BANDS, 'infant')).toBe('0–1');
    expect(bandRange(DEFAULT_AGE_BANDS, 'nope')).toBe('');
  });

  it('reads typed ages', () => {
    expect(parseAgesText('8, 5 and 11')).toEqual([8, 5, 11]);
    expect(parseAgesText('')).toEqual([]);
    expect(parseAgesText('8,5 200')).toEqual([8, 5]);
  });
});

describe('resolveBands (R164-2: tour bands, then quote or template bands, then the agency)', () => {
  const TOUR = [
    { key: 'adult', label: 'Adult', minAge: 13 },
    { key: 'child', label: 'Child', minAge: 2 },
    { key: 'infant', label: 'Infant', minAge: 0 },
  ];

  it('prefers the tour, then the snapshot, then the agency', () => {
    expect(resolveBands([TOUR, FOUR_BANDS], DEFAULT_AGE_BANDS)).toEqual(TOUR);
    expect(resolveBands([null, FOUR_BANDS], DEFAULT_AGE_BANDS).map((b) => b.minAge)).toEqual([12, 6, 4, 0]);
    expect(resolveBands([null, undefined], DEFAULT_AGE_BANDS).map((b) => b.minAge)).toEqual([12, 2, 0]);
    expect(resolveBands([], DEFAULT_AGE_BANDS)).toEqual(DEFAULT_AGE_BANDS);
  });

  it('skips a layer that is not a usable list', () => {
    expect(resolveBands([[{ key: 'adult', label: 'Adult', minAge: 13 }], TOUR], DEFAULT_AGE_BANDS)).toEqual(TOUR); // no band from age 0
    expect(resolveBands(['junk', []], DEFAULT_AGE_BANDS)).toEqual(DEFAULT_AGE_BANDS);
  });

  it('puts a 12-year-old among the children on a tour whose adults start at 13', () => {
    expect(bandForAge(resolveBands([TOUR], DEFAULT_AGE_BANDS), 12)).toBe('child');
    expect(bandForAge(resolveBands([null], DEFAULT_AGE_BANDS), 12)).toBe('adult');
  });
});
