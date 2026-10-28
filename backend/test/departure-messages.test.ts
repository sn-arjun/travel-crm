import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import worker from '../src/index';
import { bumpCatalogueVersion } from '../src/services/plans/catalogue';
import { JOB_SETS } from '../src/cron/dispatch';
import { withdrawMarketing } from '../src/services/privacy/consent';
import { resolveVariables } from '../src/services/template-engine';
import { dueAt, inWindow, rulesForTour, runDepartureMessages, type MessageRule } from '../src/services/departures/scheduled-messages';

// R154: messages that go out N days before or after a departure, each person with their own details, once.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

let originalEmailAllowance = 2000;
const queued: any[] = [];
const queueEnv = { ...testEnv, SMS_QUEUE: { send: async (m: unknown) => { queued.push(m); } }, EMAIL_QUEUE: { send: async (m: unknown) => { queued.push(m); } }, CAMPAIGN_QUEUE: { send: async () => {} } };

let admin = '';
let seq = 0;

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    queueEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}
const json = async (res: Response): Promise<any> => res.json();
const rows = async <T = any>(sql: string, ...b: unknown[]): Promise<T[]> => ((await DB.prepare(sql).bind(...b).all()).results ?? []) as T[];

async function setTimezone(tz: string) {
  await DB.prepare(`INSERT INTO settings (key, value) VALUES ('timezone', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(tz).run();
}

async function setEmailAllowance(amount: number) {
  await DB.prepare(`UPDATE plan_allowances SET monthly_amount = ? WHERE plan_key = 'pro' AND allowance_key = 'email'`).bind(amount).run();
  await bumpCatalogueVersion(testEnv);
}

async function resetUsage() {
  await DB.prepare('DELETE FROM tenant_usage_caps WHERE tenant_id = ?').bind(TENANT_ID).run();
  await DB.prepare('DELETE FROM usage_alerts WHERE tenant_id = ?').bind(TENANT_ID).run();
  await DB.prepare(`DELETE FROM notifications WHERE reference_type = 'departure'`).run();
}

const TEMPLATE_ID = 'r154-pickup-template';

async function makeTemplate(id = TEMPLATE_ID, content = 'Hi {first_name}, your pickup for {tour_name} on {departure_date} is at {pickup_time} at {pickup_point} ({pickup_address}).') {
  await DB.prepare(`INSERT OR REPLACE INTO message_templates (id, channel, name, subject, content, is_active) VALUES (?, 'email', 'R154 pickup', 'Pickup {pickup_time}', ?, 1)`).bind(id, content).run();
}

interface Dep { id: string; tourId: string; code: string; stops: Array<{ id: string; name: string }> }

/** A departure with two pickup stops, open for booking, starting on `start` (2032-08-10 unless given). */
async function makeDeparture(start = '2032-08-10', capacity = 30): Promise<Dep> {
  seq += 1;
  const tour = await json(await call('POST', '/tours', admin, { code: `DM${seq}`, title: `Alpine Escape ${seq}`, destination: 'Alps', durationDays: 3, defaultCapacity: 49 }));
  const dep = await json(await call('POST', '/departures', admin, { tourId: tour.data.id, startDate: start, startTime: '07:00', capacityMode: 'manual', capacity }));
  const id = dep.data.id as string;
  const stopsRes = await call('PUT', `/departures/${id}/stops`, admin, {
    stops: [
      { name: 'Utrecht Centraal', address: 'Stationsplein 1, Utrecht', localTime: '07:00' },
      { name: 'Amersfoort', address: 'Stationsplein 9, Amersfoort', localTime: '07:40' },
    ],
  });
  expect(stopsRes.status).toBe(200);
  const stops = (await json(stopsRes)).data as Array<{ id: string; name: string }>;
  expect((await call('POST', `/departures/${id}/status`, admin, { status: 'open' })).status).toBe(200);
  return { id, tourId: tour.data.id, code: dep.data.code as string, stops };
}

/** A party with passengers (each with their own email address) on a departure; confirmed unless `confirm` is false. */
async function book(dep: Dep, party: string, people: Array<{ first: string; stop: number }>, opts: { confirm?: boolean; contactExtra?: Record<string, unknown> } = {}) {
  seq += 1;
  const res = await call('POST', `/departures/${dep.id}/bookings`, admin, {
    contact: { name: party, email: `${party.toLowerCase().replace(/\W+/g, '.')}.${seq}@dm.test`, phone: `+3161234${String(3000 + seq)}`, ...opts.contactExtra },
    passengers: people.map((p) => ({ firstName: p.first, lastName: 'Visser', pickupStopId: dep.stops[p.stop].id })),
    createTravellers: true,
  });
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  const data = (await json(res)).data as { id: string; status: string; contactId: string; passengers: Array<{ id: string; firstName: string }> };
  if (opts.confirm !== false) expect((await call('POST', `/seat-bookings/${data.id}/confirm`, admin)).status).toBe(200);
  for (const [i, p] of data.passengers.entries()) {
    const email = `${p.firstName.toLowerCase()}.${seq}.${i}@pax.test`;
    const travellerId = `r154-tr-${seq}-${i}`;
    await DB.prepare(`INSERT INTO travellers (id, tenant_id, contact_id, first_name, last_name, full_name_passport, email) VALUES (?, ?, ?, ?, 'Visser', ?, ?)`).bind(travellerId, TENANT_ID, data.contactId, p.firstName, `${p.firstName} Visser`, email).run();
    await DB.prepare('UPDATE seat_passengers SET traveller_id = ? WHERE id = ?').bind(travellerId, p.id).run();
  }
  return data;
}

interface RuleOpts { name?: string; tourId?: string | null; anchor?: string; offsetDays?: number; localTime?: string; audience?: string; recipient?: string; purpose?: string; mode?: string; channel?: string; templateId?: string }

async function makeRule(o: RuleOpts = {}): Promise<string> {
  const res = await call('POST', '/departure-message-rules', admin, {
    name: o.name ?? 'Pickup time', tourId: o.tourId ?? null, templateId: o.templateId ?? TEMPLATE_ID, channel: o.channel ?? 'preferred', anchor: o.anchor ?? 'start',
    offsetDays: o.offsetDays ?? -2, localTime: o.localTime ?? '18:00', audience: o.audience ?? 'confirmed', recipient: o.recipient ?? 'each_passenger_with_contact',
    purpose: o.purpose ?? 'service', mode: o.mode ?? 'auto', isActive: true,
  });
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  return (await json(res)).data.id;
}

/** 18:00 Amsterdam (CEST, UTC+2) on 2032-08-08 plus a little. */
const AFTER_DUE = new Date('2032-08-08T16:30:00Z');

const run = (now = AFTER_DUE) => runDepartureMessages(queueEnv, TENANT_ID, DB, now);
const sendRows = (ruleId: string, depId?: string) =>
  rows('SELECT * FROM departure_message_sends WHERE rule_id = ?' + (depId ? ' AND departure_id = ?' : '') + ' ORDER BY created_at, id', ...(depId ? [ruleId, depId] : [ruleId]));

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  originalEmailAllowance = (await DB.prepare("SELECT monthly_amount AS n FROM plan_allowances WHERE plan_key = 'pro' AND allowance_key = 'email'").first<{ n: number }>())?.n ?? 2000;
  admin = (await json(await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID }))).data.accessToken;
  await setTimezone('Europe/Amsterdam');
  await DB.prepare("INSERT INTO settings (key, value) VALUES ('locale', 'en-GB') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  expect((await call('PUT', '/departures/settings', admin, { enabled: true })).status).toBe(200);
  await makeTemplate();
});

beforeEach(async () => {
  queued.length = 0;
  await DB.prepare('DELETE FROM departure_message_sends').run();
  await DB.prepare("UPDATE departures SET status = 'cancelled'").run(); // earlier tests' departures take no part
  await DB.prepare(`DELETE FROM departure_message_rules WHERE name NOT IN ('Extras reminder', 'Pickup time', 'Review request') OR tour_id IS NOT NULL OR is_active = 1`).run();
  await DB.prepare(`DELETE FROM assistant_suggestions WHERE rule_key = 'departures.scheduled_messages'`).run();
  await setTimezone('Europe/Amsterdam');
  await setEmailAllowance(originalEmailAllowance);
  await resetUsage();
});

afterAll(async () => {
  await setEmailAllowance(originalEmailAllowance);
  await DB.prepare("DELETE FROM settings WHERE key = 'locale'").run();
});

describe('when a message is due', () => {
  const base = { anchor: 'start', offset_days: -2, local_time: '18:00' } as MessageRule;
  const dep = { start_date: '2032-08-10', end_date: '2032-08-12', extras_cutoff_date: null };

  it('computes the moment in the agency zone: Europe/Amsterdam and Asia/Kolkata', () => {
    expect(dueAt(base, dep, 'Europe/Amsterdam', 7)).toBe('2032-08-08T16:00:00.000Z'); // CEST, UTC+2
    expect(dueAt(base, dep, 'Asia/Kolkata', 7)).toBe('2032-08-08T12:30:00.000Z'); // IST, UTC+5:30
    expect(dueAt(base, { ...dep, start_date: '2032-12-20' }, 'Europe/Amsterdam', 7)).toBe('2032-12-18T17:00:00.000Z'); // CET, UTC+1
  });

  it('counts from the end of the trip or from the extras cut-off, after or before', () => {
    expect(dueAt({ anchor: 'end', offset_days: 2, local_time: '12:00' } as MessageRule, dep, 'Europe/Amsterdam', 7)).toBe('2032-08-14T10:00:00.000Z');
    expect(dueAt({ anchor: 'extras_cutoff', offset_days: -1, local_time: null } as MessageRule, dep, 'Europe/Amsterdam', 7)).toBe('2032-08-02T07:00:00.000Z'); // start - 7 days - 1 day, 09:00 default
    expect(dueAt({ anchor: 'extras_cutoff', offset_days: 0, local_time: '08:00' } as MessageRule, { ...dep, extras_cutoff_date: '2032-08-05' }, 'Europe/Amsterdam', 7)).toBe('2032-08-05T06:00:00.000Z');
  });

  it('is open from the moment until 48 hours later', () => {
    const due = '2032-08-08T16:00:00.000Z';
    expect(inWindow(due, new Date('2032-08-08T15:59:00Z'))).toBe(false);
    expect(inWindow(due, new Date('2032-08-08T16:00:00Z'))).toBe(true);
    expect(inWindow(due, new Date('2032-08-10T15:59:00Z'))).toBe(true);
    expect(inWindow(due, new Date('2032-08-10T16:00:00Z'))).toBe(false);
    expect(inWindow(null, new Date())).toBe(false);
  });

  it('lets a rule of a tour replace the agency rule of the same name', () => {
    const r = (id: string, name: string, tour: string | null, active = 1) => ({ id, name, tour_id: tour, is_active: active }) as MessageRule;
    const all = [r('a', 'Pickup time', null), r('b', 'Review', null), r('c', 'pickup TIME', 't1'), r('d', 'Review', 't2', 0)];
    expect(rulesForTour(all, 't1').map((x) => x.id)).toEqual(['b', 'c']);
    expect(rulesForTour(all, 't2').map((x) => x.id)).toEqual(['a']); // the inactive tour rule switches the agency one off
    expect(rulesForTour(all, 't3').map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('runs as a cron job on every tick', () => {
    expect(JOB_SETS.every5.some((j) => j.name === 'departures.messages' && j.period === 'tick')).toBe(true);
  });
});

describe('the starter rules', () => {
  it('are seeded once, inactive, the first time group tours are switched on', async () => {
    const seeded = await rows('SELECT * FROM departure_message_rules WHERE tour_id IS NULL AND is_active = 0 ORDER BY offset_days');
    const byName = Object.fromEntries(seeded.map((r) => [r.name, r]));
    expect(byName['Extras reminder']).toMatchObject({ anchor: 'start', offset_days: -7, purpose: 'service', recipient: 'booking_contact', mode: 'suggest', is_active: 0 });
    expect(byName['Pickup time']).toMatchObject({ anchor: 'start', offset_days: -2, local_time: '18:00', recipient: 'each_passenger_with_contact' });
    expect(byName['Review request']).toMatchObject({ anchor: 'end', offset_days: 2, purpose: 'marketing' });
    for (const r of seeded) expect((await rows('SELECT channel, content FROM message_templates WHERE id = ?', r.template_id))[0].channel).toBe('email');
    // switching off and on again adds nothing
    expect((await call('PUT', '/departures/settings', admin, { enabled: false })).status).toBe(200);
    expect((await call('PUT', '/departures/settings', admin, { enabled: true })).status).toBe(200);
    expect((await rows('SELECT COUNT(*) AS n FROM departure_message_rules WHERE is_active = 0 AND tour_id IS NULL'))[0].n).toBe(3);
  });

  it('are listed by the API and show up as a recipe on the automations page', async () => {
    const list = (await json(await call('GET', '/departure-message-rules?scope=agency', admin))).data as any[];
    expect(list.map((r) => r.name)).toEqual(expect.arrayContaining(['Extras reminder', 'Pickup time', 'Review request']));
    expect(list.find((r) => r.name === 'Pickup time')).toMatchObject({ offsetDays: -2, localTime: '18:00', isActive: false, templateName: expect.stringContaining('Pickup time') });
    const automations = (await json(await call('GET', '/automations', admin))).data;
    const recipes = (automations.recipes ?? automations) as any[];
    expect(recipes.some((r) => r.key === 'departures.scheduled_messages')).toBe(true);
  });
});

describe('the departure job', () => {
  it('sends each passenger their own pickup point and time, once', async () => {
    const dep = await makeDeparture();
    await book(dep, 'Anna', [{ first: 'Anna', stop: 0 }, { first: 'Bram', stop: 1 }]);
    await book(dep, 'Carla', [{ first: 'Carla', stop: 1 }]);
    const ruleId = await makeRule();

    const first = await run();
    expect(first.sent).toBe(3);
    const jobs = queued.filter((j) => j.type === 'email');
    expect(jobs).toHaveLength(3);
    const by = Object.fromEntries(jobs.map((j) => [j.data.to.split('.')[0], j.data]));
    expect(by.anna.html).toContain('Hi Anna');
    expect(by.anna.html).toContain('07:00 at Utrecht Centraal (Stationsplein 1, Utrecht)');
    expect(by.bram.html).toContain('07:40 at Amersfoort (Stationsplein 9, Amersfoort)');
    expect(by.bram.html).not.toContain('07:00');
    expect(by.carla.html).toContain('07:40');
    expect(by.carla.html).toContain(dep.code ? 'Alpine Escape' : '');
    expect(by.anna.html).toContain('10 August 2032');
    expect(by.anna.subject).toBe('Pickup 07:00');

    const sent = await sendRows(ruleId, dep.id);
    expect(sent.map((r) => r.status)).toEqual(['sent', 'sent', 'sent']);
    expect(sent.every((r) => r.message_log_id && r.seat_passenger_id)).toBe(true);
    expect((await rows(`SELECT COUNT(*) AS n FROM message_log WHERE json_extract(metadata, '$.departureMessage.ruleId') = ?`, ruleId))[0].n).toBe(3);

    // a rerun, and a later run inside the window, send nothing
    queued.length = 0;
    expect((await run()).sent).toBe(0);
    expect((await run(new Date('2032-08-09T10:00:00Z'))).sent).toBe(0);
    expect(queued).toHaveLength(0);
    expect(await sendRows(ruleId, dep.id)).toHaveLength(3);
  });

  it('two runs at the same time still send once', async () => {
    const dep = await makeDeparture();
    await book(dep, 'Dirk', [{ first: 'Dirk', stop: 0 }, { first: 'Eva', stop: 1 }]);
    const ruleId = await makeRule();
    await Promise.all([run(), run()]);
    expect(queued.filter((j) => j.type === 'email')).toHaveLength(2);
    expect((await sendRows(ruleId)).filter((r) => r.status === 'sent')).toHaveLength(2);
  });

  it('sends nothing before the moment or more than 48 hours after it', async () => {
    const dep = await makeDeparture();
    await book(dep, 'Fenna', [{ first: 'Fenna', stop: 0 }]);
    const ruleId = await makeRule();
    expect((await run(new Date('2032-08-08T15:59:00Z'))).sent).toBe(0);
    expect((await run(new Date('2032-08-10T16:01:00Z'))).sent).toBe(0);
    expect(await sendRows(ruleId, dep.id)).toHaveLength(0);
    expect(queued).toHaveLength(0);
    expect((await run(new Date('2032-08-10T15:00:00Z'))).sent).toBe(1);
  });

  it('computes the moment in the agency zone', async () => {
    const dep = await makeDeparture();
    await book(dep, 'Gijs', [{ first: 'Gijs', stop: 0 }]);
    await makeRule();
    await setTimezone('Asia/Kolkata'); // 18:00 IST = 12:30 UTC
    expect((await run(new Date('2032-08-08T12:00:00Z'))).sent).toBe(0);
    expect((await run(new Date('2032-08-08T12:31:00Z'))).sent).toBe(1);
    expect(dep.id).toBeTruthy();
  });

  it('addresses the booking contact when the rule says so, and passengers without an address of their own are left out', async () => {
    const dep = await makeDeparture();
    const b = await book(dep, 'Hanna', [{ first: 'Hanna', stop: 0 }, { first: 'Ivo', stop: 1 }]);
    await DB.prepare(`UPDATE travellers SET email = NULL WHERE id = (SELECT traveller_id FROM seat_passengers WHERE id = ?)`).bind(b.passengers[1].id).run();
    const paxRule = await makeRule({ name: 'Per passenger' });
    expect((await run()).sent).toBe(1); // only Hanna has an address
    queued.length = 0;
    await DB.prepare('DELETE FROM departure_message_rules WHERE id = ?').bind(paxRule).run();
    await makeRule({ name: 'To the contact', recipient: 'booking_contact', templateId: TEMPLATE_ID });
    expect((await run()).sent).toBe(1);
    expect(queued[0].data.to).toMatch(/^hanna\.\d+@dm\.test$/);
    expect(queued[0].data.html).toContain('07:00 at Utrecht Centraal'); // the first passenger's pickup stands for the booking
  });

  it('skips an opted-out contact for a marketing message, not for a service message', async () => {
    const dep = await makeDeparture();
    const b = await book(dep, 'Jelle', [{ first: 'Jelle', stop: 0 }]);
    await withdrawMarketing(DB, b.contactId, 'any', 'manual');
    const service = await makeRule({ name: 'Service pickup', recipient: 'booking_contact', purpose: 'service' });
    const marketing = await makeRule({ name: 'Review', recipient: 'booking_contact', purpose: 'marketing' });
    const summary = await run();
    expect(summary).toMatchObject({ sent: 1, skipped_opt_out: 1 });
    expect((await sendRows(service))[0].status).toBe('sent');
    expect((await sendRows(marketing))[0]).toMatchObject({ status: 'skipped_opt_out', detail: expect.stringContaining('opted out') });
    expect(queued.filter((j) => j.type === 'email')).toHaveLength(1);
  });

  it('marks a person with no way to be reached as skipped_no_address', async () => {
    const dep = await makeDeparture();
    const b = await book(dep, 'Kees', [{ first: 'Kees', stop: 0 }]);
    await DB.prepare('UPDATE contacts SET email = NULL WHERE id = ?').bind(b.contactId).run();
    const ruleId = await makeRule({ recipient: 'booking_contact' });
    expect((await run()).skipped_no_address).toBe(1);
    expect((await sendRows(ruleId))[0].status).toBe('skipped_no_address');
    // the address is added while the window is open: the next run sends it
    await DB.prepare('UPDATE contacts SET email = ? WHERE id = ?').bind('kees.new@dm.test', b.contactId).run();
    expect((await run()).sent).toBe(1);
    expect((await sendRows(ruleId))[0].status).toBe('sent');
    expect(queued[0].data.to).toBe('kees.new@dm.test');
  });

  it('records skipped_cap when the allowance is used up, notifies once, and sends the rest when it is raised', async () => {
    const dep = await makeDeparture();
    await book(dep, 'Lotte', [{ first: 'Lotte', stop: 0 }, { first: 'Milan', stop: 1 }, { first: 'Noor', stop: 1 }]);
    const ruleId = await makeRule();
    await setEmailAllowance(1);
    const summary = await run();
    expect(summary).toMatchObject({ sent: 1, skipped_cap: 2 });
    expect((await sendRows(ruleId)).map((r) => r.status).sort()).toEqual(['sent', 'skipped_cap', 'skipped_cap']);
    const notes = await rows(`SELECT * FROM notifications WHERE reference_type = 'departure' AND reference_id = ? AND user_id = '11111111-1111-1111-1111-111111111111'`, dep.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain('2 messages');

    // still capped: nothing new is sent and nobody is told again
    queued.length = 0;
    await run(new Date('2032-08-08T17:00:00Z'));
    expect(queued).toHaveLength(0);
    expect(await rows(`SELECT id FROM notifications WHERE reference_type = 'departure' AND reference_id = ? AND user_id = '11111111-1111-1111-1111-111111111111'`, dep.id)).toHaveLength(1);

    // the allowance is raised: the two held-back messages go, the first is not sent again
    await setEmailAllowance(2000);
    const later = await run(new Date('2032-08-08T18:00:00Z'));
    expect(later.sent).toBe(2);
    expect((await sendRows(ruleId)).map((r) => r.status)).toEqual(['sent', 'sent', 'sent']);
  });

  it('in suggest mode sends nothing and makes one suggestion per departure to review and send', async () => {
    const dep = await makeDeparture();
    await book(dep, 'Olaf', [{ first: 'Olaf', stop: 0 }, { first: 'Pien', stop: 1 }]);
    const ruleId = await makeRule({ mode: 'suggest' });
    const summary = await run();
    expect(summary).toMatchObject({ sent: 0, suggested: 2 });
    expect(queued).toHaveLength(0);
    expect((await sendRows(ruleId)).map((r) => r.status)).toEqual(['suggested', 'suggested']);

    const suggestions = await rows(`SELECT * FROM assistant_suggestions WHERE rule_key = 'departures.scheduled_messages' AND entity_id = ?`, dep.id);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ status: 'pending', entity_type: 'departure', action_type: 'open_prefilled_form', title: 'Review and send 2 messages: Pickup time' });
    expect(JSON.parse(suggestions[0].params).href).toBe(`/settings/group-tours?tab=messages&rule=${ruleId}&departure=${dep.id}`);

    // reruns neither send nor add suggestions
    await run();
    await run(new Date('2032-08-09T09:00:00Z'));
    expect(queued).toHaveLength(0);
    expect(await rows(`SELECT id FROM assistant_suggestions WHERE rule_key = 'departures.scheduled_messages' AND entity_id = ?`, dep.id)).toHaveLength(1);

    // a person presses send: both go out, once, and the suggestion is done
    const sent = await json(await call('POST', `/departure-message-rules/${ruleId}/send`, admin, { departureId: dep.id }));
    expect(sent.data.sent).toBe(2);
    expect(queued.filter((j) => j.type === 'email')).toHaveLength(2);
    expect((await sendRows(ruleId)).map((r) => r.status)).toEqual(['sent', 'sent']);
    expect((await rows(`SELECT status FROM assistant_suggestions WHERE rule_key = 'departures.scheduled_messages' AND entity_id = ?`, dep.id))[0].status).toBe('applied');
    queued.length = 0;
    expect((await json(await call('POST', `/departure-message-rules/${ruleId}/send`, admin, { departureId: dep.id }))).data.sent).toBe(0);
    expect(queued).toHaveLength(0);
  });

  it('reaches the waitlisted audience and leaves confirmed bookings out of it', async () => {
    const dep = await makeDeparture('2032-08-10', 1);
    await book(dep, 'Quinn', [{ first: 'Quinn', stop: 0 }]);
    const waiting = await book(dep, 'Rosa', [{ first: 'Rosa', stop: 1 }], { confirm: false });
    expect(waiting.status).toBe('waitlisted');
    const ruleId = await makeRule({ audience: 'waitlisted', recipient: 'booking_contact', name: 'Waitlist news' });
    expect((await run()).sent).toBe(1);
    const row = (await sendRows(ruleId))[0];
    expect(row.seat_booking_id).toBe(waiting.id);
    expect(queued[0].data.to).toMatch(/^rosa\./);
  });

  it('covers departed and completed departures, and never draft or cancelled ones', async () => {
    const done = await makeDeparture('2032-06-01');
    await book(done, 'Sven', [{ first: 'Sven', stop: 0 }]);
    const cancelled = await makeDeparture('2032-06-01');
    await book(cancelled, 'Tess', [{ first: 'Tess', stop: 0 }]);
    await DB.prepare(`UPDATE departures SET status = 'completed' WHERE id = ?`).bind(done.id).run();
    await DB.prepare(`UPDATE departures SET status = 'cancelled' WHERE id = ?`).bind(cancelled.id).run();
    await makeRule({ name: 'Review', anchor: 'end', offsetDays: 2, localTime: '12:00', recipient: 'booking_contact' });
    // end date 2032-06-03 + 2 days, 12:00 CEST = 10:00Z
    expect((await run(new Date('2032-06-05T10:30:00Z'))).sent).toBe(1);
    expect(queued[0].data.to).toMatch(/^sven\./);
  });

  it('lets a tour rule replace the agency rule of the same name', async () => {
    const a = await makeDeparture();
    const b = await makeDeparture();
    await book(a, 'Uma', [{ first: 'Uma', stop: 0 }]);
    await book(b, 'Vera', [{ first: 'Vera', stop: 0 }]);
    await makeTemplate('r154-tour-template', 'Tour override for {first_name} at {pickup_time}');
    await makeRule({ name: 'Pickup time' });
    await makeRule({ name: 'pickup time', tourId: b.tourId, templateId: 'r154-tour-template' });
    expect((await run()).sent).toBe(2);
    const html = Object.fromEntries(queued.map((j) => [j.data.to.split('.')[0], j.data.html]));
    expect(html.uma).toContain('your pickup for');
    expect(html.vera).toBe('Tour override for Vera at 07:00');
  });

  it('does nothing when the agency switched group tours off, or the recipe is off', async () => {
    const dep = await makeDeparture();
    await book(dep, 'Wim', [{ first: 'Wim', stop: 0 }]);
    await makeRule();
    expect((await call('PUT', '/automations/departures.scheduled_messages', admin, { mode: 'off' })).status).toBe(200);
    expect((await run()).sent).toBe(0);
    expect((await call('PUT', '/automations/departures.scheduled_messages', admin, { mode: 'suggest' })).status).toBe(200);
    expect((await call('PUT', '/departures/settings', admin, { enabled: false })).status).toBe(200);
    expect((await run()).sent).toBe(0);
    expect((await call('PUT', '/departures/settings', admin, { enabled: true })).status).toBe(200);
    expect(queued).toHaveLength(0);
    expect((await run()).sent).toBe(1);
  });

  it('is run by the automations "run checks now" button too', async () => {
    const dep = await makeDeparture('2020-01-10'); // far in the past: never due now
    await book(dep, 'Xena', [{ first: 'Xena', stop: 0 }]);
    await makeRule();
    expect((await call('POST', '/automations/run-scheduled', admin)).status).toBe(200);
    expect(queued).toHaveLength(0);
  });
});

describe('the preview', () => {
  it('shows each person their own message without sending anything or writing a row', async () => {
    const dep = await makeDeparture();
    const b = await book(dep, 'Yara', [{ first: 'Yara', stop: 0 }, { first: 'Zef', stop: 1 }]);
    const ruleId = await makeRule();
    const res = await call('POST', `/departure-message-rules/${ruleId}/preview?departureId=${dep.id}`, admin);
    expect(res.status).toBe(200);
    const data = (await json(res)).data;
    expect(data.dueAt).toBe('2032-08-08T16:00:00.000Z');
    expect(data.items).toHaveLength(2);
    const [yara, zef] = data.items;
    expect(yara).toMatchObject({ name: 'Yara Visser', passengerId: b.passengers[0].id, channel: 'email', outcome: 'send', sentStatus: null });
    expect(yara.body).toContain('07:00 at Utrecht Centraal');
    expect(zef.body).toContain('07:40 at Amersfoort');
    expect(zef.subject).toBe('Pickup 07:40');
    expect(queued).toHaveLength(0);
    expect(await sendRows(ruleId)).toHaveLength(0);

    // after the job ran, the preview says who has been messaged
    await run();
    const after = (await json(await call('POST', `/departure-message-rules/${ruleId}/preview?departureId=${dep.id}`, admin))).data;
    expect(after.items.map((i: any) => i.sentStatus)).toEqual(['sent', 'sent']);
  });

  it('says why a marketing message would not go to an opted-out contact', async () => {
    const dep = await makeDeparture();
    const b = await book(dep, 'Anouk', [{ first: 'Anouk', stop: 0 }]);
    await withdrawMarketing(DB, b.contactId, 'email', 'manual');
    const ruleId = await makeRule({ recipient: 'booking_contact', purpose: 'marketing' });
    const data = (await json(await call('POST', `/departure-message-rules/${ruleId}/preview?departureId=${dep.id}`, admin))).data;
    expect(data.items[0]).toMatchObject({ outcome: 'skipped_opt_out' });
  });
});

describe('the rules API', () => {
  it('creates, changes and removes a rule, and refuses a template that does not exist', async () => {
    const bad = await call('POST', '/departure-message-rules', admin, { name: 'Broken', templateId: 'nope' });
    expect(bad.status).toBe(400);
    const id = await makeRule({ name: 'Temp rule' });
    const put = await call('PUT', `/departure-message-rules/${id}`, admin, { offsetDays: -3, localTime: '09:30', mode: 'suggest', isActive: false });
    expect(put.status).toBe(200);
    expect((await json(put)).data).toMatchObject({ offsetDays: -3, localTime: '09:30', mode: 'suggest', isActive: false, name: 'Temp rule' });
    expect((await call('PUT', `/departure-message-rules/${id}`, admin, { localTime: '25:00' })).status).toBe(400);
    expect((await call('DELETE', `/departure-message-rules/${id}`, admin)).status).toBe(200);
    expect((await call('DELETE', `/departure-message-rules/${id}`, admin)).status).toBe(404);
  });

  it('needs the group departures feature', async () => {
    await DB.prepare('DELETE FROM tenant_feature_flags WHERE tenant_id = ? AND feature_key = ?').bind(TENANT_ID, 'group_departures').run();
    await DB.prepare('INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES (?, ?, ?, 0)').bind('r154-gd', TENANT_ID, 'group_departures').run();
    const res = await call('GET', '/departure-message-rules', admin);
    await DB.prepare('DELETE FROM tenant_feature_flags WHERE id = ?').bind('r154-gd').run();
    expect(res.status).toBe(403);
    expect((await call('GET', '/departure-message-rules', admin)).status).toBe(200);
  });
});

describe('the departure variables', () => {
  it('fill the booking and the passenger from the departure, with the agency locale', async () => {
    const dep = await makeDeparture();
    await DB.prepare('UPDATE departures SET tour_leader_user_id = ? WHERE id = ?').bind('11111111-1111-1111-1111-111111111111', dep.id).run();
    await DB.prepare("UPDATE users SET phone = '+31 6 5555 0100' WHERE id = '11111111-1111-1111-1111-111111111111'").run();
    const b = await book(dep, 'Variabel', [{ first: 'Ada', stop: 1 }, { first: 'Bo', stop: 0 }]);
    await DB.prepare("UPDATE seat_passengers SET room_type = 'double' WHERE id = ?").bind(b.passengers[0].id).run();
    const ctx = { seatBookingId: b.id, passengerId: b.passengers[1].id };
    const vars = await resolveVariables(DB, b.contactId, undefined, {}, undefined, ctx);
    expect(vars).toMatchObject({
      tour_name: expect.stringContaining('Alpine Escape'), departure_code: dep.code, departure_date: '10 August 2032', return_date: '12 August 2032',
      pickup_point: 'Utrecht Centraal', pickup_time: '07:00', pickup_address: 'Stationsplein 1, Utrecht', seat_count: '2', passenger_names: 'Ada Visser, Bo Visser',
      tour_leader_phone: '+31 6 5555 0100',
    });
    expect(vars.tour_leader_name).toBeTruthy();
    // a passenger without a room type of their own takes the first passenger's; the label comes from the agency's room types
    expect(vars.room_type).toBe('Double');
    // another passenger of the same booking has another pickup
    expect((await resolveVariables(DB, b.contactId, undefined, {}, undefined, { seatBookingId: b.id, passengerId: b.passengers[0].id })).pickup_time).toBe('07:40');
    // a 12 hour clock locale writes 7:00 am, a 24 hour one 07:00
    await DB.prepare("UPDATE settings SET value = 'en-IN' WHERE key = 'locale'").run();
    expect((await resolveVariables(DB, b.contactId, undefined, {}, undefined, ctx)).pickup_time).toBe('7:00 am');
    await DB.prepare("UPDATE settings SET value = 'en-GB' WHERE key = 'locale'").run();
    // without a departure context the variables stay empty, as before
    expect((await resolveVariables(DB, b.contactId)).pickup_time).toBeUndefined();
  });
});
