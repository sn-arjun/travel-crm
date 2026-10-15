import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../src/utils/unsubscribe-token';
import { PRIVACY_TABLES, PRIVACY_NOT_PERSONAL } from '../src/services/privacy/registry';
import { marketingBlockedReason } from '../src/services/privacy/consent';
import { handleCampaignQueue } from '../src/queues/campaign-queue';
import { sendEmail } from '../src/services/sendgrid';

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

// The data subject (A) and a bystander (B). Unique strings so a LIKE scan can find any leftover.
const A = { id: '0196b208-0000-7000-8000-00000000000a', name: 'Zainab Quillfeather', email: 'zq-gdpr208@example.test', phone: '9811122233' };
const B = { id: '0196b208-0000-7000-8000-00000000000b', name: 'Bartholomew Underhill', email: 'bu-gdpr208@example.test', phone: '9822233344' };
const LEAD_A = '0196b208-1111-7000-8000-00000000000a';
const LEAD_B = '0196b208-1111-7000-8000-00000000000b';
const TRAV_A = '0196b208-2222-7000-8000-00000000000a';
const INV_A = '0196b208-3333-7000-8000-00000000000a';
const INV_B = '0196b208-3333-7000-8000-00000000000b';
const DOC_KEY = `${TENANT_ID}/g208/zainab-passport.pdf`;
const DOC_KEY_B = `${TENANT_ID}/g208/bartholomew.pdf`;

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = testEnv, ip = '203.0.113.208'): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'cf-connecting-ip': ip };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function ins(table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  await DB.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...Object.values(row)).run();
}
async function all<T = any>(sql: string, ...b: unknown[]): Promise<T[]> {
  return ((await DB.prepare(sql).bind(...b).all()).results ?? []) as T[];
}

