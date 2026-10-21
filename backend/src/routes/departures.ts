/**
 * Departures API (R139), mounted at /departures and gated by the plan feature group_departures in index.ts.
 * Seat bookings of one departure are here (R143, /:id/bookings); the others are under /seat-bookings. The manifest and departure
 * messages are added by later batches under the same mount.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, created, notFound } from '../utils/response';
import { rbac, requirePermission } from '../middleware/rbac';
import { logActivity } from '../utils/activity-logger';
import { guarded } from '../services/departures/common';
import {
  changeDepartureStatus, createDeparture, createDeparturesBulk, deleteDeparture, getCosts, getDepartureDetail, getDeparturePrices,
  getDepartureRow, getDepartureStops, getVehicles, listDepartures, replaceCosts, replaceDepartureStops, replaceDeparturePrices,
  replaceVehicles, updateDeparture,
} from '../services/departures/departures';
import { getGroupToursSettings, putGroupToursSettings } from '../services/departures/settings';
import { emit, seatCtxFromRequest } from '../services/departures/seat-support';
import { getBookingDetail, listBookings, requestSeats } from '../services/departures/seats';
import { runWaitlistStep } from '../services/departures/waitlist';
import {
  bulkDepartureSchema, costsBodySchema, createDepartureSchema, departureListSchema, departureStatusBodySchema, groupToursSettingsSchema,
  pricesBodySchema, stopsBodySchema, updateDepartureSchema, vehiclesBodySchema,
} from '../validators/departures';
import { bookingListSchema, requestSeatsBodySchema } from '../validators/seat-bookings';

const departures = new Hono<AppContext>();

/** More seats than before: tell the automations and let the waitlist have the new seats. */
async function afterCapacityChange(c: Context<AppContext>, id: string, before: number | undefined): Promise<void> {
  const after = (await getDepartureRow(c.get('tenantDb'), id))?.capacity;
  if (before === undefined || after === undefined || after <= before) return;
  const ctx = seatCtxFromRequest(c);
  await emit(ctx, 'departure.capacity_changed', 'departure', id, { departureId: id, from: before, to: after });
  await runWaitlistStep(ctx, id);
}

// ---- agency settings (group_tours): registered before /:id so "settings" is not read as a departure id

departures.get('/settings', requirePermission('departures', 'view'), async (c) => success(c, await getGroupToursSettings(c.get('tenantDb'))));

departures.put('/settings', rbac(['admin']), zValidator('json', groupToursSettingsSchema), async (c) => {
  const db = c.get('tenantDb');
  const saved = await putGroupToursSettings(db, c.req.valid('json'), c.get('userId'));
  await logActivity(db, { userId: c.get('userId'), action: 'update', entityType: 'setting', details: JSON.stringify({ key: 'group_tours' }) });
  return success(c, saved);
});

// ---- list, create, bulk

departures.get('/', requirePermission('departures', 'view'), zValidator('query', departureListSchema), async (c) => {
  const filters = c.req.valid('query');
  const { items, total, hasMore, nextCursor } = await listDepartures(c.get('tenantDb'), filters);
  return c.json({ success: true, data: items, pagination: { total, limit: filters.limit, hasMore, nextCursor } });
});

departures.post('/', requirePermission('departures', 'create'), zValidator('json', createDepartureSchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = await createDeparture(db, c.req.valid('json'), c.get('userId'));
    await logActivity(db, { userId: c.get('userId'), action: 'create', entityType: 'departure', entityId: id });
    return created(c, await getDepartureDetail(db, id));
  }),
);

departures.post('/bulk', requirePermission('departures', 'create'), zValidator('json', bulkDepartureSchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const { code: _ignored, ...input } = c.req.valid('json');
    const result = await createDeparturesBulk(db, input, c.get('userId'));
    for (const id of result.created) await logActivity(db, { userId: c.get('userId'), action: 'create', entityType: 'departure', entityId: id });
    const items = [];
    for (const id of result.created) items.push(await getDepartureDetail(db, id));
    return created(c, { created: items, skipped: result.skipped });
  }),
);

// ---- one departure

departures.get('/:id', requirePermission('departures', 'view'), async (c) => {
  const detail = await getDepartureDetail(c.get('tenantDb'), c.req.param('id'));
  return detail ? success(c, detail) : notFound(c, 'Departure');
});

departures.put('/:id', requirePermission('departures', 'edit'), zValidator('json', updateDepartureSchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const before = await getDepartureRow(db, id);
    if (!(await updateDeparture(db, id, c.req.valid('json'), c.get('userId')))) return notFound(c, 'Departure');
    await logActivity(db, { userId: c.get('userId'), action: 'update', entityType: 'departure', entityId: id });
    await afterCapacityChange(c, id, before?.capacity);
    return success(c, await getDepartureDetail(db, id));
  }),
);

