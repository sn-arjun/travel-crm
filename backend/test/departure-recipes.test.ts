import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import worker from '../src/index';
import { emitEvent } from '../src/services/automation/events';
import { RECIPES_BY_KEY } from '../src/services/automation/recipes';
import { ACTIONS } from '../src/services/automation/actions';
import { defaultPassengerFields } from '../src/services/departures/settings';

// R143: the group departure recipes and their actions, through the real engine.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

let admin = '';
let seq = 0;

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}
const json = async (res: Response): Promise<any> => res.json();
const rows = async <T = any>(sql: string, ...b: unknown[]): Promise<T[]> => ((await DB.prepare(sql).bind(...b).all()).results ?? []) as T[];

const DEFAULTS = {
  holdExpiryHours: 48,
  confirmMode: 'manual',
  markLeadWonOnConfirm: true,
  waitlist: { enabled: true, offerMode: 'suggest', offerHoldHours: 24 },
  seatsLeftThreshold: 10,
  deposit: { type: 'none', value: null },
  passengerFields: defaultPassengerFields(),
};

async function setMode(key: string, mode: 'off' | 'suggest' | 'auto') {
  expect((await call('PUT', `/automations/${key}`, admin, { mode })).status).toBe(200);
}

async function makeDeparture(capacity: number, extra: Record<string, unknown> = {}, start?: string): Promise<string> {
  seq += 1;
  const tour = (await json(await call('POST', '/tours', admin, { code: `RC${seq}`, title: `Recipe tour ${seq}`, destination: 'Italy', durationDays: 4 }))).data;
  const body = { tourId: tour.id, startDate: start ?? `2034-0${(seq % 9) + 1}-12`, capacityMode: 'manual', capacity, ...extra };
  const dep = await call('POST', '/departures', admin, body);
  expect(dep.status).toBe(201);
  const id = (await json(dep)).data.id;
  expect((await call('POST', `/departures/${id}/status`, admin, { status: 'open' })).status).toBe(200);
  return id;
}

async function hold(dep: string, name: string, seats: number): Promise<any> {
  const res = await call('POST', `/departures/${dep}/bookings`, admin, { contact: { name, email: `${name.toLowerCase().replace(/\W+/g, '.')}.${dep.slice(-6)}@rc.test` }, seats });
  expect(res.status, name).toBe(201);
  return (await json(res)).data;
}

