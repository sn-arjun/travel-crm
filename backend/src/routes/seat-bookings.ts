/**
 * Seat bookings API (R143), mounted at /seat-bookings and gated by the plan feature group_departures in index.ts.
 * Creating and listing the bookings of one departure lives in routes/departures.ts (/departures/:id/bookings).
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ZodType } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, notFound } from '../utils/response';
import { requirePermission } from '../middleware/rbac';
import { logActivity } from '../utils/activity-logger';
import { guarded, DepartureError } from '../services/departures/common';
import { bulkConfirm, cancelBooking, changeSeats, confirmBooking, getBookingDetail, moveBooking } from '../services/departures/seats';
import { offerBooking, runWaitlistStep } from '../services/departures/waitlist';
import { replacePassengers } from '../services/departures/passengers';
import { emitCapacityEvents, loadDepartureContext, requireBookingRow, seatCtxFromRequest } from '../services/departures/seat-support';
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
    await log(c, 'update', id, { passengers: passengers.length });
    return success(c, await getBookingDetail(db, id));
  }),
);

export default seatBookings;
