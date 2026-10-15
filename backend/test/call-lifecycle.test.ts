import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { twilioSignature } from '../src/middleware/provider-signature';
import { simulateVoipScenario, type VoipScenario } from '../src/services/voip/simulator';
import { MockVoipProvider } from '../src/services/voip/mock-provider';
import { ACTIONS } from '../src/services/automation/actions';
import { RECIPES } from '../src/services/automation/recipes';

// R303: call lifecycle events reach the automation engine once per real occurrence; the call recipes turn them into
// tasks, timeline entries and one-click suggestions (never a message sent or a call placed by themselves); the agent's
// screen pop is pushed over the realtime room. Everything runs on the mock provider with signed simulated callbacks.

const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const AGENCY_NUMBER = '+918047183303';

/** Everything pushed over the realtime room, in order. */
const pushed: Array<{ path: string; body: any }> = [];
const fakeRealtime = {
  idFromName: (name: string) => name,
  get: () => ({
    fetch: async (url: string, init?: RequestInit) => {
      pushed.push({ path: new URL(url).pathname, body: JSON.parse(String(init?.body ?? '{}')) });
      return new Response('{}');
    },
  }),
};
const testEnv = { ...(env as any), VOIP_PROVIDER: 'mock', REALTIME: fakeRealtime } as any;

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

function base(): string {
  return testEnv.API_PUBLIC_URL ? String(testEnv.API_PUBLIC_URL).replace(/[/]+$/, '') : 'http://localhost';
}

async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}

async function play(scenario: VoipScenario, callSid: string, to: string, from: string, durationSeconds?: number) {
  return simulateVoipScenario({
    scenario,
    to,
    from,
    callSid,
    durationSeconds,
    baseUrl: base(),
    authToken: testEnv.TWILIO_AUTH_TOKEN,
    send: async (request) => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(request, testEnv, ctx);
      await waitOnExecutionContext(ctx);
      return res;
    },
  });
}

/** A single signed provider callback (used for the dial result). */
async function webhook(path: string, fields: Record<string, string>): Promise<Response> {
  const signature = await twilioSignature(`${base()}/api/v1/voip${path}`, fields, testEnv.TWILIO_AUTH_TOKEN);
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1/voip${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature },
      body: new URLSearchParams(fields).toString(),
    }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

let admin = '';
let seq = 0;
const sid = (tag: string) => `CA${'0'.repeat(8)}lc${tag}${String(++seq).padStart(3, '0')}${'0'.repeat(14)}`;

async function makeContact(name: string, phone: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await call('POST', '/contacts', admin, { name, phone, type: 'customer', ...extra });
  expect(res.status).toBe(201);
  return ((await res.json()) as any).data.id;
}

async function makeLead(contactId: string, title: string): Promise<string> {
  const res = await call('POST', '/leads', admin, {
    contactId, title, destinations: ['Goa'], travelDate: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10), tripType: 'family', source: 'website', assignedTo: ADMIN_ID,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as any).data.id;
}

async function callIdOf(callSid: string): Promise<string> {
  const [row] = await rows<{ id: string }>('SELECT id FROM call_logs WHERE provider_call_id = ?', callSid);
  expect(row).toBeTruthy();
  return row.id;
}

async function eventsOf(callId: string): Promise<Array<{ type: string; payload: any; depth: number }>> {
  const list = await rows<{ type: string; payload: string; depth: number }>(
    'SELECT type, payload, depth FROM domain_events WHERE entity_type = ? AND entity_id = ? ORDER BY rowid',
    'call',
    callId,
  );
  return list.map((e) => ({ type: e.type, payload: JSON.parse(e.payload), depth: e.depth }));
}

const count = (events: Array<{ type: string }>, type: string) => events.filter((e) => e.type === type).length;

async function suggestions(ruleKey: string, dedupeLike: string) {
  return rows<Record<string, any>>('SELECT * FROM assistant_suggestions WHERE rule_key = ? AND dedupe_key = ?', ruleKey, dedupeLike);
}

/** A placed outbound call, as POST /calls/outbound makes it (mock provider). */
async function placeOutbound(toNumber: string, leadId: string | null, contactId: string | null) {
  const res = await call('POST', '/calls/outbound', admin, { toNumber, leadId, contactId });
  expect(res.status).toBe(201);
  const body = ((await res.json()) as any).data;
  return { callLogId: body.callLogId as string, providerCallId: body.providerCallId as string };
}

