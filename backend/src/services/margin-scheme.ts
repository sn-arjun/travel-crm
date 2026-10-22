/**
 * Margin-scheme invoices (R152, design 4.5 and 12).
 *
 * An agency that sells packages under the travel agents' margin scheme issues invoices with the VAT included in the price and
 * not shown, plus a legal mention. Nothing here is tax advice: the wording is the agency's own (presets are only offered by the
 * desktop app, never applied silently), the VAT rate is whatever the agency entered (none is ever assumed), and the cost of the
 * sold services is what the agency recorded in TravelCRM.
 *
 * This file holds the agency setting (`margin_scheme`), the decision which regime a new invoice starts in, and the cost of an
 * invoice (design 12): departure costs for a seat booking, else the itinerary cost, else a figure typed on the invoice.
 */

import type { Env } from '../types';
import { resolveFeature } from './features/resolve';
import {
  loadTaxSettings, vatOnMarginMinor, type MarginInput, type TaxRegime, type TaxSellerInput,
} from './tax-calculator';

export const MARGIN_SCHEME_KEY = 'margin_scheme';
export const MARGIN_FEATURE = 'margin_scheme';

export type MarginDefaultFor = 'none' | 'tour_bookings' | 'all_invoices';
export type MarginCostSetting = 'auto' | 'manual';
export type MarginCostSource = 'departure' | 'itinerary' | 'manual';

export interface MarginSchemeSettings {
  enabled: boolean;
  defaultFor: MarginDefaultFor;
  wording: string;
  /** Percent; null until the agency enters its own rate. */
  vatRate: number | null;
  costSource: MarginCostSetting;
}

export const DEFAULT_MARGIN_SCHEME: MarginSchemeSettings = {
  enabled: false,
  defaultFor: 'none',
  wording: '',
  vatRate: null,
  costSource: 'auto',
};

/** Thrown when an invoice asks for the margin scheme and the agency has not switched it on. The routes answer 400. */
export class MarginSchemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarginSchemeError';
  }
}

type D1Like = { prepare(sql: string): any };

/** Settings as stored (or sent): anything unusable falls back to the default, so a damaged value never breaks an invoice. */
export function normalizeMarginScheme(raw: unknown): MarginSchemeSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rate = typeof v.vatRate === 'number' && Number.isFinite(v.vatRate) && v.vatRate >= 0 && v.vatRate <= 100 ? v.vatRate : null;
  return {
    enabled: v.enabled === true,
    defaultFor: v.defaultFor === 'tour_bookings' || v.defaultFor === 'all_invoices' ? v.defaultFor : 'none',
    wording: typeof v.wording === 'string' ? v.wording.trim().slice(0, 500) : '',
    vatRate: rate,
    costSource: v.costSource === 'manual' ? 'manual' : 'auto',
  };
}

export async function loadMarginScheme(db: D1Like): Promise<MarginSchemeSettings> {
  const row = (await db.prepare('SELECT value FROM settings WHERE key = ?1').bind(MARGIN_SCHEME_KEY).first()) as { value: string | null } | null;
  if (!row?.value) return { ...DEFAULT_MARGIN_SCHEME };
  try {
    return normalizeMarginScheme(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_MARGIN_SCHEME };
  }
}

/** VAT contained in a margin, in currency units: margin x rate / (100 + rate), rounded half-up to the minor unit. */
export function vatOnMargin(margin: number, rate: number): number {
  return vatOnMarginMinor(Math.round(Number((margin * 100).toPrecision(12))), rate) / 100;
}

/** Margin of an invoice: the price less the cost, in currency units; null while the cost is not recorded. */
export function marginOf(price: number, cost: number | null | undefined): number | null {
  if (cost === null || cost === undefined) return null;
  return Math.round(Number(((price - cost) * 100).toPrecision(12))) / 100;
}

/** True when the feature is on for the agency and the agency switched the scheme on in its settings. */
export async function marginSchemeAllowed(env: Env, tenantId: string, scheme: MarginSchemeSettings): Promise<boolean> {
  if (!scheme.enabled) return false;
  return (await resolveFeature(env, tenantId, MARGIN_FEATURE)).enabled;
}

