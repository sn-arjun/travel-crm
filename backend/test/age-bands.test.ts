import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import {
  DEFAULT_AGE_BANDS, PER_PERSON, ageOn, ageOnFractional, bandForAge, bandsFor, countByBand, fillQuantities, parseBands,
} from '../src/services/pricing/age-bands';

// R149: the shared band resolver, the agency and template bands, filling quote quantities, the assistant's one-click quote.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

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
const data = async (res: Response): Promise<any> => ((await res.json()) as any).data;
const rows = async <T = any>(sql: string, ...b: unknown[]): Promise<T[]> => ((await DB.prepare(sql).bind(...b).all()).results ?? []) as T[];

const FOUR_BANDS = [
  { key: 'adult', label: 'Adult', minAge: 12 },
  { key: 'child_6', label: 'Child 6 to 11', minAge: 6 },
  { key: 'child_4', label: 'Child 4 to 5', minAge: 4 },
  { key: 'child_0', label: 'Child 0 to 3', minAge: 0 },
];

describe('pure resolver', () => {
  it('puts the boundary ages in the right default band', () => {
    expect(bandForAge(DEFAULT_AGE_BANDS, 11.9)).toBe('child');
    expect(bandForAge(DEFAULT_AGE_BANDS, 12)).toBe('adult');
    expect(bandForAge(DEFAULT_AGE_BANDS, 2)).toBe('child');
    expect(bandForAge(DEFAULT_AGE_BANDS, 1.99)).toBe('infant');
    expect(bandForAge(DEFAULT_AGE_BANDS, 0)).toBe('infant');
    expect(bandForAge(DEFAULT_AGE_BANDS, 64)).toBe('adult');
    expect(bandForAge(DEFAULT_AGE_BANDS, null)).toBeNull();
    expect(bandForAge(DEFAULT_AGE_BANDS, -1)).toBeNull();
  });

  it('works with a four-band list and gives the bands keys of their own', () => {
    const parsed = parseBands(FOUR_BANDS);
    expect(parsed.error).toBeNull();
    expect(parsed.bands.map((b) => b.minAge)).toEqual([12, 6, 4, 0]);
    const [adult, c6, c4, c0] = parsed.bands.map((b) => b.key);
    expect(parsed.bands.map((b) => b.key)).toEqual(['adult', 'child_6', 'child_4', 'child_0']);
    // Rows without a key get one from the label, all different.
    const keyed = parseBands([{ label: 'Adult', minAge: 12 }, { label: 'Child', minAge: 6 }, { label: 'Child', minAge: 0 }]);
    expect(new Set(keyed.bands.map((b) => b.key)).size).toBe(3);
    expect([11.9, 6, 5.99, 4, 3.5, 0, 12].map((a) => bandForAge(parsed.bands, a))).toEqual([c6, c6, c4, c4, c0, c0, adult]);
  });

  it('rejects band lists with a gap at birth, a repeated age or a repeated key', () => {
    expect(parseBands([{ label: 'Adult', minAge: 12 }, { label: 'Child', minAge: 2 }]).error).toMatch(/age 0/);
    expect(parseBands([{ label: 'A', minAge: 12 }, { label: 'B', minAge: 12 }, { label: 'C', minAge: 0 }]).error).toMatch(/same age/);
    expect(parseBands([{ key: 'x', minAge: 12 }, { key: 'x', minAge: 0 }]).error).toMatch(/same key/);
    expect(parseBands([{ label: 'A', minAge: 'abc' }]).error).toBeTruthy();
  });

  it('measures age on the travel date, whole and fractional', () => {
    expect(ageOn('2020-07-11', '2032-07-10')).toBe(11);
    expect(ageOn('2020-07-10', '2032-07-10')).toBe(12);
    expect(ageOn('2016-03-01', '2026-12-18')).toBe(10);
    expect(ageOnFractional('2020-07-11', '2032-07-10')).toBeGreaterThan(11.99);
    expect(ageOnFractional('2020-07-11', '2032-07-10')).toBeLessThan(12);
    expect(ageOnFractional('2020-01-01', '2026-01-01')).toBe(6);
  });

  it('uses the template list over the agency list', () => {
    const own = parseBands(FOUR_BANDS).bands;
    expect(bandsFor(own, DEFAULT_AGE_BANDS)).toEqual(own);
    expect(bandsFor(null, DEFAULT_AGE_BANDS).map((b) => b.key)).toEqual(['adult', 'child', 'infant']);
    expect(bandsFor('garbage', DEFAULT_AGE_BANDS).map((b) => b.key)).toEqual(['adult', 'child', 'infant']);
  });

  it('fills band lines from the count in the band, per-person lines from the total and leaves other lines', () => {
    const lines = [
      { id: 'a', paxType: 'adult', quantity: 1 },
      { id: 'c', paxType: 'child', quantity: 1 },
      { id: 'i', paxType: 'infant', quantity: 1 },
      { id: 'p', paxType: PER_PERSON, quantity: 1 },
      { id: 'f', paxType: null, quantity: 3 },
      { id: 'u', paxType: 'teen', quantity: 4 },
    ];
    expect(fillQuantities(lines, DEFAULT_AGE_BANDS, { adults: 2, ages: [8, 5] })).toEqual([
      { id: 'a', from: 1, to: 2 },
      { id: 'c', from: 1, to: 2 },
      { id: 'i', from: 1, to: 0 },
      { id: 'p', from: 1, to: 4 },
    ]);
    // Ages at or above the adult minimum are adults too.
    expect(countByBand(DEFAULT_AGE_BANDS, { adults: 1, ages: [40, 13, 1] }).counts).toEqual({ adult: 3, child: 0, infant: 1 });
    // Children of unknown age go in the child band, infants in the youngest.
    expect(countByBand(DEFAULT_AGE_BANDS, { adults: 2, children: 2, infants: 1 }).counts).toEqual({ adult: 2, child: 2, infant: 1 });
  });
});

