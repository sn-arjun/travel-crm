/**
 * Seat bookings API (R143), mounted at /seat-bookings and gated by the plan feature group_departures in index.ts.
 * Creating and listing the bookings of one departure lives in routes/departures.ts (/departures/:id/bookings).
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { ZodType } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, notFound } from '../utils/response';
import { rbac, requirePermission } from '../middleware/rbac';
import { logActivity } from '../utils/activity-logger';
import { guarded, DepartureError } from '../services/departures/common';
import { bulkConfirm, cancelBooking, changeSeats, confirmBooking, getBookingDetail, moveBooking } from '../services/departures/seats';
import { offerBooking, runWaitlistStep } from '../services/departures/waitlist';
import { replacePassengers } from '../services/departures/passengers';
import { createBookingInvoice } from '../services/departures/booking-invoice';
import { getBookingChoices, invoiceExtras, MAX_EXTRA_QUANTITY, setChoices } from '../services/departures/extras';
import { createSelfServiceLink } from '../services/departures/self-service';
import { requireFeature } from '../middleware/feature-gate';
import { revoke, revokeSelfServiceFor } from '../services/public-links';
import { announceSeats, emitCapacityEvents, loadDepartureContext, requireBookingRow, seatCtxFromRequest } from '../services/departures/seat-support';
import {
  bulkConfirmBodySchema, cancelBodySchema, changeSeatsBodySchema, confirmBodySchema, moveBodySchema, passengersBodySchema,
} from '../validators/seat-bookings';

const seatBookings = new Hono<AppContext>();

/** The body of an action that has optional parameters: no body at all is the same as `{}`. */
async function optionalBody<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const raw = await c.req.json().catch(() => ({}));
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) throw new DepartureError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid request');
  return parsed.data;
}

async function log(c: Context<AppContext>, action: string, id: string, details?: Record<string, unknown>) {
  await logActivity(c.get('tenantDb'), { userId: c.get('userId'), action, entityType: 'seat_booking', entityId: id, ...(details && { details: JSON.stringify(details) }) });
}

// Registered before /:id so "bulk-confirm" is not read as a booking id.
seatBookings.post('/bulk-confirm', requirePermission('departures', 'edit'), zValidator('json', bulkConfirmBodySchema), (c) =>
  guarded(c, async () => {
    const results = await bulkConfirm(seatCtxFromRequest(c), c.req.valid('json').ids);
    for (const r of results) if (r.ok) await log(c, 'confirm', r.id, { bulk: true });
    return success(c, { results, confirmed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
  }),
);

seatBookings.get('/:id', requirePermission('departures', 'view'), async (c) => {
  const detail = await getBookingDetail(c.get('tenantDb'), c.req.param('id'));
  return detail ? success(c, detail) : notFound(c, 'Seat booking');
});

seatBookings.post('/:id/confirm', requirePermission('departures', 'edit'), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    const { by } = await optionalBody(c, confirmBodySchema);
    await requireBookingRow(c.get('tenantDb'), id);
    const detail = await confirmBooking(seatCtxFromRequest(c), id, by);
    await log(c, 'confirm', id, by ? { by } : undefined);
    return success(c, detail);
  }),
);

seatBookings.post('/:id/cancel', requirePermission('departures', 'edit'), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    const { reason } = await optionalBody(c, cancelBodySchema);
    await requireBookingRow(c.get('tenantDb'), id);
    const detail = await cancelBooking(seatCtxFromRequest(c), id, reason);
    await log(c, 'cancel', id, { reason: reason ?? null });
    return success(c, detail);
  }),
);

// Offer the seats of a waitlisted party now (the staff click behind the "Offer N seats to X" suggestion).
seatBookings.post('/:id/offer', requirePermission('departures', 'edit'), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    await requireBookingRow(c.get('tenantDb'), id);
    await offerBooking(seatCtxFromRequest(c), id);
    await log(c, 'offer', id);
    return success(c, await getBookingDetail(c.get('tenantDb'), id));
  }),
);

seatBookings.post('/:id/move', requirePermission('departures', 'edit'), zValidator('json', moveBodySchema), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    await requireBookingRow(c.get('tenantDb'), id);
    const moved = await moveBooking(seatCtxFromRequest(c), id, c.req.valid('json').toDepartureId);
    await log(c, 'move', id, { toDepartureId: moved.departureId, newSeatBookingId: moved.id });
    return success(c, moved);
  }),
);

seatBookings.put('/:id/seats', requirePermission('departures', 'edit'), zValidator('json', changeSeatsBodySchema), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    await requireBookingRow(c.get('tenantDb'), id);
    const detail = await changeSeats(seatCtxFromRequest(c), id, c.req.valid('json').seats);
    await log(c, 'update', id, { seats: detail.seats });
    return success(c, detail);
  }),
);

seatBookings.put('/:id/passengers', requirePermission('departures', 'edit'), zValidator('json', passengersBodySchema), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    const db = c.get('tenantDb');
    const row = await requireBookingRow(db, id);
    const ctx = seatCtxFromRequest(c);
    const { passengers, createTravellers } = c.req.valid('json');
    const { seatsAdded, seatsFreed } = await replacePassengers(ctx, id, passengers, { createTravellers });
    if (seatsAdded > 0) await emitCapacityEvents(ctx, await loadDepartureContext(db, row.departure_id), seatsAdded);
    if (seatsFreed > 0) await runWaitlistStep(ctx, row.departure_id);
    await announceSeats(ctx, row.departure_id, 'seat_booking.passengers_changed');
    await log(c, 'update', id, { passengers: passengers.length });
    return success(c, await getBookingDetail(db, id));
  }),
);