/** The suggestions a recipe made about an entity, with params parsed. */
async function suggestions(ruleKey: string, entityId: string): Promise<any[]> {
  return (await rows('SELECT * FROM assistant_suggestions WHERE rule_key = ? AND entity_id = ? ORDER BY created_at, id', ruleKey, entityId)).map((r) => ({ ...r, params: JSON.parse(r.params) }));
}
const booking = async (id: string) => (await rows('SELECT * FROM seat_bookings WHERE id = ?', id))[0];

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  admin = (await json(await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID }))).data.accessToken;
  await DB.prepare(`INSERT INTO settings (key, value) VALUES ('timezone', 'Europe/Amsterdam') ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run();
  expect((await call('PUT', '/automations/pause', admin, { paused: false })).status).toBe(200);
});

beforeEach(async () => {
  expect((await call('PUT', '/departures/settings', admin, DEFAULTS)).status).toBe(200);
  for (const key of ['departures.confirm_seats', 'departures.waitlist_offer', 'departures.hold_expiring', 'departures.seats_low', 'departures.collect_details']) await setMode(key, 'suggest');
});

afterAll(async () => {
  await DB.prepare(`UPDATE tenants SET plan = 'pro' WHERE id = ?`).bind(TENANT_ID).run();
});

describe('registry', () => {
  it('the five recipes carry the plan feature and only the confirm recipe may run on its own; the actions have the intended risk', () => {
    for (const key of ['departures.confirm_seats', 'departures.waitlist_offer', 'departures.hold_expiring', 'departures.seats_low', 'departures.collect_details']) {
      expect(RECIPES_BY_KEY[key].featureKey, key).toBe('group_departures');
      expect(RECIPES_BY_KEY[key].defaultMode, key).toBe('suggest');
    }
    expect(RECIPES_BY_KEY['departures.confirm_seats'].autoEligible).toBe(true);
    expect(RECIPES_BY_KEY['departures.waitlist_offer'].autoEligible).toBe(false);
    expect(ACTIONS.confirm_seat_booking).toMatchObject({ risk: 'low', module: 'departures', permission: 'edit' });
    expect(ACTIONS.offer_seats.risk).toBe('medium');
    expect(ACTIONS.mark_lead_lost.risk).toBe('medium');
  });

  it('are listed with the plan lock', async () => {
    const list = (await json(await call('GET', '/automations', admin))).data.recipes as any[];
    const confirm = list.find((r) => r.key === 'departures.confirm_seats');
    expect(confirm).toMatchObject({ area: 'Group departures', locked: false, mode: 'suggest' });
    await DB.prepare(`UPDATE tenants SET plan = 'basic' WHERE id = ?`).bind(TENANT_ID).run();
    try {
      const basic = (await json(await call('GET', '/automations', admin))).data.recipes as any[];
      expect(basic.find((r) => r.key === 'departures.confirm_seats').locked).toBe(true);
    } finally {
      await DB.prepare(`UPDATE tenants SET plan = 'pro' WHERE id = ?`).bind(TENANT_ID).run();
    }
  });
});

describe('departures.confirm_seats', () => {
  it('suggest: a held booking gets a one-click confirm; applying it confirms, and the customer gets a "seats confirmed" draft', async () => {
    const dep = await makeDeparture(10);
    const b = await hold(dep, 'Suggest Confirm', 2);
    const [s] = await suggestions('departures.confirm_seats', b.id);
    expect(s).toMatchObject({ action_type: 'confirm_seat_booking', status: 'pending', risk: 'low', dedupe_key: `confirm-seats:${b.id}` });
    expect(s.params).toEqual({ seatBookingId: b.id });
    expect(s.title).toContain('Confirm 2 seats');
    expect((await booking(b.id)).status).toBe('held');

    const applied = await call('POST', `/assistant/suggestions/${s.id}/apply`, admin, {});
    expect(applied.status).toBe(200);
    expect(await booking(b.id)).toMatchObject({ status: 'confirmed', confirmed_by: ADMIN_ID });

    const drafts = await suggestions('departures.confirm_seats', b.id);
    const draft = drafts.find((d) => d.action_type === 'draft_reply');
    expect(draft).toBeTruthy();
    expect(draft.params.channel).toBe('email');
    expect(draft.params.body).toContain('2 seats are confirmed');
    expect(draft.params.body.startsWith('Hi Suggest,')).toBe(true);
  });

  it('auto: the held booking is confirmed on its own as the administrator who enabled it', async () => {
    await setMode('departures.confirm_seats', 'auto');
    const dep = await makeDeparture(10);
    const b = await hold(dep, 'Auto Confirm', 1);
    expect(await booking(b.id)).toMatchObject({ status: 'confirmed', confirmed_by: ADMIN_ID });
    const [s] = await suggestions('departures.confirm_seats', b.id);
    expect(s.status).toBe('auto_applied');
    // It never goes past capacity: the next party on a full departure is waitlisted, and there is nothing to confirm for it.
    const small = await makeDeparture(1);
    await hold(small, 'Fills It', 1);
    const waiting = await hold(small, 'Waits', 1);
    expect(waiting.status).toBe('waitlisted');
    expect(await suggestions('departures.confirm_seats', waiting.id)).toHaveLength(0);
  });

  it('honours the confirm mode: auto_when_available has nothing to suggest, on_deposit waits for the payment', async () => {
    const auto = await makeDeparture(5, { confirmMode: 'auto_when_available' });
    const a = await hold(auto, 'Mode Auto', 1);
    expect(a.status).toBe('confirmed');
    expect((await suggestions('departures.confirm_seats', a.id)).filter((s) => s.action_type === 'confirm_seat_booking')).toHaveLength(0);

    const dep = await makeDeparture(5, { confirmMode: 'on_deposit' });
    const d = await hold(dep, 'Mode Deposit', 1);
    expect(d.status).toBe('held');
    expect(await suggestions('departures.confirm_seats', d.id)).toHaveLength(0);
  });

  it('on_deposit: a payment.recorded event for the booking invoice confirms the booking only once the deposit is reached', async () => {
    expect((await call('PUT', '/departures/settings', admin, { deposit: { type: 'percent', value: 30 } })).status).toBe(200);
    await setMode('departures.confirm_seats', 'auto');
    const dep = await makeDeparture(5, { confirmMode: 'on_deposit' });
    const b = await hold(dep, 'Pays Deposit', 2);
    const invoice = (await json(await call('POST', '/invoices', admin, {
      contactId: b.contactId, leadId: b.leadId, items: [{ description: 'Alpine tour', quantity: 2, rate: 500, taxRate: 0 }],
    }))).data;
    await DB.prepare('UPDATE seat_bookings SET invoice_id = ? WHERE id = ?').bind(invoice.id, b.id).run();

    // 100 of 1000 is below the 30% deposit: nothing happens.
    expect((await call('POST', '/payments', admin, { invoiceId: invoice.id, amount: 100, method: 'transfer' })).status).toBe(201);
    expect((await booking(b.id)).status).toBe('held');
    expect((await suggestions('departures.confirm_seats', b.id)).filter((s) => s.dedupe_key.startsWith('confirm-seats-deposit'))).toHaveLength(0);

    // 100 + 200 reaches 300: confirmed, and recorded as confirmed by the deposit rule.
    expect((await call('POST', '/payments', admin, { invoiceId: invoice.id, amount: 200, method: 'transfer' })).status).toBe(201);
    expect(await booking(b.id)).toMatchObject({ status: 'confirmed', confirmed_by: 'deposit' });
    const [s] = (await suggestions('departures.confirm_seats', b.id)).filter((x) => x.dedupe_key.startsWith('confirm-seats-deposit'));
    expect(s).toMatchObject({ status: 'auto_applied' });
    expect(s.params).toEqual({ seatBookingId: b.id, by: 'deposit' });
  });

  it('on_deposit in suggest mode proposes the confirmation instead; a per-seat deposit is computed from the seats', async () => {
    expect((await call('PUT', '/departures/settings', admin, { deposit: { type: 'per_seat', value: 150 } })).status).toBe(200);
    const dep = await makeDeparture(5, { confirmMode: 'on_deposit' });
    const b = await hold(dep, 'Per Seat', 2); // deposit = 300
    const invoice = (await json(await call('POST', '/invoices', admin, {
      contactId: b.contactId, leadId: b.leadId, items: [{ description: 'Tour', quantity: 2, rate: 500, taxRate: 0 }],
    }))).data;
    await DB.prepare('UPDATE seat_bookings SET invoice_id = ? WHERE id = ?').bind(invoice.id, b.id).run();
    await call('POST', '/payments', admin, { invoiceId: invoice.id, amount: 299, method: 'transfer' });
    expect(await suggestions('departures.confirm_seats', b.id)).toHaveLength(0);
    await call('POST', '/payments', admin, { invoiceId: invoice.id, amount: 1, method: 'transfer' });
    const [s] = (await suggestions('departures.confirm_seats', b.id)).filter((x) => x.dedupe_key.startsWith('confirm-seats-deposit'));
    expect(s).toMatchObject({ status: 'pending', action_type: 'confirm_seat_booking' });
    expect((await call('POST', `/assistant/suggestions/${s.id}/apply`, admin, {})).status).toBe(200);
    expect(await booking(b.id)).toMatchObject({ status: 'confirmed', confirmed_by: 'deposit' });
  });
});

describe('departures.waitlist_offer', () => {
  it('suggest: freed seats produce one "Offer N seats to X" suggestion for the next fitting party; applying it holds the seats', async () => {
    const dep = await makeDeparture(3);
    const a = await hold(dep, 'Frees Seats', 3);
    const w = await hold(dep, 'Next In Line', 2);
    const other = await hold(dep, 'Second In Line', 3);
    expect([w.status, other.status]).toEqual(['waitlisted', 'waitlisted']);
    await call('POST', `/seat-bookings/${a.id}/cancel`, admin, { reason: 'x' });

    const [offer] = (await suggestions('departures.waitlist_offer', w.id)).filter((s) => s.action_type === 'offer_seats');
    expect(offer).toMatchObject({ status: 'pending', risk: 'medium' });
    expect(offer.title).toBe('Offer 2 seats to Next In Line');
    expect(offer.params).toEqual({ seatBookingId: w.id });
    expect(await booking(w.id)).toMatchObject({ status: 'waitlisted' }); // nothing changed without the click
    // 3 seats are free: the first party takes 2, and the 1 left does not fit the second party (3 seats), so only one offer is made.
    expect((await suggestions('departures.waitlist_offer', other.id)).filter((s) => s.action_type === 'offer_seats')).toHaveLength(0);

    const applied = await call('POST', `/assistant/suggestions/${offer.id}/apply`, admin, {});
    expect(applied.status).toBe(200);
    expect(await booking(w.id)).toMatchObject({ status: 'held', waitlist_position: null });
    expect((await booking(w.id)).offered_at).toBeTruthy();
  });

  it('auto_hold: the seats are held at once and the party gets a "seats are available" draft; no offer suggestion is made', async () => {
    expect((await call('PUT', '/departures/settings', admin, { waitlist: { offerMode: 'auto_hold', offerHoldHours: 6 } })).status).toBe(200);
    const dep = await makeDeparture(2);
    const a = await hold(dep, 'Auto Frees', 2);
    const w = await hold(dep, 'Auto Next', 2);
    await call('POST', `/seat-bookings/${a.id}/cancel`, admin);
    expect(await booking(w.id)).toMatchObject({ status: 'held' });
    const all = await suggestions('departures.waitlist_offer', w.id);
    expect(all.filter((s) => s.action_type === 'offer_seats')).toHaveLength(0);
    const draft = all.find((s) => s.action_type === 'draft_reply');
    expect(draft).toBeTruthy();
    expect(draft.params.body).toContain('2 seats have become available');
    expect(draft.params.body).toContain('holding them for you');
  });

  it('does not repeat itself: a second event for the same state adds no second suggestion; nothing is offered when the waitlist is off', async () => {
    const dep = await makeDeparture(2);
    const a = await hold(dep, 'Once A', 2);
    const w = await hold(dep, 'Once B', 2);
    await call('POST', `/seat-bookings/${a.id}/cancel`, admin);
    await emitEvent(testEnv, TENANT_ID, DB, { type: 'departure.status_changed', entityType: 'departure', entityId: dep, payload: { departureId: dep, from: 'open', to: 'closed' } });
    expect((await suggestions('departures.waitlist_offer', w.id)).filter((s) => s.action_type === 'offer_seats')).toHaveLength(1);

    expect((await call('PUT', '/departures/settings', admin, { waitlist: { enabled: false } })).status).toBe(200);
    await DB.prepare(`UPDATE seat_bookings SET status = 'waitlisted', waitlist_position = 1 WHERE id = ?`).bind(a.id).run(); // a waitlisted row left from before the setting changed
    await emitEvent(testEnv, TENANT_ID, DB, { type: 'departure.capacity_changed', entityType: 'departure', entityId: dep, payload: { departureId: dep } });
    expect(await suggestions('departures.waitlist_offer', a.id)).toHaveLength(0);
  });
});

describe('departures.seats_low', () => {
  it('fires once when the line is crossed: a task for the departure owner, and a promotion task when the departure takes public bookings', async () => {
    const dep = await makeDeparture(12, { publicBookingEnabled: true });
    await hold(dep, 'Low A', 1);
    await hold(dep, 'Low B', 1); // 10 left: crossing
    await hold(dep, 'Low C', 1); // already low
    await hold(dep, 'Low D', 1);
    const made = await suggestions('departures.seats_low', dep);
    expect(made.map((s) => s.action_type)).toEqual(['create_task', 'create_task']);
    expect(made.map((s) => s.dedupe_key.split(':')[0]).sort()).toEqual(['seats-low', 'seats-low-campaign']);
    const [main] = made.filter((s) => s.dedupe_key.startsWith('seats-low:'));
    expect(main.params).toMatchObject({ priority: 'medium' });
    expect(main.params.title).toContain('10 seats');
    expect(main.params.assignedTo).toBeTruthy();
    expect(main.title).toContain('10 seats left');
    expect(await suggestions('departures.seats_low', dep)).toHaveLength(2);
  });

  it('a departure without public booking gets only the owner task', async () => {
    const dep = await makeDeparture(11);
    await hold(dep, 'Private Low', 2); // 9 left
    expect(await suggestions('departures.seats_low', dep)).toHaveLength(1);
  });
});

describe('departures.hold_expiring', () => {
  const tick = (id: string) => emitEvent(testEnv, TENANT_ID, DB, { type: 'schedule.tick', entityType: 'schedule', entityId: `r143-${id}` });

  it('drafts a reminder for holds that run out within 24 hours and ignores later ones', async () => {
    const dep = await makeDeparture(10);
    const soon = await hold(dep, 'Expires Soon', 1);
    const later = await hold(dep, 'Expires Later', 1);
    await DB.prepare('UPDATE seat_bookings SET hold_expires_at = ? WHERE id = ?').bind(new Date(Date.now() + 10 * 3_600_000).toISOString(), soon.id).run();
    await DB.prepare('UPDATE seat_bookings SET hold_expires_at = ? WHERE id = ?').bind(new Date(Date.now() + 30 * 3_600_000).toISOString(), later.id).run();
    await tick(`soon-${seq}`);
    const [draft] = await suggestions('departures.hold_expiring', soon.id);
    expect(draft).toMatchObject({ action_type: 'draft_reply', status: 'pending' });
    expect(draft.params.body).toContain('holding 1 seat for you');
    expect(await suggestions('departures.hold_expiring', later.id)).toHaveLength(0);
    // The same hold is not reminded twice by a second tick.
    await tick(`soon-again-${seq}`);
    expect(await suggestions('departures.hold_expiring', soon.id)).toHaveLength(1);
  });

  it('creates a task for staff when the customer cannot be reached', async () => {
    const dep = await makeDeparture(10);
    const b = await hold(dep, 'Unreachable', 1);
    await DB.prepare('UPDATE contacts SET email = NULL, phone = NULL WHERE id = ?').bind(b.contactId).run();
    await DB.prepare('UPDATE seat_bookings SET hold_expires_at = ? WHERE id = ?').bind(new Date(Date.now() + 5 * 3_600_000).toISOString(), b.id).run();
    await tick(`unreachable-${seq}`);
    const [task] = await suggestions('departures.hold_expiring', b.id);
    expect(task).toMatchObject({ action_type: 'create_task' });
    expect(task.params.title).toContain('Call Unreachable');
    expect(task.params.priority).toBe('high');
  });
});

describe('departures.collect_details and departure awareness of the older recipes', () => {
  it('collect_details is listed but proposes nothing until the self-service link exists', async () => {
    const dep = await makeDeparture(5);
    const b = await hold(dep, 'No Link Yet', 1);
    expect((await call('POST', `/seat-bookings/${b.id}/confirm`, admin)).status).toBe(200);
    expect(await suggestions('departures.collect_details', b.id)).toHaveLength(0);
  });

  it('travellers.collect_details counts the seats of the booking, not the lead\'s own passenger count', async () => {
    const dep = await makeDeparture(8);
    const b = await hold(dep, 'Group Of Three', 3);
    expect((await call('PUT', `/leads/${b.leadId}/status`, admin, { status: 'won' })).status).toBe(200);
    const [draft] = (await rows(`SELECT params FROM assistant_suggestions WHERE rule_key = 'travellers.collect_details' AND lead_id = ?`, b.leadId)).map((r) => JSON.parse(r.params));
    expect(draft.body).toContain('all 3 travellers');
  });

  it('payments.balance_before_travel uses the start date of the lead\'s departure', async () => {
    const start = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const dep = await makeDeparture(8, {}, start);
    const contact = (await json(await call('POST', '/contacts', admin, { name: 'Balance Payer', email: `balance.${dep.slice(-6)}@rc.test`, type: 'customer' }))).data;
    const lead = (await json(await call('POST', '/leads', admin, {
      contactId: contact.id, title: 'Far away lead', destinations: ['Italy'], travelDate: '2035-03-01', tripType: 'group', source: 'manual', assignedTo: ADMIN_ID, currency: 'EUR',
    }))).data;
    const b = (await json(await call('POST', `/leads/${lead.id}/hold-seats`, admin, { departureId: dep, seats: 2 }))).data;
    expect(b.status).toBe('held');
    expect((await rows('SELECT travel_date FROM leads WHERE id = ?', lead.id))[0].travel_date).toBe('2035-03-01'); // the lead keeps its own date
    const invoice = (await json(await call('POST', '/invoices', admin, {
      contactId: contact.id, leadId: lead.id, items: [{ description: 'Tour', quantity: 1, rate: 1000, taxRate: 0 }],
    }))).data;
    await call('POST', '/payments', admin, { invoiceId: invoice.id, amount: 100, method: 'transfer' });
    await emitEvent(testEnv, TENANT_ID, DB, { type: 'schedule.tick', entityType: 'schedule', entityId: `r143-balance-${seq}` });
    const [s] = await suggestions('payments.balance_before_travel', invoice.id);
    expect(s).toBeTruthy();
    expect(s.params.body).toContain('Your trip starts on');
  });
});
