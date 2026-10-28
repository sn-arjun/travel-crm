/**
 * The public booking page's form logic (R148): what the page receives, the party being built, the price it shows, the checks
 * before it sends and the request it sends. No React and no network here, so every rule is a unit test.
 *
 * The server repeats every check that matters (bands against age, required fields, prices): this file only keeps the visitor
 * from sending what would be refused, and shows the same totals the invoice will carry.
 */

// ---------------------------------------------------------------- what the page receives (GET /public/departures/:token)

export interface PublicBand {
  key: string;
  label: string | null;
  minAge: number;
  maxAge: number | null;
  /** null when the tour has no price for the band. */
  amount: number | null;
}

export interface PublicField {
  key: string;
  label: string;
  required: boolean;
  type: 'text' | 'date' | 'select' | 'boolean';
  options: string[] | null;
  custom: boolean;
}

export interface PublicPickup {
  ref: string;
  name: string;
  address: string | null;
  localTime: string | null;
  dayOffset: number;
}

export interface PublicPage {
  state: 'open' | 'closed';
  agency: { name: string; logoUrl: string | null; primaryColor: string | null; accentColor: string | null; tagline: string | null; email: string | null; phone: string | null };
  tour: { title: string; description: string | null; destination: string | null; durationDays: number | null };
  startDate: string;
  endDate: string;
  startTime: string | null;
  days: Array<{ day: number; title: string }>;
  currency: string;
  locale: { locale: string; timeZone: string; country: string; phoneDefaultCountry: string };
  language: { default: string; available: string[] };
  prices: {
    bands: PublicBand[];
    roomSupplements: Array<{ key: string; label: string; occupancy: number; amount: number | null }>;
    seatSurcharge: number | null;
  };
  pickupPoints: PublicPickup[];
  passengerFields: PublicField[];
  shareMatching: boolean;
  preferredSeat: boolean;
  terms: string;
  requireTerms: boolean;
  marketingOptIn: boolean;
  deposit: { type: 'percent' | 'per_seat' | 'fixed'; value: number } | null;
  holdHours: number;
  seats: { left: number | null; full: boolean; waitlist: boolean };
  maxParty: number;
  captcha: { siteKey: string } | null;
  formToken: string;
}

// ---------------------------------------------------------------- the party

export interface PartyMember {
  /** Local key for React lists; never sent. */
  key: string;
  band: string;
  firstName: string;
  lastName: string;
  gender: '' | 'male' | 'female' | 'other';
  dateOfBirth: string;
  ageYears: string;
  pickupPoint: string;
  roomType: string;
  shareOk: boolean;
  shareGender: boolean;
  mealPreference: string;
  preferredSeat: string;
  extra: Record<string, string | boolean>;
}

let counter = 0;

export function emptyMember(band: string): PartyMember {
  counter += 1;
  return {
    key: `m${Date.now().toString(36)}${counter.toString(36)}`,
    band,
    firstName: '',
    lastName: '',
    gender: '',
    dateOfBirth: '',
    ageYears: '',
    pickupPoint: '',
    roomType: '',
    shareOk: false,
    shareGender: false,
    mealPreference: '',
    preferredSeat: '',
    extra: {},
  };
}

/** The band an adult is booked in: the one with the highest minimum age. */
export function topBand(page: Pick<PublicPage, 'prices'>): PublicBand | undefined {
  return page.prices.bands.slice().sort((a, b) => b.minAge - a.minAge)[0];
}

/** A party of one adult: the least a booking can be. */
export function initialParty(page: Pick<PublicPage, 'prices'>): PartyMember[] {
  const band = topBand(page);
  return band ? [emptyMember(band.key)] : [];
}

export function bandCounts(party: readonly PartyMember[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of party) out[m.band] = (out[m.band] ?? 0) + 1;
  return out;
}

/**
 * Sets how many people the party has in a band. New people are added at the end of their band's group, fewer removes the last ones
 * of the band; people of other bands keep their place and their details. The party is kept in band order (adults first).
 */
