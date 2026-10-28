/**
 * Extras on the traveller self-service page (R150): what the page receives, the choices a party is making, the totals it shows and
 * the request it sends. No React and no network here, so every rule is a unit test.
 *
 * The server repeats every check that matters (prices, capacity, the cut-off); this file keeps the visitor from sending what would
 * be refused and shows the same totals the extras invoice will carry. It mirrors backend/src/services/departures/extras.ts (unitPrice).
 */

// ---------------------------------------------------------------- what the page receives (GET /public/booking/:token)

export interface TripField {
  key: string;
  label: string;
  required: boolean;
  type: 'text' | 'date' | 'select' | 'boolean' | string;
  options: string[] | null;
  custom: boolean;
}

export interface TripPassenger {
  ref: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  bandKey: string | null;
  bandLabel: string | null;
  mealPreference: string | null;
  values: Record<string, string | boolean | null>;
  extras: Array<{ extraRef: string; quantity: number; status: string }>;
}

export interface TripExtra {
  ref: string;
  title: string;
  description: string | null;
  day: number | null;
  price: number;
  bandPrices: Record<string, number> | null;
  open: boolean;
  cutoffAt: string | null;
  soldOut: boolean;
  left: number | null;
}

export interface TripAgency {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  tagline: string | null;
  email: string | null;
  phone: string | null;
}

export interface TripPage {
  scope: 'booking' | 'passenger';
  state: 'open' | 'closed';
  reference: string;
  status: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  currency: string;
  tour: { title: string; destination: string | null; durationDays: number | null };
  fields: TripField[];
  collects: { gender: boolean; dateOfBirth: boolean; meal: boolean };
  passengers: TripPassenger[];
  extras: TripExtra[];
  extrasOpen: boolean;
  invoice: { number: string; total: number; paid: number; balance: number; status: string } | null;
  extrasMoney: { total: number; paid: number; unpaid: number };
  deposit: { amount: number; due: number } | null;
  agency: TripAgency;
  days: Array<{ day: number; title: string }>;
  locale: { locale: string; timeZone: string; country: string; phoneDefaultCountry: string };
  language: { default: string; available: string[] };
  /** Only on the answer to a save of the extras. */
  invoiceCreated?: { number: string; total: number; currency: string } | null;
}

// ---------------------------------------------------------------- prices and totals

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** What one passenger pays for one unit: the price for the passenger's age band, else the extra's price. */
export function priceFor(extra: Pick<TripExtra, 'price' | 'bandPrices'>, bandKey: string | null): number {
  const forBand = bandKey && extra.bandPrices && Object.prototype.hasOwnProperty.call(extra.bandPrices, bandKey) ? extra.bandPrices[bandKey] : undefined;
  return round2(typeof forBand === 'number' && Number.isFinite(forBand) && forBand >= 0 ? forBand : extra.price);
}

/** Extras by day, the whole trip first, then day 1, 2, ... Rows of one day keep their order. */
export function groupByDay<T extends { day: number | null }>(extras: readonly T[]): Array<{ day: number | null; items: T[] }> {
  const groups = new Map<number | null, T[]>();
  for (const e of extras) groups.set(e.day ?? null, [...(groups.get(e.day ?? null) ?? []), e]);
  return [...groups.entries()]
    .sort(([a], [b]) => (a ?? 0) - (b ?? 0))
    .map(([day, items]) => ({ day, items }));
}

/** Quantities by passenger reference, then extra reference. Zero is never stored. */
export type Selection = Record<string, Record<string, number>>;

export const MAX_QUANTITY = 20;

export function selectionFrom(passengers: readonly Pick<TripPassenger, 'ref' | 'extras'>[]): Selection {
  const out: Selection = {};
  for (const p of passengers) {
    for (const e of p.extras) {
      if (e.quantity > 0) out[p.ref] = { ...(out[p.ref] ?? {}), [e.extraRef]: e.quantity };
    }
  }
  return out;
}

export function setQuantity(selection: Selection, passengerRef: string, extraRef: string, quantity: number): Selection {
  const q = Math.max(0, Math.min(MAX_QUANTITY, Math.floor(Number.isFinite(quantity) ? quantity : 0)));
  const mine = { ...(selection[passengerRef] ?? {}) };
  if (q > 0) mine[extraRef] = q;
  else delete mine[extraRef];
  const next = { ...selection, [passengerRef]: mine };
  if (Object.keys(mine).length === 0) delete next[passengerRef];
  return next;
}

export const quantityOf = (selection: Selection, passengerRef: string, extraRef: string): number => selection[passengerRef]?.[extraRef] ?? 0;

export interface SelectionTotals {
  total: number;
  count: number;
  byPassenger: Record<string, number>;
  byExtra: Record<string, { quantity: number; amount: number }>;
}

