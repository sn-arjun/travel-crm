import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { RECIPES } from '../src/services/automation/recipes';
import { ACTIONS } from '../src/services/automation/actions';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

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

async function data(res: Response): Promise<any> {
  return ((await res.json()) as any).data;
}

async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

let admin = '';

async function contact(name: string, phone: string): Promise<string> {
  const res = await call('POST', '/contacts', admin, { name, phone, type: 'customer' });
  expect(res.status).toBe(201);
  return (await data(res)).id;
}

async function lead(contactId: string, title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await call('POST', '/leads', admin, {
    contactId, title, destinations: ['Goa'], travelDate: isoDay(60), tripType: 'family', source: 'website', assignedTo: ADMIN_ID, ...extra,
  });
  expect(res.status).toBe(201);
  return (await data(res)).id;
}

async function pendingFor(query: string): Promise<any[]> {
  return data(await call('GET', `/assistant/suggestions?${query}`, admin));
}

describe('Recipe library', () => {
  it('every recipe has a unique key, an area, and proposes only registered actions by design', () => {
    const keys = RECIPES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const recipe of RECIPES) {
      expect(recipe.area.length).toBeGreaterThan(0);
      expect(recipe.triggers.length).toBeGreaterThan(0);
      // "auto" is only ever a default for recipes that may run automatically.
      if (recipe.defaultMode === 'auto') expect(recipe.autoEligible).toBe(true);
    }
    expect(RECIPES.length).toBeGreaterThanOrEqual(24);
  });

  it('only low-risk actions exist that could run without a click', () => {
    const low = Object.values(ACTIONS).filter((a) => a.risk === 'low').map((a) => a.type).sort();
    expect(low).toEqual(['advance_lead_status', 'create_follow_up', 'create_task', 'link_message_to_lead', 'log_call_activity']);
    // Money, new records and outgoing messages are never low risk.
    for (const type of ['create_lead_from_enquiry', 'create_invoice_from_itinerary', 'record_payment', 'create_vouchers', 'draft_reply', 'mark_lead_won']) {
      expect(ACTIONS[type].risk).not.toBe('low');
    }
  });
});