export function setBandCount(party: readonly PartyMember[], band: string, count: number, bandOrder: readonly string[], maxParty: number): PartyMember[] {
  const others = party.filter((m) => m.band !== band).length;
  const wanted = Math.max(0, Math.min(Math.floor(count) || 0, Math.max(0, maxParty - others)));
  const mine = party.filter((m) => m.band === band).slice(0, wanted);
  while (mine.length < wanted) mine.push(emptyMember(band));
  const byBand = new Map<string, PartyMember[]>();
  for (const m of [...party.filter((x) => x.band !== band), ...mine]) byBand.set(m.band, [...(byBand.get(m.band) ?? []), m]);
  return [...bandOrder.flatMap((b) => byBand.get(b) ?? []), ...[...byBand.entries()].filter(([b]) => !bandOrder.includes(b)).flatMap(([, list]) => list)];
}

// ---------------------------------------------------------------- ages and bands

/** Whole years on `onDate` for someone born on `dob` (both 'YYYY-MM-DD'). */
export function ageOn(dob: string, onDate: string): number {
  const [by = 0, bm = 0, bd = 0] = dob.slice(0, 10).split('-').map(Number);
  const [y = 0, m = 0, d = 0] = onDate.slice(0, 10).split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** The band that covers an age: the highest band whose minimum age the person has reached. */
export function bandForAge(bands: readonly Pick<PublicBand, 'key' | 'minAge'>[], age: number | null): string | null {
  if (age === null || !Number.isFinite(age) || age < 0) return null;
  return bands.slice().sort((a, b) => b.minAge - a.minAge).find((b) => age >= b.minAge)?.key ?? null;
}

/** The age a member entered, from a date of birth or an age in years; null when neither is usable. */
export function memberAge(m: Pick<PartyMember, 'dateOfBirth' | 'ageYears'>, startDate: string): number | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(m.dateOfBirth)) return ageOn(m.dateOfBirth, startDate);
  const years = m.ageYears.trim() === '' ? NaN : Number(m.ageYears);
  return Number.isInteger(years) && years >= 0 && years <= 120 ? years : null;
}

/** The fields the form maps onto passenger columns; every other field a departure collects at booking is kept in extra_fields. */
const CORE_FIELDS = new Set(['name', 'gender', 'dateOfBirth', 'pickupPoint', 'roomType', 'meal']);

/** A field stored with the passenger's extra details: the agency's own fields and the optional built-in ones (nationality, documents). */
export const isExtraField = (f: Pick<PublicField, 'key'>): boolean => !CORE_FIELDS.has(f.key);

/** True when the departure collects this passenger field at booking. */
export const collects = (page: Pick<PublicPage, 'passengerFields'>, key: string): boolean => page.passengerFields.some((f) => f.key === key);

// ---------------------------------------------------------------- price

export interface QuoteLine {
  kind: 'band' | 'room' | 'seat';
  key: string;
  quantity: number;
  unit: number;
}