/** What the selection comes to, per passenger and per extra. Choices for a passenger or extra the page does not list are ignored. */
export function totals(
  selection: Selection,
  extras: readonly Pick<TripExtra, 'ref' | 'price' | 'bandPrices'>[],
  passengers: readonly Pick<TripPassenger, 'ref' | 'bandKey'>[],
): SelectionTotals {
  const out: SelectionTotals = { total: 0, count: 0, byPassenger: {}, byExtra: {} };
  for (const p of passengers) {
    for (const e of extras) {
      const q = quantityOf(selection, p.ref, e.ref);
      if (q <= 0) continue;
      const amount = round2(q * priceFor(e, p.bandKey));
      out.total = round2(out.total + amount);
      out.count += q;
      out.byPassenger[p.ref] = round2((out.byPassenger[p.ref] ?? 0) + amount);
      const prior = out.byExtra[e.ref] ?? { quantity: 0, amount: 0 };
      out.byExtra[e.ref] = { quantity: prior.quantity + q, amount: round2(prior.amount + amount) };
    }
  }
  return out;
}

/** The body of PUT /public/booking/:token/extras. */
export function toChoices(selection: Selection): Array<{ passengerRef: string; extraRef: string; quantity: number }> {
  const out: Array<{ passengerRef: string; extraRef: string; quantity: number }> = [];
  for (const [passengerRef, mine] of Object.entries(selection)) {
    for (const [extraRef, quantity] of Object.entries(mine)) if (quantity > 0) out.push({ passengerRef, extraRef, quantity });
  }
  return out;
}

export function sameSelection(a: Selection, b: Selection): boolean {
  const x = toChoices(a).map((c) => `${c.passengerRef}|${c.extraRef}|${c.quantity}`).sort();
  const y = toChoices(b).map((c) => `${c.passengerRef}|${c.extraRef}|${c.quantity}`).sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * The most of an extra the visitor can ask for in total, given what the whole departure has left: what the party has chosen already
 * counts again, so it can be kept. null means no limit that the page knows of.
 */
export function maxForExtra(extra: Pick<TripExtra, 'left' | 'soldOut' | 'ref'>, selection: Selection, ownSaved: number): number | null {
  if (extra.left === null) return extra.soldOut ? ownSaved : null;
  return extra.left + ownSaved;
}

// ---------------------------------------------------------------- the travellers step

export type TravellerValues = Record<string, string | boolean | null>;

export interface TravellerDraft {
  ref: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  mealPreference: string;
  values: Record<string, string | boolean>;
}

export function draftsFrom(page: Pick<TripPage, 'passengers' | 'fields'>): TravellerDraft[] {
  return page.passengers.map((p) => ({
    ref: p.ref,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender ?? '',
    dateOfBirth: p.dateOfBirth ?? '',
    mealPreference: p.mealPreference ?? '',
    values: Object.fromEntries(page.fields.map((f) => [f.key, f.type === 'boolean' ? p.values[f.key] === true : typeof p.values[f.key] === 'string' ? (p.values[f.key] as string) : ''])),
  }));
}

export interface TravellerProblem {
  ref: string;
  field: string;
}

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** The same checks the server makes, so a traveller is told before sending. */
export function validateTravellers(page: Pick<TripPage, 'fields' | 'startDate' | 'collects' | 'passengers'>, drafts: readonly TravellerDraft[]): TravellerProblem[] {
  const out: TravellerProblem[] = [];
  for (const d of drafts) {
    const bad = (field: string) => out.push({ ref: d.ref, field });
    if (!d.firstName.trim()) bad('firstName');
    if (d.dateOfBirth && (!DATE_SHAPE.test(d.dateOfBirth) || d.dateOfBirth > page.startDate)) bad('dateOfBirth');
    for (const f of page.fields) {
      const v = d.values[f.key];
      if (f.type === 'boolean') continue;
      const text = typeof v === 'string' ? v.trim() : '';
      if (f.required && !text) bad(f.key);
      else if (text && f.type === 'date' && !DATE_SHAPE.test(text)) bad(f.key);
      else if (text && f.type === 'select' && f.options && !f.options.includes(text)) bad(f.key);
    }
  }
  return out;
}

/** The body of PUT /public/booking/:token/passengers. A date of birth is sent only where the page still asks for it. */
export function toTravellerRequest(page: Pick<TripPage, 'collects' | 'passengers'>, drafts: readonly TravellerDraft[]) {
  return {
    passengers: drafts.map((d) => {
      const known = page.passengers.find((p) => p.ref === d.ref);
      return {
        ref: d.ref,
        firstName: d.firstName.trim(),
        lastName: d.lastName.trim(),
        ...(page.collects.gender ? { gender: d.gender } : {}),
        ...(page.collects.dateOfBirth && !known?.dateOfBirth && d.dateOfBirth ? { dateOfBirth: d.dateOfBirth } : {}),
        ...(page.collects.meal ? { mealPreference: d.mealPreference.trim() } : {}),
        values: d.values,
      };
    }),
  };
}

/** The step the link opens on: `?step=extras` or `?step=travellers`; anything else starts with the travellers. */
export type TripStep = 'travellers' | 'extras' | 'pay';
export function startStep(search: string): TripStep {
  const step = new URLSearchParams(search).get('step');
  return step === 'extras' || step === 'pay' ? step : 'travellers';
}