/** Where an invoice comes from; it decides whether `defaultFor` starts it in margin mode. */
export type InvoiceOrigin = 'booking' | 'extras' | 'itinerary' | 'trip' | 'manual';

export interface InvoiceTaxContext {
  regime: TaxRegime;
  seller: TaxSellerInput;
  scheme: MarginSchemeSettings;
  /** Present when regime is 'margin'. */
  margin: MarginInput | null;
}

/**
 * The regime a new invoice starts in. `request` is what the person chose on the invoice: 'margin' (refused unless the scheme is on)
 * or 'standard' (the agency's ordinary regime). Without it the agency's settings decide: tax system "margin", or `defaultFor`.
 * The cost is filled in by the caller (see resolveMarginCost).
 */
export async function loadInvoiceTaxContext(
  env: Env,
  tenantId: string,
  db: D1Like,
  opts: { origin: InvoiceOrigin; request?: 'margin' | 'standard' | null },
): Promise<InvoiceTaxContext> {
  const { regime: ordinary, marginDefault, seller } = await loadTaxSettings(db);
  const scheme = await loadMarginScheme(db);
  const allowed = await marginSchemeAllowed(env, tenantId, scheme);

  if (opts.request === 'margin' && !allowed) {
    throw new MarginSchemeError('The margin scheme is not switched on. Turn it on under Settings > Invoice defaults.');
  }
  let wantMargin: boolean;
  if (opts.request) wantMargin = opts.request === 'margin';
  else if (!allowed) wantMargin = false;
  else if (marginDefault || scheme.defaultFor === 'all_invoices') wantMargin = true;
  else wantMargin = scheme.defaultFor === 'tour_bookings' && (opts.origin === 'booking' || opts.origin === 'extras');

  if (!wantMargin) return { regime: ordinary, seller, scheme, margin: null };
  return { regime: 'margin', seller, scheme, margin: { wording: scheme.wording || null, cost: null, vatRate: scheme.vatRate } };
}

// ---------------------------------------------------------------- cost of an invoice

export interface MarginCost {
  cost: number | null;
  source: MarginCostSource | null;
}

const money = (n: number) => Math.round(Number((n * 100).toPrecision(12)));

/**
 * Departure costs of a seat booking (design 12): per-seat costs x the booking's seats, plus per-departure costs divided by the
 * seats confirmed on the departure when the invoice is made (a held booking counts with its own seats). Null when the departure
 * has no costs, or when a cost is in another currency than the invoice (no rate is assumed).
 */
export async function departureCostForBooking(db: D1Like, seatBookingId: string, currency: string): Promise<number | null> {
  const booking = (await db
    .prepare('SELECT departure_id, seats, status FROM seat_bookings WHERE id = ?1')
    .bind(seatBookingId)
    .first()) as { departure_id: string; seats: number; status: string } | null;
  if (!booking) return null;
  const costs = ((await db
    .prepare('SELECT kind, amount, currency FROM departure_costs WHERE departure_id = ?1')
    .bind(booking.departure_id)
    .all()) as { results?: Array<{ kind: string; amount: number; currency: string | null }> }).results ?? [];
  if (costs.length === 0) return null;
  if (costs.some((c) => c.currency && c.currency.toUpperCase() !== currency.toUpperCase())) return null;

  const confirmed = (await db
    .prepare(`SELECT COALESCE(SUM(seats), 0) AS n FROM seat_bookings WHERE departure_id = ?1 AND status = 'confirmed'`)
    .bind(booking.departure_id)
    .first()) as { n: number } | null;
  const seatsSharing = Math.max(1, (confirmed?.n ?? 0) + (booking.status === 'held' ? booking.seats : 0));
  const seats = Math.max(1, booking.seats);

  let minor = 0;
  for (const c of costs) {
    if (c.kind === 'per_seat') minor += money(c.amount * seats);
    else minor += Math.round(money(c.amount) / seatsSharing);
  }
  return minor / 100;
}