async function login(email: string): Promise<string> {
  const res = await call('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID });
  return ((await res.json()) as any).data.accessToken;
}

/** Seeds one row in every table the registry lists, for a subject. */
async function seedSubject(s: typeof A, lead: string, inv: string, withTraveller: boolean, docKey: string) {
  const k = s.id.slice(-1);
  await ins('contacts', { id: s.id, name: s.name, email: s.email, phone: s.phone, company: `${s.name} Travels`, type: 'customer', address: `12 ${s.name} Street`, city: 'Pune', tax_id: '27AAAAA0000A1Z5', notes: `Prefers aisle, ${s.name}`, created_by: ADMIN_ID });
  await ins('leads', { id: lead, contact_id: s.id, title: `${s.name} Bali trip`, notes: `call ${s.phone}`, special_requirements: 'vegan', created_by: ADMIN_ID });
  await ins('lead_activities', { id: `la-${k}-g208`, lead_id: lead, type: 'note', content: `Spoke to ${s.name}`, created_by: ADMIN_ID });
  await ins('follow_ups', { id: `fu-${k}-g208`, lead_id: lead, scheduled_at: '2026-12-01T10:00:00Z', type: 'call', notes: `ring ${s.name}`, created_by: ADMIN_ID });
  await ins('itineraries', { id: `it-${k}-g208`, lead_id: lead, title: `${s.name} itinerary`, notes: s.email, share_token: `tok-${k}-g208`, share_link_active: 1, created_by: ADMIN_ID });
  await ins('itinerary_days', { id: `id-${k}-g208`, itinerary_id: `it-${k}-g208`, day_number: 1, title: `Arrive ${s.name}` });
  await ins('itinerary_items', { id: `ii-${k}-g208`, day_id: `id-${k}-g208`, type: 'hotel', title: 'Hotel', cost_price: 100, internal_notes: 'secret margin' });
  await ins('invoices', { id: inv, lead_id: lead, contact_id: s.id, invoice_number: `G208-${k}`, subtotal: 1000, total: 1180, notes: `bill to ${s.name}`, created_by: ADMIN_ID });
  await ins('invoice_items', { id: `iv-${k}-g208`, invoice_id: inv, description: `Package for ${s.name} (${s.phone})`, quantity: 1, rate: 1000, amount: 1000 });
  await ins('payments', { id: `pay-${k}-g208`, invoice_id: inv, contact_id: s.id, amount: 500, date: '2026-10-01', notes: `paid by ${s.name}`, created_by: ADMIN_ID });
  await ins('message_log', { id: `ml-${k}-g208`, contact_id: s.id, lead_id: lead, channel: 'email', content: `Hello ${s.name}`, sent_by: ADMIN_ID });
  await ins('email_message_log', { id: `eml-${k}-g208`, contact_id: s.id, recipient_email: s.email, status: 'sent' });
  await ins('unsubscribes', { id: `un-${k}-g208`, contact_id: s.id, email: s.email });
  await ins('call_logs', { id: `cl-${k}-g208`, contact_id: s.id, lead_id: lead, direction: 'inbound', from_number: s.phone, to_number: '+918047182290', status: 'completed', notes: s.name, created_by: ADMIN_ID });
  await ins('call_transcripts', { id: `ct-${k}-g208`, call_log_id: `cl-${k}-g208`, full_transcript: `Caller ${s.name} said hello` });
  await ins('chatbot_conversations', { id: `cb-${k}-g208`, channel: 'website', visitor_id: `v-${k}`, visitor_name: s.name, visitor_email: s.email, visitor_phone: s.phone, contact_id: s.id, lead_id: lead });
  await ins('tasks', { id: `tk-${k}-g208`, title: `Call ${s.name}`, description: s.phone, related_lead_id: lead, created_by: ADMIN_ID });
  await ins('documents', { id: `dc-${k}-g208`, name: `${s.name} passport`, file_url: docKey, related_to: 'contact', related_id: s.id, uploaded_by: ADMIN_ID });
  await ins('notifications', { id: `nt-${k}-g208`, user_id: ADMIN_ID, title: 'Lead', message: `${s.name} replied`, type: 'info', reference_type: 'contact', reference_id: s.id });
  await ins('activity_logs', { id: `al-${k}-g208`, user_id: ADMIN_ID, action: 'create', entity_type: 'contact', entity_id: s.id, details: JSON.stringify({ name: s.name }), ip_address: '10.0.0.1' });
  await ins('activity_logs', { id: `al2-${k}-g208`, user_id: ADMIN_ID, action: 'update', entity_type: 'invoice', entity_id: inv, details: `edited for ${s.email}` });
  await ins('campaign_recipients', { id: `cr-${k}-g208`, campaign_id: 'none', contact_id: s.id, phone: s.phone, email: s.email, status: 'sent' }).catch(() => undefined);
  await ins('contact_consents', { id: `cc-${k}-g208`, contact_id: s.id, channel: 'email', purpose: 'marketing', status: 'granted', source: 'form', evidence: JSON.stringify({ email: s.email, ip: '1.2.3.4' }), captured_by: ADMIN_ID });
  await DB.prepare('INSERT INTO import_errors (id, import_job_id, row_number, row_data, errors) VALUES (?, ?, 1, ?, ?)').bind(`ie-${k}-g208`, 'job', `${s.name},${s.email}`, '[]').run().catch(() => undefined);
  if (withTraveller) {
    await ins('travellers', { id: TRAV_A, tenant_id: TENANT_ID, contact_id: s.id, first_name: 'Zainab', last_name: 'Quillfeather', full_name_passport: s.name, email: s.email, phone: s.phone, passport_number: 'Z9988776' });
    await ins('traveller_documents', { id: `td-${k}-g208`, tenant_id: TENANT_ID, traveller_id: TRAV_A, document_type: 'passport', file_name: 'p.pdf', file_url: docKey });
  }
}

describe('R208 consent, export, erasure, unsubscribe', () => {
  let admin = '';
  let sales = '';

  beforeAll(async () => {
    await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    admin = await login('admin@e2e.test');
    sales = await login('sales@e2e.test');
    await testEnv.FILE_STORAGE.put(DOC_KEY, 'passport-bytes-of-zainab', { httpMetadata: { contentType: 'application/pdf' } });
    await testEnv.FILE_STORAGE.put(DOC_KEY_B, 'bartholomew-bytes', { httpMetadata: { contentType: 'application/pdf' } });
    await seedSubject(A, LEAD_A, INV_A, true, DOC_KEY);
    await seedSubject(B, LEAD_B, INV_B, false, DOC_KEY_B);
  });

  afterEach(() => vi.restoreAllMocks());

  // ------------------------------------------------------------------ consent
  it('a contact created with consent gets one append-only record per channel; later changes add rows and never edit', async () => {
    const created = await call('POST', '/contacts', admin, { name: 'Consent Carol', email: 'carol-g208@example.test', type: 'customer', consent: { marketing: ['email', 'whatsapp'], source: 'form', evidence: { page: '/signup' } } });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as any).data.id;

    const first = ((await (await call('GET', `/contacts/${id}/consents`, admin)).json()) as any).data;
    expect(first.history).toHaveLength(2);
    expect(first.history.every((h: any) => h.status === 'granted' && h.source === 'form' && h.capturedBy === ADMIN_ID && h.capturedAt)).toBe(true);
    const before = await all('SELECT id, status, captured_at FROM contact_consents WHERE contact_id = ? ORDER BY id', id);

    const withdraw = await call('POST', `/contacts/${id}/consents`, admin, { channel: 'email', purpose: 'marketing', status: 'withdrawn', source: 'manual' });
    expect(withdraw.status).toBe(201);
    const after = await all('SELECT id, status, captured_at FROM contact_consents WHERE contact_id = ? ORDER BY id', id);
    expect(after).toHaveLength(3);
    for (const row of before) expect(after.find((r) => r.id === row.id)).toEqual(row); // earlier rows untouched
    expect((await all('SELECT opted_out FROM contacts WHERE id = ?', id))[0].opted_out).toBe(1);
    expect(await marketingBlockedReason(DB, id, 'email')).not.toBeNull();
  });

  it('the opt-out and opt-in routes also write consent records', async () => {
    const id = ((await (await call('POST', '/contacts', admin, { name: 'Opt Olive', email: 'olive-g208@example.test', type: 'customer' })).json()) as any).data.id;
    expect((await call('POST', `/marketing/opt-out/${id}`, admin, { channel: 'email', reason: 'too many' })).status).toBe(200);
    expect((await call('POST', `/marketing/opt-out/${id}/opt-in`, admin)).status).toBe(200);
    const rows = await all('SELECT status, source FROM contact_consents WHERE contact_id = ? ORDER BY captured_at, id', id);
    expect(rows.map((r) => r.status)).toEqual(['withdrawn', 'granted']);
    expect(await marketingBlockedReason(DB, id, 'email')).toBeNull();
  });

  // ------------------------------------------------------------------ export
  it('every tenant table that links to a contact is in the privacy registry', async () => {
    const registered = new Set(PRIVACY_TABLES.map((t) => t.table));
    const tables = (await all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '%_fts%'")).map((r) => r.name as string);
    const linking = ['contact_id', 'created_contact_id', 'lead_id', 'related_lead_id', 'traveller_id', 'invoice_id', 'call_log_id', 'visa_application_id', 'trip_id', 'itinerary_id', 'day_id'];
    const missing: string[] = [];
    for (const t of tables) {
      const cols = (await all(`SELECT name FROM pragma_table_info('${t}')`)).map((r) => r.name as string);
      if (cols.some((c) => linking.includes(c)) && !registered.has(t) && !(t in PRIVACY_NOT_PERSONAL)) missing.push(t);
    }
    expect(missing).toEqual([]);
  });

  it('export (admin only) holds rows from every seeded table for that contact and nothing of another contact', async () => {
    expect((await call('POST', `/contacts/${A.id}/privacy-export`, sales)).status).toBe(403);
    const res = await call('POST', `/contacts/${A.id}/privacy-export`, admin);
    expect(res.status).toBe(200);
    const data = ((await res.json()) as any).data;
    expect(data.downloadPath).toContain('/api/v1/files/');
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const file = await call('GET', data.downloadPath.replace('/api/v1', ''), admin);
    expect(file.status).toBe(200);
    const text = await file.text();
    const bundle = JSON.parse(text);
    for (const key of ['contact', 'consents', 'leads', 'leadActivities', 'followUps', 'itineraries', 'itineraryDays', 'itineraryItems', 'invoices', 'invoiceItems', 'payments', 'travellers', 'travellerDocuments', 'messages', 'emailLog', 'unsubscribes', 'callLogs', 'callTranscripts', 'chatbotConversations', 'tasks', 'documents', 'notifications', 'activityLog']) {
      expect(bundle.tables[key]?.length, key).toBeGreaterThan(0);
    }
    expect(bundle.files.map((f: any) => f.key)).toContain(DOC_KEY);
    expect(bundle.tables.itineraryItems[0].cost_price).toBeUndefined(); // agency-internal pricing stays out
    expect(text).not.toContain(B.email);
    expect(text).not.toContain(B.name);
    expect(text).not.toContain(DOC_KEY_B);
  });

  it('the export download needs the signed link and an admin', async () => {
    const data = ((await (await call('POST', `/contacts/${A.id}/privacy-export`, admin)).json()) as any).data;
    const bare = `/files/${encodeURIComponent(data.key)}`;
    expect((await call('GET', bare, admin)).status).toBe(403);
    expect((await call('GET', data.downloadPath.replace('/api/v1', ''), sales)).status).toBe(403);
    expect((await call('GET', data.downloadPath.replace('/api/v1', '').replace(/sig=[0-9a-f]+/, 'sig=00'), admin)).status).toBe(403);
    expect((await call('GET', data.downloadPath.replace('/api/v1', '').replace(/exp=\d+/, 'exp=1'), admin)).status).toBe(403);
  });

  // ------------------------------------------------------------------ erasure
  it('erase needs admin and the confirmation phrase', async () => {
    expect((await call('POST', `/contacts/${A.id}/erase`, sales, { confirmation: 'ERASE CONTACT' })).status).toBe(403);
    expect((await call('POST', `/contacts/${A.id}/erase`, admin, { confirmation: 'yes' })).status).toBe(400);
    expect((await call('POST', `/contacts/${A.id}/erase`, admin, {})).status).toBe(400);
    expect((await call('POST', '/contacts/does-not-exist/erase', admin, { confirmation: 'ERASE CONTACT' })).status).toBe(404);
    expect((await all('SELECT erased_at FROM contacts WHERE id = ?', A.id))[0].erased_at).toBeNull();
  });

  it('erase leaves no personal data in any tenant table or file, keeps invoices anonymised, and spares others', async () => {
    const bBefore = {
      contact: await all('SELECT * FROM contacts WHERE id = ?', B.id),
      leads: await all('SELECT * FROM leads WHERE contact_id = ?', B.id),
      invoices: await all('SELECT * FROM invoices WHERE contact_id = ?', B.id),
      messages: await all('SELECT * FROM message_log WHERE contact_id = ?', B.id),
    };
    const invoiceBefore = (await all('SELECT total, invoice_number, issue_date, tax_type FROM invoices WHERE id = ?', INV_A))[0];
    const paymentBefore = (await all('SELECT amount, date FROM payments WHERE contact_id = ?', A.id))[0];
    const exportKey = (((await (await call('POST', `/contacts/${A.id}/privacy-export`, admin)).json()) as any).data.key) as string;
    expect(await testEnv.FILE_STORAGE.head(exportKey)).not.toBeNull();

    const res = await call('POST', `/contacts/${A.id}/erase`, admin, { confirmation: 'ERASE CONTACT' });
    expect(res.status).toBe(200);
    const result = ((await res.json()) as any).data;
    expect(result.alreadyErased).toBe(false);
    expect(result.anonymisedAs).toBe(`Erased contact ${A.id.slice(0, 8)}`);

    // 1. Scan every text column of every table for the subject's name, email, phone, traveller names and passport number.
    const needles = [A.name, A.email, A.phone, 'Zainab', 'Quillfeather', 'Z9988776', '27AAAAA0000A1Z5'];
    const tables = (await all("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'"))
      .filter((t) => !/^CREATE VIRTUAL/i.test(t.sql ?? '') && !t.name.includes('_fts'))
      .map((t) => t.name as string);
    const hits: string[] = [];
    for (const t of tables) {
      const cols = (await all(`SELECT name FROM pragma_table_info('${t}') WHERE type LIKE '%TEXT%' OR type LIKE '%CHAR%' OR type = ''`)).map((r) => r.name as string);
      if (cols.length === 0) continue;
      for (const needle of needles) {
        const where = cols.map((c) => `"${c}" LIKE ?`).join(' OR ');
        const rows = await all(`SELECT 1 AS x FROM "${t}" WHERE ${where} LIMIT 1`, ...cols.map(() => `%${needle}%`));
        if (rows.length) hits.push(`${t}:${needle}`);
      }
    }
    // The auditor's own tax id check is about invoices only; the contact's tax id is nulled above, buyer_tax_id on invoices stays by law.
    expect(hits.filter((h) => !h.startsWith('invoices:27AAAAA0000A1Z5') && !h.endsWith(':27AAAAA0000A1Z5'))).toEqual([]);

    // 2. Contact row anonymised, flagged, opted out.
    const contact = (await all('SELECT * FROM contacts WHERE id = ?', A.id))[0];
    expect(contact.name).toBe(`Erased contact ${A.id.slice(0, 8)}`);
    for (const col of ['email', 'phone', 'company', 'address', 'city', 'tax_id', 'notes']) expect(contact[col], col).toBeNull();
    expect(contact.erased_at).toBeTruthy();
    expect(contact.opted_out).toBe(1);

    // 3. Invoices and payments are kept, amounts untouched.
    expect((await all('SELECT total, invoice_number, issue_date, tax_type FROM invoices WHERE id = ?', INV_A))[0]).toEqual(invoiceBefore);
    expect((await all('SELECT amount, date FROM payments WHERE contact_id = ?', A.id))[0]).toEqual(paymentBefore);
    expect((await all('SELECT description FROM invoice_items WHERE invoice_id = ?', INV_A))[0].description).toContain('Erased contact');

    // 4. Rows and files are gone.
    for (const t of ['message_log', 'email_message_log', 'call_logs', 'call_transcripts', 'travellers', 'traveller_documents', 'chatbot_conversations', 'documents', 'lead_activities', 'follow_ups', 'unsubscribes']) {
      const keyCol = t === 'travellers' || t === 'message_log' || t === 'email_message_log' || t === 'call_logs' || t === 'chatbot_conversations' || t === 'unsubscribes' ? 'contact_id' : null;
      if (keyCol) expect(await all(`SELECT 1 FROM ${t} WHERE ${keyCol} = ?`, A.id), t).toHaveLength(0);
    }
    expect(await testEnv.FILE_STORAGE.head(DOC_KEY)).toBeNull();
    expect(await testEnv.FILE_STORAGE.head(exportKey)).toBeNull();
    expect(await testEnv.FILE_STORAGE.head(DOC_KEY_B)).not.toBeNull();
    expect((await all('SELECT share_token, share_link_active FROM itineraries WHERE lead_id = ?', LEAD_A))[0]).toEqual({ share_token: null, share_link_active: 0 });

    // 5. Consent rows stay without evidence; the audit log records the erasure without personal data.
    const consents = await all('SELECT status, evidence FROM contact_consents WHERE contact_id = ?', A.id);
    expect(consents.length).toBeGreaterThanOrEqual(2);
    expect(consents.every((c) => c.evidence === null)).toBe(true);
    expect(consents.some((c) => c.status === 'withdrawn')).toBe(true);
    const audit = await all("SELECT user_id, details FROM activity_logs WHERE action = 'erase' AND entity_id = ?", A.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].user_id).toBe(ADMIN_ID);
    expect(audit[0].details).not.toContain('Zainab');

    // 6. Another contact is untouched.
    expect(await all('SELECT * FROM contacts WHERE id = ?', B.id)).toEqual(bBefore.contact);
    expect(await all('SELECT * FROM leads WHERE contact_id = ?', B.id)).toEqual(bBefore.leads);
    expect(await all('SELECT * FROM invoices WHERE contact_id = ?', B.id)).toEqual(bBefore.invoices);
    expect(await all('SELECT * FROM message_log WHERE contact_id = ?', B.id)).toEqual(bBefore.messages);

    // 7. Idempotent; an erased contact is never marketed to, and cannot be exported.
    const again = await call('POST', `/contacts/${A.id}/erase`, admin, { confirmation: 'ERASE CONTACT' });
    expect(again.status).toBe(200);
    expect(((await again.json()) as any).data.alreadyErased).toBe(true);
    expect(await all("SELECT 1 FROM activity_logs WHERE action = 'erase' AND entity_id = ?", A.id)).toHaveLength(1);
    expect(await marketingBlockedReason(DB, A.id, 'email')).toBe('contact erased');
    expect((await call('POST', `/contacts/${A.id}/privacy-export`, admin)).status).toBe(410);
  });

  // ------------------------------------------------------------------ unsubscribe
  describe('public unsubscribe link', () => {
    let contactId = '';
    const page = async (token: string, method = 'GET', e: any = testEnv, ip = '198.51.100.1') => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(new Request(`http://localhost/api/v1/public/unsubscribe/${token}`, { method, headers: { 'cf-connecting-ip': ip } }), e, ctx);
      await waitOnExecutionContext(ctx);
      return res;
    };

    beforeAll(async () => {
      contactId = ((await (await call('POST', '/contacts', admin, { name: 'Unsub Uma', email: 'uma-g208@example.test', type: 'customer', consent: { marketing: ['email'] } })).json()) as any).data.id;
    });

    it('signs tokens that verify only unchanged, per agency, with no personal data inside', async () => {
      const token = await signUnsubscribeToken(testEnv, { tenantId: TENANT_ID, contactId, channel: 'email' });
      expect(await verifyUnsubscribeToken(testEnv, token)).toEqual({ tenantId: TENANT_ID, contactId, channel: 'email' });
      expect(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).not.toContain('uma-g208');
      // an agency-B claim cannot be forged from an agency-A token
      const [payload, sig] = token.split('.');
      const forged = btoa(atob(payload.replace(/-/g, '+').replace(/_/g, '/')).replace(TENANT_ID, 'other-tenant')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      expect(await verifyUnsubscribeToken(testEnv, `${forged}.${sig}`)).toBeNull();
      // another secret does not verify it
      expect(await verifyUnsubscribeToken({ UNSUB_SECRET: 'a-different-secret' }, token)).toBeNull();
      expect(await verifyUnsubscribeToken(testEnv, 'garbage')).toBeNull();
    });

    it('unsubscribes without login, records a withdrawn consent, and is idempotent', async () => {
      const token = await signUnsubscribeToken(testEnv, { tenantId: TENANT_ID, contactId, channel: 'email' });
      const res = await page(token);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const html = await res.text();
      expect(html).toContain('unsubscribed');
      expect(html).not.toContain('Uma');
      expect(html).not.toContain('uma-g208');

      const contact = (await all('SELECT opted_out, opt_out_channel FROM contacts WHERE id = ?', contactId))[0];
      expect(contact).toEqual({ opted_out: 1, opt_out_channel: 'email' });
      const rows = await all("SELECT status, source, channel FROM contact_consents WHERE contact_id = ? AND source = 'unsubscribe_link'", contactId);
      expect(rows).toEqual([{ status: 'withdrawn', source: 'unsubscribe_link', channel: 'email' }]);
      expect(await marketingBlockedReason(DB, contactId, 'email')).not.toBeNull();

      const second = await page(token, 'POST');
      expect(second.status).toBe(200);
      expect(await second.text()).toBe(html);
      expect(await all("SELECT 1 FROM contact_consents WHERE contact_id = ? AND source = 'unsubscribe_link'", contactId)).toHaveLength(1);
    });

    it('a tampered token is 400 and changes nothing', async () => {
      const other = ((await (await call('POST', '/contacts', admin, { name: 'Safe Sam', email: 'sam-g208@example.test', type: 'customer' })).json()) as any).data.id;
      const token = await signUnsubscribeToken(testEnv, { tenantId: TENANT_ID, contactId: other, channel: 'email' });
      const [payload, sig] = token.split('.');
      expect((await page(`${payload}.${sig.slice(0, -2)}AA`)).status).toBe(400);
      expect((await page(`${payload}x.${sig}`)).status).toBe(400);
      expect((await page('not-a-token')).status).toBe(400);
      expect((await all('SELECT opted_out FROM contacts WHERE id = ?', other))[0].opted_out).toBe(0);
    });

    it('a correctly signed token for an unknown contact or agency answers exactly like a real one, and changes nothing', async () => {
      const real = await page(await signUnsubscribeToken(testEnv, { tenantId: TENANT_ID, contactId, channel: 'email' }));
      const ghostContact = await page(await signUnsubscribeToken(testEnv, { tenantId: TENANT_ID, contactId: 'no-such-contact', channel: 'email' }));
      const ghostTenant = await page(await signUnsubscribeToken(testEnv, { tenantId: '0196b208-9999-7000-8000-000000000999', contactId, channel: 'email' }));
      expect(ghostContact.status).toBe(real.status);
      expect(ghostTenant.status).toBe(real.status);
      expect(await ghostContact.text()).toBe(await real.text());
      expect(await ghostTenant.text()).toBe(await (await page(await signUnsubscribeToken(testEnv, { tenantId: TENANT_ID, contactId, channel: 'email' }))).text());
      expect(await all('SELECT 1 FROM contacts WHERE id = ?', 'no-such-contact')).toHaveLength(0);
    });

    it('is limited to 20 requests a minute per IP', async () => {
      const strict = { ...testEnv, RATE_LIMIT_MULTIPLIER: '1' };
      const token = await signUnsubscribeToken(testEnv, { tenantId: TENANT_ID, contactId, channel: 'email' });
      const codes: number[] = [];
      for (let i = 0; i < 22; i++) codes.push((await page(token, 'GET', strict, '198.51.100.77')).status);
      expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
      expect(codes.slice(20)).toEqual([429, 429]);
      expect((await page(token, 'GET', strict, '198.51.100.78')).status).toBe(200); // another IP is unaffected
    });
  });

  // ------------------------------------------------------------------ sending
  describe('marketing sends', () => {
    it('every marketing email payload carries List-Unsubscribe, List-Unsubscribe-Post and a footer link', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 202, headers: { 'x-message-id': 'm1' } }));
      const url = 'https://api.example.test/api/v1/public/unsubscribe/abc.def';
      const r = await sendEmail(testEnv, { to: 'x@example.test', subject: 'Deal', html: '<p>Hi</p>', unsubscribeUrl: url });
      expect(r.success).toBe(true);
      const payload = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      expect(payload.headers['List-Unsubscribe']).toBe(`<${url}>`);
      expect(payload.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      expect(payload.content[0].value).toContain(url);

      fetchSpy.mockClear();
      await sendEmail(testEnv, { to: 'x@example.test', subject: 'Plain', html: '<p>System</p>' });
      expect(JSON.parse((fetchSpy.mock.calls[0][1] as any).body).headers).toBeUndefined(); // transactional mail has none
    });

    it('a campaign skips withdrawn and opted-out contacts at send time and sends the rest with the unsubscribe headers', async () => {
      const mk = async (name: string, email: string) => ((await (await call('POST', '/contacts', admin, { name, email, type: 'customer' })).json()) as any).data.id as string;
      const ok = await mk('Camp Ok', 'ok-g208@example.test');
      const withdrawn = await mk('Camp Withdrawn', 'wd-g208@example.test');
      const optedOut = await mk('Camp Out', 'out-g208@example.test');
      await call('POST', `/contacts/${withdrawn}/consents`, admin, { channel: 'email', purpose: 'marketing', status: 'withdrawn', source: 'manual' });
      await DB.prepare('UPDATE contacts SET opted_out = 1 WHERE id = ?').bind(optedOut).run();
      // a withdrawal recorded as consent only (opted_out still 0) must be caught by the consent check itself
      await DB.prepare("UPDATE contacts SET opted_out = 0 WHERE id = ?").bind(withdrawn).run();

      const campaignId = '0196b208-4444-7000-8000-000000000001';
      await DB.prepare("INSERT INTO marketing_campaigns (id, name, type, status, email_subject, message_body, created_by) VALUES (?, 'G208', 'email', 'sending', 'Hello', '<p>Offer</p>', ?)").bind(campaignId, ADMIN_ID).run();
      for (const [i, id, email] of [[1, ok, 'ok-g208@example.test'], [2, withdrawn, 'wd-g208@example.test'], [3, optedOut, 'out-g208@example.test']] as const) {
        await DB.prepare("INSERT INTO campaign_recipients (id, campaign_id, contact_id, email, status) VALUES (?, ?, ?, ?, 'pending')").bind(`0196b208-5555-7000-8000-00000000000${i}`, campaignId, id, email).run();
      }

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 202 }));
      const acked: string[] = [];
      const batch = { messages: [{ body: { type: 'email_campaign', data: { campaignId, tenantId: TENANT_ID, campaignType: 'email' } }, ack: () => acked.push('ack'), retry: () => acked.push('retry') }] } as any;
      await handleCampaignQueue(batch, { ...testEnv, CAMPAIGN_QUEUE: { send: async () => undefined } });
      expect(acked).toEqual(['ack']);

      const sgCalls = fetchSpy.mock.calls.filter(([u]) => String(u).includes('sendgrid'));
      expect(sgCalls).toHaveLength(1);
      const payload = JSON.parse((sgCalls[0][1] as any).body);
      expect(payload.personalizations[0].to[0].email).toBe('ok-g208@example.test');
      expect(payload.headers['List-Unsubscribe']).toMatch(/^<.*\/api\/v1\/public\/unsubscribe\/.+>$/);
      expect(payload.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      expect(payload.content[0].value).toContain('/public/unsubscribe/');

      const status = Object.fromEntries((await all('SELECT contact_id, status FROM campaign_recipients WHERE campaign_id = ?', campaignId)).map((r) => [r.contact_id, r.status]));
      expect(status[ok]).toBe('sent');
      expect(status[withdrawn]).toBe('opted_out');
      expect(status[optedOut]).toBe('opted_out');
    });
  });
});
