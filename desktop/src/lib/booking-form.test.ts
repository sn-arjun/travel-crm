import { describe, expect, it } from 'vitest';
import {
  ageOn, bandCounts, bandForAge, buildBookingRequest, depositFor, emptyMember, initialParty, mayWaitlist, memberAge, paymentHref, quote,
  seatsNotice, setBandCount, validateContact, validateMember, validateParty, type PartyMember, type PublicPage,
} from './booking-form';

const page: PublicPage = {
  state: 'open',
  agency: { name: 'Test Agency', logoUrl: null, primaryColor: null, accentColor: null, tagline: null, email: null, phone: null },
  tour: { title: 'Alpine round', description: null, destination: 'Switzerland', durationDays: 5 },
  startDate: '2033-06-10',
  endDate: '2033-06-14',
  startTime: null,
  days: [],
  currency: 'EUR',
  locale: { locale: 'nl-NL', timeZone: 'Europe/Amsterdam', country: 'NL', phoneDefaultCountry: 'NL' },
  language: { default: 'en', available: ['en', 'nl'] },
  prices: {
    bands: [
      { key: 'adult', label: 'Adult', minAge: 12, maxAge: null, amount: 1000 },
      { key: 'child', label: 'Child', minAge: 2, maxAge: 11, amount: 600 },
      { key: 'infant', label: 'Infant', minAge: 0, maxAge: 1, amount: 0 },
    ],
    roomSupplements: [{ key: 'single', label: 'Single', occupancy: 1, amount: 250 }, { key: 'twin', label: 'Twin', occupancy: 2, amount: null }],
    seatSurcharge: 40,
  },
  pickupPoints: [{ ref: 'abc', name: 'Amsterdam', address: null, localTime: '06:30', dayOffset: 0 }],
  passengerFields: [
    { key: 'name', label: 'Name', required: true, type: 'text', options: null, custom: false },
    { key: 'gender', label: 'Gender', required: false, type: 'text', options: null, custom: false },
    { key: 'dateOfBirth', label: 'Date of birth', required: false, type: 'date', options: null, custom: false },
    { key: 'pickupPoint', label: 'Pickup point', required: true, type: 'text', options: null, custom: false },
    { key: 'roomType', label: 'Room', required: false, type: 'text', options: null, custom: false },
    { key: 'diet', label: 'Diet', required: true, type: 'select', options: ['none', 'vegan'], custom: true },
  ],
  shareMatching: true,
  preferredSeat: true,
  terms: 'Terms',
  requireTerms: true,
  marketingOptIn: true,
  deposit: { type: 'percent', value: 30 },
  holdHours: 48,
  seats: { left: 12, full: false, waitlist: false },
  maxParty: 10,
  captcha: null,
  formToken: '1.abc',
};

const member = (band: string, over: Partial<PartyMember> = {}): PartyMember => ({ ...emptyMember(band), firstName: 'Eva', pickupPoint: 'abc', extra: { diet: 'none' }, ...over });

describe('ages and bands', () => {
  it('counts whole years on the departure date', () => {
    expect(ageOn('2025-06-10', '2033-06-10')).toBe(8);
    expect(ageOn('2025-06-11', '2033-06-10')).toBe(7);
    expect(ageOn('2033-06-10', '2033-06-10')).toBe(0);
  });

  it('puts an age in the highest band it has reached', () => {
    const bands = page.prices.bands;
    expect([0, 1, 2, 11, 12, 70].map((a) => bandForAge(bands, a))).toEqual(['infant', 'infant', 'child', 'child', 'adult', 'adult']);
    expect(bandForAge(bands, null)).toBeNull();
    expect(bandForAge(bands, -1)).toBeNull();
  });

  it('reads the age from a date of birth first, then from the years typed', () => {
    expect(memberAge({ dateOfBirth: '2025-06-10', ageYears: '30' }, page.startDate)).toBe(8);
    expect(memberAge({ dateOfBirth: '', ageYears: '5' }, page.startDate)).toBe(5);
    expect(memberAge({ dateOfBirth: '', ageYears: '' }, page.startDate)).toBeNull();
    expect(memberAge({ dateOfBirth: '', ageYears: '5.5' }, page.startDate)).toBeNull();
    expect(memberAge({ dateOfBirth: '', ageYears: '200' }, page.startDate)).toBeNull();
  });
});

