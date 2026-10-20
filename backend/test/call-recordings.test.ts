import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { twilioSignature } from '../src/middleware/provider-signature';
import { MockVoipProvider } from '../src/services/voip/mock-provider';
import { handleAIExtractionQueue } from '../src/queues/ai-extraction-queue';
import { requestCallAi, summariseCall } from '../src/services/voip/call-ai';
import { retryPendingRecordings, runRecordingRetention, signRecordingLink, recordingKey, DEFAULT_ANNOUNCEMENT } from '../src/services/voip/recordings';
import { getCreditBalance } from '../src/services/ai-credits';
import { CREDIT_WEIGHTS } from '../src/services/ai-pricing';
import { runTenantJobSet } from '../src/cron/dispatch';
import { simulateVoipScenario } from '../src/services/voip/simulator';
import { emitEvent } from '../src/services/automation/events';

// R306: recordings in our own storage with a consent announcement and retention; transcription and a call summary through
// the metered AI router. Everything runs on the mock provider, local R2 and a stand-in Workers AI binding: no real provider,
// no paid AI. The stand-in answers by model (Whisper -> text, Llama -> JSON) and counts its calls.

const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const SALES_ID = '33333333-3333-3333-3333-333333333333';
const AGENCY_NUMBER = '+918047186306';
const WHISPER = '@cf/openai/whisper-large-v3-turbo';

const SUMMARY = {
  destination: 'Goa',
  travel_dates: { from: '2099-12-20', to: '2099-12-25', flexible: false },
  pax_count: 4,
  pax_details: { adults: 2, children: 2, infants: 0 },
  budget: 150000,
  budget_currency: 'INR',
  preferences: ['beach'],
  trip_type: 'family',
  hotel_preference: 'mid-range',
  meal_preference: null,
  special_requests: 'Ground floor room',
  summary: ['Family of four wants Goa in December', 'Budget about 1.5 lakh'],
  key_topics: ['Goa', 'budget'],
  action_items: [{ text: 'Send the Goa quote', assignee: null, due_date: '2099-11-01', completed: false }],
  sentiment: 'positive',
  sentiment_score: 0.8,
  deal_likelihood: 0.7,
  likelihood_signals: ['asked for a quote'],
  coaching_hints: [],
  draft_reply: 'Hi, thank you for your call. We will send the Goa options shortly.',
  overall_confidence: 0.8,
  field_confidences: {},
};

/** A Workers AI stand-in that never spends anything. */
function fakeAi() {
  const calls: Array<{ model: string }> = [];
  return {
    calls,
    run: async (model: string) => {
      calls.push({ model });
      if (model === WHISPER) return { text: 'Hello, we would like to book Goa for four people in December.', transcription_info: { language: 'en' } };
      return { response: JSON.stringify(SUMMARY), usage: { prompt_tokens: 900, completion_tokens: 250 } };
    },
  };
}

function fakeQueue() {
  const sent: any[] = [];
  return { sent, send: async (m: unknown) => { sent.push(m); }, sendBatch: async () => undefined };
}

let ai = fakeAi();
let queue = fakeQueue();
const pushed: unknown[] = [];
const fakeRealtime = { idFromName: (n: string) => n, get: () => ({ fetch: async (_u: string, init?: RequestInit) => { pushed.push(init?.body); return new Response('{}'); } }) };

function envNow(over: Record<string, unknown> = {}): any {
  return { ...(env as any), VOIP_PROVIDER: 'mock', REALTIME: fakeRealtime, ANTHROPIC_API_KEY: '', AI: ai, AI_EXTRACTION_QUEUE: queue, ...over };
}
const baseEnv = env as any;

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = envNow()): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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

function base(): string {
  return baseEnv.API_PUBLIC_URL ? String(baseEnv.API_PUBLIC_URL).replace(/[/]+$/, '') : 'http://localhost';
}

async function webhook(path: string, fields: Record<string, string>, query = ''): Promise<Response> {
  const signature = await twilioSignature(`${base()}/api/v1/voip${path}${query}`, fields, baseEnv.TWILIO_AUTH_TOKEN);
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1/voip${path}${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature },
      body: new URLSearchParams(fields).toString(),
    }),
    envNow(),
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await baseEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}
const one = async <T = Record<string, any>>(sql: string, ...binds: unknown[]) => (await rows<T>(sql, ...binds))[0];

let admin = '';
let sales = '';
let viewer = '';
let seq = 0;
const uid = (tag: string) => `r306-${tag}-${++seq}`;

interface CallOpts { id?: string; direction?: 'inbound' | 'outbound'; duration?: number; status?: string; routedTo?: string | null; createdBy?: string | null; answeredBy?: string | null; leadId?: string | null; contactId?: string | null; outcome?: string | null }
async function insertCall(o: CallOpts = {}): Promise<{ id: string; sid: string }> {
  const id = o.id ?? uid('call');
  const sid = `CA${id.replace(/[^a-z0-9]/gi, '').padEnd(32, '0').slice(0, 32)}`;
  await baseEnv.MASTER_DB
    .prepare(
      `INSERT INTO call_logs (id, contact_id, lead_id, direction, from_number, to_number, status, duration_seconds, provider_call_id, twilio_call_sid, routed_to, answered_by, created_by, outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, o.contactId ?? null, o.leadId ?? null, o.direction ?? 'inbound',
      o.direction === 'outbound' ? AGENCY_NUMBER : '+919000030601', o.direction === 'outbound' ? '+919000030601' : AGENCY_NUMBER,
      o.status ?? 'completed', o.duration ?? 125, sid, sid,
      o.routedTo === undefined ? ADMIN_ID : o.routedTo, o.answeredBy === undefined ? (o.status === undefined || o.status === 'completed' ? ADMIN_ID : null) : o.answeredBy, o.createdBy ?? null, o.outcome ?? null,
    )
    .run();
  return { id, sid };
}

/** The provider says the recording is ready (a signed recording callback). */
async function recordingReady(sid: string, recordingSid: string, seconds: number): Promise<Response> {
  return webhook('/recording-callback', {
    CallSid: sid,
    RecordingSid: recordingSid,
    RecordingUrl: `https://api.twilio.com/2010-04-01/Accounts/ACmock/Recordings/${recordingSid}`,
    RecordingDuration: String(seconds),
    RecordingChannels: '2',
  });
}

const FUTURE = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
const AUDIO = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 33, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
function addMockRecording(recordingSid: string, seconds = 125) {
  MockVoipProvider.addRecording(recordingSid, AUDIO, seconds);
}

