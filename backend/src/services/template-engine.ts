import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import { contacts, leads } from '../db/tenant-schema';
import { formatMoney, loadLocaleContext } from '../utils/money';
import { getGroupToursSettings } from './departures/settings';

/** The departure a message is about (R154): the booking, and the passenger when the message is for one person. */
export interface DepartureVariableContext {
  seatBookingId: string;
  passengerId?: string | null;
}

/** Names of the variables that only a departure context fills (the template picker lists them when group departures are on). */
export const DEPARTURE_VARIABLES = [
  'tour_name', 'departure_date', 'departure_code', 'return_date', 'pickup_point', 'pickup_time', 'pickup_address',
  'seat_count', 'passenger_names', 'room_type', 'balance_due', 'extras_link', 'details_link', 'tour_leader_name', 'tour_leader_phone',
] as const;

const longDate = (iso: string | null | undefined, locale: string): string | null => {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return iso.slice(0, 10);
  }
};

/** A wall-clock 'HH:MM' in the locale's clock style (18:00 or 6:00 PM). */
const clockTime = (hhmm: string | null | undefined, locale: string): string | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return null;
  try {
    return new Date(Date.UTC(2000, 0, 1, Number(m[1]), Number(m[2]))).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  } catch {
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }
};

/**
 * The departure variables of one booking, or of one passenger on it. A value comes from the passenger, else from the booking's
 * first passenger. Dates, times and money use the agency locale. Empty when the booking is unknown.
 */
export async function resolveDepartureVariables(db: D1Database, ctx: DepartureVariableContext): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const booking = await db
    .prepare(
      `SELECT sb.id, sb.seats, sb.invoice_id, d.id AS departure_id, d.code, d.start_date, d.end_date, d.tour_leader_driver_id, d.tour_leader_user_id, t.title
       FROM seat_bookings sb JOIN departures d ON d.id = sb.departure_id JOIN tours t ON t.id = d.tour_id WHERE sb.id = ?`,
    )
    .bind(ctx.seatBookingId)
    .first<Record<string, any>>();
  if (!booking) return out;
  const locale = (await loadLocaleContext(db)).locale;
  const passengers = (
    await db
      .prepare(`SELECT id, first_name, last_name, pickup_stop_id, room_type FROM seat_passengers WHERE seat_booking_id = ? AND status = 'active' ORDER BY created_at, id`)
      .bind(ctx.seatBookingId)
      .all<Record<string, any>>()
  ).results ?? [];
  const chosen = (ctx.passengerId ? passengers.find((p) => p.id === ctx.passengerId) : null) ?? passengers[0] ?? null;
  const first = passengers[0] ?? null;

  out.tour_name = booking.title;
  out.departure_code = booking.code;
  out.departure_date = longDate(booking.start_date, locale);
  out.return_date = longDate(booking.end_date, locale);
  out.seat_count = String(booking.seats ?? passengers.length);
  out.passenger_names = passengers.map((p) => `${p.first_name} ${p.last_name}`.trim()).filter(Boolean).join(', ') || null;

  const stopId = chosen?.pickup_stop_id ?? first?.pickup_stop_id ?? null;
  const stop = stopId
    ? await db.prepare('SELECT name, address, local_time FROM departure_stops WHERE id = ? AND departure_id = ?').bind(stopId, booking.departure_id).first<Record<string, any>>()
    : null;
  out.pickup_point = stop?.name ?? null;
  out.pickup_address = stop?.address ?? null;
  out.pickup_time = clockTime(stop?.local_time, locale);

  const roomKey: string | null = chosen?.room_type ?? first?.room_type ?? null;
  if (roomKey) {
    const settings = await getGroupToursSettings(db);
    out.room_type = settings.roomTypes.find((r) => r.key === roomKey)?.label ?? roomKey;
  } else {
    out.room_type = null;
  }

  if (booking.invoice_id) {
    const inv = await db.prepare('SELECT balance_due, total, currency, status FROM invoices WHERE id = ?').bind(booking.invoice_id).first<Record<string, any>>();
    const extras = await db
      .prepare(
        `SELECT COALESCE(SUM(COALESCE(i.balance_due, i.total)), 0) AS due FROM invoices i WHERE i.status NOT IN ('paid', 'cancelled') AND i.id IN (
           SELECT DISTINCT pe.invoice_id FROM passenger_extras pe JOIN seat_passengers sp ON sp.id = pe.seat_passenger_id WHERE sp.seat_booking_id = ? AND pe.status = 'invoiced')`,
      )
      .bind(ctx.seatBookingId)
      .first<{ due: number }>();
    if (inv) {
      const own = inv.status === 'cancelled' || inv.status === 'paid' ? 0 : (inv.balance_due ?? inv.total ?? 0);
      out.balance_due = formatMoney(own + (extras?.due ?? 0), inv.currency || 'EUR', locale);
    }
  }

  let leaderName: string | null = null;
  let leaderPhone: string | null = null;
  if (booking.tour_leader_driver_id) {
    const drv = await db.prepare('SELECT name, phone FROM drivers WHERE id = ?').bind(booking.tour_leader_driver_id).first<Record<string, any>>();
    leaderName = drv?.name ?? null;
    leaderPhone = drv?.phone ?? null;
  } else if (booking.tour_leader_user_id) {
    const usr = await db.prepare('SELECT name, phone FROM users WHERE id = ?').bind(booking.tour_leader_user_id).first<Record<string, any>>();
    leaderName = usr?.name ?? null;
    leaderPhone = usr?.phone ?? null;
  }
  out.tour_leader_name = leaderName;
  out.tour_leader_phone = leaderPhone;
  return out;
}

