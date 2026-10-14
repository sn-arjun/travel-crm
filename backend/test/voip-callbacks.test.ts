import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const AGENCY_NUMBER = '+918047182290';

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

/** A provider webhook: form-encoded, no login. */
async function webhook(path: string, fields: Record<string, string>, e: any = testEnv): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1/voip${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}

async function logCall(id: string, sid: string, from: string, contactId: string | null = null): Promise<void> {
  await testEnv.MASTER_DB
    .prepare(
      `INSERT INTO call_logs (id, contact_id, direction, from_number, to_number, status, provider_call_id, routed_to, created_by)
       VALUES (?, ?, 'inbound', ?, ?, 'ringing', ?, ?, ?)`,
    )
    .bind(id, contactId, from, AGENCY_NUMBER, sid, ADMIN_ID, ADMIN_ID)
    .run();
}

describe('VoIP provider webhooks', () => {
  let admin = '';
  let contactId = '';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;

    // The agency's number tells a webhook which workspace a call belongs to.
    expect((await call('POST', '/integrations/channels', admin, { channel: 'voice', address: AGENCY_NUMBER, provider: 'twilio', label: 'Main line' })).status).toBe(201);
    const created = await call('POST', '/contacts', admin, { name: 'Missed Caller', phone: '9000004001', type: 'customer' });
    contactId = ((await created.json()) as any).data.id;
  });

  it('a missed inbound call is recorded and becomes a call-back task for the person it rang', async () => {
    await logCall('call-missed-1', 'CA-missed-1', '+919000004001', contactId);
    const res = await webhook('/status-callback', { CallSid: 'CA-missed-1', CallStatus: 'no-answer', To: AGENCY_NUMBER, From: '+919000004001' });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<Response');

    expect((await rows('SELECT status FROM call_logs WHERE id = ?', 'call-missed-1'))[0].status).toBe('no-answer');
    const tasks = await rows(`SELECT title, priority, assigned_to FROM tasks WHERE title = 'Call back Missed Caller'`);
    expect(tasks).toEqual([{ title: 'Call back Missed Caller', priority: 'high', assigned_to: ADMIN_ID }]);

    // The provider repeats its callback: still one task.
    await webhook('/status-callback', { CallSid: 'CA-missed-1', CallStatus: 'no-answer', To: AGENCY_NUMBER, From: '+919000004001' });
    expect(await rows(`SELECT id FROM tasks WHERE title = 'Call back Missed Caller'`)).toHaveLength(1);
  });

  it('the person it rang is told, on the notification columns that exist', async () => {
    const notes = await rows(`SELECT user_id, title, message, reference_type, reference_id FROM notifications WHERE type = 'missed_call' AND reference_id = 'call-missed-1'`);
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes.find((n) => n.user_id === ADMIN_ID)).toMatchObject({ title: 'Missed call', message: 'Missed call from Missed Caller', reference_type: 'call' });
  });

  it('an unknown caller is offered as a lead with one click, never created silently', async () => {
    await logCall('call-unknown-1', 'CA-unknown-1', '+919000004999');
    await webhook('/status-callback', { CallSid: 'CA-unknown-1', CallStatus: 'no-answer', To: AGENCY_NUMBER, From: '+919000004999' });

    expect(await rows(`SELECT id FROM contacts WHERE phone LIKE '%9000004999'`)).toHaveLength(0);
    expect(await rows(`SELECT id FROM tasks WHERE title = 'Call back +919000004999'`)).toHaveLength(1);

    const pending = await rows(`SELECT id, action_type, status, title FROM assistant_suggestions WHERE rule_key = 'calls.lead_from_missed_call'`);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ action_type: 'create_lead_from_enquiry', status: 'pending', title: 'Create contact and lead for missed caller +919000004999' });

    // They ring again the same day: still one suggestion.
    await logCall('call-unknown-2', 'CA-unknown-2', '+919000004999');
    await webhook('/status-callback', { CallSid: 'CA-unknown-2', CallStatus: 'busy', To: AGENCY_NUMBER, From: '+919000004999' });
    expect(await rows(`SELECT id FROM assistant_suggestions WHERE rule_key = 'calls.lead_from_missed_call'`)).toHaveLength(1);

    expect((await call('POST', `/assistant/suggestions/${pending[0].id}/apply`, admin, {})).status).toBe(200);
    const leads = await rows(`SELECT l.title, l.source, c.phone FROM leads l JOIN contacts c ON c.id = l.contact_id WHERE l.source = 'missed_call'`);
    expect(leads).toHaveLength(1);
    expect(leads[0].title).toBe('Missed call from +919000004999');
    expect(String(leads[0].phone)).toContain('9000004999');
  });

  it('with the call setting switched off, an unknown caller gets a call-back task only', async () => {
    await testEnv.MASTER_DB
      .prepare(`INSERT INTO voip_settings (id, voip_provider, auto_create_lead_missed_call) VALUES ('voip-test', 'twilio', 0)`)
      .run();
    await logCall('call-unknown-3', 'CA-unknown-3', '+919000004888');
    await webhook('/status-callback', { CallSid: 'CA-unknown-3', CallStatus: 'no-answer', To: AGENCY_NUMBER, From: '+919000004888' });
    expect(await rows(`SELECT id FROM tasks WHERE title = 'Call back +919000004888'`)).toHaveLength(1);
    expect(await rows(`SELECT id FROM assistant_suggestions WHERE rule_key = 'calls.lead_from_missed_call' AND title LIKE '%4888'`)).toHaveLength(0);
    await testEnv.MASTER_DB.prepare(`DELETE FROM voip_settings WHERE id = 'voip-test'`).run();
  });

  it('an answered call updates its duration and creates no task', async () => {
    await logCall('call-ok-1', 'CA-ok-1', '+919000004002');
    await webhook('/status-callback', { CallSid: 'CA-ok-1', CallStatus: 'completed', CallDuration: '95', To: AGENCY_NUMBER });
    expect((await rows('SELECT status, duration_seconds FROM call_logs WHERE id = ?', 'call-ok-1'))[0]).toEqual({ status: 'completed', duration_seconds: 95 });
    expect(await rows(`SELECT id FROM tasks WHERE title LIKE 'Call back +919000004002%'`)).toHaveLength(0);
  });

  it('a finished recording is attached to its call, found by the call id alone', async () => {
    await logCall('call-rec-1', 'CA-rec-1', '+919000004003');
    const res = await webhook('/recording-callback', { CallSid: 'CA-rec-1', RecordingUrl: 'https://api.twilio.com/recordings/RE123', RecordingDuration: '42' });
    expect(res.status).toBe(200);
    expect((await rows('SELECT recording_url, recording_duration FROM call_logs WHERE id = ?', 'call-rec-1'))[0]).toEqual({
      recording_url: 'https://api.twilio.com/recordings/RE123.mp3',
      recording_duration: 42,
    });
  });

  it('a voicemail is stored on the call it belongs to', async () => {
    await logCall('call-vm-1', 'CA-vm-1', '+919000004004');
    const res = await webhook('/voicemail-callback?callLogId=call-vm-1', { RecordingUrl: 'https://api.twilio.com/recordings/RE999', RecordingDuration: '18' });
    expect(await res.text()).toContain('Thank you for your message');
    expect((await rows('SELECT recording_url, outcome FROM call_logs WHERE id = ?', 'call-vm-1'))[0]).toEqual({
      recording_url: 'https://api.twilio.com/recordings/RE999.mp3',
      outcome: 'voicemail',
    });
  });

  it('a webhook about an unknown call is answered politely and changes nothing', async () => {
    const before = (await rows('SELECT COUNT(*) AS n FROM tasks'))[0].n;
    const res = await webhook('/status-callback', { CallSid: 'CA-nobody', CallStatus: 'no-answer', To: '+15550001111' });
    expect(res.status).toBe(200);
    expect((await rows('SELECT COUNT(*) AS n FROM tasks'))[0].n).toBe(before);
    expect((await webhook('/status-callback', {})).status).toBe(200);
  });

  it('in multi-tenant mode a callback for an unknown number and unknown call writes nothing to MASTER_DB and answers <Response/>', async () => {
    const multi = { ...testEnv, TENANCY_MODE: 'multi' };
    const calls = (await rows('SELECT COUNT(*) AS n FROM call_logs'))[0].n;
    const tasks = (await rows('SELECT COUNT(*) AS n FROM tasks'))[0].n;

    const unknown = await webhook('/status-callback', { CallSid: 'CA-multi-unknown', CallStatus: 'no-answer', To: '+15550002222', From: '+15550003333' }, multi);
    expect(unknown.status).toBe(200);
    expect(await unknown.text()).toBe('<Response/>');

    // A call that exists in the shared database is not touched either: in multi mode it is not any workspace's data.
    const known = await webhook('/status-callback', { CallSid: 'CA-missed-1', CallStatus: 'completed', To: AGENCY_NUMBER, From: '+919000004001' }, multi);
    expect(known.status).toBe(200);
    expect(await known.text()).toBe('<Response/>');

    expect((await rows('SELECT COUNT(*) AS n FROM call_logs'))[0].n).toBe(calls);
    expect((await rows('SELECT COUNT(*) AS n FROM tasks'))[0].n).toBe(tasks);
    expect((await rows('SELECT status FROM call_logs WHERE id = ?', 'call-missed-1'))[0].status).toBe('no-answer');
  });
});