describe('More automations', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = (await data(login)).accessToken;
  });

  it('the first reply on a new lead moves it to Contacted', async () => {
    const contactId = await contact('First Reply', '9000001001');
    const leadId = await lead(contactId, 'First reply lead');
    expect((await call('POST', '/communications/send', admin, { contact_id: contactId, channel: 'whatsapp', message: 'Hi, thanks for reaching out', lead_id: leadId })).status).toBe(201);
    expect((await rows('SELECT status FROM leads WHERE id = ?', leadId))[0].status).toBe('contacted');

    // A second message does not move it again, and never backwards.
    await call('POST', '/communications/send', admin, { contact_id: contactId, channel: 'whatsapp', message: 'Any questions?', lead_id: leadId });
    expect((await rows('SELECT status FROM leads WHERE id = ?', leadId))[0].status).toBe('contacted');
  });

  it('a confirmed booking drafts a request for traveller details', async () => {
    const contactId = await contact('Won Booking', '9000001002');
    const leadId = await lead(contactId, 'Won booking lead', { paxAdults: 2, paxChildren: 1 });
    expect((await call('PUT', `/leads/${leadId}/status`, admin, { status: 'won' })).status).toBe(200);

    const draft = (await pendingFor(`leadId=${leadId}`)).find((s) => s.ruleKey === 'travellers.collect_details');
    expect(draft).toBeTruthy();
    expect(draft.action).toMatchObject({ type: 'draft_reply', clientHandled: true });
    expect(draft.params.body).toContain('all 3 travellers');
    expect(draft.params.body.startsWith('Hi Won,')).toBe(true);
  });

  it('a recorded payment drafts a thank-you with the balance', async () => {
    const contactId = await contact('Paying Customer', '9000001003');
    const leadId = await lead(contactId, 'Paying lead');
    const invoice = await data(await call('POST', '/invoices', admin, {
      contactId, leadId, items: [{ description: 'Goa package', quantity: 1, rate: 50000, taxRate: 0 }],
    }));
    expect((await call('POST', '/payments', admin, { invoiceId: invoice.id, amount: 20000, method: 'transfer' })).status).toBe(201);

    const thanks = (await pendingFor(`entityType=invoice&entityId=${invoice.id}`)).find((s) => s.ruleKey === 'payments.thank_you');
    expect(thanks).toBeTruthy();
    expect(thanks.title).toContain('20,000');
    expect(thanks.params.body).toContain('The balance is ₹30,000.');
  });

  it('a customer who opted out is never drafted a message', async () => {
    const contactId = await contact('Opted Out', '9000001004');
    await testEnv.MASTER_DB.prepare('UPDATE contacts SET opted_out = 1 WHERE id = ?').bind(contactId).run();
    const leadId = await lead(contactId, 'Opted out lead');
    await call('PUT', `/leads/${leadId}/status`, admin, { status: 'won' });
    const drafts = (await pendingFor(`leadId=${leadId}`)).filter((s) => s.action.type === 'draft_reply');
    expect(drafts).toHaveLength(0);
  });

  describe('arrival transfer', () => {
    let leadId = '';
    let small = '';
    let big = '';
    let driverFree = '';
    let driverBusy = '';
    const travel = isoDay(3);

    beforeAll(async () => {
      const vehicle = async (registrationNumber: string, seatingCapacity: number) =>
        (await data(await call('POST', '/fleet/vehicles', admin, { registrationNumber, type: 'muv', make: 'Toyota', model: 'Innova Crysta', seatingCapacity }))).id;
      const driver = async (name: string, phone: string) => (await data(await call('POST', '/fleet/drivers', admin, { name, phone }))).id;
      small = await vehicle('KA 01 AA 1001', 4);
      big = await vehicle('KA 01 AA 1002', 7);
      driverBusy = await driver('Asha Busy', '9000003001');
      driverFree = await driver('Ravi Free', '9000003002');

      // The first driver by name is already out on the arrival day.
      const other = await contact('Other Passenger', '9000001020');
      const busyTrip = await call('POST', '/fleet/trips', admin, {
        vehicleId: small, driverId: driverBusy, contactId: other,
        pickupDatetime: `${travel}T06:00:00.000Z`, dropDatetime: `${travel}T09:00:00.000Z`, pickupLocation: 'Airport', dropLocation: 'Hotel',
      });
      expect(busyTrip.status).toBe(201);

      const contactId = await contact('Arriving Family', '9000001021');
      leadId = await lead(contactId, 'Arriving soon', { travelDate: travel, paxAdults: 2, paxChildren: 2, destinations: ['Kumarakom'] });
      expect((await call('PUT', `/leads/${leadId}/status`, admin, { status: 'won' })).status).toBe(200);
    });

    it('proposes a vehicle that fits the group and a driver, both free that day', async () => {
      const transfer = (await pendingFor(`leadId=${leadId}`)).find((s) => s.ruleKey === 'fleet.arrival_transfer');
      expect(transfer).toBeTruthy();
      expect(transfer.action).toMatchObject({ type: 'open_prefilled_form', clientHandled: true });

      const url = new URL(`http://app${transfer.params.href}`);
      expect(url.pathname).toBe('/fleet/trips/new');
      // 4 passengers need more than the 4-seater (which is out that morning anyway); the busy driver is skipped.
      expect(url.searchParams.get('vehicleId')).toBe(big);
      expect(url.searchParams.get('driverId')).toBe(driverFree);
      expect(url.searchParams.get('leadId')).toBe(leadId);
      expect(url.searchParams.get('passengerName')).toBe('Arriving Family');
      expect(url.searchParams.get('endLocation')).toBe('Kumarakom');
      expect(url.searchParams.get('date')).toBe(travel);
      expect(transfer.params.details.map((d: any) => d.label)).toEqual(['Vehicle', 'Driver', 'Free on']);
    });

    it('creates nothing by itself, and stops suggesting once a transfer is booked', async () => {
      expect(await rows('SELECT id FROM trip_assignments WHERE lead_id = ?', leadId)).toHaveLength(0);

      const transfer = (await pendingFor(`leadId=${leadId}`)).find((s) => s.ruleKey === 'fleet.arrival_transfer');
      expect((await call('POST', `/assistant/suggestions/${transfer.id}/apply`, admin, {})).status).toBe(200);
      expect(await rows('SELECT id FROM trip_assignments WHERE lead_id = ?', leadId)).toHaveLength(0);

      const booked = await call('POST', '/fleet/trips', admin, {
        leadId, vehicleId: big, driverId: driverFree,
        pickupDatetime: `${travel}T10:00:00.000Z`, dropDatetime: `${travel}T12:00:00.000Z`, pickupLocation: 'Airport', dropLocation: 'Kumarakom',
      });
      expect(booked.status).toBe(201);
      await call('POST', '/automations/run-scheduled', admin);
      const again = (await rows(`SELECT id FROM assistant_suggestions WHERE rule_key = 'fleet.arrival_transfer' AND lead_id = ? AND status = 'pending'`, leadId));
      expect(again).toHaveLength(0);
    });

    it('rejects a form link that leaves the app', async () => {
      const { ACTIONS: actions } = await import('../src/services/automation/actions');
      const schema = actions.open_prefilled_form.schema;
      expect(schema.safeParse({ href: '/fleet/trips/new?leadId=1', buttonLabel: 'Open' }).success).toBe(true);
      expect(schema.safeParse({ href: 'https://evil.example/phish', buttonLabel: 'Open' }).success).toBe(false);
      expect(schema.safeParse({ href: '//evil.example', buttonLabel: 'Open' }).success).toBe(false);
    });
  });

  describe('daily checks', () => {
    let reviewLead = '';
    let dormant = '';
    let unanswered = '';

    beforeAll(async () => {
      // A rate card about to expire
      await testEnv.MASTER_DB.prepare(
        `INSERT INTO rate_cards (id, service_type, destination, name, cost_price, selling_price, valid_from, valid_to, is_active)
         VALUES ('rc-expiring', 'hotel', 'Goa', 'Candolim Sands Resort, Deluxe', 6500, 8200, ?, ?, 1)`,
      ).bind(isoDay(-200), isoDay(5)).run();
      await testEnv.MASTER_DB.prepare(
        `INSERT INTO rate_cards (id, service_type, destination, name, cost_price, selling_price, valid_from, valid_to, is_active)
         VALUES ('rc-fine', 'hotel', 'Goa', 'Far Future Hotel', 6500, 8200, ?, ?, 1)`,
      ).bind(isoDay(-200), isoDay(200)).run();

      // A trip that ended yesterday
      const back = await contact('Back Home', '9000001005');
      reviewLead = await lead(back, 'Just ended trip');
      await testEnv.MASTER_DB.prepare(`UPDATE leads SET status = 'won', travel_date = ?, return_date = ? WHERE id = ?`).bind(isoDay(-6), isoDay(-1), reviewLead).run();

      // A customer whose only trip was long ago
      dormant = await contact('Long Ago', '9000001006');
      const old = await lead(dormant, 'Old trip');
      await testEnv.MASTER_DB.prepare(`UPDATE leads SET status = 'won', travel_date = ?, return_date = ? WHERE id = ?`).bind(isoDay(-420), isoDay(-415), old).run();

      // A customer message nobody answered for six hours
      unanswered = await contact('Still Waiting', '9000001007');
      await testEnv.MASTER_DB.prepare(
        `INSERT INTO message_log (id, contact_id, channel, content, direction, status, created_at)
         VALUES ('msg-unanswered', ?, 'whatsapp', 'Any update on my booking?', 'incoming', 'delivered', ?)`,
      ).bind(unanswered, new Date(Date.now() - 6 * 3600_000).toISOString()).run();
      // ...and one that was answered
      const answered = await contact('Was Answered', '9000001008');
      await testEnv.MASTER_DB.prepare(
        `INSERT INTO message_log (id, contact_id, channel, content, direction, status, created_at)
         VALUES ('msg-answered', ?, 'whatsapp', 'Question', 'incoming', 'delivered', ?)`,
      ).bind(answered, new Date(Date.now() - 6 * 3600_000).toISOString()).run();
      await testEnv.MASTER_DB.prepare(
        `INSERT INTO message_log (id, contact_id, channel, content, direction, status, created_at)
         VALUES ('msg-answer', ?, 'whatsapp', 'Answer', 'outgoing', 'sent', ?)`,
      ).bind(answered, new Date(Date.now() - 5 * 3600_000).toISOString()).run();

      expect((await call('POST', '/automations/run-scheduled', admin)).status).toBe(200);
      // Running again the same day must not duplicate anything.
      expect((await call('POST', '/automations/run-scheduled', admin)).status).toBe(200);
    });

    it('creates a renewal task for the rate card that is about to expire, and only that one', async () => {
      const tasks = await rows(`SELECT title, due_date FROM tasks WHERE title LIKE 'Renew rate card:%'`);
      expect(tasks).toEqual([{ title: 'Renew rate card: Candolim Sands Resort, Deluxe', due_date: isoDay(5) }]);
    });

    it('creates one task for the unanswered message and none for the answered one', async () => {
      const tasks = await rows(`SELECT title, priority FROM tasks WHERE title LIKE 'Reply to the message from%'`);
      expect(tasks).toEqual([{ title: 'Reply to the message from Still Waiting', priority: 'high' }]);
    });

    it('drafts a review request for the trip that just ended', async () => {
      const review = (await pendingFor(`leadId=${reviewLead}`)).filter((s) => s.ruleKey === 'marketing.post_trip_review');
      expect(review).toHaveLength(1);
      expect(review[0].params.body).toContain('Welcome back!');
    });

    it('drafts a win-back for the dormant customer, but not for one with an enquiry open', async () => {
      const winBack = (await pendingFor(`contactId=${dormant}`)).filter((s) => s.ruleKey === 'marketing.dormant_win_back');
      expect(winBack).toHaveLength(1);
      expect(winBack[0].reason).toMatch(/^Last travelled with you in /);

      const all = await rows(`SELECT contact_id FROM assistant_suggestions WHERE rule_key = 'marketing.dormant_win_back'`);
      expect(all.map((r) => r.contact_id)).toEqual([dormant]);
    });
  });
});
