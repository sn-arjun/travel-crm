import { describe, expect, it } from 'vitest';

import {
  draftsFrom, groupByDay, type Selection, maxForExtra, priceFor, quantityOf, sameSelection, selectionFrom, setQuantity, startStep, toChoices,
  toTravellerRequest, totals, validateTravellers, type TripExtra, type TripPage, type TripPassenger,
} from './extras';

const gondola = { ref: 'g', price: 50, bandPrices: { child: 30, infant: 0 } };
const dinner = { ref: 'd', price: 25, bandPrices: null };
const eva = { ref: 'p1', bandKey: 'adult' };
const sanne = { ref: 'p2', bandKey: 'child' };
const baby = { ref: 'p3', bandKey: 'infant' };

describe('priceFor', () => {
  it('uses the price of the passenger\'s band, a band price of 0 as a price, and the extra price otherwise', () => {
    expect(priceFor(gondola, 'adult')).toBe(50);
    expect(priceFor(gondola, 'child')).toBe(30);
    expect(priceFor(gondola, 'infant')).toBe(0);
    expect(priceFor(gondola, null)).toBe(50);
    expect(priceFor(dinner, 'child')).toBe(25);
    expect(priceFor({ price: 10.005, bandPrices: null }, 'adult')).toBe(10.01);
  });
});

describe('groupByDay', () => {
  it('puts the whole trip first, then the days in order, keeping the order inside a day', () => {
    const list = [
      { title: 'c', day: 3 }, { title: 'a', day: null }, { title: 'b', day: 2 }, { title: 'd', day: 3 }, { title: 'e', day: null },
    ];
    expect(groupByDay(list).map((g) => [g.day, g.items.map((i) => i.title)])).toEqual([[null, ['a', 'e']], [2, ['b']], [3, ['c', 'd']]]);
    expect(groupByDay([])).toEqual([]);
  });
});

describe('the selection', () => {
  const passengers: Array<Pick<TripPassenger, 'ref' | 'extras'>> = [
    { ref: 'p1', extras: [{ extraRef: 'g', quantity: 1, status: 'paid' }, { extraRef: 'd', quantity: 0, status: 'cancelled' }] },
    { ref: 'p2', extras: [] },
  ];

  it('starts from what is saved and never stores a zero', () => {
    const s = selectionFrom(passengers);
    expect(s).toEqual({ p1: { g: 1 } });
    expect(setQuantity(s, 'p1', 'g', 0)).toEqual({});
    expect(setQuantity(s, 'p2', 'd', 2)).toEqual({ p1: { g: 1 }, p2: { d: 2 } });
    expect(setQuantity(s, 'p2', 'd', -4)).toEqual({ p1: { g: 1 } });
    expect(setQuantity(s, 'p2', 'd', 99).p2?.d).toBe(20);
    expect(quantityOf(s, 'p1', 'g')).toBe(1);
    expect(quantityOf(s, 'p9', 'g')).toBe(0);
  });

  it('totals per passenger and per extra with each band\'s price', () => {
    let s: Selection = {};
    s = setQuantity(s, 'p1', 'g', 1);
    s = setQuantity(s, 'p2', 'g', 1);
    s = setQuantity(s, 'p3', 'g', 1);
    s = setQuantity(s, 'p1', 'd', 2);
    const t = totals(s, [gondola, dinner], [eva, sanne, baby]);
    expect(t.total).toBe(130); // 50 + 30 + 0 + 2 x 25
    expect(t.count).toBe(5);
    expect(t.byPassenger).toEqual({ p1: 100, p2: 30, p3: 0 });
    expect(t.byExtra).toEqual({ g: { quantity: 3, amount: 80 }, d: { quantity: 2, amount: 50 } });
    // A choice for an extra or a passenger the page does not list does not count.
    expect(totals({ ...s, ghost: { g: 3 }, p1: { ...(s.p1 ?? {}), x: 4 } }, [gondola, dinner], [eva, sanne, baby]).total).toBe(130);
    expect(totals({}, [gondola], [eva]).total).toBe(0);
  });

  it('builds the request and compares selections regardless of order', () => {
    const a = { p1: { g: 1, d: 2 }, p2: { g: 1 } };
    const b = { p2: { g: 1 }, p1: { d: 2, g: 1 } };
    expect(sameSelection(a, b)).toBe(true);
    expect(sameSelection(a, { p1: { g: 1 } })).toBe(false);
    expect(toChoices(a)).toHaveLength(3);
    expect(toChoices({})).toEqual([]);
  });

  it('knows how much more of a limited extra can be asked for', () => {
    const limited = { ref: 'g', left: 2, soldOut: false } as Pick<TripExtra, 'left' | 'soldOut' | 'ref'>;
    expect(maxForExtra(limited, {}, 1)).toBe(3);
    expect(maxForExtra({ ref: 'g', left: 0, soldOut: true }, {}, 1)).toBe(1);
    expect(maxForExtra({ ref: 'g', left: null, soldOut: false }, {}, 0)).toBeNull();
  });
});

