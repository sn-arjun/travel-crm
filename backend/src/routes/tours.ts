/**
 * Tours API (R139), mounted at /tours and gated by the plan feature group_departures in index.ts.
 * A tour is the product: its default stops, prices (age band, room supplement, seat surcharge) and extras catalogue.
 */

import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, created, notFound } from '../utils/response';
import { requirePermission } from '../middleware/rbac';
import { logActivity } from '../utils/activity-logger';
import { guarded } from '../services/departures/common';
import {
  createTour, getTourDetail, getTourExtras, getTourPrices, getTourRow, getTourStops, listTours, removeTour, replacePrices,
  replaceStops, replaceTourExtras, updateTour,
} from '../services/departures/tours';
import {
  createTourSchema, extrasBodySchema, pricesBodySchema, stopsBodySchema, tourListSchema, updateTourSchema,
} from '../validators/departures';

const tours = new Hono<AppContext>();

tours.get('/', requirePermission('departures', 'view'), zValidator('query', tourListSchema), async (c) => {
  const { items, total, hasMore, nextCursor } = await listTours(c.get('tenantDb'), c.req.valid('query'));
  return c.json({ success: true, data: items, pagination: { total, limit: c.req.valid('query').limit, hasMore, nextCursor } });
});

tours.post('/', requirePermission('departures', 'create'), zValidator('json', createTourSchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = await createTour(db, c.req.valid('json'), c.get('userId'));
    await logActivity(db, { userId: c.get('userId'), action: 'create', entityType: 'tour', entityId: id });
    return created(c, await getTourDetail(db, id));
  }),
);

tours.get('/:id', requirePermission('departures', 'view'), async (c) => {
  const detail = await getTourDetail(c.get('tenantDb'), c.req.param('id'));
  return detail ? success(c, detail) : notFound(c, 'Tour');
});

tours.put('/:id', requirePermission('departures', 'edit'), zValidator('json', updateTourSchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    if (!(await updateTour(db, id, c.req.valid('json')))) return notFound(c, 'Tour');
    await logActivity(db, { userId: c.get('userId'), action: 'update', entityType: 'tour', entityId: id });
    return success(c, await getTourDetail(db, id));
  }),
);

// A tour that ever had a departure is archived (its history stays); one that never had one is deleted.
tours.delete('/:id', requirePermission('departures', 'delete'), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const result = await removeTour(db, id);
  if (!result) return notFound(c, 'Tour');
  await logActivity(db, { userId: c.get('userId'), action: result.archived ? 'archive' : 'delete', entityType: 'tour', entityId: id });
  return success(c, { id, archived: result.archived, deleted: !result.archived });
});

// ---- default stops

tours.get('/:id/stops', requirePermission('departures', 'view'), async (c) => {
  const db = c.get('tenantDb');
  if (!(await getTourRow(db, c.req.param('id')))) return notFound(c, 'Tour');
  return success(c, await getTourStops(db, c.req.param('id')));
});

tours.put('/:id/stops', requirePermission('departures', 'edit'), zValidator('json', stopsBodySchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    if (!(await getTourRow(db, id))) return notFound(c, 'Tour');
    await replaceStops(db, { kind: 'tour', id }, c.req.valid('json').stops);
    return success(c, await getTourStops(db, id));
  }),
);

// ---- prices (age band, room supplement, seat surcharge, other)

tours.get('/:id/prices', requirePermission('departures', 'view'), async (c) => {
  const db = c.get('tenantDb');
  if (!(await getTourRow(db, c.req.param('id')))) return notFound(c, 'Tour');
  return success(c, await getTourPrices(db, c.req.param('id')));
});

tours.put('/:id/prices', requirePermission('departures', 'edit'), zValidator('json', pricesBodySchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    if (!(await getTourRow(db, id))) return notFound(c, 'Tour');
    await replacePrices(db, id, null, c.req.valid('json').prices);
    return success(c, await getTourPrices(db, id));
  }),
);

// ---- extras catalogue (behaviour comes with the self-service batch)

tours.get('/:id/extras', requirePermission('departures', 'view'), async (c) => {
  const db = c.get('tenantDb');
  if (!(await getTourRow(db, c.req.param('id')))) return notFound(c, 'Tour');
  return success(c, await getTourExtras(db, c.req.param('id')));
});

tours.put('/:id/extras', requirePermission('departures', 'edit'), zValidator('json', extrasBodySchema), (c) =>
  guarded(c, async () => {
    const db = c.get('tenantDb');
    const id = c.req.param('id');
    if (!(await getTourRow(db, id))) return notFound(c, 'Tour');
    await replaceTourExtras(db, id, c.req.valid('json').extras);
    return success(c, await getTourExtras(db, id));
  }),
);

export default tours;
