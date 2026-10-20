import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { handleQueue } from '../src/queues/index';

/**
 * R128: five email delivery bugs found by the ADR-002 review.
 *  1. the provider message id is saved on every outbound email row, so delivery events find it (and count once);
 *  2. "send itinerary by email" sends;
 *  3. invoice and voucher "send" send an email;
 *  4. a hard bounce flags the address undeliverable instead of erasing it, and later sends are suppressed;
 *  5. Communication Hub email carries a reply-to.
 * No real mail: fetch is mocked, the queue is drained in the test, events are signed with a test ECDSA key.
 */

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_EMAIL = 'admin@e2e.test';
// Production-like for the event webhook: only a genuinely signed event passes.
const strict = { ...testEnv, TEST_MODE: 'false' };

let admin = '';
const queued: Array<{ type: string; data: any }> = [];
const queueEnv = {
  ...testEnv,
  EMAIL_QUEUE: { send: async (m: any) => { queued.push(m); } },
  SMS_QUEUE: { send: async (m: any) => { queued.push(m); } },
  CAMPAIGN_QUEUE: { send: async () => {} },
};

interface Json { status: number; body: any }

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = queueEnv): Promise<Json> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: await res.json().catch(() => null) };
}

const sql = (text: string, ...binds: unknown[]) => (testEnv.MASTER_DB as D1Database).prepare(text).bind(...binds);
async function one<T = Record<string, any>>(text: string, ...binds: unknown[]): Promise<T> {
  return (await sql(text, ...binds).first()) as T;
}

// ── fake SendGrid: every send is recorded and answered 202 with an x-message-id ──
interface SentMail { to: string; subject?: string; replyTo?: string; html: string; attachments: any[]; messageId: string; raw: any }
const sent: SentMail[] = [];
let sendCounter = 0;
const realFetch = globalThis.fetch;

function fakeSendGrid() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!String(url).includes('api.sendgrid.com/v3/mail/send')) return realFetch(input, init);
    const raw = JSON.parse(String(init?.body ?? '{}'));
    const messageId = `r128msg${++sendCounter}`;
    sent.push({
      to: raw.personalizations?.[0]?.to?.[0]?.email,
      subject: raw.subject,
      replyTo: raw.reply_to?.email,
      html: (raw.content ?? []).map((c: any) => c.value).join('\n'),
      attachments: raw.attachments ?? [],
      messageId,
      raw,
    });
    return new Response('', { status: 202, headers: { 'x-message-id': messageId } });
  });
}

/** Run what the routes put on the queue through the real queue consumer. */
async function drain(): Promise<void> {
  const jobs = queued.splice(0);
  for (const body of jobs) {
    await handleQueue({ queue: 'travelcrm-email-queue', messages: [{ body, ack() {}, retry() { throw new Error(`queue retried: ${JSON.stringify(body).slice(0, 200)}`); } }] } as any, testEnv);
  }
}

// ── signed SendGrid event webhook (same scheme routes/webhooks.ts verifies) ──
function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s);
}
function toDer(raw: Uint8Array): Uint8Array {
  const int = (part: Uint8Array) => {
    let i = 0;
    while (i < part.length - 1 && part[i] === 0) i++;
    let v = part.slice(i);
    if (v[0] & 0x80) v = Uint8Array.of(0, ...v);
    return Uint8Array.of(0x02, v.length, ...v);
  };
  const body = Uint8Array.of(...int(raw.slice(0, 32)), ...int(raw.slice(32)));
  return Uint8Array.of(0x30, body.length, ...body);
}

let keyPair: CryptoKeyPair;
let sgEnv: any;
let tsCounter = 1760100000;

async function sendEvents(events: Array<Record<string, unknown>>): Promise<number> {
  const body = JSON.stringify(events);
  const ts = String(tsCounter++);
  const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, new TextEncoder().encode(ts + body)));
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request('http://localhost/api/v1/webhooks/sendgrid/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Twilio-Email-Event-Webhook-Signature': b64(toDer(raw)),
        'X-Twilio-Email-Event-Webhook-Timestamp': ts,
      },
      body,
    }),
    sgEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res.status;
}