describe('the party builder', () => {
  it('starts with one adult', () => {
    const party = initialParty(page);
    expect(party).toHaveLength(1);
    expect(party[0]!.band).toBe('adult');
  });

  it('adds and removes people per band and keeps adults first', () => {
    const order = ['adult', 'child', 'infant'];
    let party = initialParty(page);
    party = setBandCount(party, 'child', 2, order, 10);
    party = setBandCount(party, 'adult', 2, order, 10);
    expect(party.map((m) => m.band)).toEqual(['adult', 'adult', 'child', 'child']);
    const names = party.map((m) => m.key);
    party = setBandCount(party, 'child', 1, order, 10);
    expect(party.map((m) => m.band)).toEqual(['adult', 'adult', 'child']);
    expect(party.map((m) => m.key)).toEqual([names[0], names[1], names[2]]); // the details of those who stay are kept
    expect(bandCounts(party)).toEqual({ adult: 2, child: 1 });
  });

  it('never goes over the largest party the page takes', () => {
    const order = ['adult', 'child', 'infant'];
    let party = setBandCount(initialParty(page), 'adult', 8, order, 10);
    party = setBandCount(party, 'child', 9, order, 10);
    expect(party).toHaveLength(10);
    expect(bandCounts(party)).toEqual({ adult: 8, child: 2 });
    expect(setBandCount(party, 'adult', -3, order, 10).filter((m) => m.band === 'adult')).toHaveLength(0);
    expect(setBandCount(party, 'adult', Number.NaN, order, 10).filter((m) => m.band === 'adult')).toHaveLength(0);
  });
});

describe('quote', () => {
  it('adds bands, the single supplement and the seat surcharge, and the deposit of the total', () => {
    const party = [
      member('adult', { roomType: 'single', preferredSeat: '3A' }),
      member('adult', { roomType: 'twin' }),
      member('child', { ageYears: '8' }),
      member('infant', { ageYears: '1' }),
    ];
    const q = quote(page, party);
    expect(q.lines.map((l) => [l.kind, l.key, l.quantity, l.unit])).toEqual([
      ['band', 'adult', 2, 1000],
      ['band', 'child', 1, 600],
      ['room', 'single', 1, 250],
      ['seat', 'seat', 1, 40],
    ]);
    expect(q.total).toBe(2890);
    expect(q.deposit).toBe(867);
    expect(q.priced).toBe(true);
  });

  it('shows no amounts for a tour without prices', () => {
    const bare: PublicPage = { ...page, prices: { bands: page.prices.bands.map((b) => ({ ...b, amount: null })), roomSupplements: [], seatSurcharge: null } };
    const q = quote(bare, [member('adult')]);
    expect(q).toMatchObject({ lines: [], total: 0, priced: false, deposit: 0 });
  });

  it('ignores the seat surcharge when preferred seats are off', () => {
    expect(quote({ ...page, preferredSeat: false }, [member('adult', { preferredSeat: '3A' })]).total).toBe(1000);
  });

  it('works out each kind of deposit and never asks for more than the total', () => {
    expect(depositFor({ type: 'percent', value: 25 }, 3, 1000)).toBe(250);
    expect(depositFor({ type: 'per_seat', value: 100 }, 3, 1000)).toBe(300);
    expect(depositFor({ type: 'fixed', value: 400 }, 3, 1000)).toBe(400);
    expect(depositFor({ type: 'fixed', value: 4000 }, 3, 1000)).toBe(1000);
    expect(depositFor(null, 3, 1000)).toBe(0);
    expect(depositFor({ type: 'percent', value: 33.333 }, 1, 100)).toBe(33.33);
  });
});

describe('checks before sending', () => {
  it('needs a name and an email or phone, and shapes them', () => {
    expect(validateContact({ name: '', email: '', phone: '' }).map((p) => p.key)).toEqual(['booking.error.nameRequired', 'booking.error.contactRequired']);
    expect(validateContact({ name: 'Eva', email: 'eva@example.com', phone: '' })).toEqual([]);
    expect(validateContact({ name: 'Eva', email: '', phone: '+31 6 1234 5678' })).toEqual([]);
    expect(validateContact({ name: 'Eva', email: 'eva@', phone: '' })[0]!.key).toBe('booking.error.emailInvalid');
    expect(validateContact({ name: 'Eva', email: '', phone: '+31 12' })[0]!.key).toBe('booking.error.phoneInvalid');
  });

  it('asks for the fields the departure marks required', () => {
    expect(validateMember(page, member('adult'), 0)).toEqual([]);
    const missing = validateMember(page, member('adult', { firstName: ' ', pickupPoint: '', extra: {} }), 2);
    expect(missing.map((p) => [p.index, p.field])).toEqual([[2, 'firstName'], [2, 'pickupPoint'], [2, 'extra.diet']]);
  });

  it('does not ask for a pickup point when the departure has none to offer', () => {
    const noStops: PublicPage = { ...page, pickupPoints: [] };
    expect(validateMember(noStops, member('adult', { pickupPoint: '' }), 0)).toEqual([]);
  });

  it('a child needs an age and it has to fit the band', () => {
    expect(validateMember(page, member('child'), 1).map((p) => p.key)).toEqual(['booking.error.ageNeeded']);
    expect(validateMember(page, member('child', { ageYears: '8' }), 1)).toEqual([]);
    expect(validateMember(page, member('child', { ageYears: '30' }), 1).map((p) => p.key)).toEqual(['booking.error.bandMismatch']);
    expect(validateMember(page, member('child', { dateOfBirth: '2025-06-10' }), 1)).toEqual([]);
    expect(validateMember(page, member('child', { dateOfBirth: '2033-12-01' }), 1).map((p) => p.key)).toEqual(['booking.error.dobInvalid']);
    expect(validateMember(page, member('adult', { ageYears: '5' }), 0).map((p) => p.key)).toEqual(['booking.error.bandMismatch']);
    expect(validateMember(page, member('adult', { ageYears: 'x' }), 0).map((p) => p.key)).toEqual(['booking.error.ageInvalid']);
  });

  it('refuses an empty party, one that is too big and the same seat twice', () => {
    expect(validateParty(page, []).map((p) => p.key)).toEqual(['booking.error.partyEmpty']);
    const big = Array.from({ length: 11 }, () => member('adult'));
    expect(validateParty(page, big).map((p) => p.key)).toContain('booking.error.partyTooBig');
    const twice = validateParty(page, [member('adult', { preferredSeat: '3A' }), member('adult', { preferredSeat: ' 3a ' })]);
    expect(twice).toEqual([{ index: 1, field: 'preferredSeat', key: 'booking.error.seatTwice' }]);
    expect(validateParty(page, [member('adult', { preferredSeat: '<b>' })]).map((p) => p.key)).toEqual(['booking.error.seatInvalid']);
  });
});

