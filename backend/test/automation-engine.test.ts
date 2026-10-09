import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { analyzeWithRules, parseTravelDate } from '../src/services/automation/message-analysis';

const testEnv = env as any;
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
  // Automations triggered by a request run after its response; wait for them.
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

async function login(email: string): Promise<string> {
  const res = await call('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID });
  expect(res.status).toBe(200);
  return (await data(res)).accessToken;
}

async function inbound(body: Record<string, unknown>) {
  const res = await call('POST', '/test/inbound', null, { tenantId: TENANT_ID, channel: 'whatsapp', ...body });
  expect(res.status).toBe(200);
  return (await data(res)) as { messageId: string; contactId: string | null; leadId: string | null };
}

async function suggestions(token: string, query: string): Promise<any[]> {
  const res = await call('GET', `/assistant/suggestions?${query}`, token);
  expect(res.status).toBe(200);
  return data(res);
}

const KERALA_TEMPLATE = {
  title: 'Kerala Backwaters & Hills — 5N/6D',
  description: 'Tea hills of Munnar, spice country in Thekkady, a houseboat night and Kumarakom.',
  destination: 'Kerala',
  durationDays: 6,
  category: 'family',
  templateData: JSON.stringify({
    days: [
      { dayNumber: 1, title: 'Arrive Kochi, drive to Munnar', city: 'Munnar', items: [
        { type: 'transport', title: 'Innova Crysta with chauffeur — 6 days', costPrice: 3200, sellingPrice: 3800, quantity: 6, taxRate: 5, sortOrder: 0 },
        { type: 'hotel', title: 'Misty Hills Tea Resort — Family Suite (CP), 2 nights', costPrice: 9500, sellingPrice: 12000, quantity: 2, taxRate: 5, sortOrder: 1 },
      ] },
      { dayNumber: 3, title: 'Thekkady spice trails', city: 'Thekkady', items: [
        { type: 'hotel', title: 'Cardamom County Retreat — Plantation Villa (MAP)', costPrice: 12500, sellingPrice: 15500, quantity: 1, taxRate: 5, sortOrder: 0 },
      ] },
      { dayNumber: 4, title: 'Alleppey houseboat', city: 'Alleppey', items: [
        { type: 'hotel', title: 'Lakes & Lagoons — Premium 2-Bedroom Houseboat, all meals', costPrice: 24000, sellingPrice: 29000, quantity: 1, taxRate: 5, sortOrder: 0 },
      ] },
    ],
    inclusions: [],
    exclusions: [],
  }),
};

const ENQUIRY =
  "Hi! We're a family of four from Bengaluru (kids aged 8 and 11) planning a 5-night Kerala trip from 18 Dec. " +
  "We'd love Munnar, one houseboat night and some backwater time. Budget around ₹1.25 lakh. Could you share a plan?";

let admin = '';
let sales = '';
let viewer = '';

describe('Message understanding (rules)', () => {
  const input = { channel: 'whatsapp', knownDestinations: ['Kerala', 'Munnar', 'Thekkady', 'Goa'], today: '2026-10-08' };

  it('extracts the trip from an enquiry', () => {
    const a = analyzeWithRules({ ...input, text: ENQUIRY });
    expect(a.intent).toBe('enquiry');
    expect(a.needsWork).toBe(true);
    expect(a.entities).toMatchObject({
      destinations: ['Kerala', 'Munnar'],
      nights: 5,
      travelDate: '2026-12-18',
      returnDate: '2026-12-23',
      paxAdults: 2,
      paxChildren: 2,
      budget: 125000,
      tripType: 'family',
    });
    expect(a.entities.specialRequirements).toContain('Kids aged 8 and 11');
    expect(a.source).toBe('rules');
  });

  it('reads a payment with its bank reference', () => {
    const a = analyzeWithRules({ ...input, text: 'Looks perfect, please go ahead. Paid 60000 advance by NEFT, UTR 362100487715.' });
    expect(a.intent).toBe('payment');
    expect(a.entities).toMatchObject({ paymentAmount: 60000, paymentReference: '362100487715' });
    expect(a.entities.budget).toBeUndefined();
  });

  it('tells a confirmation, a change request and small talk apart', () => {
    expect(analyzeWithRules({ ...input, text: 'This looks great, please go ahead and book it' }).intent).toBe('confirmation');
    expect(analyzeWithRules({ ...input, text: 'Can we add one more night in Thekkady instead?' }).intent).toBe('change_request');
    const thanks = analyzeWithRules({ ...input, text: 'Thank you so much!' });
    expect(thanks).toMatchObject({ intent: 'other', needsWork: false });
  });

  it('resolves day-first dates to the next occurrence', () => {
    expect(parseTravelDate('from 18 Dec', '2026-10-08')).toBe('2026-12-18');
    expect(parseTravelDate('on 5th January', '2026-10-08')).toBe('2027-01-05');
    expect(parseTravelDate('March 3, 2027', '2026-10-08')).toBe('2027-03-03');
    expect(parseTravelDate('travelling 20/11', '2026-10-08')).toBe('2026-11-20');
    expect(parseTravelDate('no date here', '2026-10-08')).toBeUndefined();
  });

  it('understands lakh, k and plain amounts', () => {
    expect(analyzeWithRules({ ...input, text: 'Goa trip, budget 80k' }).entities.budget).toBe(80000);
    expect(analyzeWithRules({ ...input, text: 'Goa trip, budget Rs 2,50,000' }).entities.budget).toBe(250000);
    expect(analyzeWithRules({ ...input, text: 'Honeymoon in Goa, budget 1.5 lakhs' }).entities).toMatchObject({ budget: 150000, paxAdults: 2, tripType: 'honeymoon' });
  });
});

describe('Automation engine: enquiry to booking', () => {
  let messageId = '';
  let leadId = '';
  let contactId = '';
  let itineraryId = '';
  let invoiceId = '';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    admin = await login('admin@e2e.test');
    sales = await login('sales@e2e.test');
    viewer = await login('viewer@e2e.test');
    expect((await call('POST', '/itinerary-templates', admin, KERALA_TEMPLATE)).status).toBe(201);
  });

  it('proposes a contact and lead for an enquiry from an unknown number', async () => {
    const result = await inbound({ from: '+919845023117', fromName: 'Priya Nair', body: ENQUIRY });
    messageId = result.messageId;

    const list = await suggestions(admin, `entityType=message&entityId=${messageId}`);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      ruleKey: 'inbox.read_messages',
      title: 'Create contact and lead for Priya Nair',
      status: 'pending',
      canApply: true,
      action: { type: 'create_lead_from_enquiry', risk: 'medium' },
    });
    expect(list[0].params).toMatchObject({
      name: 'Priya Nair',
      phone: '+919845023117',
      destinations: ['Kerala', 'Munnar'],
      travelDate: expect.stringMatching(/-12-18$/),
      paxAdults: 2,
      paxChildren: 2,
      budget: 125000,
      tripType: 'family',
      source: 'whatsapp',
      messageIds: [messageId],
    });
    expect(list[0].reason).toContain('Kerala');

    const [analysis] = await rows('SELECT intent, source, needs_work FROM assistant_message_analysis WHERE message_id = ?', messageId);
    expect(analysis).toEqual({ intent: 'enquiry', source: 'rules', needs_work: 1 });
  });

  it('adds a second message from the same sender to the pending suggestion instead of making another', async () => {
    const second = await inbound({ from: '+919845023117', fromName: 'Priya Nair', body: 'Also could you include Thekkady in the plan?' });
    const all = await rows(`SELECT id, params FROM assistant_suggestions WHERE action_type = 'create_lead_from_enquiry'`);
    expect(all).toHaveLength(1);
    const params = JSON.parse(all[0].params);
    expect(params.destinations).toEqual(['Kerala', 'Munnar', 'Thekkady']);
    expect(params.messageIds).toEqual([messageId, second.messageId]);
    expect(params.budget).toBe(125000);
  });

  it('shows the suggestion to a viewer but does not let them apply it', async () => {
    const list = await suggestions(viewer, `entityType=message&entityId=${messageId}`);
    expect(list[0].canApply).toBe(false);
    const res = await call('POST', `/assistant/suggestions/${list[0].id}/apply`, viewer, {});
    expect(res.status).toBe(403);
  });

  it('creates the contact and lead in one click, and only once', async () => {
    const [pending] = await suggestions(sales, `entityType=message&entityId=${messageId}`);
    const [first, second] = await Promise.all([
      call('POST', `/assistant/suggestions/${pending.id}/apply`, sales, {}),
      call('POST', `/assistant/suggestions/${pending.id}/apply`, sales, {}),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);

    const applied = await data(first.status === 200 ? first : second);
    expect(applied.status).toBe('applied');
    leadId = applied.result.entities.find((e: any) => e.type === 'lead').id;
    contactId = applied.result.entities.find((e: any) => e.type === 'contact').id;

    const [contact] = await rows('SELECT name, phone, source FROM contacts WHERE id = ?', contactId);
    expect(contact).toEqual({ name: 'Priya Nair', phone: '+919845023117', source: 'whatsapp' });
    expect(await rows(`SELECT id FROM contacts WHERE phone = '+919845023117'`)).toHaveLength(1);

    const [lead] = await rows('SELECT * FROM leads WHERE id = ?', leadId);
    expect(lead).toMatchObject({
      contact_id: contactId,
      destination: '["Kerala","Munnar","Thekkady"]',
      pax_adults: 2,
      pax_children: 2,
      budget: 125000,
      trip_type: 'family',
      source: 'whatsapp',
      status: 'new',
    });
    expect(lead.travel_date).toMatch(/-12-18$/);
    expect(lead.return_date).toMatch(/-12-23$/);
    // The person who turned the enquiry into a lead owns it.
    expect(lead.assigned_to).toBe('33333333-3333-3333-3333-333333333333');

    const messages = await rows(`SELECT contact_id, lead_id FROM message_log WHERE from_address = '+919845023117'`);
    expect(messages).toHaveLength(2);
    for (const m of messages) expect(m).toEqual({ contact_id: contactId, lead_id: leadId });
  });

  it('follows on by itself: first follow-up scheduled, template and reply offered', async () => {
    const followUps = await rows('SELECT type, status FROM follow_ups WHERE lead_id = ?', leadId);
    expect(followUps).toEqual([{ type: 'whatsapp', status: 'pending' }]);

    const auto = await rows(`SELECT status, applied_by FROM assistant_suggestions WHERE rule_key = 'leads.first_follow_up' AND lead_id = ?`, leadId);
    expect(auto).toHaveLength(1);
    expect(auto[0].status).toBe('auto_applied');

    const pending = await suggestions(admin, `leadId=${leadId}`);
    const byAction = Object.fromEntries(pending.map((s) => [s.action.type, s]));
    expect(Object.keys(byAction).sort()).toEqual(['create_itinerary_from_template', 'draft_reply']);
    expect(byAction.create_itinerary_from_template.title).toBe('Build the itinerary from "Kerala Backwaters & Hills — 5N/6D"');
    expect(byAction.create_itinerary_from_template.reason).toContain('5 nights');
    expect(byAction.draft_reply.action.clientHandled).toBe(true);
    expect(byAction.draft_reply.params).toMatchObject({ contactId, channel: 'whatsapp' });
    expect(byAction.draft_reply.params.body.startsWith('Hi Priya,')).toBe(true);
  });

  it('builds the itinerary from the suggested template', async () => {
    const [template] = (await suggestions(admin, `leadId=${leadId}`)).filter((s) => s.action.type === 'create_itinerary_from_template');
    const res = await call('POST', `/assistant/suggestions/${template.id}/apply`, admin, {});
    expect(res.status).toBe(200);
    itineraryId = (await data(res)).result.entities[0].id;
    const [itinerary] = await rows('SELECT lead_id, title FROM itineraries WHERE id = ?', itineraryId);
    expect(itinerary).toEqual({ lead_id: leadId, title: 'Priya Nair: Kerala Backwaters & Hills — 5N/6D' });
  });

  it('moves the lead to Proposal Sent and schedules a follow-up when the quote link is sent', async () => {
    const share = await data(await call('POST', `/itineraries/${itineraryId}/share-link`, admin));
    const sent = await call('POST', '/communications/send', admin, {
      contact_id: contactId,
      channel: 'whatsapp',
      message: `Hi Priya, your Kerala plan is ready: ${share.shareUrl}`,
      lead_id: leadId,
    });
    expect(sent.status).toBe(201);

    const [lead] = await rows('SELECT status FROM leads WHERE id = ?', leadId);
    expect(lead.status).toBe('proposal_sent');
    expect(await rows('SELECT id FROM follow_ups WHERE lead_id = ?', leadId)).toHaveLength(2);

    const runs = await rows(`SELECT rule_key, outcome FROM automation_runs WHERE rule_key IN ('leads.quote_sent_status', 'leads.follow_up_after_quote') ORDER BY rule_key`);
    expect(runs).toEqual([
      { rule_key: 'leads.follow_up_after_quote', outcome: 'applied' },
      { rule_key: 'leads.quote_sent_status', outcome: 'applied' },
    ]);
  });

  it('an ordinary message without the quote link changes nothing', async () => {
    await call('POST', '/communications/send', admin, { contact_id: contactId, channel: 'whatsapp', message: 'Let me know if you have questions', lead_id: leadId });
    expect(await rows('SELECT id FROM follow_ups WHERE lead_id = ?', leadId)).toHaveLength(2);
  });

  it('reads "go ahead, paid" as a confirmation and offers to mark the lead won', async () => {
    const reply = await inbound({ from: '+919845023117', body: 'Looks perfect, please go ahead. Paid 60000 advance by NEFT, UTR 362100487715.' });
    expect(reply.leadId).toBe(leadId);

    const pending = await suggestions(admin, `leadId=${leadId}`);
    const won = pending.find((s) => s.action.type === 'mark_lead_won');
    expect(won).toBeTruthy();
    expect(won.reason).toContain('60,000');

    expect((await call('POST', `/assistant/suggestions/${won.id}/apply`, admin, {})).status).toBe(200);
    expect((await rows('SELECT status FROM leads WHERE id = ?', leadId))[0].status).toBe('won');
  });

  it('on won: creates the booking checklist and offers the invoice', async () => {
    const tasks = await rows('SELECT title, assigned_to FROM tasks WHERE related_lead_id = ? ORDER BY title', leadId);
    expect(tasks).toHaveLength(4);
    expect(tasks.map((t) => t.title.split(':')[0])).toEqual([
      'Arrange airport transfers and vehicle',
      'Collect the balance payment',
      'Collect traveller names and ID documents',
      'Send hotel and transport vouchers',
    ]);
    // Tasks go to the lead owner, not to whoever marked it won.
    for (const t of tasks) expect(t.assigned_to).toBe('33333333-3333-3333-3333-333333333333');

    const invoice = (await suggestions(admin, `leadId=${leadId}`)).find((s) => s.action.type === 'create_invoice_from_itinerary');
    expect(invoice).toBeTruthy();
    expect(invoice.action.risk).toBe('high');

    // A salesperson may not create invoices, with or without the assistant.
    expect((await call('POST', `/assistant/suggestions/${invoice.id}/apply`, sales, {})).status).toBe(403);

    const res = await call('POST', `/assistant/suggestions/${invoice.id}/apply`, admin, {});
    expect(res.status).toBe(200);
    invoiceId = (await data(res)).result.entities[0].id;
    const [row] = await rows('SELECT lead_id, status, total FROM invoices WHERE id = ?', invoiceId);
    expect(row).toMatchObject({ lead_id: leadId, status: 'draft' });
    expect(row.total).toBeGreaterThan(0);
  });

  it('matches the payment the customer already wrote about to the new invoice', async () => {
    const payment = (await suggestions(admin, `entityType=invoice&entityId=${invoiceId}`)).find((s) => s.action.type === 'record_payment');
    expect(payment).toBeTruthy();
    expect(payment.params).toMatchObject({ invoiceId, amount: 60000, reference: '362100487715', method: 'transfer' });

    expect((await call('POST', `/assistant/suggestions/${payment.id}/apply`, admin, {})).status).toBe(200);
    const [invoice] = await rows('SELECT status, paid_amount FROM invoices WHERE id = ?', invoiceId);
    expect(invoice).toEqual({ status: 'partially_paid', paid_amount: 60000 });
  });

  it('after the advance: drafts one voucher per hotel stay with dates from the travel date', async () => {
    const vouchers = (await suggestions(admin, `leadId=${leadId}`)).find((s) => s.action.type === 'create_vouchers');
    expect(vouchers).toBeTruthy();
    expect(vouchers.params.vouchers.map((v: any) => [v.details.hotelName, v.details.checkIn.slice(5), v.details.checkOut.slice(5), v.details.mealPlan])).toEqual([
      ['Misty Hills Tea Resort', '12-18', '12-20', 'CP'],
      ['Cardamom County Retreat', '12-20', '12-21', 'MAP'],
      ['Lakes & Lagoons', '12-21', '12-22', 'EP'],
    ]);

    expect((await call('POST', `/assistant/suggestions/${vouchers.id}/apply`, admin, {})).status).toBe(200);
    expect(await rows(`SELECT id FROM vouchers WHERE lead_id = ? AND status = 'draft'`, leadId)).toHaveLength(3);
  });

  it('keeps an audit trail and counts what is waiting', async () => {
    const activity = await data(await call('GET', '/assistant/activity?limit=100', admin));
    expect(activity.length).toBeGreaterThan(10);
    expect(activity.every((a: any) => typeof a.ruleTitle === 'string' && a.outcome)).toBe(true);

    const count = await data(await call('GET', '/assistant/suggestions/count', admin));
    expect(count.pending).toBe((await rows(`SELECT id FROM assistant_suggestions WHERE status = 'pending'`)).length);
    // A viewer can act on nothing, so nothing is "waiting" for them.
    expect((await data(await call('GET', '/assistant/suggestions/count', viewer))).pending).toBe(0);
  });
});