/** The linked itinerary's total cost; null when the itinerary is missing, has no cost, or is in another currency. */
export async function itineraryCost(db: D1Like, itineraryId: string, currency: string): Promise<number | null> {
  const row = (await db
    .prepare('SELECT total_cost, currency FROM itineraries WHERE id = ?1')
    .bind(itineraryId)
    .first()) as { total_cost: number | null; currency: string | null } | null;
  if (!row || !(Number(row.total_cost) > 0)) return null;
  if (row.currency && row.currency.toUpperCase() !== currency.toUpperCase()) return null;
  return money(Number(row.total_cost)) / 100;
}

/**
 * The cost to snapshot on a margin invoice. A figure typed on the invoice always wins and is a manual cost. Otherwise, with the
 * cost source "auto", a seat booking uses its departure costs, else its itinerary's cost; an invoice made from an itinerary uses that
 * itinerary's cost; anything else (or the "manual" setting) records no cost until a person types one.
 */
export async function resolveMarginCost(
  db: D1Like,
  input: {
    scheme: MarginSchemeSettings;
    currency: string;
    manualCost?: number | null;
    seatBookingId?: string | null;
    itineraryId?: string | null;
  },
): Promise<MarginCost> {
  if (input.manualCost !== undefined && input.manualCost !== null) return { cost: money(input.manualCost) / 100, source: 'manual' };
  if (input.scheme.costSource === 'manual') return { cost: null, source: 'manual' };
  if (input.seatBookingId) {
    const fromDeparture = await departureCostForBooking(db, input.seatBookingId, input.currency);
    if (fromDeparture !== null) return { cost: fromDeparture, source: 'departure' };
    const booking = (await db.prepare('SELECT itinerary_id FROM seat_bookings WHERE id = ?1').bind(input.seatBookingId).first()) as { itinerary_id: string | null } | null;
    if (booking?.itinerary_id) {
      const fromItinerary = await itineraryCost(db, booking.itinerary_id, input.currency);
      if (fromItinerary !== null) return { cost: fromItinerary, source: 'itinerary' };
    }
  }
  if (input.itineraryId) {
    const fromItinerary = await itineraryCost(db, input.itineraryId, input.currency);
    if (fromItinerary !== null) return { cost: fromItinerary, source: 'itinerary' };
  }
  return { cost: null, source: 'manual' };
}

/** The booking an invoice belongs to (seat bookings point at their invoice), for refreshing the cost of a draft. */
export async function bookingOfInvoice(db: D1Like, invoiceId: string): Promise<string | null> {
  const row = (await db.prepare('SELECT id FROM seat_bookings WHERE invoice_id = ?1').bind(invoiceId).first()) as { id: string } | null;
  return row?.id ?? null;
}

// ---------------------------------------------------------------- what staff without finance rights may see

/** Columns and breakdown entries that reveal the agency's cost and margin. */
export function stripMarginFigures<T extends Record<string, unknown>>(row: T): T {
  const copy: Record<string, unknown> = { ...row };
  for (const key of ['margin_cost', 'margin_cost_source', 'margin_vat_rate']) {
    if (key in copy) copy[key] = null;
  }
  if (typeof copy.tax_breakdown === 'string') {
    try {
      const parsed = JSON.parse(copy.tax_breakdown);
      if (Array.isArray(parsed)) copy.tax_breakdown = JSON.stringify(parsed.filter((e) => !(e && e.hidden)));
    } catch { /* leave as is */ }
  }
  return copy as T;
}

/** The four margin columns of an invoice; all null for an invoice that is not under the margin scheme. */
export function marginColumns(
  regime: TaxRegime,
  margin: MarginInput | null,
  cost: MarginCost | null,
): { margin_cost: number | null; margin_cost_source: string | null; margin_vat_rate: number | null; margin_wording: string | null } {
  if (regime !== 'margin' || !margin) return { margin_cost: null, margin_cost_source: null, margin_vat_rate: null, margin_wording: null };
  return {
    margin_cost: cost?.cost ?? null,
    margin_cost_source: cost?.source ?? null,
    margin_vat_rate: margin.vatRate,
    margin_wording: margin.wording,
  };
}
