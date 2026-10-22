import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import worker from '../src/index';

// R155: "Accept and book" on the shared quote page: one tap approves the quote, wins the lead, holds or confirms the seats of a
// linked departure, makes the invoice the agency asked for and offers the deposit. Idempotent, rate limited, and invisible while off.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const realLimits = { ...testEnv, RATE_LIMIT_MULTIPLIER: '1' };

let admin = '';
let sales = '';
let seq = 0;
let ipSeq = 10;

async function send(e: any, method: string, path: string, init: { token?: string | null; json?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost${path}`, { method, headers, body: init.json === undefined ? undefined : JSON.stringify(init.json) }), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const staff = (method: string, path: string, body?: unknown, token = admin) => send(testEnv, method, `/api/v1${path}`, { token, json: body });
const json = async (res: Response): Promise<any> => (await res.json()) as any;
const data = async (res: Response): Promise<any> => ((await res.json()) as any).data;
const rows = async <T = any>(sql: string, ...b: unknown[]): Promise<T[]> => ((await DB.prepare(sql).bind(...b).all()).results ?? []) as T[];
const setSetting = (key: string, value: string) =>
  DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, value, new Date().toISOString()).run();

const pubGet = (token: string, e: any = testEnv) => send(e, 'GET', `/api/v1/public/quotation/${token}`, { headers: { 'cf-connecting-ip': `198.51.100.${ipSeq++ % 250}` } });
const pubAccept = (token: string, body: unknown, opts: { ip?: string; e?: any } = {}) =>
  send(opts.e ?? testEnv, 'POST', `/api/v1/public/quotation/${token}/accept`, { json: body, headers: { 'cf-connecting-ip': opts.ip ?? `203.0.113.${ipSeq++ % 250}` } });
const ok = { name: 'Eva de Vries', termsAccepted: true };

const BANK = { accountName: 'Reisbureau Test BV', iban: 'NL91ABNA0417164300', bic: 'ABNANL2A', bankName: 'ABN AMRO' };

async function setAccept(over: Record<string, unknown> = {}) {
  expect((await staff('PUT', '/settings/quotes-accept', { enabled: true, label: '', requireName: true, requireTerms: true, holdSeats: true, createInvoice: 'none', offerDeposit: true, ...over })).status).toBe(200);
}

interface Quote { id: string; token: string; leadId: string; contactId: string }

/** A lead (3 pax), a quote with an adult line, a band line nobody falls in (quantity 0) and a flat line, and its share link. */
async function makeQuote(o: { validityDate?: string | null; pax?: number } = {}): Promise<Quote> {
  seq += 1;
  const c = await staff('POST', '/contacts', { name: `Quote Buyer ${seq}`, type: 'customer', email: `buyer${seq}@quote-accept.test`, phone: `612${String(100000 + seq)}` });
  expect(c.status).toBe(201);
  const contactId = (await data(c)).id;
  const l = await staff('POST', '/leads', { contactId, title: `Quote trip ${seq}`, destinations: ['Switzerland'], travelDate: '2033-06-10', paxAdults: o.pax ?? 3, paxChildren: 0, tripType: 'family', source: 'manual' });
  expect(l.status).toBe(201);
  const leadId = (await data(l)).id;
  const it = await staff('POST', '/itineraries', {
    leadId,
    title: `Alpine quote ${seq}`,
    currency: 'EUR',
    validityDate: o.validityDate === undefined ? '2099-01-01' : o.validityDate,
    termsConditions: 'Terms apply.',
    days: [{
      dayNumber: 1, title: 'Arrive',
      items: [
        { type: 'activity', title: 'Guided walk adult', sellingPrice: 100, quantity: 3, paxType: 'adult', sortOrder: 0 },
        { type: 'activity', title: 'Guided walk infant', sellingPrice: 40, quantity: 0, paxType: 'infant', sortOrder: 1 },
        { type: 'hotel', title: 'Hotel for the group', sellingPrice: 500, quantity: 1, sortOrder: 2 },
      ],
    }],
  });
  expect(it.status).toBe(201);
  const id = (await data(it)).id;
  const link = await staff('POST', `/itineraries/${id}/share-link`);
  expect(link.status).toBe(200);
  return { id, token: (await data(link)).shareToken, leadId, contactId };
}

/** A tour in EUR with one open departure of `capacity` seats. */
async function makeDeparture(capacity = 10): Promise<{ id: string; code: string }> {
  seq += 1;
  const tour = await staff('POST', '/tours', { code: `QA${seq}`, title: `Accept tour ${seq}`, destination: 'Switzerland', durationDays: 5, currency: 'EUR' });
  expect(tour.status).toBe(201);
  const tourId = (await data(tour)).id;
  expect((await staff('PUT', `/tours/${tourId}/prices`, { prices: [{ kind: 'age_band', key: 'adult', label: 'Adult', amount: 1000 }] })).status).toBe(200);
  const dep = await staff('POST', '/departures', { tourId, startDate: `2033-0${(seq % 9) + 1}-20`, capacityMode: 'manual', capacity });
  expect(dep.status).toBe(201);
  const d = await data(dep);
  expect((await staff('POST', `/departures/${d.id}/status`, { status: 'open' })).status).toBe(200);
  return { id: d.id, code: d.code };
}

async function link(q: Quote, departureId: string, seats?: number) {
  expect((await staff('PUT', `/itineraries/${q.id}/departure`, { departureId, seatsRequested: seats })).status).toBe(200);
}

/** Someone else already holds `n` seats of the departure. */
async function takeSeats(depId: string, n: number) {
  seq += 1;
  const res = await staff('POST', `/departures/${depId}/bookings`, {
    contact: { name: `Other party ${seq}`, email: `other${seq}@quote-accept.test` },
    passengers: Array.from({ length: n }, (_, i) => ({ firstName: `Pax${i}`, ageYears: 30 })),
  });
  expect(res.status).toBe(201);
}

const events = async (type: string, entityId: string) => rows('SELECT * FROM domain_events WHERE type = ? AND entity_id = ?', type, entityId);

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await send(testEnv, 'POST', '/api/v1/test/reset')).status).toBe(200);
  const login = async (email: string) => (await data(await send(testEnv, 'POST', '/api/v1/auth/login', { json: { email, password: 'password123', tenantId: TENANT_ID } }))).accessToken;
  admin = await login('admin@e2e.test');
  sales = await login('sales@e2e.test');
  expect((await staff('PUT', '/automations/pause', { paused: true })).status).toBe(200);
  for (const [k, v] of Object.entries({ country: 'NL', company_country: 'NL', currency: 'EUR', locale: 'nl-NL', timezone: 'Europe/Amsterdam', phone_default_country: 'NL', tax_system: 'none' })) await setSetting(k, v);
});

beforeEach(async () => {
  await DB.prepare(`DELETE FROM tenant_feature_flags WHERE feature_key IN ('quote_acceptance', 'group_departures')`).run();
  await DB.prepare('DELETE FROM payment_gateway_accounts').run();
  await DB.prepare(`DELETE FROM settings WHERE key IN ('bank_details', 'payment_defaults')`).run();
  expect((await staff('PUT', '/departures/settings', { enabled: true, holdExpiryHours: 48, confirmMode: 'manual', waitlist: { enabled: true }, showSeatsLeft: 'always', deposit: { type: 'none', value: null } })).status).toBe(200);
  await setAccept({ enabled: false });
});

describe('the setting', () => {
  it('starts off, is changed by an admin only, and keeps unknown input out', async () => {
    await DB.prepare(`DELETE FROM settings WHERE key = 'quotes_accept'`).run();
    const first = await data(await staff('GET', '/settings/quotes-accept'));
    expect(first).toMatchObject({ enabled: false, label: '', requireName: true, requireTerms: true, holdSeats: true, createInvoice: 'none', offerDeposit: true });
    expect((await staff('PUT', '/settings/quotes-accept', { enabled: true }, sales)).status).toBe(403);
    expect((await staff('PUT', '/settings/quotes-accept', { createInvoice: 'receipt' })).status).toBe(400);
    const saved = await data(await staff('PUT', '/settings/quotes-accept', { enabled: true, label: 'Book now', createInvoice: 'proforma' }));
    expect(saved).toMatchObject({ enabled: true, label: 'Book now', createInvoice: 'proforma', requireName: true });
  });
});

describe('off means as before', () => {
  it('the setting off: no accept block on GET and 404 on accept', async () => {
    const q = await makeQuote();
    const page = await json(await pubGet(q.token));
    expect(page.accept).toBeUndefined();
    expect(page.itinerary.title).toContain('Alpine quote');
    const res = await pubAccept(q.token, ok);
    expect(res.status).toBe(404);
    expect((await rows('SELECT status, accepted_at FROM itineraries WHERE id = ?', q.id))[0]).toMatchObject({ status: 'draft', accepted_at: null });
  });

  it('the plan feature off (an agency override) also hides it, whatever the setting says', async () => {
    const q = await makeQuote();
    await setAccept({ enabled: true });
    expect((await json(await pubGet(q.token))).accept).toMatchObject({ enabled: true });
    await DB.prepare('INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES (?, ?, ?, 0)').bind('r155-flag', TENANT_ID, 'quote_acceptance').run();
    expect((await json(await pubGet(q.token))).accept).toBeUndefined();
    expect((await pubAccept(q.token, ok)).status).toBe(404);
  });
});

describe('the public page', () => {
  it('hides the lines of an age band nobody falls in, and shows the accept block with the agency label', async () => {
    const q = await makeQuote();
    await setAccept({ label: 'Book this trip' });
    const page = await json(await pubGet(q.token));
    const titles = page.days.flatMap((d: any) => d.items.map((i: any) => i.title));
    expect(titles).toEqual(['Guided walk adult', 'Hotel for the group']);
    expect(page.accept).toMatchObject({ enabled: true, label: 'Book this trip', requireName: true, requireTerms: true, state: 'open' });
    expect(page.accept.departure).toBeUndefined();
    expect(JSON.stringify(page)).not.toContain('accepted_ip_hash');
  });

  it('the builder still has the zero-quantity line', async () => {
    const q = await makeQuote();
    const full = await data(await staff('GET', `/itineraries/${q.id}`));
    expect(full.days[0].items.map((i: any) => [i.title, i.quantity])).toContainEqual(['Guided walk infant', 0]);
  });
});

describe('accepting', () => {
  it('approves the quote, wins the lead once, notifies staff and is idempotent', async () => {
    const q = await makeQuote();
    await setAccept();
    expect((await pubAccept(q.token, { name: '', termsAccepted: true })).status).toBe(400);
    expect((await pubAccept(q.token, { name: 'Eva', termsAccepted: false })).status).toBe(400);
    expect((await rows('SELECT accepted_at FROM itineraries WHERE id = ?', q.id))[0].accepted_at).toBeNull();

    const res = await pubAccept(q.token, ok, { ip: '203.0.113.77' });
    expect(res.status).toBe(200);
    const first = await json(res);
    expect(first).toMatchObject({ status: 'accepted', name: 'Eva de Vries' });
    expect(first.invoice).toBeUndefined();

    const [row] = await rows('SELECT status, accepted_at, accepted_via, accepted_name, accepted_ip_hash FROM itineraries WHERE id = ?', q.id);
    expect(row).toMatchObject({ status: 'approved', accepted_via: 'share_link', accepted_name: 'Eva de Vries' });
    expect(row.accepted_at).toBe(first.acceptedAt);
    // Only a salted hash of the address is kept.
    expect(row.accepted_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain('203.0.113.77');
    expect((await rows('SELECT status FROM leads WHERE id = ?', q.leadId))[0].status).toBe('won');

    const again = await json(await pubAccept(q.token, { name: 'Someone else', termsAccepted: true }));
    expect(again).toEqual(first);
    expect((await rows('SELECT accepted_name FROM itineraries WHERE id = ?', q.id))[0].accepted_name).toBe('Eva de Vries');
    expect(await events('quote.accepted', q.id)).toHaveLength(1);
    expect((await events('lead.status_changed', q.leadId)).filter((e) => JSON.parse(e.payload).to === 'won')).toHaveLength(1);
    expect(await rows(`SELECT id FROM lead_activities WHERE lead_id = ? AND content LIKE '%accepted online%'`, q.leadId)).not.toHaveLength(0);
    expect(await rows(`SELECT id FROM notifications WHERE reference_id = ? AND type = 'quote_accepted'`, q.leadId)).toHaveLength(1);

    // The page now shows the accepted state, with the first answer.
    const page = await json(await pubGet(q.token));
    expect(page.accept.state).toBe('accepted');
    expect(page.accept.result).toMatchObject({ status: 'accepted', name: 'Eva de Vries' });
  });

  it('two taps at once make one acceptance', async () => {
    const q = await makeQuote();
    await setAccept({ createInvoice: 'invoice' });
    const [a, b] = await Promise.all([pubAccept(q.token, ok), pubAccept(q.token, ok)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await events('quote.accepted', q.id)).toHaveLength(1);
    expect(await rows('SELECT id FROM invoices WHERE lead_id = ?', q.leadId)).toHaveLength(1);
  });

  it('a name and the terms are only asked for when the settings ask for them', async () => {
    const q = await makeQuote();
    await setAccept({ requireName: false, requireTerms: false });
    const res = await pubAccept(q.token, {});
    expect(res.status).toBe(200);
    expect((await json(res)).name).toBeNull();
  });

  it('refuses an expired quote, a revoked link and a rejected quote, and keeps the first answer for an accepted one', async () => {
    await setAccept();
    const expired = await makeQuote({ validityDate: '2020-01-01' });
    expect((await pubAccept(expired.token, ok)).status).toBe(410);
    expect((await pubGet(expired.token)).status).toBe(410);

    const revoked = await makeQuote();
    expect((await staff('DELETE', `/itineraries/${revoked.id}/share-link`)).status).toBe(200);
    expect((await pubAccept(revoked.token, ok)).status).toBe(410);
    expect((await pubAccept('never-issued-r155', ok)).status).toBe(404);

    const rejected = await makeQuote();
    expect((await staff('PUT', `/itineraries/${rejected.id}`, { status: 'rejected' })).status).toBe(200);
    const res = await pubAccept(rejected.token, ok);
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('NOT_ACCEPTABLE');
    expect((await rows('SELECT status FROM leads WHERE id = ?', rejected.leadId))[0].status).not.toBe('won');

    // An accepted quote stays readable after its validity date.
    const later = await makeQuote({ validityDate: '2099-01-01' });
    expect((await pubAccept(later.token, ok)).status).toBe(200);
    await DB.prepare(`UPDATE itineraries SET validity_date = '2020-01-01' WHERE id = ?`).bind(later.id).run();
    expect((await pubGet(later.token)).status).toBe(200);
    expect((await pubAccept(later.token, ok)).status).toBe(200);
  });

  it('allows 5 accepts per 10 minutes per address', async () => {
    await setAccept();
    const quotes: Quote[] = [];
    for (let i = 0; i < 6; i++) quotes.push(await makeQuote());
    const statuses: number[] = [];
    for (const q of quotes) statuses.push((await pubAccept(q.token, ok, { ip: '192.0.2.200', e: realLimits })).status);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
    expect((await rows('SELECT accepted_at FROM itineraries WHERE id = ?', quotes[5].id))[0].accepted_at).toBeNull();
  });
});

describe('seats of a linked departure', () => {
  it('holds the seats when the confirm mode is manual (seats requested on the quote), and says when', async () => {
    const dep = await makeDeparture(10);
    const q = await makeQuote();
    await link(q, dep.id, 4);
    await setAccept();
    const page = await json(await pubGet(q.token));
    expect(page.accept.state).toBe('open');
    expect(page.accept.departure).toMatchObject({ seatsLeft: 10, seatsRequested: 4 });
    const res = await json(await pubAccept(q.token, ok));
    expect(res.seats).toMatchObject({ status: 'held', seats: 4, departureCode: dep.code });
    expect(res.seats.holdExpiresAt).toBeTruthy();
    const [b] = await rows('SELECT status, seats, source, lead_id FROM seat_bookings WHERE departure_id = ?', dep.id);
    expect(b).toMatchObject({ status: 'held', seats: 4, source: 'quote_accept', lead_id: q.leadId });
    expect((await json(await pubAccept(q.token, ok))).seats).toMatchObject({ status: 'held', seats: 4 });
    expect(await rows('SELECT id FROM seat_bookings WHERE departure_id = ?', dep.id)).toHaveLength(1);
  });

  it('uses the party of the lead when the quote names no seat count, and confirms in confirm mode auto_when_available', async () => {
    expect((await staff('PUT', '/departures/settings', { confirmMode: 'auto_when_available' })).status).toBe(200);
    const dep = await makeDeparture(10);
    const q = await makeQuote({ pax: 3 });
    await DB.prepare('UPDATE itineraries SET departure_id = ? WHERE id = ?').bind(dep.id, q.id).run();
    await setAccept();
    const res = await json(await pubAccept(q.token, ok));
    expect(res.seats).toMatchObject({ status: 'confirmed', seats: 3 });
    expect((await rows('SELECT confirmed_by FROM seat_bookings WHERE departure_id = ?', dep.id))[0].confirmed_by).toBe('auto');
  });

  it('holds until the deposit when the confirm mode is on_deposit', async () => {
    expect((await staff('PUT', '/departures/settings', { confirmMode: 'on_deposit' })).status).toBe(200);
    const dep = await makeDeparture(10);
    const q = await makeQuote();
    await link(q, dep.id, 2);
    await setAccept();
    expect((await json(await pubAccept(q.token, ok))).seats.status).toBe('held');
  });

  it('puts the party on the waitlist when the departure is full and the waitlist is on', async () => {
    const dep = await makeDeparture(4);
    await takeSeats(dep.id, 2);
    const q = await makeQuote();
    await link(q, dep.id, 3);
    await setAccept();
    expect((await json(await pubGet(q.token))).accept.state).toBe('full_waitlist');
    const res = await json(await pubAccept(q.token, ok));
    expect(res.seats).toMatchObject({ status: 'waitlisted', seats: 3 });
    expect((await rows("SELECT seats FROM seat_bookings WHERE departure_id = ? AND status = 'waitlisted'", dep.id))).toEqual([{ seats: 3 }]);
  });

  it('refuses when the departure is full and the waitlist is off, and changes nothing', async () => {
    expect((await staff('PUT', '/departures/settings', { waitlist: { enabled: false } })).status).toBe(200);
    const dep = await makeDeparture(4);
    await takeSeats(dep.id, 2);
    const q = await makeQuote();
    await link(q, dep.id, 3);
    await setAccept();
    expect((await json(await pubGet(q.token))).accept.state).toBe('full');
    const res = await pubAccept(q.token, ok);
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe('DEPARTURE_FULL');
    expect((await rows('SELECT accepted_at FROM itineraries WHERE id = ?', q.id))[0].accepted_at).toBeNull();
    expect((await rows('SELECT status FROM leads WHERE id = ?', q.leadId))[0].status).not.toBe('won');
    expect(await rows('SELECT id FROM seat_bookings WHERE departure_id = ? AND lead_id = ?', dep.id, q.leadId)).toHaveLength(0);
  });

  it('leaves the seats alone when the agency turns seat holds off, when group tours are off, and shows the seats-left setting', async () => {
    const dep = await makeDeparture(10);
    const q = await makeQuote();
    await link(q, dep.id, 4);
    await setAccept({ holdSeats: false });
    expect((await json(await pubGet(q.token))).accept.departure).toBeUndefined();
    const res = await json(await pubAccept(q.token, ok));
    expect(res.seats).toBeUndefined();
    expect(await rows('SELECT id FROM seat_bookings WHERE departure_id = ?', dep.id)).toHaveLength(0);

    const q2 = await makeQuote();
    await link(q2, dep.id, 4);
    await setAccept({ holdSeats: true });
    expect((await staff('PUT', '/departures/settings', { showSeatsLeft: 'never' })).status).toBe(200);
    expect((await json(await pubGet(q2.token))).accept.departure.seatsLeft).toBeNull();
    expect((await staff('PUT', '/departures/settings', { showSeatsLeft: 'always', enabled: false })).status).toBe(200);
    const page = await json(await pubGet(q2.token));
    expect(page.accept.departure).toBeUndefined();
    expect((await json(await pubAccept(q2.token, ok))).seats).toBeUndefined();
  });
});

describe('invoice and deposit', () => {
  it('makes no invoice by default', async () => {
    const q = await makeQuote();
    await setAccept();
    const res = await json(await pubAccept(q.token, ok));
    expect(res.invoice).toBeUndefined();
    expect(res.payment).toBeUndefined();
    expect(await rows('SELECT id FROM invoices WHERE lead_id = ?', q.leadId)).toHaveLength(0);
  });

  it('makes the invoice from the quote lines (no zero-quantity line) and a deposit link on the test gateway', async () => {
    expect((await staff('PUT', '/integrations/payment-gateways/mock', {})).status).toBe(200);
    expect((await staff('PUT', '/settings/payment-defaults', { deposit: { type: 'percent', value: 20 } })).status).toBe(200);
    const q = await makeQuote();
    await setAccept({ createInvoice: 'invoice' });
    const res = await json(await pubAccept(q.token, ok));
    expect(res.invoice).toMatchObject({ total: 800, currency: 'EUR', type: 'tax_invoice' });
    expect(res.payment).toMatchObject({ amount: 160, currency: 'EUR', purpose: 'deposit' });
    expect(res.payment.url).toContain('http');
    const [inv] = await rows('SELECT id, type, status, payment_link_gateway, payment_link_amount, payment_link_purpose FROM invoices WHERE lead_id = ?', q.leadId);
    expect(inv).toMatchObject({ type: 'tax_invoice', payment_link_gateway: 'mock', payment_link_amount: 160, payment_link_purpose: 'deposit' });
    const lines = await rows('SELECT description, quantity, rate FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order', inv.id);
    expect(lines).toEqual([
      { description: 'Day 1: Guided walk adult', quantity: 3, rate: 100 },
      { description: 'Day 1: Hotel for the group', quantity: 1, rate: 500 },
    ]);
    expect((await rows('SELECT accepted_invoice_id FROM itineraries WHERE id = ?', q.id))[0].accepted_invoice_id).toBe(inv.id);
    // A repeated accept returns the same link and makes no second invoice.
    const again = await json(await pubAccept(q.token, ok));
    expect(again.payment.url).toBe(res.payment.url);
    expect(await rows('SELECT id FROM invoices WHERE lead_id = ?', q.leadId)).toHaveLength(1);
  });

  it('a proforma is a proforma, and without a set deposit the link is for the whole balance', async () => {
    expect((await staff('PUT', '/integrations/payment-gateways/mock', {})).status).toBe(200);
    const q = await makeQuote();
    await setAccept({ createInvoice: 'proforma' });
    const res = await json(await pubAccept(q.token, ok));
    expect(res.invoice.type).toBe('proforma');
    expect(res.payment).toMatchObject({ amount: 800, purpose: 'balance' });
  });

  it('uses the deposit of the departure for a quote with held seats', async () => {
    expect((await staff('PUT', '/integrations/payment-gateways/mock', {})).status).toBe(200);
    expect((await staff('PUT', '/departures/settings', { deposit: { type: 'per_seat', value: 50 } })).status).toBe(200);
    const dep = await makeDeparture(10);
    const q = await makeQuote();
    await link(q, dep.id, 4);
    await setAccept({ createInvoice: 'invoice' });
    const res = await json(await pubAccept(q.token, ok));
    expect(res.seats.status).toBe('held');
    expect(res.payment).toMatchObject({ amount: 200, purpose: 'deposit' });
  });

  it('gives the bank details and the invoice number as the reference when no gateway is connected', async () => {
    await setSetting('bank_details', JSON.stringify(BANK));
    const q = await makeQuote();
    await setAccept({ createInvoice: 'invoice' });
    const res = await json(await pubAccept(q.token, ok));
    expect(res.payment).toBeUndefined();
    expect(res.bank).toMatchObject({ amount: 800, currency: 'EUR', reference: expect.stringContaining(res.invoice.number) });
    expect(res.bank.lines.map((l: any) => l.field)).toEqual(expect.arrayContaining(['accountName', 'iban']));
  });

  it('offers no payment when the agency turned the deposit off', async () => {
    expect((await staff('PUT', '/integrations/payment-gateways/mock', {})).status).toBe(200);
    const q = await makeQuote();
    await setAccept({ createInvoice: 'invoice', offerDeposit: false });
    const res = await json(await pubAccept(q.token, ok));
    expect(res.invoice).toBeDefined();
    expect(res.payment).toBeUndefined();
    expect(res.bank).toBeUndefined();
  });
});

describe('staff mark a quote accepted', () => {
  it('records an acceptance that came by message, wins the lead, and is idempotent', async () => {
    const q = await makeQuote();
    const res = await staff('POST', `/itineraries/${q.id}/mark-accepted`, { via: 'message', name: 'Eva by WhatsApp' });
    expect(res.status).toBe(200);
    expect((await data(res)).changed).toBe(true);
    expect((await rows('SELECT status, accepted_via, accepted_name, accepted_ip_hash FROM itineraries WHERE id = ?', q.id))[0]).toMatchObject({ status: 'approved', accepted_via: 'message', accepted_name: 'Eva by WhatsApp', accepted_ip_hash: null });
    expect((await rows('SELECT status FROM leads WHERE id = ?', q.leadId))[0].status).toBe('won');
    expect((await data(await staff('POST', `/itineraries/${q.id}/mark-accepted`, {}))).changed).toBe(false);
    expect(await events('quote.accepted', q.id)).toHaveLength(1);

    const detail = await data(await staff('GET', `/itineraries/${q.id}`));
    expect(detail).toMatchObject({ acceptedVia: 'message', acceptedName: 'Eva by WhatsApp' });
    expect(detail.acceptedAt).toBeTruthy();
    expect(detail.acceptedIpHash).toBeUndefined();
    expect((await staff('POST', '/itineraries/does-not-exist/mark-accepted', {})).status).toBe(404);
  });
});
