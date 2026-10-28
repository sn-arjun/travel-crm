/**
 * Accept and book on the shared quote page (R155, design 4.6, 5.5 and 13.3).
 *
 * A customer taps "Accept and book" on the quote link. Everything that follows happens here, in one request and in this order:
 * the quote is approved with who and when, the lead moves to won (the same events as a click on the status), the seats of a linked
 * departure are held or confirmed (the agency's confirm mode decides, design Q4), the invoice is made when the agency wants one,
 * a deposit link is made when a gateway (or the test gateway) is connected, `quote.accepted` is emitted and staff are told.
 *
 * It is idempotent. The first request claims the quote with one UPDATE that only matches while `accepted_at` is empty; any later
 * request (a double tap, a retry, a second device) finds it claimed and gets the same answer, read from what the first one wrote.
 *
 * Nothing here knows about HTTP. The public route (routes/public.ts) decides who may call it; the staff route only calls
 * `markAccepted`, which records an acceptance that came by message and does none of the booking steps.
 */

import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../../types';
import { notifications } from '../../db/tenant-schema';
import { generateId } from '../../utils/uuid';
import { logLeadActivity } from '../../utils/lead-activity-logger';
import { emitEvent } from '../automation/events';
import { resolveFeature } from '../features/resolve';
import { sha256Hex } from '../billing/gateway';
import { agencyDefaultLanguage, t, type TextLanguage } from '../../i18n';
import { DepartureError } from '../departures/common';
import { loadDepartureContext, seatsLeft, type SeatCtx } from '../departures/seat-support';
import { requestSeats } from '../departures/seats';
import { bankInstructions, bookingDeposit, createDepositLink, type BankInstructions } from '../departures/booking-invoice';
import { createInvoice, InvoiceContactNotFound, itineraryInvoiceItems } from '../domain/invoices';
import { loadInvoiceTaxContext, MarginSchemeError } from '../margin-scheme';
import { TaxConfigError } from '../tax-calculator';
import { depositAmount, loadPaymentDefaults } from '../payments/accounts';

type Row = Record<string, any>;

export const QUOTES_ACCEPT_KEY = 'quotes_accept';
/** The plan feature switch; seat holds additionally need `group_departures` and the agency's own group tours switch. */
export const QUOTE_ACCEPT_FEATURE = 'quote_acceptance';

export type InvoiceChoice = 'none' | 'proforma' | 'invoice';

export interface QuoteAcceptSettings {
  enabled: boolean;
  /** The button text; empty means the built-in (translated) "Accept and book". */
  label: string;
  requireName: boolean;
  requireTerms: boolean;
  holdSeats: boolean;
  createInvoice: InvoiceChoice;
  /** Offer a deposit link (or the bank details) once the invoice exists. Needs an invoice to pay against. */
  offerDeposit: boolean;
}

export const DEFAULT_QUOTE_ACCEPT: QuoteAcceptSettings = {
  enabled: false,
  label: '',
  requireName: true,
  requireTerms: true,
  holdSeats: true,
  createInvoice: 'none',
  offerDeposit: true,
};

export function normalizeQuoteAccept(raw: unknown): QuoteAcceptSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
  return {
    enabled: v.enabled === true,
    label: typeof v.label === 'string' ? v.label.trim().slice(0, 60) : '',
    requireName: bool(v.requireName, DEFAULT_QUOTE_ACCEPT.requireName),
    requireTerms: bool(v.requireTerms, DEFAULT_QUOTE_ACCEPT.requireTerms),
    holdSeats: bool(v.holdSeats, DEFAULT_QUOTE_ACCEPT.holdSeats),
    createInvoice: v.createInvoice === 'proforma' || v.createInvoice === 'invoice' ? v.createInvoice : 'none',
    offerDeposit: bool(v.offerDeposit, DEFAULT_QUOTE_ACCEPT.offerDeposit),
  };
}

export async function loadQuoteAccept(db: D1Database): Promise<QuoteAcceptSettings> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?1').bind(QUOTES_ACCEPT_KEY).first<{ value: string | null }>();
  if (!row?.value) return { ...DEFAULT_QUOTE_ACCEPT };
  try {
    return normalizeQuoteAccept(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_QUOTE_ACCEPT };
  }
}

// ---------------------------------------------------------------- what the page may show