/** SendGrid sends sg_message_id as "<x-message-id>.<filter>.<n>". */
const sgEvent = (event: string, messageId: string, email: string, extra: Record<string, unknown> = {}) => ({
  event,
  email,
  sg_message_id: `${messageId}.filterdrecv-1.1`,
  sg_event_id: `evt-${event}-${messageId}`,
  ...extra,
});

async function newContact(name: string, email: string | null, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await call('POST', '/contacts', admin, { name, ...(email ? { email } : {}), type: 'customer', ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}

async function newLead(contactId: string, title: string): Promise<string> {
  const res = await call('POST', '/leads', admin, { contactId, title, destinations: ['Kerala'], travelDate: '2027-01-15', tripType: 'domestic', source: 'website' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}

describe('email delivery bugs (R128)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, { email: ADMIN_EMAIL, password: 'password123', tenantId: TENANT_ID });
    admin = login.body.data.accessToken;

    keyPair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const publicKey = b64((await crypto.subtle.exportKey('spki', keyPair.publicKey)) as ArrayBuffer);
    sgEnv = { ...strict, SENDGRID_WEBHOOK_PUBLIC_KEY: publicKey };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sent.length = 0;
    queued.length = 0;
  });

  // ──────────────────────────────────────────────────────────────
  describe('1. the provider message id reaches the row, and events count once', () => {
    it('a campaign email stores the provider message id on its log row; signed events update the row and the campaign counters', async () => {
      fakeSendGrid();
      const contactId = await newContact('Event Receiver', 'events-r128@example.com', { tags: ['r128-events'] });
      const created = await call('POST', '/campaigns', admin, { name: 'R128 events', subject: 'Hello', body: '<p>Hi</p>', segmentFilters: { tags: ['r128-events'] } });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const campaignId = created.body.data.id as string;
      expect((await call('POST', `/campaigns/${campaignId}/send`, admin)).status).toBe(200);
      await drain();

      expect(sent).toHaveLength(1);
      const log = await one('SELECT id, message_id, status FROM email_message_log WHERE campaign_id = ? AND contact_id = ?', campaignId, contactId);
      expect(log.message_id).toBe(sent[0].messageId);
      expect(log.status).toBe('sent');

      const email = 'events-r128@example.com';
      const mid = sent[0].messageId;
      expect(await sendEvents([sgEvent('processed', mid, email), sgEvent('delivered', mid, email), sgEvent('open', mid, email), sgEvent('click', mid, email)])).toBe(200);
      let row = await one('SELECT status, opened_at, clicked_at FROM email_message_log WHERE id = ?', log.id);
      expect(row.status).toBe('clicked');
      expect(row.opened_at).toBeTruthy();
      expect(row.clicked_at).toBeTruthy();
      let camp = await one('SELECT opened_count, clicked_count, bounced_count FROM email_campaigns WHERE id = ?', campaignId);
      expect(camp).toMatchObject({ opened_count: 1, clicked_count: 1, bounced_count: 0 });

      // The provider redelivers the same events, and a late "delivered" arrives after the open: nothing is counted twice or moved back.
      expect(await sendEvents([sgEvent('open', mid, email), sgEvent('click', mid, email), sgEvent('open', mid, email), sgEvent('delivered', mid, email)])).toBe(200);
      row = await one('SELECT status FROM email_message_log WHERE id = ?', log.id);
      expect(row.status).toBe('clicked');
      camp = await one('SELECT opened_count, clicked_count FROM email_campaigns WHERE id = ?', campaignId);
      expect(camp).toMatchObject({ opened_count: 1, clicked_count: 1 });

      // A soft bounce ("blocked") is recorded and counted once; the address stays deliverable.
      expect(await sendEvents([sgEvent('bounce', mid, email, { type: 'blocked', reason: 'mailbox full' }), sgEvent('bounce', mid, email, { type: 'blocked', reason: 'mailbox full' })])).toBe(200);
      row = await one('SELECT status, bounce_reason FROM email_message_log WHERE id = ?', log.id);
      expect(row).toMatchObject({ status: 'bounced', bounce_reason: 'mailbox full' });
      camp = await one('SELECT bounced_count FROM email_campaigns WHERE id = ?', campaignId);
      expect(camp.bounced_count).toBe(1);
      expect((await one('SELECT email_undeliverable FROM contacts WHERE id = ?', contactId)).email_undeliverable).toBe(0);
    });

    it('a Communication Hub email and a marketing campaign email keep the message id too, and their events update them', async () => {
      fakeSendGrid();
      const contactId = await newContact('Hub Receiver', 'hub-r128@example.com', { tags: ['r128-hub'] });
      const hub = await call('POST', '/communications/send', admin, { channel: 'email', contact_id: contactId, message: 'Your quote is ready' });
      expect(hub.status, JSON.stringify(hub.body)).toBe(201);
      await drain();
      const msgRow = await one('SELECT id, status, external_id FROM message_log WHERE id = ?', hub.body.data.message_id);
      expect(msgRow.status).toBe('sent');
      expect(msgRow.external_id).toBe(sent[0].messageId);
      expect(await sendEvents([sgEvent('delivered', sent[0].messageId, 'hub-r128@example.com'), sgEvent('open', sent[0].messageId, 'hub-r128@example.com')])).toBe(200);
      expect((await one('SELECT status, delivered_at, read_at FROM message_log WHERE id = ?', msgRow.id))).toMatchObject({ status: 'read', delivered_at: expect.any(String), read_at: expect.any(String) });

      // marketing campaign recipient (campaign-queue sends it directly)
      await sql(`INSERT INTO marketing_campaigns (id, name, type, status, email_subject, message_body) VALUES ('r128-mc', 'R128 marketing', 'email', 'sending', 'Offer', '<p>Offer</p>')`).run();
      await sql(`INSERT INTO campaign_recipients (id, campaign_id, contact_id, email, status) VALUES ('r128-mr', 'r128-mc', ?, 'hub-r128@example.com', 'pending')`, contactId).run();
      await handleQueue({ queue: 'travelcrm-campaign-queue', messages: [{ body: { type: 'email_campaign', data: { campaignId: 'r128-mc', tenantId: TENANT_ID, campaignType: 'email' } }, ack() {}, retry() { throw new Error('retried'); } }] } as any, { ...testEnv, CAMPAIGN_QUEUE: { send: async () => {} } });
      const rec = await one('SELECT status, message_id FROM campaign_recipients WHERE id = ?', 'r128-mr');
      expect(rec.status).toBe('sent');
      expect(rec.message_id).toBe(sent[1].messageId);
      await sendEvents([sgEvent('open', rec.message_id, 'hub-r128@example.com'), sgEvent('open', rec.message_id, 'hub-r128@example.com'), sgEvent('click', rec.message_id, 'hub-r128@example.com')]);
      expect(await one('SELECT opened_count, clicked_count FROM marketing_campaigns WHERE id = ?', 'r128-mc')).toMatchObject({ opened_count: 1, clicked_count: 1 });
    });
  });

  // ──────────────────────────────────────────────────────────────
  describe('2. itinerary by email', () => {
    it('queues a job the consumer recognises and sends it, with the secure quotation link, to the address given', async () => {
      fakeSendGrid();
      const errors = vi.spyOn(console, 'error');
      const contactId = await newContact('Itinerary Receiver', 'itin-r128@example.com');
      const leadId = await newLead(contactId, 'Kerala quote');
      const itin = await call('POST', '/itineraries', admin, { leadId, title: 'Kerala backwaters', days: [{ dayNumber: 1, title: 'Arrival' }] });
      expect(itin.status, JSON.stringify(itin.body)).toBe(201);
      const itinId = itin.body.data.id as string;

      const res = await call('POST', `/itineraries/${itinId}/send`, admin, { channel: 'email', to: 'itin-r128@example.com', message: 'Dear guest,\n\nYour quotation is attached.' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(queued).toHaveLength(1);
      expect(queued[0].type).toBe('email');
      await drain();

      expect(errors.mock.calls.some((c) => String(c[0]).includes('Unknown queue message type'))).toBe(false);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('itin-r128@example.com');
      expect(sent[0].subject).toContain('Kerala backwaters');
      expect(sent[0].html).toContain('Your quotation is attached.');
      const token = (await one('SELECT share_token FROM itineraries WHERE id = ?', itinId)).share_token as string;
      expect(token).toBeTruthy();
      expect(sent[0].html).toContain(token);
      // the send is tracked: a log row with the provider id
      const log = await one('SELECT message_id FROM email_message_log WHERE contact_id = ? AND recipient_email = ?', contactId, 'itin-r128@example.com');
      expect(log.message_id).toBe(sent[0].messageId);
    });
  });

  // ──────────────────────────────────────────────────────────────
  describe('3. invoice and voucher send', () => {
    it('invoice send by email queues and sends the invoice with its payment link, and still moves draft to sent', async () => {
      fakeSendGrid();
      const contactId = await newContact('Invoice Receiver', 'inv-r128@example.com');
      const inv = await call('POST', '/invoices', admin, { contactId, items: [{ description: 'Kerala package', quantity: 1, rate: 50000 }] });
      expect(inv.status, JSON.stringify(inv.body)).toBe(201);
      const invoiceId = inv.body.data.id as string;
      const invoiceNumber = inv.body.data.invoiceNumber as string;
      await sql(`UPDATE invoices SET payment_link_url = 'https://pay.example.test/r128', payment_link_status = 'created' WHERE id = ?`, invoiceId).run();

      const res = await call('POST', `/invoices/${invoiceId}/send`, admin, { channel: 'email', to: 'inv-r128@example.com' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      await drain();

      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('inv-r128@example.com');
      expect(sent[0].subject).toContain(invoiceNumber);
      expect(sent[0].html).toContain('Kerala package');
      expect(sent[0].html).toContain('https://pay.example.test/r128');
      expect((await one('SELECT status FROM invoices WHERE id = ?', invoiceId)).status).toBe('sent');
    });

    it('voucher send by email attaches the voucher PDF', async () => {
      fakeSendGrid();
      const contactId = await newContact('Voucher Receiver', 'vou-r128@example.com');
      const leadId = await newLead(contactId, 'Voucher trip');
      const v = await call('POST', '/vouchers', admin, {
        leadId,
        type: 'transport',
        title: 'Airport transfer',
        details: { vehicleType: 'Sedan', pickupLocation: 'Cochin Airport', pickupTime: '10:00', dropLocation: 'Hotel Lake View' },
      });
      expect(v.status, JSON.stringify(v.body)).toBe(201);
      const voucherId = v.body.data.id as string;

      const res = await call('POST', `/vouchers/${voucherId}/send`, admin, { channel: 'email', to: 'vou-r128@example.com' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      await drain();

      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('vou-r128@example.com');
      expect(sent[0].attachments).toHaveLength(1);
      expect(sent[0].attachments[0]).toMatchObject({ type: 'application/pdf', filename: expect.stringMatching(/^voucher-transport-.*\.pdf$/) });
      expect(atob(sent[0].attachments[0].content).startsWith('%PDF')).toBe(true);
      expect((await one('SELECT status FROM vouchers WHERE id = ?', voucherId)).status).toBe('sent');
    });
  });

  // ──────────────────────────────────────────────────────────────
  describe('4. a hard bounce no longer erases the address', () => {
    it('keeps the email, flags it undeliverable with reason and date, shows it on the contact API, and suppresses further sends', async () => {
      fakeSendGrid();
      const contactId = await newContact('Bounce Receiver', 'bounce-r128@example.com');
      const hub = await call('POST', '/communications/send', admin, { channel: 'email', contact_id: contactId, message: 'First message' });
      expect(hub.status).toBe(201);
      await drain();
      const mid = sent[0].messageId;

      expect(await sendEvents([sgEvent('bounce', mid, 'bounce-r128@example.com', { type: 'bounce', reason: '550 5.1.1 user unknown' })])).toBe(200);

      const row = await one('SELECT email, email_undeliverable, email_undeliverable_reason, email_undeliverable_at FROM contacts WHERE id = ?', contactId);
      expect(row.email).toBe('bounce-r128@example.com');
      expect(row.email_undeliverable).toBe(1);
      expect(row.email_undeliverable_reason).toContain('user unknown');
      expect(row.email_undeliverable_at).toBeTruthy();

      const api = await call('GET', `/contacts/${contactId}`, admin);
      expect(api.body.data).toMatchObject({ email: 'bounce-r128@example.com', emailUndeliverable: 1, emailUndeliverableReason: expect.stringContaining('user unknown') });
      const list = await call('GET', '/contacts?search=Bounce%20Receiver', admin);
      expect(list.body.data.find((c: any) => c.id === contactId)).toMatchObject({ emailUndeliverable: 1 });

      // Further sends to the address are suppressed at the queue: the provider is not called, the allowance is given back.
      sent.length = 0;
      const again = await call('POST', '/communications/send', admin, { channel: 'email', contact_id: contactId, message: 'Second message' });
      expect(again.status).toBe(201);
      await drain();
      expect(sent).toHaveLength(0);
      expect((await one('SELECT status, error_message FROM message_log WHERE id = ?', again.body.data.message_id)).status).toBe('failed');

      // An invoice email is refused with a reason, and the status does not change.
      const inv = await call('POST', '/invoices', admin, { contactId, items: [{ description: 'Blocked', quantity: 1, rate: 100 }] });
      const blocked = await call('POST', `/invoices/${inv.body.data.id}/send`, admin, { channel: 'email', to: 'bounce-r128@example.com' });
      expect(blocked.status).toBe(409);
      expect((await one('SELECT status FROM invoices WHERE id = ?', inv.body.data.id)).status).toBe('draft');

      // Correcting the address on the contact clears the flag.
      const fix = await call('PUT', `/contacts/${contactId}`, admin, { email: 'bounce-fixed-r128@example.com' });
      expect(fix.status).toBe(200);
      expect(await one('SELECT email_undeliverable, email_undeliverable_reason FROM contacts WHERE id = ?', contactId)).toMatchObject({ email_undeliverable: 0, email_undeliverable_reason: null });
    });
  });

  // ──────────────────────────────────────────────────────────────
  describe('5. replies reach the agency', () => {
    it('Communication Hub email carries the sending user as reply-to, or the agency receiving address when it has one', async () => {
      fakeSendGrid();
      const contactId = await newContact('Reply Receiver', 'reply-r128@example.com');

      const first = await call('POST', '/communications/send', admin, { channel: 'email', contact_id: contactId, message: 'Hello there' });
      expect(first.status).toBe(201);
      expect(queued[0].data.replyTo).toBe(ADMIN_EMAIL);
      await drain();
      expect(sent[0].replyTo).toBe(ADMIN_EMAIL);

      await sql(`INSERT INTO tenant_channel_addresses (id, tenant_id, channel, address, provider, label) VALUES ('r128-addr', ?, 'email', 'inbox-r128@agency.example.test', NULL, 'Agency inbox')`, TENANT_ID).run();
      try {
        const second = await call('POST', '/communications/send', admin, { channel: 'email', contact_id: contactId, message: 'Another one' });
        expect(second.status).toBe(201);
        await drain();
        expect(sent[1].replyTo).toBe('inbox-r128@agency.example.test');
      } finally {
        await sql(`DELETE FROM tenant_channel_addresses WHERE id = 'r128-addr'`).run();
      }
    });
  });
});