describe('age bands on templates and quotes', () => {
  let admin = '';
  let sales = '';
  let contactId = '';
  let leadId = '';
  let templateId = '';

  const templateData = JSON.stringify({
    days: [
      { dayNumber: 1, title: 'Arrive', items: [
        { type: 'hotel', title: 'Hotel, whole group', costPrice: 100, sellingPrice: 1000, quantity: 1, taxRate: 0, sortOrder: 0 },
        { type: 'activity', title: 'Tour adult', costPrice: 10, sellingPrice: 100, quantity: 1, taxRate: 0, paxType: 'adult', sortOrder: 1 },
        { type: 'activity', title: 'Tour child', costPrice: 5, sellingPrice: 50, quantity: 1, taxRate: 0, paxType: 'child', sortOrder: 2 },
        { type: 'transport', title: 'Transfer per person', costPrice: 2, sellingPrice: 20, quantity: 1, taxRate: 0, paxType: PER_PERSON, sortOrder: 3 },
      ] },
    ],
    inclusions: [],
    exclusions: [],
  });

  async function newLead(name: string, pax: { adults: number; children: number; infants?: number }, travelDate = '2032-07-10'): Promise<{ contactId: string; leadId: string }> {
    const c = await call('POST', '/contacts', admin, { name, type: 'customer', email: `${name.toLowerCase().replace(/\W+/g, '.')}@ab.test` });
    expect(c.status).toBe(201);
    const cid = (await data(c)).id;
    const l = await call('POST', '/leads', admin, {
      contactId: cid, title: `${name} trip`, destinations: ['Kerala'], travelDate, paxAdults: pax.adults, paxChildren: pax.children,
      paxInfants: pax.infants ?? 0, tripType: 'family', source: 'manual',
    });
    expect(l.status).toBe(201);
    return { contactId: cid, leadId: (await data(l)).id };
  }

  const quantities = async (itineraryId: string): Promise<Record<string, number>> =>
    Object.fromEntries((await rows(
      `SELECT i.title, i.quantity FROM itinerary_items i JOIN itinerary_days d ON d.id = i.day_id WHERE d.itinerary_id = ?`, itineraryId,
    )).map((r) => [r.title, r.quantity]));

  async function setFlag(enabled: boolean | null) {
    await DB.prepare('DELETE FROM tenant_feature_flags WHERE tenant_id = ? AND feature_key = ?').bind(TENANT_ID, 'age_band_pricing').run();
    if (enabled !== null) {
      await DB.prepare('INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES (?, ?, ?, ?)').bind('r149-flag', TENANT_ID, 'age_band_pricing', enabled ? 1 : 0).run();
    }
  }

  beforeAll(async () => {
    await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = async (email: string) => (await data(await call('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID }))).accessToken;
    admin = await login('admin@e2e.test');
    sales = await login('sales@e2e.test');
    ({ contactId, leadId } = await newLead('Ada Family', { adults: 2, children: 2 }));
    const t = await call('POST', '/itinerary-templates', admin, { title: 'Band template', destination: 'Kerala', durationDays: 1, category: 'family', templateData });
    expect(t.status).toBe(201);
    templateId = (await data(t)).id;
  });

  afterAll(async () => {
    await setFlag(null);
    await DB.prepare("DELETE FROM settings WHERE key = 'pricing.age_bands'").run();
  });

  it('starts on the default bands and keeps an agency list', async () => {
    const first = await data(await call('GET', '/settings/age-bands', admin));
    expect(first.isDefault).toBe(true);
    expect(first.bands.map((b: any) => [b.key, b.minAge])).toEqual([['adult', 12], ['child', 2], ['infant', 0]]);

    expect((await call('PUT', '/settings/age-bands', sales, { bands: FOUR_BANDS })).status).toBe(403);
    expect((await call('PUT', '/settings/age-bands', admin, { bands: [{ label: 'Adult', minAge: 12 }] })).status).toBe(400);
    const saved = await call('PUT', '/settings/age-bands', admin, { bands: FOUR_BANDS });
    expect(saved.status).toBe(200);
    const body = await data(saved);
    expect(body.isDefault).toBe(false);
    expect(body.bands.map((b: any) => b.minAge)).toEqual([12, 6, 4, 0]);

    expect((await call('PUT', '/settings/age-bands', admin, { bands: null })).status).toBe(200);
    expect((await data(await call('GET', '/settings/age-bands', admin))).isDefault).toBe(true);
  });

  it('a quote created from a template without ages keeps the template quantities', async () => {
    const res = await call('POST', '/itinerary-templates/create-from', admin, { templateId, leadId, title: 'No ages' });
    expect(res.status).toBe(201);
    const id = (await data(res)).id;
    expect(await quantities(id)).toEqual({ 'Hotel, whole group': 1, 'Tour adult': 1, 'Tour child': 1, 'Transfer per person': 1 });
    const [row] = await rows('SELECT total_selling, age_bands, pax_ages FROM itineraries WHERE id = ?', id);
    expect(row).toEqual({ total_selling: 1000 + 100 + 50 + 20, age_bands: null, pax_ages: null });
  });

  it('fills the quantities from adults and ages when it creates the quote', async () => {
    const res = await call('POST', '/itinerary-templates/create-from', admin, { templateId, leadId, title: 'Two and two', adults: 2, ages: [8, 5] });
    expect(res.status).toBe(201);
    const id = (await data(res)).id;
    expect(await quantities(id)).toEqual({ 'Hotel, whole group': 1, 'Tour adult': 2, 'Tour child': 2, 'Transfer per person': 4 });
    const [row] = await rows('SELECT total_selling, grand_total, pax_ages FROM itineraries WHERE id = ?', id);
    expect(row.total_selling).toBe(1000 + 200 + 100 + 80);
    expect(row.grand_total).toBe(1380);
    expect(JSON.parse(row.pax_ages)).toMatchObject({ adults: 2, ages: [8, 5] });
  });

  it('a template with its own four bands prices by them and the quote keeps the snapshot', async () => {
    const data4 = JSON.stringify({
      days: [{ dayNumber: 1, title: 'Day', items: [
        { type: 'activity', title: 'Adult', sellingPrice: 100, costPrice: 0, quantity: 1, taxRate: 0, paxType: 'adult', sortOrder: 0 },
        { type: 'activity', title: '6 to 11', sellingPrice: 60, costPrice: 0, quantity: 1, taxRate: 0, paxType: 'child_6', sortOrder: 1 },
        { type: 'activity', title: '4 to 5', sellingPrice: 40, costPrice: 0, quantity: 1, taxRate: 0, paxType: 'child_4', sortOrder: 2 },
        { type: 'activity', title: '0 to 3', sellingPrice: 10, costPrice: 0, quantity: 1, taxRate: 0, paxType: 'child_0', sortOrder: 3 },
        { type: 'activity', title: 'Old child key', sellingPrice: 5, costPrice: 0, quantity: 3, taxRate: 0, paxType: 'child', sortOrder: 4 },
      ] }],
    });
    const t = await call('POST', '/itinerary-templates', admin, { title: 'Four band template', durationDays: 1, templateData: data4 });
    const id4 = (await data(t)).id;
    // A line may only name a band of the list in force: 'child' is not one of the template's bands.
    expect((await call('PUT', `/itinerary-templates/${id4}/age-bands`, admin, { ageBands: FOUR_BANDS, lines: [{ day: 0, item: 4, paxType: 'child' }] })).status).toBe(400);
    expect((await call('PUT', `/itinerary-templates/${id4}/age-bands`, admin, { lines: [{ day: 0, item: 9, paxType: null }] })).status).toBe(400);
    const saved = await call('PUT', `/itinerary-templates/${id4}/age-bands`, admin, { ageBands: FOUR_BANDS, lines: [{ day: 0, item: 4, paxType: PER_PERSON }] });
    expect(saved.status).toBe(200);
    expect((await data(await call('GET', `/itinerary-templates/${id4}`, admin))).ageBands.map((b: any) => b.key)).toEqual(['adult', 'child_6', 'child_4', 'child_0']);

    const made = await call('POST', '/itinerary-templates/create-from', admin, { templateId: id4, leadId, title: 'Four bands', adults: 2, ages: [11.9, 7, 5, 3, 0.5] });
    expect(made.status).toBe(201);
    const id = (await data(made)).id;
    expect(await quantities(id)).toEqual({ Adult: 2, '6 to 11': 2, '4 to 5': 1, '0 to 3': 2, 'Old child key': 7 });
    const [row] = await rows('SELECT total_selling, age_bands FROM itineraries WHERE id = ?', id);
    expect(row.total_selling).toBe(2 * 100 + 2 * 60 + 40 + 2 * 10 + 7 * 5);
    expect(JSON.parse(row.age_bands).map((b: any) => b.key)).toEqual(['adult', 'child_6', 'child_4', 'child_0']);
    // The quote follows its snapshot, not the agency list.
    expect((await call('PUT', '/settings/age-bands', admin, { bands: [{ key: 'adult', label: 'Adult', minAge: 18 }, { key: 'minor', label: 'Minor', minAge: 0 }] })).status).toBe(200);
    const preview = await data(await call('POST', `/itineraries/${id}/fill-quantities`, admin, { source: 'ages', adults: 1, ages: [7] }));
    expect(preview.bands.map((b: any) => b.key)).toEqual(['adult', 'child_6', 'child_4', 'child_0']);
    expect((await call('PUT', '/settings/age-bands', admin, { bands: null })).status).toBe(200);
  });

  it('previews and applies a fill from ages, and recomputes the totals', async () => {
    const made = await call('POST', '/itinerary-templates/create-from', admin, { templateId, leadId, title: 'To refill' });
    const id = (await data(made)).id;

    const preview = await call('POST', `/itineraries/${id}/fill-quantities`, admin, { source: 'ages', adults: 2, ages: [8, 5, 1] });
    expect(preview.status).toBe(200);
    const p = await data(preview);
    expect(p.applied).toBe(false);
    expect(p.counts).toEqual({ adult: 2, child: 2, infant: 1 });
    expect(p.total).toBe(5);
    expect(p.lines.map((l: any) => [l.title, l.from, l.to])).toEqual([['Tour adult', 1, 2], ['Tour child', 1, 2], ['Transfer per person', 1, 5]]);
    // A preview changes nothing.
    expect((await quantities(id))['Tour adult']).toBe(1);

    const applied = await call('POST', `/itineraries/${id}/fill-quantities?apply=1`, admin, { source: 'ages', adults: 2, ages: [8, 5, 1] });
    expect(applied.status).toBe(200);
    expect((await data(applied)).applied).toBe(true);
    expect(await quantities(id)).toEqual({ 'Hotel, whole group': 1, 'Tour adult': 2, 'Tour child': 2, 'Transfer per person': 5 });
    const [row] = await rows('SELECT total_selling, pax_ages FROM itineraries WHERE id = ?', id);
    expect(row.total_selling).toBe(1000 + 200 + 100 + 100);
    expect(JSON.parse(row.pax_ages)).toMatchObject({ adults: 2, ages: [8, 5, 1], source: 'ages' });
    expect((await data(await call('GET', `/itineraries/${id}`, admin))).paxAges).toMatchObject({ source: 'ages' });
  });

  it('fills from linked travellers by their date of birth on the travel date', async () => {
    const lead = await newLead('Bea Travellers', { adults: 1, children: 0 }, '2032-07-10');
    const made = await call('POST', '/itinerary-templates/create-from', admin, { templateId, leadId: lead.leadId, title: 'Travellers' });
    const id = (await data(made)).id;
    const mk = async (firstName: string, dateOfBirth?: string) => {
      const res = await call('POST', '/travellers', admin, { contactId: lead.contactId, firstName, lastName: 'T', ...(dateOfBirth ? { dateOfBirth } : {}) });
      expect(res.status).toBe(201);
      return (await data(res)).id as string;
    };
    // On 2032-07-10: 40, 11 (turns 12 the next day), 12 (today), 1 and one without a date of birth.
    const ids = [await mk('Parent', '1992-01-01'), await mk('Almost', '2020-07-11'), await mk('Just', '2020-07-10'), await mk('Little', '2031-01-01'), await mk('Unknown')];
    expect((await call('POST', `/itineraries/${id}/fill-quantities`, admin, { source: 'travellers', travellerIds: [] })).status).toBe(400);
    const preview = await data(await call('POST', `/itineraries/${id}/fill-quantities`, admin, { source: 'travellers', travellerIds: ids }));
    expect(preview.travelDate).toBe('2032-07-10');
    expect(preview.counts).toEqual({ adult: 3, child: 1, infant: 1 });
    expect(preview.unknown).toBe(1);
    expect((await call('POST', `/itineraries/${id}/fill-quantities?apply=1`, admin, { source: 'travellers', travellerIds: ids })).status).toBe(200);
    expect(await quantities(id)).toMatchObject({ 'Tour adult': 3, 'Tour child': 1, 'Transfer per person': 5 });
  });

  it("fills from the lead with the children's ages the message reader found", async () => {
    const lead = await newLead('Cy Lead', { adults: 2, children: 2 });
    const msg = await call('POST', '/test/inbound', null, {
      tenantId: TENANT_ID, channel: 'whatsapp', from: '+31612345678', fromName: 'Cy Lead',
      body: 'Hi, two adults and kids aged 8 and 5 want a Kerala trip in December. Can you send a plan?',
    });
    expect(msg.status).toBe(200);
    const messageId = (await data(msg)).messageId;
    // Tie the message to the lead the way the assistant does once it has made one.
    await DB.prepare('UPDATE message_log SET lead_id = ?, contact_id = ? WHERE id = ?').bind(lead.leadId, lead.contactId, messageId).run();
    const [analysis] = await rows('SELECT entities FROM assistant_message_analysis WHERE message_id = ?', messageId);
    expect(JSON.parse(analysis.entities).childAges).toEqual([8, 5]);

    const made = await call('POST', '/itinerary-templates/create-from', admin, { templateId, leadId: lead.leadId, title: 'From lead' });
    const id = (await data(made)).id;
    const preview = await data(await call('POST', `/itineraries/${id}/fill-quantities`, admin, { source: 'lead' }));
    expect(preview.ages).toEqual([8, 5]);
    expect(preview.counts).toEqual({ adult: 2, child: 2, infant: 0 });
    expect((await call('POST', `/itineraries/${id}/fill-quantities?apply=1`, admin, { source: 'lead' })).status).toBe(200);
    expect(await quantities(id)).toMatchObject({ 'Tour adult': 2, 'Tour child': 2, 'Transfer per person': 4 });
  });

  it("the assistant's one-click quote already has the band quantities", async () => {
    const msg = await call('POST', '/test/inbound', null, {
      tenantId: TENANT_ID, channel: 'whatsapp', from: '+31698765432', fromName: 'Dee Assistant',
      body: 'Hello! 2 adults and kids aged 8 and 5, we would like to visit Kerala from 18 Dec for 5 nights. Budget 3000 EUR.',
    });
    expect(msg.status).toBe(200);
    const messageId = (await data(msg)).messageId;
    const list = (await data(await call('GET', `/assistant/suggestions?entityType=message&entityId=${messageId}`, admin))) as any[];
    const create = list.find((x) => x.action.type === 'create_lead_from_enquiry');
    expect(create).toBeTruthy();
    const applied = await data(await call('POST', `/assistant/suggestions/${create.id}/apply`, admin, {}));
    const leadOf = applied.result.entities.find((e: any) => e.type === 'lead').id as string;

    const pending = (await data(await call('GET', `/assistant/suggestions?leadId=${leadOf}`, admin))) as any[];
    const quote = pending.find((x) => x.action.type === 'create_itinerary_from_template');
    expect(quote).toBeTruthy();
    expect(quote.params).toMatchObject({ adults: 2, ages: [8, 5] });
    expect(quote.reason).toContain('2 adults, children 8 and 5');
    const done = await call('POST', `/assistant/suggestions/${quote.id}/apply`, admin, {});
    expect(done.status).toBe(200);
    const itineraryId = (await data(done)).result.entities[0].id as string;
    // Whichever template matched, its band lines now follow the party.
    const items = await rows(
      `SELECT i.pax_type, i.quantity FROM itinerary_items i JOIN itinerary_days d ON d.id = i.day_id WHERE d.itinerary_id = ? AND i.pax_type IS NOT NULL`, itineraryId,
    );
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) expect(it.quantity).toBe(it.pax_type === 'adult' ? 2 : it.pax_type === 'child' ? 2 : it.pax_type === PER_PERSON ? 4 : 0);
  });

  it('with the feature off the routes answer 403 and create-from ignores the ages', async () => {
    await setFlag(false);
    expect((await call('GET', '/settings/age-bands', admin)).status).toBe(403);
    expect((await call('PUT', '/settings/age-bands', admin, { bands: FOUR_BANDS })).status).toBe(403);
    expect((await call('PUT', `/itinerary-templates/${templateId}/age-bands`, admin, { ageBands: null })).status).toBe(403);
    const made = await call('POST', '/itinerary-templates/create-from', admin, { templateId, leadId, title: 'Feature off', adults: 2, ages: [8, 5] });
    expect(made.status).toBe(201);
    const id = (await data(made)).id;
    expect((await call('POST', `/itineraries/${id}/fill-quantities`, admin, { source: 'lead' })).status).toBe(403);
    expect(await quantities(id)).toEqual({ 'Hotel, whole group': 1, 'Tour adult': 1, 'Tour child': 1, 'Transfer per person': 1 });
    const [row] = await rows('SELECT pax_ages FROM itineraries WHERE id = ?', id);
    expect(row.pax_ages).toBeNull();
    await setFlag(null);
  });

  it('a clone keeps the band snapshot, and a zero-quantity line is not invoiced', async () => {
    const made = await call('POST', '/itinerary-templates/create-from', admin, { templateId, leadId, title: 'Clone me', adults: 2, ages: [] });
    const id = (await data(made)).id;
    const clone = await data(await call('POST', `/itineraries/${id}/clone`, admin, {}));
    const [row] = await rows('SELECT age_bands, pax_ages FROM itineraries WHERE id = ?', clone.id);
    expect(row.age_bands).not.toBeNull();
    expect(JSON.parse(row.pax_ages)).toMatchObject({ adults: 2, ages: [] });
    expect(await quantities(clone.id)).toMatchObject({ 'Tour child': 0 });
    const invoice = await call('POST', '/invoices/from-itinerary', admin, { itineraryId: clone.id });
    expect(invoice.status).toBe(201);
    const invoiceId = (await data(invoice)).id;
    const lines = await rows('SELECT description FROM invoice_items WHERE invoice_id = ?', invoiceId);
    expect(lines.some((l) => l.description.includes('Tour child'))).toBe(false);
    expect(lines.some((l) => l.description.includes('Tour adult'))).toBe(true);
  });
  it('R164-2: a quote linked to a departure of a tour with its own bands is filled by those bands', async () => {
    await setFlag(true);
    const tour = await call('POST', '/tours', admin, { code: 'AB164', title: 'Own bands tour', durationDays: 3, currency: 'EUR', ageBands: [{ key: 'adult', label: 'Adult', minAge: 13 }, { key: 'child', label: 'Child', minAge: 2 }, { key: 'infant', label: 'Infant', minAge: 0 }] });
    expect(tour.status).toBe(201);
    const dep = await call('POST', '/departures', admin, { tourId: (await data(tour)).id, startDate: '2033-06-10', capacityMode: 'manual', capacity: 20 });
    expect(dep.status).toBe(201);
    const depId = (await data(dep)).id;
    expect((await call('POST', `/departures/${depId}/status`, admin, { status: 'open' })).status).toBe(200);

    const made = await call('POST', '/itinerary-templates/create-from', admin, { templateId, leadId, title: 'For the tour' });
    const id = (await data(made)).id;
    // Not linked yet: the agency's bands (adult from 12) put the 12-year-old among the adults.
    const before = await data(await call('POST', `/itineraries/${id}/fill-quantities`, admin, { source: 'ages', adults: 1, ages: [12] }));
    expect(before.counts).toEqual({ adult: 2, child: 0, infant: 0 });

    expect((await call('PUT', `/itineraries/${id}/departure`, admin, { departureId: depId, seatsRequested: 2 })).status).toBe(200);
    const after = await data(await call('POST', `/itineraries/${id}/fill-quantities`, admin, { source: 'ages', adults: 1, ages: [12] }));
    expect(after.counts).toEqual({ adult: 1, child: 1, infant: 0 });
    expect(after.bands.map((b: any) => b.minAge)).toEqual([13, 2, 0]);
    expect((await call('POST', `/itineraries/${id}/fill-quantities?apply=1`, admin, { source: 'ages', adults: 1, ages: [12] })).status).toBe(200);
    expect(await quantities(id)).toMatchObject({ 'Tour adult': 1, 'Tour child': 1 });
    const shown = await data(await call('GET', `/itineraries/${id}`, admin));
    expect(shown.ageBands.map((b: any) => b.minAge)).toEqual([13, 2, 0]);
  });
});
