/**
 * Departures API (R139), mounted at /departures and gated by the plan feature group_departures in index.ts.
 * Seat bookings, the manifest and departure messages are added by later batches under the same mount.
 */

import { Hono } from 'hono';
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
import {
  bulkDepartureSchema, costsBodySchema, createDepartureSchema, departureListSchema, departureStatusBodySchema, groupToursSettingsSchema,
  pricesBodySchema, stopsBodySchema, updateDepartureSchema, vehiclesBodySchema,
} from '../validators/departures';

const departures = new Hono<AppContext>();

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
    if (!(await updateDeparture(db, id, c.req.valid('json'), c.get('userId')))) return notFound(c, 'Departure');
    await logActivity(db, { userId: c.get('userId'), action: 'update', entityType: 'departure', entityId: id });
    return success(c, await getDepartureDetail(db, id));
  }),
);

departures.post('/:id/status', requirePermission('departures', 'edit'), zValidator('json', departureStatusBodySchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    const { status, reason } = c.req.valid('json');
    const updated = await changeDepartureStatus(db, id, status, reason, c.get('userId'));
    if (!updated) return notFound(c, 'Departure');
    await logActivity(db, { userId: c.get('userId'), action: 'status_change', entityType: 'departure', entityId: id, details: JSON.stringify({ status, reason }) });
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
    if (!(await getDepartureRow(db, id))) return notFound(c, 'Departure');
    await replaceVehicles(db, id, c.req.valid('json').vehicles, c.get('userId'));
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

export default departures;