// The booking's invoice (R148): made from the passengers' bands, room supplements and seat surcharge, or refreshed while still a draft.
seatBookings.post('/:id/invoice', rbac(['admin', 'sales_manager', 'accountant']), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    const db = c.get('tenantDb');
    const row = await requireBookingRow(db, id);
    const ctx = seatCtxFromRequest(c);
    const result = await createBookingInvoice(c.env, c.get('tenantId'), db, id, { userId: c.get('userId'), depth: ctx.depth, waiter: ctx.waiter });
    await log(c, 'update', id, { invoice: result.invoiceNumber, created: result.created });
    await announceSeats(ctx, row.departure_id, 'seat_booking.invoiced');
    return success(c, { ...result, booking: await getBookingDetail(db, id) });
  }),
);

// ---- the self-service link (R150): one address per booking, or per passenger, where the party adds traveller details, picks extras and pays.
// The staff screen sends it through the Communication Hub (SendMessageDialog) with a template that uses {{details_link}} / {{extras_link}}.

const selfServiceLinkSchema = z.object({ scope: z.enum(['booking', 'passenger']).default('booking'), passengerId: z.string().min(1).max(64).optional() });

seatBookings.post('/:id/self-service-link', requireFeature('public_booking'), requirePermission('departures', 'edit'), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    const db = c.get('tenantDb');
    await requireBookingRow(db, id);
    const body = await optionalBody(c, selfServiceLinkSchema);
    const link = await createSelfServiceLink(c.env, c.get('tenantId'), db, id, body.scope, body.passengerId);
    await log(c, 'update', id, { selfServiceLink: body.scope });
    return success(c, link);
  }),
);

// Stops every self-service address of the booking and of its passengers.
seatBookings.delete('/:id/self-service-link', requirePermission('departures', 'edit'), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    const db = c.get('tenantDb');
    await requireBookingRow(db, id);
    const { results } = await db.prepare('SELECT id FROM seat_passengers WHERE seat_booking_id = ?').bind(id).all<{ id: string }>();
    const stopped =
      (await revoke(c.env, 'booking_self_service', id, c.get('tenantId'))) +
      (await revokeSelfServiceFor(c.env, c.get('tenantId'), { seatBookingIds: [], passengerIds: (results ?? []).map((r) => r.id) }));
    await log(c, 'update', id, { selfServiceLink: 'stopped', stopped });
    return success(c, { stopped });
  }),
);

// ---- extras chosen for the booking's passengers (R150). Staff are not held to the cut-off.

seatBookings.get('/:id/extras', requirePermission('departures', 'view'), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    await requireBookingRow(c.get('tenantDb'), id);
    return success(c, { choices: await getBookingChoices(c.get('tenantDb'), id) });
  }),
);

const staffChoicesSchema = z.object({
  choices: z.array(z.object({ passengerId: z.string().min(1).max(64), extraId: z.string().min(1).max(64), quantity: z.number().int().min(0).max(MAX_EXTRA_QUANTITY) })).max(600),
  /** The passengers whose choices these are; the others keep theirs. Omitted: every passenger of the booking. */
  passengerIds: z.array(z.string().min(1).max(64)).max(100).optional(),
  /** Make or refresh the extras invoice afterwards (default). */
  invoice: z.boolean().optional(),
});

seatBookings.put('/:id/extras', requirePermission('departures', 'edit'), zValidator('json', staffChoicesSchema), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    const db = c.get('tenantDb');
    await requireBookingRow(db, id);
    const body = c.req.valid('json');
    const result = await setChoices(db, id, body.choices, { via: 'staff', enforceCutoff: false, passengerIds: body.passengerIds });
    const ctx = seatCtxFromRequest(c);
    const invoice = body.invoice === false ? null : await invoiceExtras(c.env, c.get('tenantId'), db, id, { userId: c.get('userId'), depth: ctx.depth, waiter: ctx.waiter });
    await log(c, 'update', id, { extras: result.changed });
    return success(c, { ...result, invoice, choices: await getBookingChoices(db, id) });
  }),
);

// The extras invoice (one per booking, refreshed while nothing is paid on it).
seatBookings.post('/:id/extras-invoice', rbac(['admin', 'sales_manager', 'accountant']), (c) =>
  guarded(c, async () => {
    const id = c.req.param('id');
    const db = c.get('tenantDb');
    await requireBookingRow(db, id);
    const ctx = seatCtxFromRequest(c);
    const invoice = await invoiceExtras(c.env, c.get('tenantId'), db, id, { userId: c.get('userId'), depth: ctx.depth, waiter: ctx.waiter });
    if (invoice) await log(c, 'update', id, { extrasInvoice: invoice.invoiceNumber, created: invoice.created });
    return success(c, { invoice, choices: await getBookingChoices(db, id) });
  }),
);

export default seatBookings;