departures.post('/:id/status', requirePermission('departures', 'edit'), zValidator('json', departureStatusBodySchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const { status, reason } = c.req.valid('json');
    const from = (await getDepartureRow(db, id))?.status;
    const updated = await changeDepartureStatus(db, id, status, reason, c.get('userId'));
    if (!updated) return notFound(c, 'Departure');
    await logActivity(db, { userId: c.get('userId'), action: 'status_change', entityType: 'departure', entityId: id, details: JSON.stringify({ status, reason }) });
    await emit(seatCtxFromRequest(c), 'departure.status_changed', 'departure', id, { departureId: id, from, to: status, ...(reason && { reason }) });
    return success(c, await getDepartureDetail(db, id));
  }),
);

departures.delete('/:id', requirePermission('departures', 'delete'), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    if (!(await deleteDeparture(db, id))) return notFound(c, 'Departure');
    await logActivity(db, { userId: c.get('userId'), action: 'delete', entityType: 'departure', entityId: id });
    return success(c, { id, deleted: true });
  }),
);

// ---- coaches

departures.get('/:id/vehicles', requirePermission('departures', 'view'), async (c) => {
  const db = c.get('tenantDb');
  if (!(await getDepartureRow(db, c.req.param('id')))) return notFound(c, 'Departure');
  return success(c, await getVehicles(db, c.req.param('id')));
});

departures.put('/:id/vehicles', requirePermission('departures', 'edit'), zValidator('json', vehiclesBodySchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const before = await getDepartureRow(db, id);
    if (!before) return notFound(c, 'Departure');
    await replaceVehicles(db, id, c.req.valid('json').vehicles, c.get('userId'));
    await afterCapacityChange(c, id, before.capacity);
    return success(c, await getDepartureDetail(db, id));
  }),
);

// ---- stops

departures.get('/:id/stops', requirePermission('departures', 'view'), async (c) => {
  const db = c.get('tenantDb');
  if (!(await getDepartureRow(db, c.req.param('id')))) return notFound(c, 'Departure');
  return success(c, await getDepartureStops(db, c.req.param('id')));
});

departures.put('/:id/stops', requirePermission('departures', 'edit'), zValidator('json', stopsBodySchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    if (!(await getDepartureRow(db, id))) return notFound(c, 'Departure');
    await replaceDepartureStops(db, id, c.req.valid('json').stops);
    return success(c, await getDepartureStops(db, id));
  }),
);

// ---- prices: the tour's rows with this departure's overrides applied; PUT replaces the overrides

departures.get('/:id/prices', requirePermission('departures', 'view'), async (c) => {
  const prices = await getDeparturePrices(c.get('tenantDb'), c.req.param('id'));
  return prices ? success(c, prices) : notFound(c, 'Departure');
});

departures.put('/:id/prices', requirePermission('departures', 'edit'), zValidator('json', pricesBodySchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    if (!(await getDepartureRow(db, id))) return notFound(c, 'Departure');
    await replaceDeparturePrices(db, id, c.req.valid('json').prices);
    return success(c, await getDeparturePrices(db, id));
  }),
);

// ---- costs

departures.get('/:id/costs', requirePermission('departures', 'view'), async (c) => {
  const db = c.get('tenantDb');
  if (!(await getDepartureRow(db, c.req.param('id')))) return notFound(c, 'Departure');
  return success(c, await getCosts(db, c.req.param('id')));
});

departures.put('/:id/costs', requirePermission('departures', 'edit'), zValidator('json', costsBodySchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    await replaceCosts(db, id, c.req.valid('json').costs, c.get('userId'));
    return success(c, await getCosts(db, id));
  }),
);

// ---- seat bookings of one departure (R143)

departures.get('/:id/bookings', requirePermission('departures', 'view'), zValidator('query', bookingListSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  if (!(await getDepartureRow(db, id))) return notFound(c, 'Departure');
  const filters = c.req.valid('query');
  const { items, total, hasMore, nextCursor } = await listBookings(db, id, filters);
  return c.json({ success: true, data: items, pagination: { total, limit: filters.limit, hasMore, nextCursor } });
});

departures.post('/:id/bookings', requirePermission('departures', 'create'), zValidator('json', requestSeatsBodySchema), (c) =>
  guarded(c, async () => {
    const { hold: _hold, ...body } = c.req.valid('json');
    const booking = await requestSeats(seatCtxFromRequest(c), { ...body, departureId: c.req.param('id'), source: 'staff' });
    await logActivity(c.get('tenantDb'), { userId: c.get('userId'), action: 'create', entityType: 'seat_booking', entityId: booking.id, details: JSON.stringify({ status: booking.status, seats: booking.seats }) });
    return created(c, booking);
  }),
);

export default departures;