export type AcceptState = 'open' | 'accepted' | 'expired' | 'full_waitlist' | 'full';

export interface SeatsAnswer {
  /** unavailable: the seats were taken between the page load and the tap; the quote is accepted, staff follow up. */
  status: 'held' | 'confirmed' | 'waitlisted' | 'unavailable';
  seats: number;
  holdExpiresAt: string | null;
  departureCode: string | null;
}

export interface PaymentAnswer {
  url: string;
  amount: number;
  currency: string;
  purpose: 'deposit' | 'balance';
}

export interface BankAnswer extends BankInstructions {
  amount: number;
  currency: string;
}

export interface AcceptAnswer {
  status: 'accepted';
  acceptedAt: string;
  name: string | null;
  seats?: SeatsAnswer;
  invoice?: { number: string; total: number; currency: string; type: string };
  payment?: PaymentAnswer;
  bank?: BankAnswer;
}

export interface AcceptBlock {
  enabled: true;
  /** The agency's language for the page (en or nl); the visitor's own choice, if any, wins on the page. */
  language: TextLanguage;
  /** null: the page uses its own translated default. */
  label: string | null;
  requireName: boolean;
  requireTerms: boolean;
  state: AcceptState;
  departure?: { startDate: string; endDate: string; seatsLeft: number | null; seatsRequested: number };
  /** Present once the quote is accepted: what the customer sees again on a later visit. */
  result?: AcceptAnswer;
}

function seatsLeftDisplay(mode: string, threshold: number, left: number): number | null {
  if (mode === 'always') return left;
  if (mode === 'below_threshold') return left <= threshold ? left : null;
  return null;
}

interface SeatPlan {
  departureId: string;
  seats: number;
}

/** The seats this acceptance would take: the linked departure, when seat holds apply to this agency and this quote. */
async function seatPlan(env: Env, tenantId: string, db: D1Database, itin: Row, settings: QuoteAcceptSettings): Promise<SeatPlan | null> {
  if (!itin.departure_id || !settings.holdSeats) return null;
  if (!(await resolveFeature(env, tenantId, 'group_departures')).enabled) return null;
  let enabled = false;
  try {
    enabled = (await loadDepartureContext(db, itin.departure_id)).settings.enabled;
  } catch (e) {
    if (e instanceof DepartureError) return null;
    throw e;
  }
  if (!enabled) return null;
  const lead = await db.prepare('SELECT pax_adults, pax_children FROM leads WHERE id = ?').bind(itin.lead_id).first<Row>();
  const party = Math.max(1, (lead?.pax_adults ?? 0) + (lead?.pax_children ?? 0));
  return { departureId: itin.departure_id, seats: itin.seats_requested ?? party };
}

/** The settings and switches that make a quote acceptable at all, or null (feature off, setting off): the page then shows no accept block. */
export async function acceptableSettings(env: Env, tenantId: string, db: D1Database): Promise<QuoteAcceptSettings | null> {
  if (!(await resolveFeature(env, tenantId, QUOTE_ACCEPT_FEATURE)).enabled) return null;
  const settings = await loadQuoteAccept(db);
  return settings.enabled ? settings : null;
}

/** open, accepted, or full (a linked departure that cannot take the party; with the waitlist on the button joins it). */
export async function acceptState(env: Env, tenantId: string, db: D1Database, itin: Row, settings: QuoteAcceptSettings): Promise<{ state: AcceptState; plan: SeatPlan | null }> {
  const plan = await seatPlan(env, tenantId, db, itin, settings);
  if (itin.accepted_at) return { state: 'accepted', plan };
  if (['rejected', 'expired'].includes(itin.status)) return { state: 'expired', plan };
  if (!plan) return { state: 'open', plan };
  const dep = await loadDepartureContext(db, plan.departureId);
  const left = await seatsLeft(db, plan.departureId, dep.row.capacity);
  const waitlist = dep.settings.waitlist.enabled;
  if (dep.row.status !== 'open') return { state: 'full', plan };
  if (plan.seats > dep.row.capacity) return { state: 'full', plan };
  if (plan.seats > left) return { state: waitlist ? 'full_waitlist' : 'full', plan };
  return { state: 'open', plan };
}