describe('the travellers step', () => {
  const page: Pick<TripPage, 'passengers' | 'fields' | 'startDate' | 'collects'> = {
    startDate: '2033-06-20',
    collects: { gender: true, dateOfBirth: true, meal: true },
    fields: [
      { key: 'nationality', label: 'Nationality', required: true, type: 'text', options: null, custom: false },
      { key: 'documentExpiry', label: 'Document expiry', required: false, type: 'date', options: null, custom: false },
      { key: 'diet', label: 'Diet', required: false, type: 'select', options: ['none', 'vegan'], custom: true },
      { key: 'vip', label: 'VIP', required: false, type: 'boolean', options: null, custom: true },
    ],
    passengers: [
      { ref: 'p1', firstName: 'Eva', lastName: 'de Vries', gender: null, dateOfBirth: null, bandKey: 'adult', bandLabel: 'Adult', mealPreference: null, values: { nationality: null, documentExpiry: '2030-01-01', diet: null, vip: true }, extras: [] },
      { ref: 'p2', firstName: 'Sanne', lastName: '', gender: 'female', dateOfBirth: '2025-01-01', bandKey: 'child', bandLabel: 'Child', mealPreference: 'vegan', values: {}, extras: [] },
    ],
  };

  it('makes a draft per passenger from what is known', () => {
    const drafts = draftsFrom(page);
    expect(drafts[0]!).toMatchObject({ ref: 'p1', firstName: 'Eva', gender: '', dateOfBirth: '', values: { nationality: '', documentExpiry: '2030-01-01', diet: '', vip: true } });
    expect(drafts[1]!.values.vip).toBe(false);
  });

  it('finds what is missing or wrong, the way the server does', () => {
    const drafts = draftsFrom(page);
    drafts[1]!.firstName = ' ';
    drafts[1]!.values.nationality = 'Dutch';
    drafts[1]!.values.documentExpiry = '31-12-2030';
    drafts[1]!.values.diet = 'carnivore';
    drafts[0]!.dateOfBirth = '2040-01-01';
    expect(validateTravellers(page, drafts)).toEqual([
      { ref: 'p1', field: 'dateOfBirth' },
      { ref: 'p1', field: 'nationality' },
      { ref: 'p2', field: 'firstName' },
      { ref: 'p2', field: 'documentExpiry' },
      { ref: 'p2', field: 'diet' },
    ]);
    drafts[0]!.dateOfBirth = '1985-03-01';
    drafts[0]!.values.nationality = 'Dutch';
    drafts[1]!.firstName = 'Sanne';
    drafts[1]!.values.documentExpiry = '';
    drafts[1]!.values.diet = 'vegan';
    expect(validateTravellers(page, drafts)).toEqual([]);
  });

  it('sends a date of birth only where none is known, and only what the agency collects', () => {
    const drafts = draftsFrom(page);
    drafts[0]!.dateOfBirth = '1985-03-01';
    drafts[1]!.dateOfBirth = '1999-01-01';
    const request = toTravellerRequest(page, drafts);
    expect(request.passengers[0]!).toMatchObject({ ref: 'p1', dateOfBirth: '1985-03-01', gender: '', mealPreference: '' });
    expect(request.passengers[1]!).not.toHaveProperty('dateOfBirth');
    const none = toTravellerRequest({ ...page, collects: { gender: false, dateOfBirth: false, meal: false } }, drafts);
    expect(none.passengers[0]!).not.toHaveProperty('gender');
    expect(none.passengers[0]!).not.toHaveProperty('mealPreference');
  });
});

describe('startStep', () => {
  it('opens on the step named in the link', () => {
    expect(startStep('?step=extras')).toBe('extras');
    expect(startStep('?lang=nl&step=pay')).toBe('pay');
    expect(startStep('?step=travellers')).toBe('travellers');
    expect(startStep('?step=hack')).toBe('travellers');
    expect(startStep('')).toBe('travellers');
  });
});
