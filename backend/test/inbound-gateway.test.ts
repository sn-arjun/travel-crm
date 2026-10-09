import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const SALES_ID = '33333333-3333-3333-3333-333333333333';
const API_KEY = 'inbound-test-key';
const TENANT_WHATSAPP = '+918047182290';
const TENANT_SMS = '+918047182291';
const TENANT_MAILBOX = 'hello@inbound.test';

async function send(path: string, init: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function json(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return send(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function form(path: string, fields: Record<string, string>): Promise<Response> {
  return send(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}

async function simulate(body: Record<string, unknown>) {
  const res = await json('POST', '/test/inbound', { tenantId: TENANT_ID, ...body });
  expect(res.status).toBe(200);
  return ((await res.json()) as any).data as { messageId: string; contactId: string | null; leadId: string | null; duplicate: boolean };
}

let adminToken = '';

async function createContact(name: string, phone: string, email?: string): Promise<string> {
  const res = await json('POST', '/contacts', { name, phone, email, type: 'customer' }, adminToken);
  expect(res.status).toBe(201);
  return ((await res.json()) as any).data.id;
}

async function createLeadFor(contactId: string, title: string, assignedTo: string = ADMIN_ID): Promise<string> {
  const res = await json(
    'POST',
    '/leads',
    { contactId, title, destinations: ['Munnar'], travelDate: '2026-12-18', tripType: 'family', source: 'website', assignedTo },
    adminToken,
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as any).data.id;
}

describe('Inbound gateway', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await json('POST', '/test/reset')).status).toBe(200);
    const login = await json('POST', '/auth/login', { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    expect(login.status).toBe(200);
    adminToken = ((await login.json()) as any).data.accessToken;

    await testEnv.MASTER_DB.batch([
      testEnv.MASTER_DB.prepare(
        `INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address, provider) VALUES ('addr-wa', ?, 'whatsapp', ?, 'twilio')`,
      ).bind(TENANT_ID, TENANT_WHATSAPP),
      testEnv.MASTER_DB.prepare(
        `INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address, provider) VALUES ('addr-sms', ?, 'sms', ?, 'twilio')`,
      ).bind(TENANT_ID, TENANT_SMS),
      testEnv.MASTER_DB.prepare(
        `INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address, provider) VALUES ('addr-mail', ?, 'email', ?, 'sendgrid')`,
      ).bind(TENANT_ID, TENANT_MAILBOX),
      testEnv.MASTER_DB.prepare(
        `INSERT INTO tenant_api_keys (id, tenant_id, api_key, label, is_active) VALUES ('key-1', ?, ?, 'Website', 1)`,
      ).bind(TENANT_ID, API_KEY),
    ]);
  });

  describe('message from an unknown sender', () => {
    it('is stored as incoming with the sender address and no contact', async () => {
      const result = await simulate({ channel: 'whatsapp', from: '98450 23117', body: 'Hi! Family of four, 5 nights in Kerala from 18 Dec.' });
      expect(result).toMatchObject({ contactId: null, leadId: null, duplicate: false });

      const [row] = await rows('SELECT * FROM message_log WHERE id = ?', result.messageId);
      expect(row).toMatchObject({
        direction: 'incoming',
        channel: 'whatsapp',
        status: 'delivered',
        contact_id: null,
        from_address: '+919845023117',
      });
      expect(row.content).toContain('Kerala');
    });

    it('notifies the people who triage new enquiries, not salespeople', async () => {
      const result = await simulate({ channel: 'sms', from: '+919811111111', body: 'Do you do Ladakh bike trips?' });
      const notified = await rows('SELECT user_id, title, message FROM notifications WHERE reference_id = ?', result.messageId);
      // The test database is shared by two seeded tenants, so "triage users" is read from it.
      const triage = await rows(`SELECT id FROM users WHERE role IN ('admin', 'sales_manager') AND is_active = 1`);
      expect(notified.map((n) => n.user_id).sort()).toEqual(triage.map((u) => u.id).sort());
      expect(notified.map((n) => n.user_id)).toContain(ADMIN_ID);
      expect(notified.map((n) => n.user_id)).not.toContain(SALES_ID);
      expect(notified[0].title).toBe('New SMS');
      expect(notified[0].message).toContain('+919811111111');
      expect(notified[0].message).toContain('Ladakh');
    });

    it('appears in the communication log with its direction and sender', async () => {
      const result = await simulate({ channel: 'whatsapp', from: '+919822222222', body: 'Log visibility check' });
      const res = await json('GET', '/communications/log?search=Log%20visibility', undefined, adminToken);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      const list = Array.isArray(body.data) ? body.data : body.data.data;
      const entry = list.find((m: any) => m.id === result.messageId);
      expect(entry).toMatchObject({ direction: 'incoming', fromAddress: '+919822222222', contactId: null });
    });
  });

  describe('message from a known contact', () => {
    it('links the contact by any stored phone form and the single open lead', async () => {
      const contactId = await createContact('Priya Nair', '9845099001', 'priya.nair@example.com');
      const leadId = await createLeadFor(contactId, 'Kerala Backwaters Family Holiday', SALES_ID);

      const result = await simulate({ channel: 'whatsapp', from: 'whatsapp:+919845099001', body: 'Can we add a houseboat night?' });
      expect(result).toMatchObject({ contactId, leadId, duplicate: false });

      const activity = await rows('SELECT type, content, created_by FROM lead_activities WHERE lead_id = ? AND type = ?', leadId, 'whatsapp');
      expect(activity).toHaveLength(1);
      expect(activity[0].content).toContain('houseboat');
      expect(activity[0].created_by).toBeNull();

      const notified = await rows('SELECT user_id, message, reference_type FROM notifications WHERE reference_id = ? AND type = ?', contactId, 'message_received');
      expect(notified.map((n) => n.user_id)).toEqual([SALES_ID]);
      expect(notified[0].reference_type).toBe('contact');
      expect(notified[0].message.startsWith('Priya Nair:')).toBe(true);
    });

    it('matches an email sender to the contact', async () => {
      const [contact] = await rows(`SELECT id FROM contacts WHERE email = 'priya.nair@example.com'`);
      const result = await simulate({ channel: 'email', from: 'Priya Nair <Priya.Nair@Example.com>', subject: 'Dates', body: 'We can also do 20 Dec.' });
      expect(result.contactId).toBe(contact.id);
      const [row] = await rows('SELECT subject, from_address FROM message_log WHERE id = ?', result.messageId);
      expect(row).toMatchObject({ subject: 'Dates', from_address: 'priya.nair@example.com' });
    });

    it('does not guess a lead when the contact has two open leads', async () => {
      const contactId = await createContact('Rohan Desai', '9822051934');
      await createLeadFor(contactId, 'Goa Beach Escape');
      await createLeadFor(contactId, 'Coorg Weekend');
      const result = await simulate({ channel: 'whatsapp', from: '+919822051934', body: 'Any update?' });
      expect(result).toMatchObject({ contactId, leadId: null });
    });

    it('ignores closed leads when choosing the lead', async () => {
      const contactId = await createContact('Divya Menon', '9447061825');
      const closed = await createLeadFor(contactId, 'Munnar Tea Trails Weekend');
      await testEnv.MASTER_DB.prepare(`UPDATE leads SET status = 'won' WHERE id = ?`).bind(closed).run();
      const open = await createLeadFor(contactId, 'Wayanad Monsoon Break');
      const result = await simulate({ channel: 'sms', from: '09447061825', body: 'Late check-out possible?' });
      expect(result.leadId).toBe(open);
    });
  });

  it('stores a redelivered provider message once', async () => {
    const first = await simulate({ channel: 'whatsapp', from: '+919833333333', body: 'Hello', externalId: 'SM-dup-1' });
    const notifiedOnce = await rows('SELECT id FROM notifications WHERE reference_id = ?', first.messageId);
    const second = await simulate({ channel: 'whatsapp', from: '+919833333333', body: 'Hello', externalId: 'SM-dup-1' });
    expect(second).toMatchObject({ messageId: first.messageId, duplicate: true });
    expect(await rows(`SELECT id FROM message_log WHERE external_id = 'SM-dup-1'`)).toHaveLength(1);
    expect(notifiedOnce.length).toBeGreaterThan(0);
    expect(await rows('SELECT id FROM notifications WHERE reference_id = ?', first.messageId)).toHaveLength(notifiedOnce.length);
  });

  describe('Twilio webhook', () => {
    it('routes WhatsApp to the tenant that owns the receiving number', async () => {
      const res = await form('/webhooks/inbound/twilio/message', {
        From: 'whatsapp:+919845077001',
        To: `whatsapp:${TENANT_WHATSAPP}`,
        Body: 'Need a Maldives quote',
        MessageSid: 'SM-tw-1',
        ProfileName: 'Neha Kapoor',
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/xml');

      const [row] = await rows(`SELECT * FROM message_log WHERE external_id = 'SM-tw-1'`);
      expect(row).toMatchObject({ channel: 'whatsapp', direction: 'incoming', from_address: '+919845077001', to_address: TENANT_WHATSAPP });
      expect(JSON.parse(row.metadata)).toMatchObject({ provider: 'twilio', from_name: 'Neha Kapoor' });
    });

    it('treats a plain number as SMS', async () => {
      await form('/webhooks/inbound/twilio/message', { From: '+919845077002', To: TENANT_SMS, Body: 'Call me back', MessageSid: 'SM-tw-2' });
      const [row] = await rows(`SELECT channel FROM message_log WHERE external_id = 'SM-tw-2'`);
      expect(row.channel).toBe('sms');
    });

    it('acknowledges but does not store a message to a number no tenant owns', async () => {
      const res = await form('/webhooks/inbound/twilio/message', { From: 'whatsapp:+919845077003', To: 'whatsapp:+910000000000', Body: 'Lost', MessageSid: 'SM-tw-3' });
      expect(res.status).toBe(200);
      expect(await rows(`SELECT id FROM message_log WHERE external_id = 'SM-tw-3'`)).toHaveLength(0);
      const logged = await rows(`SELECT status, error_message FROM webhook_log WHERE tenant_id = 'unrouted' AND source = 'twilio:whatsapp'`);
      expect(logged).toHaveLength(1);
      expect(logged[0].status).toBe('unrouted');
    });
  });

  it('Plivo webhook takes the channel from the configured URL', async () => {
    const res = await form('/webhooks/inbound/plivo/message?channel=whatsapp', {
      From: '919845077004',
      To: TENANT_WHATSAPP.slice(1),
      Text: 'Plivo hello',
      MessageUUID: 'PL-1',
    });
    expect(res.status).toBe(200);
    const [row] = await rows(`SELECT channel, from_address FROM message_log WHERE external_id = 'PL-1'`);
    expect(row).toMatchObject({ channel: 'whatsapp', from_address: '+919845077004' });
  });

  describe('Email (SendGrid Inbound Parse)', () => {
    function parsePayload(fields: Record<string, string>): Promise<Response> {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.set(key, value);
      return send('/webhooks/inbound/email/any-secret-in-test-mode', { method: 'POST', body: data });
    }

    it('stores the email for the tenant that owns the mailbox', async () => {
      const res = await parsePayload({
        from: 'Siddharth Rao <siddharth.rao@example.com>',
        to: `Sahyadri Holidays <${TENANT_MAILBOX}>`,
        envelope: JSON.stringify({ to: [TENANT_MAILBOX], from: 'siddharth.rao@example.com' }),
        subject: 'Offsite for 24 people',
        text: 'We are planning a Coorg offsite in November.',
        headers: 'Received: by mx\nMessage-ID: <abc-123@mail.example.com>\nDate: today',
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ success: true, stored: true });

      const [row] = await rows(`SELECT * FROM message_log WHERE external_id = '<abc-123@mail.example.com>'`);
      expect(row).toMatchObject({
        channel: 'email',
        direction: 'incoming',
        subject: 'Offsite for 24 people',
        from_address: 'siddharth.rao@example.com',
        to_address: TENANT_MAILBOX,
      });
    });

    it('falls back to the HTML body', async () => {
      await parsePayload({
        from: 'kavitha.reddy@example.com',
        to: TENANT_MAILBOX,
        subject: 'Goa meet',
        html: '<div>Need <b>30 rooms</b><br>in Candolim</div>',
        headers: 'Message-ID: <html-1@mail.example.com>',
      });
      const [row] = await rows(`SELECT content FROM message_log WHERE external_id = '<html-1@mail.example.com>'`);
      expect(row.content).toBe('Need 30 rooms\nin Candolim');
    });

    it('does not store mail for an unknown mailbox', async () => {
      const res = await parsePayload({ from: 'someone@example.com', to: 'nobody@inbound.test', subject: 'Hi', text: 'Hello', headers: 'Message-ID: <lost-1@mail.example.com>' });
      expect(await res.json()).toMatchObject({ success: true, stored: false });
      expect(await rows(`SELECT id FROM message_log WHERE external_id = '<lost-1@mail.example.com>'`)).toHaveLength(0);
    });
  });

  describe('Website enquiry form', () => {
    const enquiry = {
      api_key: API_KEY,
      name: 'Aditya Joshi',
      phone: '9825041896',
      email: 'aditya.joshi@example.com',
      destination: 'Singapore',
      travel_date: '2026-12-05',
      adults: 2,
      children: 2,
      budget: 260000,
      message: 'Universal Studios and Sentosa please.',
      utm_source: 'google',
    };

    it('rejects a missing or wrong API key', async () => {
      expect((await json('POST', '/webhooks/inbound/web-form', { name: 'X' })).status).toBe(400);
      expect((await json('POST', '/webhooks/inbound/web-form', { ...enquiry, api_key: 'nope' })).status).toBe(401);
    });

    it('requires something to identify the person', async () => {
      expect((await json('POST', '/webhooks/inbound/web-form', { api_key: API_KEY, destination: 'Goa' })).status).toBe(400);
    });

    it('creates the contact, the lead and an inbox entry', async () => {
      const res = await json('POST', '/webhooks/inbound/web-form', enquiry);
      expect(res.status).toBe(200);
      const { lead_id: leadId, contact_id: contactId } = (await res.json()) as any;

      const [contact] = await rows('SELECT name, phone, email, type, source FROM contacts WHERE id = ?', contactId);
      expect(contact).toMatchObject({ name: 'Aditya Joshi', phone: '+919825041896', email: 'aditya.joshi@example.com', type: 'customer', source: 'website' });

      const [lead] = await rows('SELECT * FROM leads WHERE id = ?', leadId);
      expect(lead).toMatchObject({
        contact_id: contactId,
        title: 'Singapore enquiry: Aditya Joshi',
        destination: '["Singapore"]',
        travel_date: '2026-12-05',
        pax_adults: 2,
        pax_children: 2,
        budget: 260000,
        source: 'website',
        status: 'new',
        priority: 'hot',
        created_by: null,
      });
      expect(lead.assigned_to).toBeTruthy();

      const [message] = await rows(`SELECT channel, direction, lead_id, metadata FROM message_log WHERE contact_id = ? AND channel = 'web_form'`, contactId);
      expect(message).toMatchObject({ channel: 'web_form', direction: 'incoming', lead_id: leadId });
      expect(JSON.parse(message.metadata)).toMatchObject({ utm_source: 'google' });
    });

    it('reuses the contact on a second enquiry and keeps the old URL working', async () => {
      const res = await json('POST', '/leads/webhook', { ...enquiry, name: 'Aditya J', destination: 'Bali', email: '' });
      expect(res.status).toBe(200);
      const { contact_id: contactId } = (await res.json()) as any;
      expect(await rows(`SELECT id FROM contacts WHERE phone = '+919825041896'`)).toHaveLength(1);
      expect(await rows('SELECT id FROM leads WHERE contact_id = ?', contactId)).toHaveLength(2);
    });
  });

  it('the simulator refuses unsupported channels and missing fields', async () => {
    expect((await json('POST', '/test/inbound', { tenantId: TENANT_ID, channel: 'fax', from: '1', body: 'x' })).status).toBe(400);
    expect((await json('POST', '/test/inbound', { tenantId: TENANT_ID, channel: 'sms', body: 'x' })).status).toBe(400);
    expect((await json('POST', '/test/inbound', { tenantId: 'no-such-tenant', channel: 'sms', from: '1', body: 'x' })).status).toBe(404);
  });
});