describe('Automation engine: undo, dismiss, settings', () => {
  it('undo removes the lead and the contact it created', async () => {
    const m = await inbound({ from: '+919811100099', fromName: 'Rohit Bhatia', body: 'Planning a Goa trip for 2 adults from 5 Jan, 3 nights. Please share a quote.' });
    const [s] = await suggestions(admin, `entityType=message&entityId=${m.messageId}`);
    const applied = await data(await call('POST', `/assistant/suggestions/${s.id}/apply`, admin, { params: { title: 'Goa New Year break: Rohit Bhatia' } }));
    const lead = applied.result.entities.find((e: any) => e.type === 'lead').id;
    const contact = applied.result.entities.find((e: any) => e.type === 'contact').id;
    expect((await rows('SELECT title FROM leads WHERE id = ?', lead))[0].title).toBe('Goa New Year break: Rohit Bhatia');
    expect(applied.canUndo).toBe(true);

    const undone = await call('POST', `/assistant/suggestions/${s.id}/undo`, admin);
    expect(undone.status).toBe(200);
    expect((await data(undone)).status).toBe('undone');
    expect((await rows('SELECT is_deleted FROM leads WHERE id = ?', lead))[0].is_deleted).toBe(1);
    expect((await rows('SELECT is_deleted FROM contacts WHERE id = ?', contact))[0].is_deleted).toBe(1);
    expect((await rows('SELECT contact_id, lead_id FROM message_log WHERE id = ?', m.messageId))[0]).toEqual({ contact_id: null, lead_id: null });
    expect((await call('POST', `/assistant/suggestions/${s.id}/undo`, admin)).status).toBe(409);
  });

  it('a dismissed suggestion cannot be applied', async () => {
    const m = await inbound({ from: '+919811100098', body: 'Need a quote for a Goa holiday, 4 nights' });
    const [s] = await suggestions(admin, `entityType=message&entityId=${m.messageId}`);
    expect((await call('POST', `/assistant/suggestions/${s.id}/dismiss`, admin)).status).toBe(200);
    expect((await call('POST', `/assistant/suggestions/${s.id}/apply`, admin, {})).status).toBe(409);
    expect(await suggestions(admin, `entityType=message&entityId=${m.messageId}`)).toHaveLength(0);
  });

  it('small talk raises no suggestion', async () => {
    const m = await inbound({ from: '+919811100097', body: 'Thank you!' });
    expect(await rows('SELECT id FROM assistant_suggestions WHERE source_id = ?', m.messageId)).toHaveLength(0);
    expect((await rows('SELECT intent FROM assistant_message_analysis WHERE message_id = ?', m.messageId))[0].intent).toBe('other');
  });

  it('lists the library with modes, and only an admin can switch an automation to automatic', async () => {
    const library = await data(await call('GET', '/automations', admin));
    const byKey = Object.fromEntries(library.recipes.map((r: any) => [r.key, r]));
    expect(byKey['leads.first_follow_up']).toMatchObject({ mode: 'auto', autoEligible: true, area: 'Leads' });
    expect(byKey['inbox.read_messages']).toMatchObject({ mode: 'suggest', autoEligible: false, usesAi: true });
    expect(byKey['leads.first_follow_up'].settings[0]).toMatchObject({ key: 'hours', value: 24 });
    expect(byKey['leads.first_follow_up'].last30Days.applied).toBeGreaterThan(0);

    expect((await call('GET', '/automations', sales)).status).toBe(403);
    // Creating a lead always needs a click.
    expect((await call('PUT', '/automations/inbox.read_messages', admin, { mode: 'auto' })).status).toBe(400);
    expect((await call('PUT', '/automations/leads.first_follow_up', admin, { settings: { hours: 0 } })).status).toBe(400);
    expect((await call('PUT', '/automations/no.such.recipe', admin, { mode: 'off' })).status).toBe(404);
  });

  it('a recipe switched off does nothing; switched to suggest it waits for a click', async () => {
    expect((await call('PUT', '/automations/leads.first_follow_up', admin, { mode: 'off' })).status).toBe(200);
    const contact = await data(await call('POST', '/contacts', admin, { name: 'Off Mode', phone: '9000000011', type: 'customer' }));
    const off = await data(await call('POST', '/leads', admin, { contactId: contact.id, title: 'Off mode lead', destinations: ['Goa'], travelDate: '2027-01-10', tripType: 'family', source: 'website' }));
    expect(await rows('SELECT id FROM follow_ups WHERE lead_id = ?', off.id)).toHaveLength(0);

    expect((await call('PUT', '/automations/leads.first_follow_up', admin, { mode: 'suggest', settings: { hours: 4 } })).status).toBe(200);
    const waiting = await data(await call('POST', '/leads', admin, { contactId: contact.id, title: 'Suggest mode lead', destinations: ['Goa'], travelDate: '2027-01-10', tripType: 'family', source: 'website' }));
    expect(await rows('SELECT id FROM follow_ups WHERE lead_id = ?', waiting.id)).toHaveLength(0);
    const [pending] = (await suggestions(admin, `leadId=${waiting.id}`)).filter((s) => s.action.type === 'create_follow_up');
    expect(pending.reason).toContain('4 hours');
    expect((await call('POST', `/assistant/suggestions/${pending.id}/apply`, admin, {})).status).toBe(200);
    expect(await rows('SELECT id FROM follow_ups WHERE lead_id = ?', waiting.id)).toHaveLength(1);

    expect((await call('PUT', '/automations/leads.first_follow_up', admin, { mode: 'auto', settings: { hours: 24 } })).status).toBe(200);
  });

  it('a paused workspace runs no automation until it is resumed', async () => {
    expect((await call('PUT', '/automations/pause', sales, { paused: true })).status).toBe(403);
    expect((await call('PUT', '/automations/pause', admin, { paused: true })).status).toBe(200);
    expect((await data(await call('GET', '/automations', admin))).paused).toBe(true);

    const contact = await data(await call('POST', '/contacts', admin, { name: 'Paused Import', phone: '9000000013', type: 'customer' }));
    const lead = await data(await call('POST', '/leads', admin, { contactId: contact.id, title: 'Imported while paused', destinations: ['Goa'], travelDate: '2027-01-10', tripType: 'family', source: 'website' }));
    const m = await inbound({ from: '+919811100096', body: 'Need a quote for a Goa holiday, 4 nights' });
    expect(await rows('SELECT id FROM follow_ups WHERE lead_id = ?', lead.id)).toHaveLength(0);
    expect(await rows('SELECT id FROM assistant_suggestions WHERE lead_id = ? OR source_id = ?', lead.id, m.messageId)).toHaveLength(0);

    expect((await call('PUT', '/automations/pause', admin, { paused: false })).status).toBe(200);
    const after = await data(await call('POST', '/leads', admin, { contactId: contact.id, title: 'Created after resume', destinations: ['Goa'], travelDate: '2027-01-10', tripType: 'family', source: 'website' }));
    expect(await rows('SELECT id FROM follow_ups WHERE lead_id = ?', after.id)).toHaveLength(1);
  });

  it('the daily run drafts a nudge for a quote that has gone quiet, once', async () => {
    const contact = await data(await call('POST', '/contacts', admin, { name: 'Quiet Customer', phone: '9000000012', type: 'customer' }));
    const lead = await data(await call('POST', '/leads', admin, { contactId: contact.id, title: 'Quiet quote', destinations: ['Goa'], travelDate: '2027-02-01', tripType: 'family', source: 'website' }));
    await testEnv.MASTER_DB.prepare(`UPDATE leads SET status = 'proposal_sent', updated_at = '2026-01-01T00:00:00Z' WHERE id = ?`).bind(lead.id).run();

    expect((await call('POST', '/automations/run-scheduled', admin)).status).toBe(200);
    expect((await call('POST', '/automations/run-scheduled', admin)).status).toBe(200);

    const nudges = (await suggestions(admin, `leadId=${lead.id}`)).filter((s) => s.ruleKey === 'leads.stale_quote_nudge');
    expect(nudges).toHaveLength(1);
    expect(nudges[0].params.body).toContain('Hi Quiet,');
  });
});