async function setSettings(sets: string, ...binds: unknown[]) {
  await baseEnv.MASTER_DB.prepare(`UPDATE voip_settings SET ${sets} WHERE id = 'voip-r306'`).bind(...binds).run();
}

/** Leave the agency exactly `remaining` AI credits this month (the plan allowance is read first: it is the cap). */
let creditBaseline = 0;
async function leaveCredits(remaining: number | 'all') {
  await baseEnv.MASTER_DB.prepare('DELETE FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = ?').bind(TENANT_ID, 'ai_credits_per_month').run();
  const { limit } = await getCreditBalance(baseEnv.MASTER_DB, TENANT_ID);
  await baseEnv.MASTER_DB
    .prepare('UPDATE tenant_usage_caps SET current_usage = ? WHERE tenant_id = ? AND cap_key = ?')
    .bind(remaining === 'all' ? limit : limit - remaining, TENANT_ID, 'ai_credits_per_month')
    .run();
  creditBaseline = limit - (remaining === 'all' ? 0 : remaining);
}
/** Credits charged since leaveCredits. */
async function spent(): Promise<number> {
  return (await getCreditBalance(baseEnv.MASTER_DB, TENANT_ID)).used - creditBaseline;
}
async function planAi(enabled: boolean) {
  await baseEnv.MASTER_DB
    .prepare(`INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES (?, ?, 'ai_copilot', ?) ON CONFLICT(tenant_id, feature_key) DO UPDATE SET is_enabled = excluded.is_enabled`)
    .bind(uid('flag'), TENANT_ID, enabled ? 1 : 0)
    .run();
  await baseEnv.CACHE.delete(`tenant_features:${TENANT_ID}`).catch(() => undefined);
}

/** Run every queued message through the real queue consumer until the queue is empty. */
async function drain(e: any = envNow()): Promise<string[]> {
  const handled: string[] = [];
  for (let i = 0; i < 10 && queue.sent.length > 0; i++) {
    const messages = queue.sent.splice(0);
    await handleAIExtractionQueue(
      { queue: 'travelcrm-ai-extraction-queue', messages: messages.map((body) => ({ body, ack: () => handled.push(`ack:${body.type}`), retry: () => handled.push(`retry:${body.type}`) })) } as any,
      e,
    );
  }
  return handled;
}