export interface Quote {
  lines: QuoteLine[];
  total: number;
  /** False when the tour has no prices for this party: the page then shows no amounts. */
  priced: boolean;
  deposit: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The deposit owed up front for a total (design 4.1): percent of the total, per seat, a fixed sum; never more than the total. */
export function depositFor(deposit: PublicPage['deposit'], seats: number, total: number): number {
  if (!deposit || !(deposit.value > 0)) return 0;
  const raw = deposit.type === 'percent' ? (total * deposit.value) / 100 : deposit.type === 'per_seat' ? deposit.value * seats : deposit.value;
  return Math.min(round2(raw), round2(total));
}

/** The lines the invoice will carry for this party (same rules as the server): bands, room supplements and the preferred-seat surcharge. */
export function quote(page: Pick<PublicPage, 'prices' | 'deposit' | 'preferredSeat'>, party: readonly PartyMember[]): Quote {
  const lines: QuoteLine[] = [];
  const counts = bandCounts(party);
  for (const band of page.prices.bands) {
    const quantity = counts[band.key] ?? 0;
    if (quantity > 0 && band.amount !== null && band.amount > 0) lines.push({ kind: 'band', key: band.key, quantity, unit: band.amount });
  }
  for (const room of page.prices.roomSupplements) {
    const quantity = party.filter((m) => m.roomType === room.key).length;
    if (quantity > 0 && room.amount !== null && room.amount > 0) lines.push({ kind: 'room', key: room.key, quantity, unit: room.amount });
  }
  const surcharge = page.prices.seatSurcharge;
  if (page.preferredSeat && surcharge !== null && surcharge > 0) {
    const quantity = party.filter((m) => m.preferredSeat.trim() !== '').length;
    if (quantity > 0) lines.push({ kind: 'seat', key: 'seat', quantity, unit: surcharge });
  }
  const total = round2(lines.reduce((sum, l) => sum + l.quantity * l.unit, 0));
  return { lines, total, priced: page.prices.bands.some((b) => b.amount !== null && b.amount > 0), deposit: depositFor(page.deposit, party.length, total) };
}

// ---------------------------------------------------------------- checks before sending

export interface FieldProblem {
  /** Index in the party, or -1 for the contact and the terms. */
  index: number;
  field: string;
  /** Catalogue key of the sentence to show. */
  key: string;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SEAT_LABEL = /^[A-Za-z0-9 ._-]{1,20}$/;

export function validateContact(contact: { name: string; email: string; phone: string }): FieldProblem[] {
  const out: FieldProblem[] = [];
  if (!contact.name.trim()) out.push({ index: -1, field: 'contact.name', key: 'booking.error.nameRequired' });
  const email = contact.email.trim();
  const digits = contact.phone.replace(/\D/g, '');
  if (!email && !digits) out.push({ index: -1, field: 'contact.email', key: 'booking.error.contactRequired' });
  if (email && !EMAIL_SHAPE.test(email)) out.push({ index: -1, field: 'contact.email', key: 'booking.error.emailInvalid' });
  if (digits && (digits.length < 6 || digits.length > 15)) out.push({ index: -1, field: 'contact.phone', key: 'booking.error.phoneInvalid' });
  return out;
}

/** Checks one member against the departure's fields and bands. Mirrors the server: a band other than the top one needs an age that fits it. */
export function validateMember(page: PublicPage, m: PartyMember, index: number): FieldProblem[] {
  const out: FieldProblem[] = [];
  const add = (field: string, key: string) => out.push({ index, field, key });
  if (!m.firstName.trim()) add('firstName', 'booking.error.required');

  const age = memberAge(m, page.startDate);
  const dobGiven = m.dateOfBirth.trim() !== '';
  if (dobGiven && (!/^\d{4}-\d{2}-\d{2}$/.test(m.dateOfBirth) || m.dateOfBirth > page.startDate)) add('dateOfBirth', 'booking.error.dobInvalid');
  else if (m.ageYears.trim() !== '' && !dobGiven && age === null) add('ageYears', 'booking.error.ageInvalid');
  else if (age !== null) {
    const band = bandForAge(page.prices.bands, age);
    if (band && band !== m.band) add(dobGiven ? 'dateOfBirth' : 'ageYears', 'booking.error.bandMismatch');
  } else if (m.band !== topBand(page)?.key) {
    add(collects(page, 'dateOfBirth') ? 'dateOfBirth' : 'ageYears', 'booking.error.ageNeeded');
  }

  for (const f of page.passengerFields) {
    if (!f.required) continue;
    switch (f.key) {
      case 'name': break; // the first name is checked above
      case 'gender': if (!m.gender) add('gender', 'booking.error.required'); break;
      case 'dateOfBirth': if (!dobGiven && age === null) add('dateOfBirth', 'booking.error.required'); break;
      case 'pickupPoint': if (page.pickupPoints.length > 0 && !m.pickupPoint) add('pickupPoint', 'booking.error.required'); break;
      case 'roomType': if (!m.roomType) add('roomType', 'booking.error.required'); break;
      case 'meal': if (!m.mealPreference.trim()) add('mealPreference', 'booking.error.required'); break;
      default: {
        const v = m.extra[f.key];
        if (f.type === 'boolean' ? v !== true : typeof v !== 'string' || !v.trim()) add(`extra.${f.key}`, 'booking.error.required');
      }
    }
  }
  if (page.preferredSeat && m.preferredSeat.trim() && !SEAT_LABEL.test(m.preferredSeat.trim())) add('preferredSeat', 'booking.error.seatInvalid');
  return out;
}

export function validateParty(page: PublicPage, party: readonly PartyMember[]): FieldProblem[] {
  const out: FieldProblem[] = [];
  if (party.length === 0) out.push({ index: -1, field: 'party', key: 'booking.error.partyEmpty' });
  if (party.length > page.maxParty) out.push({ index: -1, field: 'party', key: 'booking.error.partyTooBig' });
  party.forEach((m, i) => out.push(...validateMember(page, m, i)));
  const taken = new Set<string>();
  party.forEach((m, i) => {
    const seat = m.preferredSeat.trim().toLowerCase();
    if (!seat) return;
    if (taken.has(seat)) out.push({ index: i, field: 'preferredSeat', key: 'booking.error.seatTwice' });
    taken.add(seat);
  });
  return out;
}

// ---------------------------------------------------------------- the request

export interface BookingForm {
  contact: { name: string; email: string; phone: string };
  party: readonly PartyMember[];
  acceptTerms: boolean;
  marketingOptIn: boolean;
  notes: string;
  /** Honeypot: a person never fills it. */
  website: string;
  language: string;
  captchaToken?: string;
}

/** The body of POST /public/departures/:token/bookings. Only what the departure collects is sent. */
export function buildBookingRequest(page: PublicPage, form: BookingForm) {
  const send = (key: string) => collects(page, key);
  return {
    formToken: page.formToken,
    website: form.website,
    language: form.language,
    ...(form.captchaToken ? { captchaToken: form.captchaToken } : {}),
    contact: {
      name: form.contact.name.trim(),
      ...(form.contact.email.trim() ? { email: form.contact.email.trim() } : {}),
      ...(form.contact.phone.replace(/\D/g, '') ? { phone: form.contact.phone.trim() } : {}),
    },
    passengers: form.party.map((m) => {
      const dob = send('dateOfBirth') && m.dateOfBirth ? m.dateOfBirth : undefined;
      const age = !dob && m.ageYears.trim() !== '' ? Number(m.ageYears) : undefined;
      const extra: Record<string, string | boolean> = {};
      for (const f of page.passengerFields) {
        const v = m.extra[f.key];
        if (isExtraField(f) && v !== undefined && v !== '') extra[f.key] = v;
      }
      return {
        band: m.band,
        firstName: m.firstName.trim(),
        lastName: m.lastName.trim(),
        ...(send('gender') && m.gender ? { gender: m.gender } : {}),
        ...(dob ? { dateOfBirth: dob } : {}),
        ...(age !== undefined ? { ageYears: age } : {}),
        ...(send('pickupPoint') && m.pickupPoint ? { pickupPoint: m.pickupPoint } : {}),
        ...(send('roomType') && m.roomType ? { roomType: m.roomType, shareOk: m.shareOk, shareGender: m.shareGender } : {}),
        ...(send('meal') && m.mealPreference.trim() ? { mealPreference: m.mealPreference.trim() } : {}),
        ...(page.preferredSeat && m.preferredSeat.trim() ? { preferredSeat: m.preferredSeat.trim() } : {}),
        ...(Object.keys(extra).length ? { extraFields: extra } : {}),
      };
    }),
    acceptTerms: form.acceptTerms,
    ...(form.marketingOptIn ? { marketingOptIn: true } : {}),
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
  };
}

// ---------------------------------------------------------------- what the page says about seats

export type SeatsNotice = { kind: 'count'; count: number } | { kind: 'full'; waitlist: boolean } | null;

/** The seats line under the tour name: a number when the agency shows it, "full" (with the waitlist offer) when no seat is left, else nothing. */
export function seatsNotice(seats: PublicPage['seats']): SeatsNotice {
  if (seats.full) return { kind: 'full', waitlist: seats.waitlist };
  if (seats.left !== null) return { kind: 'count', count: seats.left };
  return null;
}

/** Whether a party of this size surely fits: the page shows the waitlist wording on submit when it may not. */
export function mayWaitlist(seats: PublicPage['seats'], partySize: number): boolean {
  return seats.full || (seats.left !== null && partySize > seats.left);
}

/** Opens the mock pay page with a way back to this page; other gateways' links are left exactly as they are. */
export function paymentHref(url: string, returnTo: string): string {
  if (!url.includes('/webhooks/payments/mock-pay/')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}return=${encodeURIComponent(returnTo)}`;
}