/** The accept block of GET /public/quotation/:token, or null while the feature or the setting is off. */
export async function buildAcceptBlock(env: Env, tenantId: string, db: D1Database, itin: Row): Promise<AcceptBlock | null> {
  const settings = await acceptableSettings(env, tenantId, db);
  if (!settings) return null;
  const { state, plan } = await acceptState(env, tenantId, db, itin, settings);
  const block: AcceptBlock = { enabled: true, language: await agencyDefaultLanguage(db), label: settings.label || null, requireName: settings.requireName, requireTerms: settings.requireTerms, state };
  if (plan) {
    const dep = await loadDepartureContext(db, plan.departureId);
    const left = await seatsLeft(db, plan.departureId, dep.row.capacity);
    block.departure = {
      startDate: dep.row.start_date,
      endDate: dep.row.end_date,
      seatsLeft: seatsLeftDisplay(dep.effective.showSeatsLeft, dep.settings.seatsLeftThreshold, left),
      seatsRequested: plan.seats,
    };
  }
  if (itin.accepted_at) block.result = await describeAcceptance(db, itin);
  return block;
}

// ---------------------------------------------------------------- the answer, read back from what was written

/** The money step of an answer: the open payment link of the invoice if it has one, else the bank details. Never creates a link. */
async function existingPayment(db: D1Database, invoice: Row): Promise<{ payment?: PaymentAnswer; bank?: BankAnswer }> {
  const currency = String(invoice.currency).toUpperCase();
  if (invoice.payment_link_url && invoice.payment_link_status === 'created') {
    return {
      payment: { url: invoice.payment_link_url, amount: invoice.payment_link_amount ?? invoice.balance_due, currency, purpose: invoice.payment_link_purpose === 'balance' ? 'balance' : 'deposit' },
    };
  }
  if (!(invoice.balance_due > 0.005) || ['void', 'cancelled', 'paid'].includes(invoice.status)) return {};
  const bank = await bankInstructions(db, invoice.invoice_number);
  return bank ? { bank: { ...bank, amount: invoice.balance_due, currency } } : {};
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What an accepted quote answers: the same body the first request got (the payment link is the one stored on the invoice). */
export async function describeAcceptance(db: D1Database, itin: Row): Promise<AcceptAnswer> {
  const answer: AcceptAnswer = { status: 'accepted', acceptedAt: itin.accepted_at, name: itin.accepted_name ?? null };
  if (itin.departure_id) {
    const b = await db
      .prepare(
        `SELECT sb.status, sb.seats, sb.hold_expires_at, d.code FROM seat_bookings sb JOIN departures d ON d.id = sb.departure_id
         WHERE sb.lead_id = ? AND sb.departure_id = ? AND sb.status IN ('held', 'confirmed', 'waitlisted') ORDER BY sb.created_at DESC LIMIT 1`,
      )
      .bind(itin.lead_id, itin.departure_id)
      .first<Row>();
    if (b) answer.seats = { status: b.status, seats: b.seats, holdExpiresAt: b.hold_expires_at ?? null, departureCode: b.code };
  }
  if (itin.accepted_invoice_id) {
    const inv = await db
      .prepare('SELECT id, invoice_number, type, total, balance_due, paid_amount, currency, status, payment_link_url, payment_link_status, payment_link_amount, payment_link_purpose FROM invoices WHERE id = ?')
      .bind(itin.accepted_invoice_id)
      .first<Row>();
    if (inv) {
      answer.invoice = { number: inv.invoice_number, total: inv.total, currency: String(inv.currency).toUpperCase(), type: inv.type };
      Object.assign(answer, await existingPayment(db, inv));
    }
  }
  return answer;
}

// ---------------------------------------------------------------- accepting

export interface AcceptCtx {
  env: Env;
  tenantId: string;
  db: D1Database;
  waiter?: { waitUntil(promise: Promise<unknown>): void };
  /** The visitor's IP; only its salted hash is stored. */
  ip: string;
  /** Public base URL of this API, for payment links of the test gateway. */
  apiBase: string;
}

export class AcceptError extends Error {
  constructor(public status: 400 | 404 | 409 | 410, public code: string, message: string) {
    super(message);
  }
}

export interface AcceptInput {
  name?: string | null;
  termsAccepted?: boolean;
}

/** The lead moves to won through the same writes and events as a status change in the app (actor: nobody, source: the accepted quote). */
async function moveLeadToWon(ctx: Pick<AcceptCtx, 'env' | 'tenantId' | 'db' | 'waiter'>, lead: Row, content: string, source: string): Promise<boolean> {
  if (['won', 'booking_confirmed', 'completed'].includes(lead.status)) return false;
  const res = await ctx.db
    .prepare(`UPDATE leads SET status = 'won', updated_at = ? WHERE id = ? AND status = ?`)
    .bind(new Date().toISOString(), lead.id, lead.status)
    .run();
  if ((res.meta?.changes ?? 0) === 0) return false;
  await logLeadActivity(drizzle(ctx.db), {
    leadId: lead.id, type: 'status_change', content, metadata: { old_status: lead.status, new_status: 'won', source }, userId: null,
  });
  await emitEvent(ctx.env, ctx.tenantId, ctx.db, { type: 'lead.status_changed', entityType: 'lead', entityId: lead.id, payload: { from: lead.status, to: 'won', source }, actorId: null }, ctx.waiter);
  return true;
}

async function notifyStaff(db: D1Database, lead: Row, itin: Row, lang: TextLanguage, name: string): Promise<void> {
  const to = lead.assigned_to ?? lead.created_by;
  if (!to) return;
  try {
    await drizzle(db).insert(notifications).values({
      id: generateId(),
      userId: to,
      title: t(lang, 'quotes.accept.notifyTitle'),
      message: t(lang, 'quotes.accept.notifyBody', { name, title: itin.title }),
      type: 'quote_accepted',
      referenceType: 'lead',
      referenceId: lead.id,
    });
  } catch (err) {
    console.error('[quote-accept] notification failed', err);
  }
}

/** The invoice the agency asked for, from the quote lines. A tax or margin set-up problem leaves the acceptance in place without an invoice. */
async function makeInvoice(ctx: AcceptCtx, itin: Row, lead: Row, choice: Exclude<InvoiceChoice, 'none'>): Promise<{ id: string } | null> {
  const { env, tenantId, db, waiter } = ctx;
  const { regime } = await loadInvoiceTaxContext(env, tenantId, db, { origin: 'itinerary' });
  const items = await itineraryInvoiceItems(db, itin.id, regime);
  if (items.length === 0) return null;
  try {
    const made = await createInvoice(
      env, tenantId, db,
      {
        contactId: lead.contact_id,
        leadId: lead.id,
        type: choice === 'proforma' ? 'proforma' : 'tax_invoice',
        items,
        currency: itin.currency || undefined,
        origin: 'itinerary',
        itineraryId: itin.id,
        notes: JSON.stringify({ generatedFromItinerary: itin.id, acceptedOnline: true }),
      },
      { userId: null, waiter },
    );
    return { id: made.id };
  } catch (e) {
    if (e instanceof TaxConfigError || e instanceof MarginSchemeError || e instanceof InvoiceContactNotFound) {
      console.error('[quote-accept] invoice not created:', e.message);
      return null;
    }
    throw e;
  }
}

/** A deposit link for the invoice (or its balance when the agency has set no deposit), or null: the caller falls back to the bank details. */
async function offerPayment(ctx: AcceptCtx, invoice: Row, depositSeats: { deposit: { type: string; value: number | null }; seats: number } | null, contact: Row | null): Promise<{ payment?: PaymentAnswer; bank?: BankAnswer }> {
  const { env, tenantId, db } = ctx;
  const balance = round2(invoice.balance_due ?? invoice.total);
  if (!(balance > 0.005)) return {};
  let amount: number | null = depositSeats ? bookingDeposit(depositSeats.deposit, depositSeats.seats, invoice.total) || null : null;
  if (!amount) amount = depositAmount(await loadPaymentDefaults(db), invoice.total, balance);
  let purpose: 'deposit' | 'balance' = 'deposit';
  if (!amount) {
    amount = balance;
    purpose = 'balance';
  }
  amount = Math.min(round2(amount), balance);
  const currency = String(invoice.currency).toUpperCase();
  const link = await createDepositLink(
    env, tenantId, db, { id: invoice.id, invoiceNumber: invoice.invoice_number, currency }, amount,
    { name: contact?.name ?? null, email: contact?.email ?? null, phone: contact?.phone ?? null }, ctx.apiBase, purpose,
  );
  if (link) return { payment: { url: link.url, amount: link.amount, currency, purpose } };
  const bank = await bankInstructions(db, invoice.invoice_number);
  return bank ? { bank: { ...bank, amount, currency } } : {};
}

/**
 * Accepts a quote. The caller has resolved the link and checked that the feature and the setting are on (`settings`).
 * Throws AcceptError: 400 NAME_REQUIRED / TERMS_REQUIRED, 409 NOT_ACCEPTABLE (rejected or expired quote), 409 DEPARTURE_FULL.
 */
export async function acceptQuote(ctx: AcceptCtx, itinId: string, settings: QuoteAcceptSettings, input: AcceptInput): Promise<AcceptAnswer> {
  const { env, tenantId, db, waiter } = ctx;
  const itin = await db.prepare('SELECT * FROM itineraries WHERE id = ? AND COALESCE(is_deleted, 0) = 0').bind(itinId).first<Row>();
  if (!itin) throw new AcceptError(404, 'NOT_FOUND', 'Quotation not found');
  // A repeated accept (double tap, retry, another device) is answered with what the first one did.
  if (itin.accepted_at) return describeAcceptance(db, itin);

  const name = (input.name ?? '').trim().slice(0, 120);
  if (settings.requireName && !name) throw new AcceptError(400, 'NAME_REQUIRED', 'Please enter your name');
  if (settings.requireTerms && input.termsAccepted !== true) throw new AcceptError(400, 'TERMS_REQUIRED', 'Please accept the terms');

  const { state, plan } = await acceptState(env, tenantId, db, itin, settings);
  if (state === 'expired') throw new AcceptError(409, 'NOT_ACCEPTABLE', 'This quotation can no longer be accepted');
  if (state === 'full') throw new AcceptError(409, 'DEPARTURE_FULL', 'The departure is full');

  // Claim. Only one request can change accepted_at from empty; the others return the winner's answer below.
  const now = new Date().toISOString();
  const claim = await db
    .prepare(
      `UPDATE itineraries SET status = 'approved', accepted_at = ?1, accepted_via = 'share_link', accepted_name = ?2, accepted_ip_hash = ?3, updated_at = ?1
       WHERE id = ?4 AND accepted_at IS NULL`,
    )
    .bind(now, name || null, await sha256Hex(`${ctx.ip}|${tenantId}`), itinId)
    .run();
  if ((claim.meta?.changes ?? 0) === 0) {
    const fresh = await db.prepare('SELECT * FROM itineraries WHERE id = ?').bind(itinId).first<Row>();
    return describeAcceptance(db, fresh ?? itin);
  }

  const lead = await db.prepare('SELECT * FROM leads WHERE id = ? AND COALESCE(is_deleted, 0) = 0').bind(itin.lead_id).first<Row>();
  const contact = lead ? await db.prepare('SELECT name, email, phone FROM contacts WHERE id = ?').bind(lead.contact_id).first<Row>() : null;
  const lang = await agencyDefaultLanguage(db);
  const who = name || contact?.name || '-';
  const answer: AcceptAnswer = { status: 'accepted', acceptedAt: now, name: name || null };

  if (lead) {
    await moveLeadToWon(ctx, lead, t(lang, 'quotes.accept.timeline', { title: itin.title, name: who }), 'quote_accept');
    await logLeadActivity(drizzle(db), { leadId: lead.id, type: 'note', content: t(lang, 'quotes.accept.timeline', { title: itin.title, name: who }), metadata: { itineraryId: itin.id, via: 'share_link' }, userId: null });
  }

  // Seats: the confirm mode of the departure decides between held and confirmed; a full departure with a waitlist takes the party onto it.
  let bookingSeats: { deposit: { type: string; value: number | null }; seats: number } | null = null;
  if (plan && lead) {
    const seatCtx: SeatCtx = { env, tenantId, db, userId: null, waiter };
    try {
      const booking = await requestSeats(seatCtx, { departureId: plan.departureId, seats: plan.seats, leadId: lead.id, source: 'quote_accept' });
      answer.seats = { status: booking.status as SeatsAnswer['status'], seats: booking.seats, holdExpiresAt: booking.holdExpiresAt ?? null, departureCode: booking.departureCode ?? null };
    } catch (e) {
      if (!(e instanceof DepartureError)) throw e;
      // The party already has seats on this departure (staff booked them), or they went between the page load and the tap.
      const existing = await describeAcceptance(db, { ...itin, accepted_at: now });
      answer.seats = existing.seats ?? { status: 'unavailable', seats: plan.seats, holdExpiresAt: null, departureCode: null };
      if (!existing.seats) console.error('[quote-accept] seats not taken:', e.code);
    }
    if (answer.seats && answer.seats.status !== 'unavailable' && answer.seats.status !== 'waitlisted') {
      const dep = await loadDepartureContext(db, plan.departureId);
      bookingSeats = { deposit: dep.effective.deposit, seats: answer.seats.seats };
    }
  }

  // Invoice, then the deposit link (or bank details) against it.
  let invoiceId: string | null = null;
  if (settings.createInvoice !== 'none' && lead) {
    const made = await makeInvoice(ctx, itin, lead, settings.createInvoice);
    if (made) {
      invoiceId = made.id;
      await db.prepare('UPDATE itineraries SET accepted_invoice_id = ? WHERE id = ?').bind(made.id, itinId).run();
      const inv = await db
        .prepare('SELECT id, invoice_number, type, total, balance_due, paid_amount, currency, status FROM invoices WHERE id = ?')
        .bind(made.id)
        .first<Row>();
      if (inv) {
        answer.invoice = { number: inv.invoice_number, total: inv.total, currency: String(inv.currency).toUpperCase(), type: inv.type };
        if (settings.offerDeposit) Object.assign(answer, await offerPayment(ctx, inv, bookingSeats, contact));
      }
    }
  }

  await emitEvent(
    env, tenantId, db,
    {
      type: 'quote.accepted', entityType: 'itinerary', entityId: itinId,
      payload: { itineraryId: itinId, leadId: itin.lead_id, via: 'share_link', departureId: itin.departure_id ?? null, seatsStatus: answer.seats?.status ?? null, invoiceId },
      actorId: null,
    },
    waiter,
  );
  if (lead) await notifyStaff(db, lead, itin, lang, who);
  return answer;
}

// ---------------------------------------------------------------- staff: an acceptance that came by message

/**
 * Staff record that the customer accepted outside the page (a message, a call). The quote becomes approved with accepted_via staff or
 * message and the lead moves to won; seats and invoices stay with the staff, who already have those tools. Idempotent like acceptQuote:
 * an already accepted quote is left as it is and returns `changed: false`.
 */
export async function markAccepted(
  ctx: Pick<AcceptCtx, 'env' | 'tenantId' | 'db' | 'waiter'>,
  itinId: string,
  input: { via: 'staff' | 'message'; name?: string | null; userId: string },
): Promise<{ changed: boolean; acceptedAt: string | null }> {
  const { db } = ctx;
  const itin = await db.prepare('SELECT * FROM itineraries WHERE id = ? AND COALESCE(is_deleted, 0) = 0').bind(itinId).first<Row>();
  if (!itin) throw new AcceptError(404, 'NOT_FOUND', 'Itinerary not found');
  if (itin.accepted_at) return { changed: false, acceptedAt: itin.accepted_at };
  const now = new Date().toISOString();
  const claim = await db
    .prepare(`UPDATE itineraries SET status = 'approved', accepted_at = ?1, accepted_via = ?2, accepted_name = ?3, updated_at = ?1 WHERE id = ?4 AND accepted_at IS NULL`)
    .bind(now, input.via, (input.name ?? '').trim().slice(0, 120) || null, itinId)
    .run();
  if ((claim.meta?.changes ?? 0) === 0) return { changed: false, acceptedAt: itin.accepted_at };
  const lang = await agencyDefaultLanguage(db);
  const lead = await db.prepare('SELECT * FROM leads WHERE id = ? AND COALESCE(is_deleted, 0) = 0').bind(itin.lead_id).first<Row>();
  if (lead) {
    const text = t(lang, 'quotes.accept.timelineStaff', { title: itin.title, via: input.via });
    await moveLeadToWon(ctx, lead, text, 'quote_accept');
    await logLeadActivity(drizzle(db), { leadId: lead.id, type: 'note', content: text, metadata: { itineraryId: itin.id, via: input.via }, userId: input.userId });
  }
  await emitEvent(ctx.env, ctx.tenantId, db, { type: 'quote.accepted', entityType: 'itinerary', entityId: itinId, payload: { itineraryId: itinId, leadId: itin.lead_id, via: input.via }, actorId: input.userId }, ctx.waiter);
  return { changed: true, acceptedAt: now };
}