/**
 * Substitute variables in a template string.
 * Replaces {variable_name} with corresponding values from data.
 * Missing variables are replaced with empty strings.
 */
export function substituteVariables(template: string, data: Record<string, string | null | undefined>): string {
  return template.replace(/{(\w+)}/g, (match, variable) => {
    return data[variable] ?? '';
  });
}

/**
 * Resolve all variables for a contact and optional lead.
 * Returns an object with all available variables for templating.
 */
export async function resolveVariables(
  db: D1Database,
  contactId: string,
  leadId?: string,
  tenantSettings?: Record<string, string>,
  /** Self-service addresses of a booking (R150): the staff screen supplies them, the templates use {details_link} and {extras_link}. */
  selfService?: { details_link?: string | null; extras_link?: string | null },
  /** R154: the departure the message is about; fills the departure variables (tour_name, pickup_time, ...). */
  departure?: DepartureVariableContext,
): Promise<Record<string, string | null>> {
  const drizzleDb = drizzle(db);

  const variables: Record<string, string | null> = {
    customer_name: null,
    first_name: null,
    destination: null,
    travel_date: null,
    return_date: null,
    pax_count: null,
    amount: null,
    invoice_number: null,
    agent_name: null,
    company_name: null,
    company_phone: null,
    details_link: selfService?.details_link ?? null,
    extras_link: selfService?.extras_link ?? null,
  };

  try {
    // Fetch contact details
    const contact = await drizzleDb
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1)
      .then(rows => rows[0]);

    if (contact) {
      variables.customer_name = contact.name;
      // Try to extract first name (first word)
      variables.first_name = contact.name.split(' ')[0];
      variables.company_phone = contact.phone;
    }

    // Fetch lead details if provided
    if (leadId) {
      const lead = await drizzleDb
        .select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .limit(1)
        .then(rows => rows[0]);

      if (lead) {
        variables.destination = lead.destination;
        variables.travel_date = lead.travelDate;
        variables.return_date = lead.returnDate;
        const totalPax = (lead.paxAdults || 0) + (lead.paxChildren || 0) + (lead.paxInfants || 0);
        variables.pax_count = totalPax > 0 ? totalPax.toString() : null;
        variables.amount = lead.budget ? lead.budget.toString() : null;
      }
    }

    // The departure of a seat booking (R154): its own values win over the lead's
    if (departure) {
      const dep = await resolveDepartureVariables(db, departure);
      for (const [key, value] of Object.entries(dep)) if (value !== null && value !== undefined) variables[key] = value;
    }

    // Tenant settings (company name, etc.)
    if (tenantSettings) {
      variables.company_name = tenantSettings.company_name || null;
      variables.agent_name = tenantSettings.agent_name || null;
    }
  } catch (err) {
    console.error('Error resolving variables:', err);
    // Continue with null values for any failed lookups
  }

  return variables;
}