describe('the request', () => {
  it('sends only what the departure collects and the form token', () => {
    const party = [
      member('adult', { lastName: 'de Vries', gender: 'female', roomType: 'single', shareOk: true, preferredSeat: '3A', mealPreference: 'vegan' }),
      member('child', { firstName: 'Tim', ageYears: '8', dateOfBirth: '' }),
    ];
    const body = buildBookingRequest(page, {
      contact: { name: ' Eva ', email: ' eva@example.com ', phone: '' }, party, acceptTerms: true, marketingOptIn: false, notes: '', website: '', language: 'nl',
    });
    expect(body).toMatchObject({ formToken: '1.abc', language: 'nl', acceptTerms: true, contact: { name: 'Eva', email: 'eva@example.com' } });
    expect(body.contact).not.toHaveProperty('phone');
    expect(body).not.toHaveProperty('marketingOptIn');
    expect(body.passengers[0]!).toEqual({
      band: 'adult', firstName: 'Eva', lastName: 'de Vries', gender: 'female', pickupPoint: 'abc', roomType: 'single', shareOk: true, shareGender: false,
      preferredSeat: '3A', extraFields: { diet: 'none' },
    });
    // The meal field is not collected by this departure, so it is not sent even though the visitor typed it.
    expect(body.passengers[0]!).not.toHaveProperty('mealPreference');
    expect(body.passengers[1]!).toMatchObject({ band: 'child', firstName: 'Tim', ageYears: 8 });
    expect(body.passengers[1]!).not.toHaveProperty('dateOfBirth');
  });

  it('sends the marketing opt-in only when ticked', () => {
    const base = { contact: { name: 'Eva', email: 'eva@example.com', phone: '' }, party: [member('adult')], acceptTerms: true, notes: '', website: '', language: 'en' };
    expect(buildBookingRequest(page, { ...base, marketingOptIn: true })).toMatchObject({ marketingOptIn: true });
    expect(buildBookingRequest(page, { ...base, marketingOptIn: false })).not.toHaveProperty('marketingOptIn');
  });
});

describe('seats and payment links', () => {
  it('words the seats line from the setting, not from guesses', () => {
    expect(seatsNotice({ left: 7, full: false, waitlist: false })).toEqual({ kind: 'count', count: 7 });
    expect(seatsNotice({ left: null, full: false, waitlist: false })).toBeNull();
    expect(seatsNotice({ left: null, full: true, waitlist: true })).toEqual({ kind: 'full', waitlist: true });
    expect(mayWaitlist({ left: 2, full: false, waitlist: true }, 3)).toBe(true);
    expect(mayWaitlist({ left: null, full: false, waitlist: true }, 3)).toBe(false);
    expect(mayWaitlist({ left: 0, full: true, waitlist: true }, 1)).toBe(true);
  });

  it('adds the way back to the test gateway page only', () => {
    expect(paymentHref('http://api.test/api/v1/webhooks/payments/mock-pay/k/l', 'http://app.test/book/t')).toBe(
      'http://api.test/api/v1/webhooks/payments/mock-pay/k/l?return=http%3A%2F%2Fapp.test%2Fbook%2Ft',
    );
    expect(paymentHref('https://checkout.stripe.com/c/pay/cs_test', 'http://app.test/book/t')).toBe('https://checkout.stripe.com/c/pay/cs_test');
  });
});