beforeAll(async () => {
  await applyD1Migrations(baseEnv.MASTER_DB, baseEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  await baseEnv.MASTER_DB.prepare("INSERT INTO settings (key, value) VALUES ('country', 'GB') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  const login = async (email: string) => ((await (await call('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID })).json()) as any).data.accessToken as string;
  admin = await login('admin@e2e.test');
  sales = await login('sales@e2e.test');
  viewer = await login('viewer@e2e.test');
  await call('POST', '/test/voip/own-number', null, { tenantId: TENANT_ID, phoneNumber: AGENCY_NUMBER });
  await baseEnv.MASTER_DB.prepare("INSERT OR IGNORE INTO voip_allowed_countries (tenant_id, country) VALUES (?, 'IN')").bind(TENANT_ID).run(); // the customers here are Indian numbers (R305 destination allow-list)
  expect((await call('POST', '/integrations/channels', admin, { channel: 'voice', address: AGENCY_NUMBER, provider: 'twilio', label: 'R306 line' })).status).toBe(201);
  await baseEnv.MASTER_DB
    .prepare(`INSERT INTO voip_settings (id, voip_provider, routing_strategy, default_caller_id, voicemail_enabled) VALUES ('voip-r306', 'twilio', 'assigned', ?, 1)`)
    .bind(AGENCY_NUMBER)
    .run();
  await baseEnv.MASTER_DB
    .prepare(`INSERT OR IGNORE INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source) VALUES ('0196a306-0000-7000-8000-0000000000c1', ?, 'call_minutes_100', 1, 100, ?, 'super_admin_grant')`)
    .bind(TENANT_ID, new Date().toISOString().slice(0, 7))
    .run();
});

let deletedMark = 0;
const deletedNow = () => MockVoipProvider.deletedRecordings.slice(deletedMark);

beforeEach(async () => {
  deletedMark = MockVoipProvider.deletedRecordings.length;
  ai = fakeAi();
  queue = fakeQueue();
  pushed.length = 0;
  await setSettings(`recording_consent_mode = 'announce', recording_announcement = NULL, recording_retention_days = 90, recording_policy = 'all', call_ai_enabled = 0, call_ai_engine = 'standard'`);
  await baseEnv.MASTER_DB.prepare(`UPDATE settings SET value = '0' WHERE key = 'automations_paused'`).run();
});

describe('storing the recording (calls.store_recording)', () => {
  it('copies the provider recording into R2 once, records size and expiry, then deletes it at the provider', async () => {
    const { id, sid } = await insertCall();
    addMockRecording('RE0000r306store1');
    const res = await recordingReady(sid, 'RE0000r306store1', 125);
    expect(res.status).toBe(200);

    const row = await one(`SELECT recording_r2_key, recording_bytes, recording_expires_at, recording_state, recording_provider_deleted_at, recording_provider_id FROM call_logs WHERE id = ?`, id);
    expect(row.recording_r2_key).toBe(`${TENANT_ID}/recordings/${id}.mp3`);
    expect(row.recording_r2_key).toBe(recordingKey(TENANT_ID, id));
    expect(row.recording_bytes).toBe(AUDIO.byteLength);
    expect(row.recording_state).toBe('stored');
    expect(row.recording_provider_id).toBe('RE0000r306store1');
    // 90 days by default
    const days = (Date.parse(row.recording_expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThan(90.1);

    const object = await baseEnv.FILE_STORAGE.get(row.recording_r2_key);
    expect(object).toBeTruthy();
    expect(new Uint8Array(await object.arrayBuffer())).toEqual(AUDIO);
    expect(object.customMetadata).toMatchObject({ kind: 'call-recording', callId: id });

    // The provider's copy is gone, and only the one deletion was asked for.
    expect(deletedNow()).toEqual(['RE0000r306store1']);
    expect(MockVoipProvider.hasRecording('RE0000r306store1')).toBe(false);
    expect(row.recording_provider_deleted_at).toBeTruthy();
  });

  it('the timeline entries written when the call ended get their Play button once the recording is stored', async () => {
    const contact = ((await (await call('POST', '/contacts', admin, { name: 'R306 Timeline', phone: '9000030630', type: 'customer' })).json()) as any).data.id;
    const lead = ((await (await call('POST', '/leads', admin, { contactId: contact, title: 'R306 timeline trip', destinations: ['Goa'], travelDate: FUTURE, tripType: 'family', source: 'website', assignedTo: ADMIN_ID })).json()) as any).data.id;
    const { id, sid } = await insertCall({ contactId: contact, leadId: lead });
    // What log_call_activity writes when the call ends: the recording is not there yet.
    await baseEnv.MASTER_DB
      .prepare(`INSERT INTO lead_activities (id, lead_id, type, content, metadata, created_by) VALUES (?, ?, 'call', 'Inbound call', ?, ?)`)
      .bind(uid('act'), lead, JSON.stringify({ call_id: id, direction: 'inbound', result: 'completed', duration_seconds: 125, has_recording: false }), ADMIN_ID)
      .run();
    addMockRecording('RE0000r306tline1');
    await recordingReady(sid, 'RE0000r306tline1', 125);
    const entry = await one(`SELECT metadata FROM lead_activities WHERE lead_id = ? AND type = 'call'`, lead);
    expect(JSON.parse(entry.metadata)).toMatchObject({ call_id: id, has_recording: true, duration_seconds: 125 });
  });

  it('a call that ends after its recording is already stored gets its timeline entry with the Play button too', async () => {
    const contact = ((await (await call('POST', '/contacts', admin, { name: 'R306 Late End', phone: '9000030631', type: 'customer' })).json()) as any).data.id;
    const lead = ((await (await call('POST', '/leads', admin, { contactId: contact, title: 'R306 late end trip', destinations: ['Goa'], travelDate: FUTURE, tripType: 'family', source: 'website', assignedTo: ADMIN_ID })).json()) as any).data.id;
    const { id, sid } = await insertCall({ contactId: contact, leadId: lead });
    addMockRecording('RE0000r306lateend');
    await recordingReady(sid, 'RE0000r306lateend', 125);
    await emitEvent(envNow(), TENANT_ID, baseEnv.MASTER_DB, {
      type: 'call.ended',
      entityType: 'call',
      entityId: id,
      payload: { callId: id, direction: 'inbound', result: 'completed', durationSeconds: 125, number: '+919000030631', contactId: contact, leadId: lead, agentId: ADMIN_ID },
    });
    const entry = await one(`SELECT metadata FROM lead_activities WHERE lead_id = ? AND type = 'call'`, lead);
    expect(JSON.parse(entry.metadata)).toMatchObject({ call_id: id, has_recording: true });
  });

  it('a repeated callback, or the same recording again, does not copy or delete twice', async () => {
    const { id, sid } = await insertCall();
    addMockRecording('RE0000r306once1');
    await recordingReady(sid, 'RE0000r306once1', 125);
    await recordingReady(sid, 'RE0000r306once1', 125); // provider retry: claimed already
    // A second recording sid for the same call never replaces the stored one.
    addMockRecording('RE0000r306once2');
    await recordingReady(sid, 'RE0000r306once2', 125);
    expect(MockVoipProvider.deletedRecordings.filter((r) => r === 'RE0000r306once1')).toHaveLength(1);
    expect((await one('SELECT recording_provider_id AS p FROM call_logs WHERE id = ?', id)).p).toBe('RE0000r306once1');
    const listed = await baseEnv.FILE_STORAGE.list({ prefix: `${TENANT_ID}/recordings/${id}` });
    expect(listed.objects).toHaveLength(1);
  });

  it('is record-keeping, not an automation: the automations pause switch does not stop it', async () => {
    await baseEnv.MASTER_DB.prepare(`INSERT INTO settings (key, value) VALUES ('automations_paused', '1') ON CONFLICT(key) DO UPDATE SET value = '1'`).run();
    const { id, sid } = await insertCall();
    addMockRecording('RE0000r306pause1');
    await recordingReady(sid, 'RE0000r306pause1', 125);
    expect((await one('SELECT recording_state AS s FROM call_logs WHERE id = ?', id)).s).toBe('stored');
  });

  it('a failed copy keeps the provider copy and the claim is given back, so the retry job stores it', async () => {
    const { id, sid } = await insertCall();
    // The provider has no such recording yet.
    await recordingReady(sid, 'RE0000r306late01', 125);
    let row = await one('SELECT recording_state, recording_r2_key, recording_url FROM call_logs WHERE id = ?', id);
    expect(row.recording_state).toBe('failed');
    expect(row.recording_r2_key).toBeNull();
    expect(row.recording_url).toContain('RE0000r306late01');
    expect(deletedNow()).toEqual([]);

    addMockRecording('RE0000r306late01');
    const retried = await retryPendingRecordings(envNow(), TENANT_ID, baseEnv.MASTER_DB);
    expect(retried.stored).toBeGreaterThanOrEqual(1);
    row = await one('SELECT recording_state, recording_r2_key FROM call_logs WHERE id = ?', id);
    expect(row.recording_state).toBe('stored');
    expect(row.recording_r2_key).toBe(recordingKey(TENANT_ID, id));
    expect(deletedNow()).toEqual(['RE0000r306late01']);
  });

  it('the call simulator can deliver the recording callback, so a local stack stores and plays a recording end to end', async () => {
    const result = await simulateVoipScenario({
      scenario: 'inbound_answered',
      to: AGENCY_NUMBER,
      from: '+919000030640',
      durationSeconds: 45,
      withRecording: true,
      baseUrl: base(),
      authToken: baseEnv.TWILIO_AUTH_TOKEN,
      send: async (request) => {
        const ctx = createExecutionContext();
        const res = await worker.fetch(request, envNow(), ctx);
        await waitOnExecutionContext(ctx);
        return res;
      },
    });
    expect(result.steps.map((s) => s.path)).toEqual(['/twiml/inbound', '/status-callback', '/status-callback', '/status-callback', '/recording-callback']);
    expect(result.steps.every((s) => s.status === 200)).toBe(true);
    const row = await one('SELECT id, recording_state, recording_r2_key, recording_bytes FROM call_logs WHERE provider_call_id = ?', result.callSid);
    expect(row.recording_state).toBe('stored');
    expect(row.recording_r2_key).toBe(recordingKey(TENANT_ID, row.id));
    expect(row.recording_bytes).toBeGreaterThan(1000);
    expect(deletedNow()).toContain(`RE${result.callSid.slice(2)}`);
  });

  it('is retried by the five-minute cron job, which is not paused by the automations switch', async () => {
    const { id, sid } = await insertCall();
    await recordingReady(sid, 'RE0000r306cron01', 125);
    addMockRecording('RE0000r306cron01');
    const out = await runTenantJobSet(envNow(), TENANT_ID, baseEnv.MASTER_DB, 'every5', new Date().toISOString());
    expect(out.failed).toEqual([]);
    expect(out.ran).toContain('calls.recordings-retry');
    expect((await one('SELECT recording_state AS s FROM call_logs WHERE id = ?', id)).s).toBe('stored');
  });
});

describe('playback through a short-lived signed link', () => {
  let callId = '';
  let key = '';

  beforeAll(async () => {
    const made = await insertCall({ id: uid('play'), routedTo: ADMIN_ID });
    callId = made.id;
    addMockRecording('RE0000r306play01');
    await recordingReady(made.sid, 'RE0000r306play01', 125);
    key = recordingKey(TENANT_ID, callId);
  });

  it('an admin gets a link that plays before it expires, and the play is written to the activity log', async () => {
    const res = await call('GET', `/calls/${callId}/recording`, admin);
    expect(res.status).toBe(200);
    const data = ((await res.json()) as any).data;
    expect(data.url).toContain(`/api/v1/files/${encodeURIComponent(key)}?exp=`);
    expect(new Date(data.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000 + 2000);
    expect(data.bytes).toBe(AUDIO.byteLength);

    const play = await call('GET', data.url.replace('/api/v1', ''), admin);
    expect(play.status).toBe(200);
    expect(play.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(play.headers.get('Cache-Control')).toBe('no-store');
    expect(new Uint8Array(await play.arrayBuffer())).toEqual(AUDIO);

    const log = await rows(`SELECT user_id, entity_id FROM activity_logs WHERE action = 'play_recording' AND entity_id = ?`, callId);
    expect(log).toEqual([{ user_id: ADMIN_ID, entity_id: callId }]);
  });

  it('a range request returns just that part (so the player can seek)', async () => {
    const data = ((await (await call('GET', `/calls/${callId}/recording`, admin)).json()) as any).data;
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request(`http://localhost${data.url}`, { headers: { Authorization: `Bearer ${admin}`, Range: 'bytes=2-5' } }),
      envNow(),
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(206);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(AUDIO.slice(2, 6));
    expect(res.headers.get('Content-Range')).toBe(`bytes 2-5/${AUDIO.byteLength}`);
  });

  it('fails after the link expires, with a tampered signature, without a link, and for another person', async () => {
    const fresh = ((await (await call('GET', `/calls/${callId}/recording`, admin)).json()) as any).data;
    const tampered = fresh.url.replace(/sig=([0-9a-f]{4})/, (_m: string, a: string) => `sig=${a === '0000' ? '1111' : '0000'}`);
    expect((await call('GET', tampered.replace('/api/v1', ''), admin)).status).toBe(403);

    // issued 10 minutes ago: past its 5 minutes
    const old = await signRecordingLink(baseEnv, key, ADMIN_ID, Date.now() - 10 * 60_000);
    expect((await call('GET', old.path.replace('/api/v1', ''), admin)).status).toBe(403);

    // no signature at all: the key typed by hand
    expect((await call('GET', `/files/${encodeURIComponent(key)}`, admin)).status).toBe(403);

    // a link is bound to the person it was issued to
    expect((await call('GET', fresh.url.replace('/api/v1', ''), sales)).status).toBe(403);
  });

  it('a recording cannot be deleted through the files route', async () => {
    expect((await call('DELETE', `/files/${encodeURIComponent(key)}`, admin)).status).toBe(403);
    expect(await baseEnv.FILE_STORAGE.head(key)).toBeTruthy();
  });

  it('a salesperson cannot play another agent\'s call, but can play one they took', async () => {
    expect((await call('GET', `/calls/${callId}/recording`, sales)).status).toBe(403);

    const mine = await insertCall({ id: uid('mine'), routedTo: SALES_ID, answeredBy: SALES_ID });
    addMockRecording('RE0000r306mine01');
    await recordingReady(mine.sid, 'RE0000r306mine01', 125);
    const ok = await call('GET', `/calls/${mine.id}/recording`, sales);
    expect(ok.status).toBe(200);
    const link = ((await ok.json()) as any).data.url as string;
    expect((await call('GET', link.replace('/api/v1', ''), sales)).status).toBe(200);
  });

  it('a call on a lead assigned to the salesperson can be played by them', async () => {
    const contact = ((await (await call('POST', '/contacts', admin, { name: 'R306 Lead Owner', phone: '9000030699', type: 'customer' })).json()) as any).data.id;
    const lead = ((await (await call('POST', '/leads', admin, { contactId: contact, title: 'R306 trip', destinations: ['Goa'], travelDate: FUTURE, tripType: 'family', source: 'website', assignedTo: SALES_ID })).json()) as any).data.id;
    const made = await insertCall({ id: uid('lead'), routedTo: ADMIN_ID, leadId: lead, contactId: contact });
    addMockRecording('RE0000r306lead01');
    await recordingReady(made.sid, 'RE0000r306lead01', 125);
    expect((await call('GET', `/calls/${made.id}/recording`, sales)).status).toBe(200);
  });

  it('the roles that may never hear recordings are refused', async () => {
    expect((await call('GET', `/calls/${callId}/recording`, viewer)).status).toBe(403);
    // and a viewer cannot use a link an admin was given
    const adminLink = ((await (await call('GET', `/calls/${callId}/recording`, admin)).json()) as any).data.url as string;
    expect((await call('GET', adminLink.replace('/api/v1', ''), viewer)).status).toBe(403);
  });

  it('answers clearly while the copy is pending, and when nothing was recorded', async () => {
    const pending = await insertCall({ id: uid('pend') });
    await recordingReady(pending.sid, 'RE0000r306pend01', 125); // not at the provider yet: copy fails
    const res = await call('GET', `/calls/${pending.id}/recording`, admin);
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toMatch(/still being saved/i);

    const none = await insertCall({ id: uid('none') });
    expect((await call('GET', `/calls/${none.id}/recording`, admin)).status).toBe(404);
  });
});

describe('retention', () => {
  it('deletes audio and transcripts after the retention period and keeps the call record and the summary', async () => {
    await setSettings('recording_retention_days = 30');
    const { id, sid } = await insertCall({ id: uid('ret') });
    addMockRecording('RE0000r306ret001');
    await recordingReady(sid, 'RE0000r306ret001', 125);
    const stored = await one('SELECT recording_r2_key AS k, recording_expires_at AS e FROM call_logs WHERE id = ?', id);
    const days = (Date.parse(stored.e) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);

    await baseEnv.MASTER_DB.prepare(`INSERT INTO call_transcripts (id, call_log_id, full_transcript) VALUES (?, ?, 'a transcript')`).bind(uid('tr'), id).run();
    await baseEnv.MASTER_DB.prepare(`INSERT INTO ai_call_extractions (id, call_log_id, summary, status) VALUES (?, ?, '["kept summary"]', 'pending')`).bind(uid('ex'), id).run();

    // Nothing is due yet
    let out = await runRecordingRetention(envNow(), TENANT_ID, baseEnv.MASTER_DB, new Date());
    expect(out.recordingsDeleted).toBe(0);
    expect(await baseEnv.FILE_STORAGE.head(stored.k)).toBeTruthy();

    // 31 days later the recording has expired and the 30-day-old call's transcript goes with it
    await baseEnv.MASTER_DB.prepare(`UPDATE call_logs SET created_at = ? WHERE id = ?`).bind(new Date(Date.now() - 31 * 86_400_000).toISOString(), id).run();
    out = await runRecordingRetention(envNow(), TENANT_ID, baseEnv.MASTER_DB, new Date(Date.now() + 31 * 86_400_000));
    expect(out.recordingsDeleted).toBeGreaterThanOrEqual(1);
    expect(await baseEnv.FILE_STORAGE.head(stored.k)).toBeNull();

    const row = await one('SELECT recording_r2_key, recording_state, recording_url, status FROM call_logs WHERE id = ?', id);
    expect(row).toMatchObject({ recording_r2_key: null, recording_state: 'expired', recording_url: null, status: 'completed' });
    expect(await rows('SELECT id FROM call_transcripts WHERE call_log_id = ?', id)).toHaveLength(0);
    expect(await rows('SELECT summary FROM ai_call_extractions WHERE call_log_id = ?', id)).toEqual([{ summary: '["kept summary"]' }]);

    const res = await call('GET', `/calls/${id}/recording`, admin);
    expect(res.status).toBe(410);
  });

  it('runs daily through the cron job set at the agency send hour', async () => {
    const out = await runTenantJobSet(envNow(), TENANT_ID, baseEnv.MASTER_DB, 'daily', new Date().toISOString());
    expect(out.failed).toEqual([]);
    expect(out.ran).toContain('calls.recording-retention');
  });

  it('a recording that never reached our storage is removed from the provider after the retention period', async () => {
    const { id, sid } = await insertCall({ id: uid('stuck') });
    await recordingReady(sid, 'RE0000r306stuck1', 125); // never available: stays at the provider
    await baseEnv.MASTER_DB.prepare('UPDATE call_logs SET created_at = ? WHERE id = ?').bind(new Date(Date.now() - 100 * 86_400_000).toISOString(), id).run();
    const out = await runRecordingRetention(envNow(), TENANT_ID, baseEnv.MASTER_DB, new Date());
    expect(out.providerCopiesDeleted).toBeGreaterThanOrEqual(1);
    expect(deletedNow()).toContain('RE0000r306stuck1');
    expect((await one('SELECT recording_url AS u, recording_state AS s FROM call_logs WHERE id = ?', id))).toEqual({ u: null, s: 'expired' });
  });
});

describe('consent announcement', () => {
  async function inbound(sid: string): Promise<string> {
    const caller = '+919000030602';
    const res = await webhook('/twiml/inbound', { CallSid: sid, From: caller, To: AGENCY_NUMBER });
    expect(res.status).toBe(200);
    return res.text();
  }

  it('announce (the default): the caller hears the announcement before the agent is rung, and recording is on', async () => {
    const xml = await inbound(uid('ann1').replace(/[^A-Za-z0-9]/g, '').padEnd(34, '0'));
    expect(xml).toContain(`<Say>${DEFAULT_ANNOUNCEMENT}</Say>`);
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(xml.indexOf('<Say>')).toBeLessThan(xml.indexOf('<Dial'));
  });

  it('uses the agency\'s own wording, and notes on the call that it was announced', async () => {
    await setSettings(`recording_announcement = 'Calls to Sahyadri Holidays are recorded to help us serve you.'`);
    const sid = uid('ann2').replace(/[^A-Za-z0-9]/g, '').padEnd(34, '0');
    const xml = await inbound(sid);
    expect(xml).toContain('<Say>Calls to Sahyadri Holidays are recorded to help us serve you.</Say>');
    expect((await one('SELECT recording_consent AS c FROM call_logs WHERE provider_call_id = ?', sid)).c).toBe('announced');
  });

  it('recording off: no announcement and no recording; on request: no automatic recording', async () => {
    await setSettings(`recording_consent_mode = 'off'`);
    let xml = await inbound(uid('off1').replace(/[^A-Za-z0-9]/g, '').padEnd(34, '0'));
    expect(xml).not.toContain('<Say>');
    expect(xml).not.toContain('record=');

    await setSettings(`recording_consent_mode = 'on_request'`);
    xml = await inbound(uid('req1').replace(/[^A-Za-z0-9]/g, '').padEnd(34, '0'));
    expect(xml).not.toContain('record=');
  });

  it('the recording policy still limits which directions record', async () => {
    await setSettings(`recording_policy = 'outbound'`);
    const xml = await inbound(uid('pol1').replace(/[^A-Za-z0-9]/g, '').padEnd(34, '0'));
    expect(xml).not.toContain('record=');
    expect(xml).not.toContain('<Say>');
  });

  it('outbound: the customer hears the announcement on answer and the call records; off means neither', async () => {
    await setSettings(`default_caller_id = '${AGENCY_NUMBER}'`);
    const placed = await call('POST', '/calls/outbound', admin, { toNumber: '+919000030603' });
    expect(placed.status).toBe(201);
    const callLogId = ((await placed.json()) as any).data.callLogId as string;
    const mock = MockVoipProvider.calls[MockVoipProvider.calls.length - 1];
    expect(mock.record).toBe(true);
    expect(mock.announcementUrl).toContain(`/api/v1/voip/twiml/announce?callLogId=${callLogId}`);

    // The announcement endpoint is the signed callback the provider fetches when the customer answers.
    const announce = await webhook('/twiml/announce', { CallSid: mock.providerCallId, To: '+919000030603', From: AGENCY_NUMBER }, `?callLogId=${callLogId}`);
    expect(announce.status).toBe(200);
    expect(await announce.text()).toContain(`<Say>${DEFAULT_ANNOUNCEMENT}</Say>`);
    expect((await one('SELECT recording_consent AS c FROM call_logs WHERE id = ?', callLogId)).c).toBe('announced');

    await setSettings(`recording_consent_mode = 'off'`);
    const off = await call('POST', '/calls/outbound', admin, { toNumber: '+919000030604' });
    expect(off.status).toBe(201);
    const offCall = MockVoipProvider.calls[MockVoipProvider.calls.length - 1];
    expect(offCall.record).toBe(false);
    expect(offCall.announcementUrl).toBeUndefined();
  });

  it('on request: the agent\'s consent tick starts the recording and is noted on the call', async () => {
    await setSettings(`recording_consent_mode = 'on_request', default_caller_id = '${AGENCY_NUMBER}'`);
    const placed = await call('POST', '/calls/outbound', admin, { toNumber: '+919000030605' });
    expect(placed.status, JSON.stringify(await placed.clone().json())).toBe(201);
    const { callLogId, providerCallId } = ((await placed.json()) as any).data;
    expect(MockVoipProvider.calls.find((c) => c.providerCallId === providerCallId)!.record).toBe(false);

    await baseEnv.MASTER_DB.prepare(`UPDATE call_logs SET status = 'in-progress' WHERE id = ?`).bind(callLogId).run();
    const res = await call('POST', `/calls/${callLogId}/recording/consent`, admin, {});
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data).toEqual({ consent: 'given', recording: true });
    expect(MockVoipProvider.calls.find((c) => c.providerCallId === providerCallId)!.recordingStarted).toBe(true);
    expect((await one('SELECT recording_consent AS c FROM call_logs WHERE id = ?', callLogId)).c).toBe('given');
    // someone else's call cannot be ticked by an unrelated salesperson
    expect((await call('POST', `/calls/${callLogId}/recording/consent`, sales, {})).status).toBe(403);
  });
});

describe('recording and call AI settings', () => {
  it('an admin reads and changes them; others cannot change them', async () => {
    const get = await call('GET', '/calls/recording-settings', admin);
    expect(get.status).toBe(200);
    expect(((await get.json()) as any).data).toMatchObject({ configured: true, consentMode: 'announce', retentionDays: 90, callAiEnabled: false, callAiEngine: 'standard', defaultAnnouncement: DEFAULT_ANNOUNCEMENT, announcement: null });

    const put = await call('PUT', '/calls/recording-settings', admin, { consentMode: 'on_request', retentionDays: 45, announcement: ' Hello, recording on. ', callAiEnabled: true, callAiEngine: 'premium' });
    expect(put.status).toBe(200);
    expect(((await put.json()) as any).data).toMatchObject({ consentMode: 'on_request', retentionDays: 45, announcement: 'Hello, recording on.', callAiEnabled: true, callAiEngine: 'premium', premiumAvailable: false });
    expect(await one('SELECT recording_retention_days AS d, call_ai_enabled AS a FROM voip_settings WHERE id = ?', 'voip-r306')).toEqual({ d: 45, a: 1 });

    expect((await call('PUT', '/calls/recording-settings', sales, { retentionDays: 1 })).status).toBe(403);
    expect((await call('PUT', '/calls/recording-settings', admin, { retentionDays: 0 })).status).toBe(400);
    expect((await call('PUT', '/calls/recording-settings', admin, { consentMode: 'whenever' })).status).toBe(400);

    const cleared = await call('PUT', '/calls/recording-settings', admin, { announcement: '' });
    expect(((await cleared.json()) as any).data.announcement).toBeNull();
  });
});

describe('transcription: when it is queued', () => {
  async function storedCall(opts: CallOpts & { recordingSid: string; seconds?: number }): Promise<string> {
    const made = await insertCall({ duration: opts.seconds ?? 125, ...opts });
    addMockRecording(opts.recordingSid, opts.seconds ?? 125);
    await recordingReady(made.sid, opts.recordingSid, opts.seconds ?? 125);
    return made.id;
  }

  beforeEach(async () => {
    await planAi(true);
    await leaveCredits(5000);
  });

  it('is not enqueued when call AI is off (and nothing is written to the call)', async () => {
    const id = await storedCall({ id: uid('aioff'), recordingSid: 'RE0000r306aioff1' });
    expect(queue.sent).toEqual([]);
    expect((await one('SELECT ai_status AS s FROM call_logs WHERE id = ?', id)).s).toBeNull();
    expect((await requestCallAi(envNow(), baseEnv.MASTER_DB, TENANT_ID, id)).status).toBe('off');
    expect(ai.calls).toEqual([]);
  });

  it('is not enqueued when the agency has no AI credits left: the call says so and the recording is still stored', async () => {
    await setSettings('call_ai_enabled = 1');
    await leaveCredits(0);
    const id = await storedCall({ id: uid('nocred'), recordingSid: 'RE0000r306nocred1' });
    expect(queue.sent).toEqual([]);
    expect(await one('SELECT ai_status, ai_status_reason, recording_state FROM call_logs WHERE id = ?', id)).toEqual({
      ai_status: 'skipped', ai_status_reason: 'Not summarised: AI credits used up', recording_state: 'stored',
    });
    expect(ai.calls).toEqual([]);

    // "Summarise now" refuses with the credits message while there are none, and works after a top-up.
    const refused = await call('POST', `/calls/${id}/summarise`, admin, {});
    expect(refused.status).toBe(429);
    await leaveCredits(5000);
    const accepted = await call('POST', `/calls/${id}/summarise`, admin, {});
    expect(accepted.status).toBe(202);
    expect(queue.sent.map((m) => m.type)).toEqual(['transcribe_call']);
  });

  it('is not enqueued for a call under 20 seconds, or when the plan has no AI', async () => {
    await setSettings('call_ai_enabled = 1');
    const short = await storedCall({ id: uid('short'), recordingSid: 'RE0000r306short1', seconds: 19 });
    expect(queue.sent).toEqual([]);
    expect((await one('SELECT ai_status_reason AS r FROM call_logs WHERE id = ?', short)).r).toMatch(/too short/);

    await planAi(false);
    const noPlan = await storedCall({ id: uid('noplan'), recordingSid: 'RE0000r306noplan1' });
    expect(queue.sent).toEqual([]);
    expect((await one('SELECT ai_status_reason AS r FROM call_logs WHERE id = ?', noPlan)).r).toMatch(/not included in this plan/);
    expect(ai.calls).toEqual([]);
  });

  it('is enqueued for a long enough call when call AI is on, the plan includes it and credits suffice', async () => {
    await setSettings('call_ai_enabled = 1');
    const id = await storedCall({ id: uid('queued'), recordingSid: 'RE0000r306queue1' });
    expect(queue.sent).toEqual([{ type: 'transcribe_call', callLogId: id, tenantId: TENANT_ID }]);
    expect((await one('SELECT ai_status AS s FROM call_logs WHERE id = ?', id)).s).toBe('queued');
    expect(ai.calls).toEqual([]); // nothing has run yet
  });
});

describe('transcription and summary through the metered router', () => {
  beforeEach(async () => {
    await planAi(true);
    await leaveCredits(5000);
    await setSettings('call_ai_enabled = 1');
  });

  async function stored(recordingSid: string, over: CallOpts = {}): Promise<string> {
    const made = await insertCall({ id: uid('ai'), duration: 125, ...over });
    addMockRecording(recordingSid, 125);
    await recordingReady(made.sid, recordingSid, 125);
    return made.id;
  }

  it('the queue consumer transcribes (3 credits per started minute), then summarises (5 per started 5 minutes), and never calls Anthropic', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const contact = ((await (await call('POST', '/contacts', admin, { name: 'R306 Caller', phone: '9000030610', type: 'customer' })).json()) as any).data.id;
    const lead = ((await (await call('POST', '/leads', admin, { contactId: contact, title: 'R306 Goa', destinations: ['Maldives'], travelDate: FUTURE, tripType: 'family', source: 'website', assignedTo: ADMIN_ID })).json()) as any).data.id;
    const id = await stored('RE0000r306ai00001', { contactId: contact, leadId: lead });
    expect(queue.sent).toHaveLength(1);

    // an Anthropic key in the environment makes no difference: the summary goes through the router's Workers AI model
    const handled = await drain(envNow({ ANTHROPIC_API_KEY: 'sk-ant-should-never-be-used' }));
    expect(handled).toEqual(['ack:transcribe_call', 'ack:summarise_call']);

    // 125 s = 3 started minutes of Whisper at 3 credits, plus one 5-minute block of summary at 5 credits
    const charged = await spent();
    expect(charged).toBe(3 * CREDIT_WEIGHTS.transcribe_standard + CREDIT_WEIGHTS.understand);
    expect(charged).toBe(14);
    expect(ai.calls.map((c) => c.model)).toEqual([WHISPER, '@cf/meta/llama-3.3-70b-instruct-fp8-fast']);
    expect(fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => /anthropic|deepgram|twilio/.test(u))).toEqual([]);
    fetchSpy.mockRestore();

    const transcript = await one('SELECT full_transcript, language, transcription_model, duration_seconds FROM call_transcripts WHERE call_log_id = ?', id);
    expect(transcript).toMatchObject({ language: 'en', transcription_model: WHISPER, duration_seconds: 125 });
    expect(transcript.full_transcript).toContain('book Goa');
    const usage = await rows('SELECT task_type, model_name, cost_estimate FROM ai_usage_log WHERE call_log_id = ? ORDER BY task_type', id);
    expect(usage.map((u) => u.task_type)).toEqual(['call_summary', 'transcription']);
    // 3 minutes at $0.0005
    expect(usage.find((u) => u.task_type === 'transcription')!.cost_estimate).toBeCloseTo(0.0015, 6);
    expect((await one('SELECT ai_status AS s FROM call_logs WHERE id = ?', id)).s).toBe('summarised');

    // The summary is a pending extraction a person reviews.
    const extraction = await one('SELECT status, summary, destination FROM ai_call_extractions WHERE call_log_id = ?', id);
    expect(extraction.status).toBe('pending');
    expect(JSON.parse(extraction.summary)).toEqual(SUMMARY.summary);

    // Events for the engine
    const events = await rows(`SELECT type FROM domain_events WHERE entity_type = 'call' AND entity_id = ? AND type IN ('call.transcript_ready', 'call.summary_ready')`, id);
    expect(events.map((e) => e.type).sort()).toEqual(['call.summary_ready', 'call.transcript_ready']);

    // Everything produced from the transcript is a suggestion needing a click
    const suggestions = await rows(`SELECT action_type, status, origin FROM assistant_suggestions WHERE rule_key = 'calls.summarise' AND source_id = ? ORDER BY action_type`, id);
    expect(suggestions.map((s) => s.action_type)).toEqual(['create_task', 'draft_reply', 'update_lead']);
    expect(suggestions.every((s) => s.status === 'pending' && s.origin === 'ai')).toBe(true);
    // ... and nothing changed on the lead, no task exists, no message went out
    expect((await one('SELECT destination, budget FROM leads WHERE id = ?', lead))).toMatchObject({ budget: null });
    expect(JSON.parse((await one('SELECT destination AS d FROM leads WHERE id = ?', lead)).d)).toEqual(['Maldives']);
    expect(await rows('SELECT id FROM tasks WHERE title = ?', 'Send the Goa quote')).toHaveLength(0);
    expect(await rows('SELECT id FROM message_log WHERE contact_id = ?', contact)).toHaveLength(0);
  });

  it('applying the lead-update suggestion is the click that changes the lead', async () => {
    const contact = ((await (await call('POST', '/contacts', admin, { name: 'R306 Click', phone: '9000030611', type: 'customer' })).json()) as any).data.id;
    const lead = ((await (await call('POST', '/leads', admin, { contactId: contact, title: 'R306 Click trip', destinations: ['Maldives'], travelDate: FUTURE, tripType: 'family', source: 'website', assignedTo: ADMIN_ID })).json()) as any).data.id;
    const id = await stored('RE0000r306click01', { contactId: contact, leadId: lead });
    await drain();
    const suggestion = await one(`SELECT id, params FROM assistant_suggestions WHERE rule_key = 'calls.summarise' AND source_id = ? AND action_type = 'update_lead'`, id);
    expect(JSON.parse(suggestion.params)).toMatchObject({ leadId: lead, changes: { destinations: ['Goa'], paxAdults: 2, paxChildren: 2, budget: 150000, travelDate: '2099-12-20' } });
  });

  it('a second delivery of the same job changes nothing and costs nothing', async () => {
    const id = await stored('RE0000r306twice01');
    const message = { ...queue.sent[0] };
    await drain();
    const used = (await spent());
    queue.sent.push(message, { type: 'summarise_call', callLogId: id, tenantId: TENANT_ID });
    await drain();
    expect((await spent())).toBe(used);
    expect(await rows('SELECT id FROM call_transcripts WHERE call_log_id = ?', id)).toHaveLength(1);
    expect(await rows('SELECT id FROM ai_call_extractions WHERE call_log_id = ?', id)).toHaveLength(1);
  });

  it('a voicemail is transcribed (3 per started minute) but not summarised', async () => {
    const made = await insertCall({ id: uid('vm'), duration: 0, status: 'no-answer', answeredBy: null });
    addMockRecording('RE0000r306vm00001', 12);
    await recordingReady(made.sid, 'RE0000r306vm00001', 12);
    expect(queue.sent.map((m) => m.type)).toEqual(['transcribe_voicemail']);
    await drain();
    expect(await rows('SELECT id FROM call_transcripts WHERE call_log_id = ?', made.id)).toHaveLength(1);
    expect(await rows('SELECT id FROM ai_call_extractions WHERE call_log_id = ?', made.id)).toHaveLength(0);
    expect((await spent())).toBe(CREDIT_WEIGHTS.transcribe_standard);
  });

  it('credits are checked before audio is sent: not enough for the call means no model call and no charge', async () => {
    const id = await stored('RE0000r306short02');
    queue.sent.splice(0); // the producer queued it; now the balance drops before the consumer runs
    await leaveCredits(1);
    queue.sent.push({ type: 'transcribe_call', callLogId: id, tenantId: TENANT_ID });
    const handled = await drain();
    expect(handled).toEqual(['ack:transcribe_call']);
    expect(ai.calls).toEqual([]);
    expect((await getCreditBalance(baseEnv.MASTER_DB, TENANT_ID)).remaining).toBe(1);
    expect((await one('SELECT ai_status AS s, ai_status_reason AS r FROM call_logs WHERE id = ?', id))).toEqual({ s: 'skipped', r: 'Not summarised: AI credits used up' });
  });

  it('when the AI service is unavailable nothing is charged and the call offers "try again"', async () => {
    ai = { calls: [], run: async () => { throw new Error('binding down'); } } as any;
    const id = await stored('RE0000r306down001');
    const handled = await drain();
    expect(handled).toEqual(['ack:transcribe_call']);
    expect((await spent())).toBe(0);
    expect(await one('SELECT ai_status, ai_status_reason FROM call_logs WHERE id = ?', id)).toEqual({ ai_status: 'failed', ai_status_reason: 'Not summarised: the AI service is not available right now' });
    // try again once the service is back
    ai = fakeAi();
    const again = await call('POST', `/calls/${id}/summarise`, admin, {});
    expect(again.status).toBe(202);
    await drain();
    expect((await one('SELECT ai_status AS s FROM call_logs WHERE id = ?', id)).s).toBe('summarised');
  });

  it('the summary goes through the AI router (a stubbed router sees the call_summary task and the units to charge)', async () => {
    const id = await insertCall({ id: uid('router'), duration: 650 });
    await baseEnv.MASTER_DB.prepare(`INSERT INTO call_transcripts (id, call_log_id, full_transcript) VALUES (?, ?, 'Customer: Goa for four. Agent: sure.')`).bind(uid('tr'), id.id).run();
    const route = vi.fn(async () => ({ result: JSON.stringify(SUMMARY), model: 'stub-model', provider: 'cloudflare', inputTokens: 10, outputTokens: 5, cost: 0.001 }));
    const logUsage = vi.fn(async () => undefined);
    await summariseCall(envNow(), baseEnv.MASTER_DB, TENANT_ID, id.id, { router: { route, logUsage } as any });
    expect(route).toHaveBeenCalledTimes(1);
    const args = route.mock.calls[0] as unknown as [string, string, string, { units: number }];
    expect(args[0]).toBe('call_summary');
    expect(args[1]).toContain('Goa for four');
    // 650 s is 3 started 5-minute blocks
    expect(args[3]).toEqual({ units: 3 });
    expect(logUsage).toHaveBeenCalledWith(expect.anything(), 'call_summary', 'stub-model', 10, 5, 0.001, id.id, expect.any(Number));
    expect((await one('SELECT model_used AS m FROM ai_call_extractions WHERE call_log_id = ?', id.id)).m).toBe('stub-model');
  });

  it('transcripts are readable by admin and the salesperson on the call, not by other salespeople or the viewer', async () => {
    const mine = await insertCall({ id: uid('trmine'), routedTo: SALES_ID });
    const other = await insertCall({ id: uid('trother'), routedTo: ADMIN_ID });
    for (const c of [mine, other]) {
      await baseEnv.MASTER_DB.prepare(`INSERT INTO call_transcripts (id, call_log_id, full_transcript) VALUES (?, ?, 'hello')`).bind(uid('tr'), c.id).run();
    }
    expect((await call('GET', `/transcripts/${mine.id}`, sales)).status).toBe(200);
    expect((await call('GET', `/transcripts/${other.id}`, sales)).status).toBe(403);
    expect((await call('GET', `/transcripts/${other.id}`, admin)).status).toBe(200);
    expect((await call('GET', `/transcripts/${mine.id}`, viewer)).status).toBe(403);
    expect((await call('GET', `/calls/${mine.id}/summary`, sales)).status).toBe(200);
    expect((await call('GET', `/calls/${other.id}/summary`, sales)).status).toBe(403);
    expect((await call('GET', `/calls/${mine.id}/summary`, viewer)).status).toBe(403);
  });
});

describe('contact erasure removes recordings (R208 registry)', () => {
  it('erasing the contact deletes the stored recording object and the transcript', async () => {
    const contact = ((await (await call('POST', '/contacts', admin, { name: 'R306 Erase Me', phone: '9000030620', type: 'customer' })).json()) as any).data.id;
    const made = await insertCall({ id: uid('erase'), contactId: contact });
    addMockRecording('RE0000r306erase1');
    await recordingReady(made.sid, 'RE0000r306erase1', 125);
    const key = recordingKey(TENANT_ID, made.id);
    await baseEnv.MASTER_DB.prepare(`INSERT INTO call_transcripts (id, call_log_id, full_transcript) VALUES (?, ?, 'private words')`).bind(uid('tr'), made.id).run();
    expect(await baseEnv.FILE_STORAGE.head(key)).toBeTruthy();

    const res = await call('POST', `/contacts/${contact}/erase`, admin, { confirmation: 'ERASE CONTACT' });
    expect(res.status).toBe(200);
    expect(await baseEnv.FILE_STORAGE.head(key)).toBeNull();
    expect(await rows('SELECT id FROM call_transcripts WHERE call_log_id = ?', made.id)).toHaveLength(0);
    expect(await rows('SELECT id FROM call_logs WHERE id = ?', made.id)).toHaveLength(0);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