describe('Call lifecycle events and recipes', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    await testEnv.MASTER_DB.prepare("INSERT INTO settings (key, value) VALUES ('country', 'GB') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;
    expect((await call('POST', '/integrations/channels', admin, { channel: 'voice', address: AGENCY_NUMBER, provider: 'twilio', label: 'Lifecycle line' })).status).toBe(201);
    await testEnv.MASTER_DB
      .prepare(`INSERT INTO voip_settings (id, voip_provider, routing_strategy, default_caller_id, max_ring_duration, voicemail_enabled) VALUES ('voip-lc', 'twilio', 'assigned', ?, 25, 1)`)
      .bind(AGENCY_NUMBER)
      .run();
    await testEnv.MASTER_DB
      .prepare(`INSERT OR IGNORE INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source) VALUES ('0196a303-0000-7000-8000-0000000000c1', ?, 'call_minutes_100', 1, 100, ?, 'super_admin_grant')`)
      .bind(TENANT_ID, new Date().toISOString().slice(0, 7))
      .run();
    MockVoipProvider.reset();
    // Quiet hours off unless a test turns them on.
    await testEnv.MASTER_DB.prepare("INSERT INTO settings (key, value) VALUES ('customer_quiet_start', '09:00'), ('customer_quiet_end', '09:00') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  });

  describe('an answered inbound call from a known contact with a new lead', () => {
    const caller = '+919000009301';
    const callSid = sid('ans');
    let callId = '';
    let leadId = '';
    let contactId = '';

    beforeAll(async () => {
      contactId = await makeContact('Lifecycle Anita', caller);
      leadId = await makeLead(contactId, 'Anita Goa trip');
      pushed.length = 0;
      await play('inbound_answered', callSid, AGENCY_NUMBER, caller, 45);
      callId = await callIdOf(callSid);
    });

    it('emits ringing, answered and ended once each at depth 0, with the payloads of the design', async () => {
      const events = await eventsOf(callId);
      expect(count(events, 'call.ringing')).toBe(1);
      expect(count(events, 'call.answered')).toBe(1);
      expect(count(events, 'call.ended')).toBe(1);
      expect(events.every((e) => e.depth === 0)).toBe(true);
      const ringing = events.find((e) => e.type === 'call.ringing')!.payload;
      expect(ringing).toMatchObject({ callId, from: caller, to: AGENCY_NUMBER, contactId, leadId, routedTo: ADMIN_ID });
      const ended = events.find((e) => e.type === 'call.ended')!.payload;
      expect(ended).toMatchObject({ direction: 'inbound', result: 'completed', durationSeconds: 45, contactId, leadId, agentId: ADMIN_ID });
      const answered = events.find((e) => e.type === 'call.answered')!.payload;
      expect(answered.agentId).toBe(ADMIN_ID);
      expect(typeof answered.answeredAt).toBe('string');
    });

    it('records who answered, so per-agent analytics count the inbound row (created_by is NULL)', async () => {
      const [row] = await rows('SELECT created_by, routed_to, answered_by FROM call_logs WHERE id = ?', callId);
      expect(row).toMatchObject({ created_by: null, routed_to: ADMIN_ID, answered_by: ADMIN_ID });
      const res = await call('GET', '/calls/analytics', admin);
      const agents = ((await res.json()) as any).data.topAgents as Array<{ userId: string; totalCalls: number; completed: number }>;
      const mine = agents.find((a) => a.userId === ADMIN_ID);
      expect(mine && mine.totalCalls).toBeGreaterThanOrEqual(1);
      expect(mine && mine.completed).toBeGreaterThanOrEqual(1);
      // And the per-agent list filter finds inbound rows for the agent too.
      const list = await call('GET', `/calls?userId=${ADMIN_ID}&direction=inbound`, admin);
      const ids = ((await list.json()) as any).data.map((r: any) => r.id);
      expect(ids).toContain(callId);
    });

    it('leads.contacted_on_call moves the new lead to contacted on its own, with Undo available', async () => {
      const [lead] = await rows('SELECT status FROM leads WHERE id = ?', leadId);
      expect(lead.status).toBe('contacted');
      const [s] = await suggestions('leads.contacted_on_call', `contacted-call:${leadId}`);
      expect(s.status).toBe('auto_applied');
      expect(s.undo).toBeTruthy();
    });

    it('calls.log_to_timeline writes one entry on the lead and one on the contact', async () => {
      const leadEntries = await rows('SELECT type, content, metadata FROM lead_activities WHERE lead_id = ? AND type = ?', leadId, 'call');
      expect(leadEntries).toHaveLength(1);
      expect(leadEntries[0].content).toContain('Inbound call, 45 s');
      expect(JSON.parse(leadEntries[0].metadata)).toMatchObject({ call_id: callId, direction: 'inbound', duration_seconds: 45, agent_id: ADMIN_ID });
      const contactEntries = await rows(`SELECT details FROM activity_logs WHERE entity_type = 'contact' AND entity_id = ? AND action = 'call'`, contactId);
      expect(contactEntries).toHaveLength(1);

      const lead = await call('GET', `/leads/${leadId}/activities`, admin);
      const items = ((await lead.json()) as any).data as Array<any>;
      expect(items.find((a) => a.type === 'call')?.meta).toMatchObject({ callId, direction: 'inbound', durationSeconds: 45 });
      const timeline = await call('GET', `/contacts/${contactId}/timeline`, admin);
      const entries = ((await timeline.json()) as any).data as Array<any>;
      expect(entries.some((e) => e.title === 'call' && JSON.parse(e.metadata).callId === undefined && JSON.parse(e.metadata).call_id === callId)).toBe(true);
    });

    it('calls.next_step_prompt only suggests a follow-up (nothing is scheduled without a click)', async () => {
      const [s] = await suggestions('calls.next_step_prompt', `next-step:${callId}`);
      expect(s.status).toBe('pending');
      expect(s.action_type).toBe('create_follow_up');
      expect(JSON.parse(s.params)).toMatchObject({ leadId, type: 'call' });
      expect(await rows('SELECT id FROM follow_ups WHERE lead_id = ? AND notes = ?', leadId, 'Follow-up after call')).toHaveLength(0);
    });

    it('pushes the screen pop to the routed agent and "ringing for" to everyone else', async () => {
      const toAgent = pushed.find((p) => p.path === '/send-to-user' && p.body.type === 'call:ringing');
      expect(toAgent?.body.targetUserId).toBe(ADMIN_ID);
      expect(toAgent?.body.data).toMatchObject({
        callId,
        from: caller,
        routedTo: ADMIN_ID,
        contact: { id: contactId, name: 'Lifecycle Anita' },
        lead: { id: leadId, title: 'Anita Goa trip' },
      });
      const others = pushed.find((p) => p.path === '/broadcast' && p.body.type === 'call:ringing_for');
      expect(others?.body.excludeUserId).toBe(ADMIN_ID);
      expect(others?.body.data.lastInteraction).toBeNull();
      expect(pushed.filter((p) => p.body.type === 'call:ringing')).toHaveLength(1);
    });

    it('replaying the whole call changes nothing', async () => {
      const before = (await eventsOf(callId)).length;
      const suggestionsBefore = (await rows('SELECT COUNT(*) AS n FROM assistant_suggestions'))[0].n;
      pushed.length = 0;
      await play('inbound_answered', callSid, AGENCY_NUMBER, caller, 45);
      expect((await eventsOf(callId)).length).toBe(before);
      expect((await rows('SELECT COUNT(*) AS n FROM assistant_suggestions'))[0].n).toBe(suggestionsBefore);
      expect(await rows('SELECT id FROM lead_activities WHERE lead_id = ? AND type = ?', leadId, 'call')).toHaveLength(1);
      expect(pushed.filter((p) => p.body.type === 'call:ringing')).toHaveLength(0);
    });
  });

  it('a call under 30 seconds does not move a new lead to contacted', async () => {
    const caller = '+919000009302';
    const contactId = await makeContact('Lifecycle Brief', caller);
    const leadId = await makeLead(contactId, 'Brief call lead');
    const callSid = sid('brf');
    await play('inbound_answered', callSid, AGENCY_NUMBER, caller, 12);
    expect((await rows('SELECT status FROM leads WHERE id = ?', leadId))[0].status).toBe('new');
    expect(await suggestions('leads.contacted_on_call', `contacted-call:${leadId}`)).toHaveLength(0);
  });

  it('the dial result "answered" reports the answer when the provider sends it, still once', async () => {
    const caller = '+919000009303';
    const contactId = await makeContact('Lifecycle Dial', caller);
    await makeLead(contactId, 'Dial result lead');
    const callSid = sid('dlr');
    // Only the inbound step and the dial result, then the end of the call.
    await play('inbound_answered', callSid, AGENCY_NUMBER, caller, 60);
    const callId = await callIdOf(callSid);
    const res = await webhook(`/twiml/dial-status?callLogId=${callId}`, { CallSid: callSid, To: AGENCY_NUMBER, From: caller, DialCallStatus: 'completed' });
    expect(res.status).toBe(200);
    expect(count(await eventsOf(callId), 'call.answered')).toBe(1);
  });

  it('a ringing agent who does not pick up: the dial result sends the caller to voicemail and the call is missed once', async () => {
    const caller = '+919000009305';
    await makeContact('Lifecycle Ringing', caller);
    const callSid = sid('rng');
    // The call reaches the agent (inbound step only), then the provider reports the dial ended with no answer.
    const inboundStep = await webhook('/twiml/inbound', { CallSid: callSid, To: AGENCY_NUMBER, From: caller, CallStatus: 'ringing', Direction: 'inbound' });
    expect(inboundStep.status).toBe(200);
    const callId = await callIdOf(callSid);
    const fields = { CallSid: callSid, To: AGENCY_NUMBER, From: caller, DialCallStatus: 'no-answer' };
    const dial = await webhook(`/twiml/dial-status?callLogId=${callId}`, fields);
    expect(dial.status).toBe(200);
    expect(await dial.text()).toContain('<Record');
    // The provider repeats it, and the call's own status callback says the same thing.
    await webhook(`/twiml/dial-status?callLogId=${callId}`, fields);
    await webhook('/status-callback', { CallSid: callSid, To: AGENCY_NUMBER, From: caller, CallStatus: 'no-answer', CallDuration: '0' });

    const events = await eventsOf(callId);
    expect(count(events, 'call.ringing')).toBe(1);
    expect(count(events, 'call.missed')).toBe(1);
    expect(count(events, 'call.answered')).toBe(0);
    expect(count(events, 'call.ended')).toBe(0);
    expect((await rows('SELECT status FROM call_logs WHERE id = ?', callId))[0].status).toBe('no-answer');
    expect(await rows('SELECT id FROM tasks WHERE title = ?', 'Call back Lifecycle Ringing')).toHaveLength(1);
  });

  describe('a missed inbound call', () => {
    it('from a known contact: one call.missed, a call-back task, and an acknowledgement draft that nobody sent', async () => {
      const caller = '+919000009311';
      const contactId = await makeContact('Lifecycle Missed', caller);
      const callSid = sid('mis');
      const messagesBefore = (await rows('SELECT COUNT(*) AS n FROM message_log'))[0].n;
      await play('inbound_missed', callSid, AGENCY_NUMBER, caller);
      const callId = await callIdOf(callSid);
      const events = await eventsOf(callId);
      expect(count(events, 'call.missed')).toBe(1);
      expect(count(events, 'call.ended')).toBe(0);
      expect(await rows('SELECT id FROM tasks WHERE title = ?', 'Call back Lifecycle Missed')).toHaveLength(1);

      const [ack] = await suggestions('calls.missed_acknowledgement', `missed-ack:${callId}`);
      expect(ack.status).toBe('pending');
      expect(ack.action_type).toBe('draft_reply');
      const params = JSON.parse(ack.params);
      expect(params).toMatchObject({ contactId, channel: 'whatsapp' });
      expect(params.sendAfter ?? null).toBeNull();
      // Customer-facing: a person sends it. Nothing went out.
      expect((await rows('SELECT COUNT(*) AS n FROM message_log'))[0].n).toBe(messagesBefore);
    });

    it('quiet hours keep the draft but hold it until they end', async () => {
      const caller = '+919000009312';
      await makeContact('Lifecycle Night', caller);
      await testEnv.MASTER_DB.prepare("UPDATE settings SET value = '00:00' WHERE key = 'customer_quiet_start'").run();
      await testEnv.MASTER_DB.prepare("UPDATE settings SET value = '24:00' WHERE key = 'customer_quiet_end'").run();
      try {
        const callSid = sid('qht');
        await play('inbound_missed', callSid, AGENCY_NUMBER, caller);
        const callId = await callIdOf(callSid);
        const [ack] = await suggestions('calls.missed_acknowledgement', `missed-ack:${callId}`);
        expect(ack.status).toBe('pending');
        const sendAfter = JSON.parse(ack.params).sendAfter as string;
        expect(Date.parse(sendAfter)).toBeGreaterThan(Date.now());
        expect(ack.reason).toContain('quiet hours');
        // The call-back task for the agent is internal: quiet hours do not hold it.
        expect(await rows('SELECT id FROM tasks WHERE title = ?', 'Call back Lifecycle Night')).toHaveLength(1);
      } finally {
        await testEnv.MASTER_DB.prepare("UPDATE settings SET value = '09:00' WHERE key IN ('customer_quiet_start', 'customer_quiet_end')").run();
      }
    });

    it('no draft for a contact who opted out or asked not to be disturbed, or for an unknown number', async () => {
      const optedOut = '+919000009313';
      const dnd = '+919000009314';
      const unknown = '+919000009315';
      await makeContact('Lifecycle OptOut', optedOut);
      await makeContact('Lifecycle Dnd', dnd);
      await testEnv.MASTER_DB.prepare("UPDATE contacts SET opted_out = 1 WHERE phone = ?").bind(optedOut).run();
      await testEnv.MASTER_DB.prepare("UPDATE contacts SET dnd_enabled = 1 WHERE phone = ?").bind(dnd).run();
      for (const [tag, number] of [['oo', optedOut], ['dn', dnd], ['uk', unknown]] as const) {
        const callSid = sid(tag);
        await play('inbound_missed', callSid, AGENCY_NUMBER, number);
        const callId = await callIdOf(callSid);
        expect(await suggestions('calls.missed_acknowledgement', `missed-ack:${callId}`)).toHaveLength(0);
        expect(count(await eventsOf(callId), 'call.missed')).toBe(1);
      }
    });
  });

  it('a voicemail replaces the call-back task with one voicemail task (one task, not two)', async () => {
    const caller = '+919000009321';
    await makeContact('Lifecycle Voicemail', caller);
    const callSid = sid('vm');
    await play('inbound_voicemail', callSid, AGENCY_NUMBER, caller, 20);
    const callId = await callIdOf(callSid);
    const events = await eventsOf(callId);
    expect(count(events, 'call.missed')).toBe(1);
    expect(count(events, 'call.voicemail_left')).toBe(1);
    expect(count(events, 'call.recording_ready')).toBe(1);
    const left = events.find((e) => e.type === 'call.voicemail_left')!.payload;
    expect(left).toMatchObject({ from: caller, durationSeconds: 20 });
    expect(String(left.recordingUrl)).toContain('.mp3');
    expect(events.find((e) => e.type === 'call.recording_ready')!.payload).toMatchObject({ callId, durationSeconds: 20 });

    expect(await rows('SELECT id FROM tasks WHERE title = ?', 'Call back Lifecycle Voicemail')).toHaveLength(0);
    const voicemailTasks = await rows('SELECT id, description FROM tasks WHERE title = ?', 'Listen to voicemail from Lifecycle Voicemail');
    expect(voicemailTasks).toHaveLength(1);
    expect(voicemailTasks[0].description).toContain('.mp3');
    const [callback] = await suggestions('calls.missed_callback', `callback:${callId}`);
    expect(callback.status).toBe('undone');
    expect((await rows('SELECT outcome FROM call_logs WHERE id = ?', callId))[0].outcome).toBe('voicemail');

    // Played again: still one task and one of each event.
    await play('inbound_voicemail', callSid, AGENCY_NUMBER, caller, 20);
    expect(await rows('SELECT id FROM tasks WHERE title = ?', 'Listen to voicemail from Lifecycle Voicemail')).toHaveLength(1);
    expect(count(await eventsOf(callId), 'call.voicemail_left')).toBe(1);
  });

  describe('outbound calls', () => {
    it('call.started is emitted by the agent starting the call; answered and ended follow the provider, and a lead goes to contacted', async () => {
      const customer = '+919000009331';
      const contactId = await makeContact('Lifecycle Outbound', customer);
      const leadId = await makeLead(contactId, 'Outbound trip');
      const { callLogId, providerCallId } = await placeOutbound(customer, leadId, contactId);

      let events = await eventsOf(callLogId);
      expect(count(events, 'call.started')).toBe(1);
      expect(events.find((e) => e.type === 'call.started')!.payload).toMatchObject({ direction: 'outbound', to: customer, contactId, leadId, agentId: ADMIN_ID });

      await play('outbound_answered', providerCallId, customer, AGENCY_NUMBER, 45);
      events = await eventsOf(callLogId);
      expect(count(events, 'call.answered')).toBe(1);
      expect(count(events, 'call.ended')).toBe(1);
      expect(events.find((e) => e.type === 'call.ended')!.payload).toMatchObject({ direction: 'outbound', result: 'completed', durationSeconds: 45, leadId, contactId });
      expect((await rows('SELECT answered_by FROM call_logs WHERE id = ?', callLogId))[0].answered_by).toBe(ADMIN_ID);
      expect((await rows('SELECT status FROM leads WHERE id = ?', leadId))[0].status).toBe('contacted');
      expect(await rows('SELECT id FROM lead_activities WHERE lead_id = ? AND type = ?', leadId, 'call')).toHaveLength(1);
    });

    it('an unanswered outbound call ends as no_answer and suggests one retry task per lead per day', async () => {
      const customer = '+919000009332';
      const contactId = await makeContact('Lifecycle Retry', customer);
      const leadId = await makeLead(contactId, 'Retry trip');

      const first = await placeOutbound(customer, leadId, contactId);
      await play('outbound_no_answer', first.providerCallId, customer, AGENCY_NUMBER);
      const events = await eventsOf(first.callLogId);
      expect(count(events, 'call.ended')).toBe(1);
      expect(count(events, 'call.answered')).toBe(0);
      expect(events.find((e) => e.type === 'call.ended')!.payload).toMatchObject({ result: 'no_answer', durationSeconds: 0, leadId });

      const retry = await rows<Record<string, any>>(`SELECT * FROM assistant_suggestions WHERE rule_key = 'calls.retry_task' AND lead_id = ?`, leadId);
      expect(retry).toHaveLength(1);
      expect(retry[0].status).toBe('pending');
      expect(retry[0].action_type).toBe('create_task');
      expect(await rows('SELECT id FROM tasks WHERE title = ?', 'Try Lifecycle Retry again')).toHaveLength(0);

      // A second unanswered call the same day does not add a second suggestion.
      const second = await placeOutbound(customer, leadId, contactId);
      await play('outbound_no_answer', second.providerCallId, customer, AGENCY_NUMBER);
      expect(await rows(`SELECT id FROM assistant_suggestions WHERE rule_key = 'calls.retry_task' AND lead_id = ?`, leadId)).toHaveLength(1);
      // Not-answered calls are still on the timeline.
      expect((await rows('SELECT COUNT(*) AS n FROM lead_activities WHERE lead_id = ? AND type = ?', leadId, 'call'))[0].n).toBe(2);
    });
  });

  it('an answered call with an unknown number offers one-click contact and lead creation, and creates nothing itself', async () => {
    const caller = '+919000009341';
    const callSid = sid('unk');
    const contactsBefore = (await rows('SELECT COUNT(*) AS n FROM contacts'))[0].n;
    await play('inbound_answered', callSid, AGENCY_NUMBER, caller, 50);
    const callId = await callIdOf(callSid);
    expect(count(await eventsOf(callId), 'call.ended')).toBe(1);
    const found = await rows<Record<string, any>>(`SELECT * FROM assistant_suggestions WHERE rule_key = 'calls.lead_from_unknown_caller' AND entity_id = ?`, callId);
    expect(found).toHaveLength(1);
    expect(found[0].status).toBe('pending');
    expect(found[0].action_type).toBe('create_lead_from_enquiry');
    expect(JSON.parse(found[0].params).phone).toBe(caller);
    expect((await rows('SELECT COUNT(*) AS n FROM contacts'))[0].n).toBe(contactsBefore);
  });

  it('a transfer emits call.transferred with who handed it over and the note', async () => {
    const customer = '+919000009351';
    const { callLogId } = await placeOutbound(customer, null, null);
    const res = await call('POST', `/calls/${callLogId}/transfer`, admin, { targetNumber: '+919000009399', note: 'Wants the Bali package' });
    expect(res.status).toBe(200);
    const events = await eventsOf(callLogId);
    expect(count(events, 'call.transferred')).toBe(1);
    expect(events.find((e) => e.type === 'call.transferred')!.payload).toMatchObject({ fromAgent: ADMIN_ID, toNumber: '+919000009399', note: 'Wants the Bali package' });
  });

  it('with automations paused the events are recorded but no recipe reacts', async () => {
    await testEnv.MASTER_DB.prepare("INSERT INTO settings (key, value) VALUES ('automations_paused', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
    try {
      const caller = '+919000009361';
      const contactId = await makeContact('Lifecycle Paused', caller);
      const leadId = await makeLead(contactId, 'Paused trip');
      const callSid = sid('pau');
      await play('inbound_answered', callSid, AGENCY_NUMBER, caller, 90);
      const callId = await callIdOf(callSid);
      expect(count(await eventsOf(callId), 'call.ended')).toBe(1);
      expect((await rows('SELECT status FROM leads WHERE id = ?', leadId))[0].status).toBe('new');
      expect(await rows('SELECT id FROM lead_activities WHERE lead_id = ? AND type = ?', leadId, 'call')).toHaveLength(0);
    } finally {
      await testEnv.MASTER_DB.prepare("UPDATE settings SET value = '0' WHERE key = 'automations_paused'").run();
    }
  });

  describe('guard rails', () => {
    it('no recipe or action can place a call', () => {
      expect(Object.keys(ACTIONS).filter((a) => /place|dial|start_call|outbound/.test(a))).toEqual([]);
      const callRecipes = RECIPES.filter((r) => r.triggers.some((t) => t.startsWith('call.')));
      expect(callRecipes.map((r) => r.key).sort()).toEqual([
        'calls.lead_from_missed_call',
        'calls.lead_from_unknown_caller',
        'calls.log_to_timeline',
        'calls.missed_acknowledgement',
        'calls.missed_callback',
        'calls.next_step_prompt',
        'calls.retry_task',
        'calls.summarise',
        'calls.voicemail_task',
        'leads.contacted_on_call',
      ]);
    });

    it('everything a call recipe suggested is an internal or one-click action; customer-facing ones are never auto-applied', async () => {
      const all = await rows<{ rule_key: string; action_type: string; status: string }>(
        `SELECT rule_key, action_type, status FROM assistant_suggestions WHERE rule_key LIKE 'calls.%' OR rule_key = 'leads.contacted_on_call'`,
      );
      expect(all.length).toBeGreaterThan(0);
      for (const s of all) {
        expect(['create_task', 'create_follow_up', 'create_lead_from_enquiry', 'draft_reply', 'advance_lead_status', 'log_call_activity']).toContain(s.action_type);
        if (['draft_reply', 'create_lead_from_enquiry', 'create_follow_up'].includes(s.action_type) && s.rule_key !== 'calls.next_step_prompt') {
          expect(s.status).not.toBe('auto_applied');
        }
      }
      expect(all.filter((s) => s.action_type === 'draft_reply' && s.status === 'auto_applied')).toHaveLength(0);
      expect(all.filter((s) => s.rule_key === 'calls.next_step_prompt' && s.status === 'auto_applied')).toHaveLength(0);
    });

    it('the hardcoded follow-up in the outcome handler is gone: saving "follow-up needed" schedules nothing by itself', async () => {
      const caller = '+919000009371';
      const contactId = await makeContact('Lifecycle Outcome', caller);
      const leadId = await makeLead(contactId, 'Outcome trip');
      const { callLogId } = await placeOutbound(caller, leadId, contactId);
      const res = await call('PUT', `/calls/${callLogId}`, admin, { outcome: 'follow_up_needed' });
      expect(res.status).toBe(200);
      expect(await rows('SELECT id FROM follow_ups WHERE lead_id = ? AND notes LIKE ?', leadId, 'Auto-created from call%')).toHaveLength(0);
    });
  });
});
