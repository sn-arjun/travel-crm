import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { twilioSignature } from '../src/middleware/provider-signature';
import { simulateVoipScenario, VOIP_SCENARIOS, type VoipScenario } from '../src/services/voip/simulator';
import { MockVoipProvider } from '../src/services/voip/mock-provider';

// R302: every provider callback is processed exactly once, and calls follow the right steps.
// Everything runs on the mock provider (no network); callbacks are signed like the provider's.

const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const AGENCY_NUMBER = '+918047182295';
const CUSTOMER = '+919000009100';
const testEnv = { ...(env as any), VOIP_PROVIDER: 'mock' } as any;

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

/** A provider callback as the provider sends it: form-encoded and signed (path may carry a query). */
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

async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}

async function play(scenario: VoipScenario, callSid: string, to: string, from: string) {
  return simulateVoipScenario({
    scenario,
    to,
    from,
    callSid,
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

describe('Provider callbacks are processed once', () => {
  let admin = '';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    await testEnv.MASTER_DB.prepare("INSERT INTO settings (key, value) VALUES ('country', 'GB') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;
    expect((await call('POST', '/integrations/channels', admin, { channel: 'voice', address: AGENCY_NUMBER, provider: 'twilio', label: 'Once line' })).status).toBe(201);
    await testEnv.MASTER_DB
      .prepare(`INSERT INTO voip_settings (id, voip_provider, routing_strategy, default_caller_id, max_ring_duration) VALUES ('voip-once', 'twilio', 'assigned', ?, 25)`)
      .bind(AGENCY_NUMBER)
      .run();
    // A call-minute pack, so placing and finishing calls is allowed.
    await testEnv.MASTER_DB
      .prepare(`INSERT OR IGNORE INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source) VALUES ('0196a302-0000-7000-8000-0000000000c1', ?, 'call_minutes_100', 1, 100, ?, 'super_admin_grant')`)
      .bind(TENANT_ID, new Date().toISOString().slice(0, 7))
      .run();
  });

  // The mock numbers its calls from 1 after a reset; resetting between tests would reuse provider ids that call_logs already holds.
  beforeAll(() => MockVoipProvider.reset());

  describe('each simulator scenario played twice in a row leaves one of everything', () => {
    VOIP_SCENARIOS.forEach((scenario, i) => {
      it(scenario, async () => {
        const inbound = scenario.startsWith('inbound');
        const callSid = `CA${'0'.repeat(10)}once${i}${'0'.repeat(18)}`;
        const caller = `+91900009${String(200 + i)}`;
        const to = inbound ? AGENCY_NUMBER : CUSTOMER;
        const from = inbound ? caller : AGENCY_NUMBER;

        // Outbound calls exist in the log before the provider reports on them.
        if (!inbound) {
          await testEnv.MASTER_DB
            .prepare(`INSERT INTO call_logs (id, direction, from_number, to_number, status, provider_call_id, twilio_call_sid, created_by) VALUES (?, 'outbound', ?, ?, 'initiated', ?, ?, ?)`)
            .bind(`call-once-${i}`, AGENCY_NUMBER, CUSTOMER, callSid, callSid, ADMIN_ID)
            .run();
        }

        const first = await play(scenario, callSid, to, from);
        const after1 = {
          logs: await rows('SELECT status, duration_seconds FROM call_logs WHERE provider_call_id = ?', callSid),
          notes: await rows(`SELECT id FROM notifications WHERE type = 'missed_call' AND reference_id IN (SELECT id FROM call_logs WHERE provider_call_id = ?)`, callSid),
          tasks: await rows(`SELECT id FROM tasks WHERE title = ?`, `Call back ${caller}`),
          events: await rows('SELECT provider_call_id, event, sequence FROM provider_events WHERE provider_call_id = ?', callSid),
        };

        const second = await play(scenario, callSid, to, from);
        expect(first.steps.every((s) => s.status === 200)).toBe(true);
        expect(second.steps.every((s) => s.status === 200)).toBe(true);

        // One call row, and the replay changed nothing at all.
        expect(after1.logs).toHaveLength(1);
        expect(await rows('SELECT status, duration_seconds FROM call_logs WHERE provider_call_id = ?', callSid)).toEqual(after1.logs);
        expect(await rows(`SELECT id FROM notifications WHERE type = 'missed_call' AND reference_id IN (SELECT id FROM call_logs WHERE provider_call_id = ?)`, callSid)).toEqual(after1.notes);
        expect(await rows(`SELECT id FROM tasks WHERE title = ?`, `Call back ${caller}`)).toEqual(after1.tasks);
        expect(await rows('SELECT provider_call_id, event, sequence FROM provider_events WHERE provider_call_id = ?', callSid)).toEqual(after1.events);

        if (scenario === 'inbound_missed') {
          // One task, and each person told once (the ringing agent is also an admin: one note each, not two).
          expect(after1.tasks).toHaveLength(1);
          const perUser = await rows(
            `SELECT user_id, COUNT(*) AS n FROM notifications WHERE type = 'missed_call' AND reference_id IN (SELECT id FROM call_logs WHERE provider_call_id = ?) GROUP BY user_id`,
            callSid,
          );
          expect(perUser.length).toBeGreaterThanOrEqual(1);
          expect(perUser.every((r) => r.n === 1)).toBe(true);
          expect(await rows(`SELECT event FROM provider_events WHERE provider_call_id = ? AND event = 'missed'`, callSid)).toHaveLength(1);
        }
        if (scenario === 'inbound_answered' || scenario === 'outbound_answered') {
          expect(after1.logs[0]).toEqual({ status: 'completed', duration_seconds: 45 });
          // Call minutes counted once: 45 seconds is one minute.
          expect(await rows(`SELECT event_key FROM metered_events WHERE event_key = ?`, `call:${callSid}`)).toHaveLength(1);
        }
      });
    });
  });

  it('late callbacks never move a finished call backwards', async () => {
    const callSid = `CA${'0'.repeat(10)}late0${'0'.repeat(19)}`;
    await testEnv.MASTER_DB
      .prepare(`INSERT INTO call_logs (id, direction, from_number, to_number, status, provider_call_id, twilio_call_sid, created_by) VALUES ('call-late', 'outbound', ?, ?, 'initiated', ?, ?, ?)`)
      .bind(AGENCY_NUMBER, CUSTOMER, callSid, callSid, ADMIN_ID)
      .run();
    const fields = { CallSid: callSid, To: CUSTOMER, From: AGENCY_NUMBER, Direction: 'outbound-api' };
    // Out of order: completed first, then the earlier steps arrive.
    await webhook('/status-callback', { ...fields, CallStatus: 'completed', CallDuration: '70', SequenceNumber: '4' });
    await webhook('/status-callback', { ...fields, CallStatus: 'in-progress', SequenceNumber: '3' });
    await webhook('/status-callback', { ...fields, CallStatus: 'ringing', SequenceNumber: '2' });
    // And the completed one again.
    await webhook('/status-callback', { ...fields, CallStatus: 'completed', CallDuration: '70', SequenceNumber: '4' });
    expect((await rows('SELECT status, duration_seconds FROM call_logs WHERE id = ?', 'call-late'))[0]).toEqual({ status: 'completed', duration_seconds: 70 });
    expect(await rows(`SELECT event_key FROM metered_events WHERE event_key = ?`, `call:${callSid}`)).toHaveLength(1);
  });

  describe('inbound: the agent leg, the no-answer fallback and the miss', () => {
    const callSid = `CA${'0'.repeat(10)}dial0${'0'.repeat(19)}`;
    const caller = '+919000009301';
    let callLogId = '';

    it('rings the agent with a Dial whose action reaches dial-status, for the configured ring time', async () => {
      const res = await webhook('/twiml/inbound', { CallSid: callSid, From: caller, To: AGENCY_NUMBER });
      const xml = await res.text();
      expect(res.status).toBe(200);
      expect(xml).toContain('<Client>u_');
      callLogId = (await rows('SELECT id FROM call_logs WHERE provider_call_id = ?', callSid))[0].id;
      expect(xml).toMatch(new RegExp(`<Dial [^>]*action="[^"]*/api/v1/voip/twiml/dial-status\\?callLogId=${callLogId}"`));
      expect(xml).toMatch(/<Dial [^>]*timeout="25"/);
    });

    it('answered: dial-status ends quietly and nothing is missed', async () => {
      const res = await webhook(`/twiml/dial-status?callLogId=${callLogId}`, { CallSid: callSid, To: AGENCY_NUMBER, From: caller, DialCallStatus: 'completed' });
      expect(res.status).toBe(200);
      const xml = await res.text();
      expect(xml).not.toContain('<Record');
      expect(await rows(`SELECT event FROM provider_events WHERE provider_call_id = ? AND event = 'missed'`, callSid)).toHaveLength(0);
      expect(await rows(`SELECT id FROM tasks WHERE title = ?`, `Call back ${caller}`)).toHaveLength(0);
    });

    it('no answer: voicemail markup, and the call is missed once even when everything repeats and the status callback agrees', async () => {
      const send = () => webhook(`/twiml/dial-status?callLogId=${callLogId}`, { CallSid: callSid, To: AGENCY_NUMBER, From: caller, DialCallStatus: 'no-answer' });
      const res = await send();
      expect(res.status).toBe(200);
      const xml = await res.text();
      expect(xml).toContain('<Record');
      expect(xml).toContain('/api/v1/voip/recording-callback');

      await send();
      await webhook('/status-callback', { CallSid: callSid, CallStatus: 'no-answer', To: AGENCY_NUMBER, From: caller });
      await webhook('/status-callback', { CallSid: callSid, CallStatus: 'no-answer', To: AGENCY_NUMBER, From: caller });

      expect((await rows('SELECT status FROM call_logs WHERE id = ?', callLogId))[0].status).toBe('no-answer');
      expect(await rows(`SELECT event FROM provider_events WHERE provider_call_id = ? AND event = 'missed'`, callSid)).toHaveLength(1);
      expect(await rows(`SELECT id FROM tasks WHERE title = ?`, `Call back ${caller}`)).toHaveLength(1);
      expect(await rows(`SELECT id FROM domain_events WHERE type = 'call.missed' AND entity_id = ?`, callLogId)).toHaveLength(1);
      const perUser = await rows(`SELECT user_id, COUNT(*) AS n FROM notifications WHERE type = 'missed_call' AND reference_id = ? GROUP BY user_id`, callLogId);
      expect(perUser.length).toBeGreaterThanOrEqual(1);
      expect(perUser.every((r) => r.n === 1)).toBe(true);
    });

    it('a busy agent is missed the same way, and with voicemail switched off the caller is told and hung up on', async () => {
      const sid = `CA${'0'.repeat(10)}busy0${'0'.repeat(19)}`;
      await webhook('/twiml/inbound', { CallSid: sid, From: '+919000009302', To: AGENCY_NUMBER });
      const id = (await rows('SELECT id FROM call_logs WHERE provider_call_id = ?', sid))[0].id;
      await testEnv.MASTER_DB.prepare(`UPDATE voip_settings SET voicemail_enabled = 0 WHERE id = 'voip-once'`).run();
      try {
        const res = await webhook(`/twiml/dial-status?callLogId=${id}`, { CallSid: sid, To: AGENCY_NUMBER, From: '+919000009302', DialCallStatus: 'busy' });
        const xml = await res.text();
        expect(xml).toContain('<Hangup/>');
        expect(xml).not.toContain('<Record');
      } finally {
        await testEnv.MASTER_DB.prepare(`UPDATE voip_settings SET voicemail_enabled = 1 WHERE id = 'voip-once'`).run();
      }
      expect(await rows(`SELECT event FROM provider_events WHERE provider_call_id = ? AND event = 'missed'`, sid)).toHaveLength(1);
    });

    it('a recording callback repeated stores the recording once', async () => {
      const fields = { CallSid: callSid, RecordingSid: 'RE-once-1', RecordingUrl: 'https://api.twilio.com/rec/RE-once-1', RecordingDuration: '9' };
      await webhook('/recording-callback', fields);
      await testEnv.MASTER_DB.prepare('UPDATE call_logs SET recording_duration = 1 WHERE id = ?').bind(callLogId).run();
      await webhook('/recording-callback', fields);
      // The repeat was a no-op: it did not overwrite what is there.
      expect((await rows('SELECT recording_url, recording_duration FROM call_logs WHERE id = ?', callLogId))[0]).toEqual({ recording_url: 'https://api.twilio.com/rec/RE-once-1.mp3', recording_duration: 1 });
    });
  });

  describe('outbound: the agent leg exists', () => {
    it('softphone (the default) rings the agent app first and the customer second', async () => {
      const placed = MockVoipProvider.calls.length;
      const res = await call('POST', '/calls/outbound', admin, { toNumber: CUSTOMER });
      expect(res.status).toBe(201);
      const data = ((await res.json()) as any).data;
      expect(MockVoipProvider.calls).toHaveLength(placed + 1);
      expect(MockVoipProvider.calls.at(-1)).toMatchObject({
        providerCallId: data.providerCallId,
        mode: 'softphone',
        agentLeg: `client:u_${ADMIN_ID.replace(/-/g, '')}`,
        from: AGENCY_NUMBER,
        to: CUSTOMER,
      });
      const log = (await rows('SELECT provider_call_id, direction, created_by FROM call_logs WHERE id = ?', data.callLogId))[0];
      expect(log).toEqual({ provider_call_id: data.providerCallId, direction: 'outbound', created_by: ADMIN_ID });
    });

    it('bridge rings the agent\'s own phone first, then the customer; the lead and contact stay linked', async () => {
      const contact = await call('POST', '/contacts', admin, { name: 'Bridge Customer', phone: CUSTOMER, type: 'customer' });
      const contactId = ((await contact.json()) as any).data.id;
      const leadRes = await call('POST', '/leads', admin, { contactId, title: 'Bridge trip', destinations: ['Goa'], travelDate: '2026-12-20', tripType: 'family', source: 'manual' });
      const leadId = ((await leadRes.json()) as any).data.id;

      const res = await call('POST', '/calls/outbound', admin, { toNumber: CUSTOMER, leadId, mode: 'bridge', agentNumber: '+447700900123' });
      expect(res.status).toBe(201);
      const data = ((await res.json()) as any).data;
      expect(MockVoipProvider.calls.at(-1)).toMatchObject({ mode: 'bridge', agentLeg: '+447700900123', to: CUSTOMER, from: AGENCY_NUMBER });
      const log = (await rows('SELECT lead_id, contact_id FROM call_logs WHERE id = ?', data.callLogId))[0];
      expect(log).toEqual({ lead_id: leadId, contact_id: contactId });
    });

    it('bridge without any phone for the agent is refused before the provider is touched', async () => {
      await testEnv.MASTER_DB.prepare('UPDATE users SET phone = NULL WHERE id = ?').bind(ADMIN_ID).run();
      const placed = MockVoipProvider.calls.length;
      const res = await call('POST', '/calls/outbound', admin, { toNumber: CUSTOMER, mode: 'bridge' });
      expect(res.status).toBe(422);
      expect(MockVoipProvider.calls).toHaveLength(placed);
    });
  });
});
