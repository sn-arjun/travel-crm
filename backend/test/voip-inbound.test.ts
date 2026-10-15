import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { AIExtractionService } from '../src/services/ai-extraction';
import { TwilioVoipProvider } from '../src/services/twilio-voice';
import worker from '../src/index';
import { twilioSignature } from '../src/middleware/provider-signature';
import { handleAIExtractionQueue } from '../src/queues/ai-extraction-queue';

// The extraction model is never called for real: the service returns a canned result.
const CANNED = {
  destination: 'Goa', travelDates: null, paxCount: 2, paxDetails: null, budget: 50000, budgetCurrency: 'INR',
  preferences: [], tripType: 'family', hotelPreference: null, mealPreference: null, specialRequests: null,
  summary: ['Wants Goa'], keyTopics: ['goa'],
  actionItems: [
    { text: 'Send the Goa quote', dueDate: '2026-12-01', completed: false },
    { text: 'Confirm passports', completed: false },
  ],
  sentiment: 'positive', sentimentScore: 0.8, dealLikelihood: 0.7, likelihoodSignals: [], coachingHints: [],
  overallConfidence: 0.9, fieldConfidences: {}, modelUsed: 'test-model', inputTokens: 10, outputTokens: 5, costEstimate: 0,
};

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const AGENCY_NUMBER = '+918047182291';
const LEAD = { destinations: ['Goa'], travelDate: '2026-12-20', tripType: 'family', source: 'manual' };

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

async function webhook(path: string, fields: Record<string, string>): Promise<Response> {
  const base = testEnv.API_PUBLIC_URL ? String(testEnv.API_PUBLIC_URL).replace(/[/]+$/, '') : 'http://localhost';
  const signature = await twilioSignature(`${base}/api/v1/voip${path}`, fields, testEnv.TWILIO_AUTH_TOKEN);
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

describe('Inbound calls are logged and routed on the real schema', () => {
  let admin = '';
  let contactId = '';
  let leadId = '';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    // R301: calling is offered only in some countries; these agencies are in the UK.
    await testEnv.MASTER_DB.prepare("INSERT INTO settings (key, value) VALUES ('country', 'GB') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;
    expect((await call('POST', '/integrations/channels', admin, { channel: 'voice', address: AGENCY_NUMBER, provider: 'twilio', label: 'Inbound line' })).status).toBe(201);

    const contact = await call('POST', '/contacts', admin, { name: 'Known Caller', phone: '+91 90000 05001', type: 'customer' });
    contactId = ((await contact.json()) as any).data.id;
    // A closed lead and an open one: the call must attach to the open one.
    const closed = await call('POST', '/leads', admin, { ...LEAD, contactId, title: 'Old lost trip' });
    const closedBody = (await closed.json()) as any;
    if (!closedBody.data) throw new Error(JSON.stringify(closedBody));
    const closedId = closedBody.data.id;
    await testEnv.MASTER_DB.prepare(`UPDATE leads SET status = 'lost' WHERE id = ?`).bind(closedId).run();
    const open = await call('POST', '/leads', admin, { ...LEAD, contactId, title: 'Goa family trip' });
    leadId = ((await open.json()) as any).data.id;

    await testEnv.MASTER_DB.prepare(`INSERT INTO voip_settings (id, voip_provider, routing_strategy) VALUES ('voip-inbound', 'twilio', 'assigned')`).run();
  });

  it('a call from an unknown number is logged with no creator and rings an agent', async () => {
    const res = await webhook('/twiml/inbound', { CallSid: 'CA-in-unknown', From: '+919000099999', To: AGENCY_NUMBER });
    expect(res.status).toBe(200);
    const xml = await res.text();
    // No owner exists for a stranger: the default 'assigned' strategy shares the call among active agents
    expect(xml).toContain('<Client>u_');

    const log = (await rows(`SELECT direction, created_by, contact_id, lead_id, routed_to, status FROM call_logs WHERE provider_call_id = 'CA-in-unknown'`))[0];
    expect(log).toMatchObject({ direction: 'inbound', created_by: null, contact_id: null, lead_id: null, status: 'ringing' });
    expect(log.routed_to).toBeTruthy();
    expect(xml).toContain(`<Client>u_${String(log.routed_to).replace(/-/g, '')}</Client>`);
  });

  it('a call from a known contact with an open lead is linked to both and goes to the lead owner', async () => {
    await testEnv.MASTER_DB.prepare('UPDATE leads SET assigned_to = ? WHERE id = ?').bind(ADMIN_ID, leadId).run();
    // The number is stored with spaces and a +; the caller arrives in E.164.
    const res = await webhook('/twiml/inbound', { CallSid: 'CA-in-known', From: '+919000005001', To: AGENCY_NUMBER });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(`<Client>u_${ADMIN_ID.replace(/-/g, '')}</Client>`);

    const log = (await rows(`SELECT created_by, contact_id, lead_id, routed_to FROM call_logs WHERE provider_call_id = 'CA-in-known'`))[0];
    expect(log).toEqual({ created_by: null, contact_id: contactId, lead_id: leadId, routed_to: ADMIN_ID });
  });

  it('the same webhook repeated does not log the call twice', async () => {
    await webhook('/twiml/inbound', { CallSid: 'CA-in-known', From: '+919000005001', To: AGENCY_NUMBER });
    expect(await rows(`SELECT id FROM call_logs WHERE provider_call_id = 'CA-in-known'`)).toHaveLength(1);
  });

  it('caller-info finds the contact and their open lead (the phone parameter)', async () => {
    const res = await call('GET', '/voip/caller-info?phone=%2B919000005001', admin);
    expect(res.status).toBe(200);
    const data = ((await res.json()) as any).data;
    expect(data.isKnown).toBe(true);
    expect(data.contact.id).toBe(contactId);
    expect(data.lead.id).toBe(leadId);
  });

  it('the routed agent can save the outcome of an inbound call, and the lead status change reaches the automations', async () => {
    const logId = (await rows(`SELECT id FROM call_logs WHERE provider_call_id = 'CA-in-known'`))[0].id;
    const res = await call('PUT', `/calls/${logId}`, admin, { outcome: 'interested', notes: 'Wants Goa' });
    expect(res.status).toBe(200);
    expect((await rows('SELECT status FROM leads WHERE id = ?', leadId))[0].status).toBe('contacted');
    const events = await rows(`SELECT payload FROM domain_events WHERE type = 'lead.status_changed' AND entity_id = ?`, leadId);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(events[0].payload)).toEqual({ from: 'new', to: 'contacted' });
  });

  it('a call started from a lead keeps the lead link and the lead contact', async () => {
    await testEnv.MASTER_DB.prepare(`UPDATE voip_settings SET default_caller_id = '+918047182291' WHERE id = 'voip-inbound'`).run();
    // R110: call minutes are metered; this agency needs a call-minute pack for the month before it can place a call.
    await testEnv.MASTER_DB
      .prepare(`INSERT OR IGNORE INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source) VALUES ('0196a110-0000-7000-8000-0000000000c1', ?, 'call_minutes_100', 1, 100, ?, 'super_admin_grant')`)
      .bind(TENANT_ID, new Date().toISOString().slice(0, 7))
      .run();
    // Never reach the real provider
    vi.spyOn(TwilioVoipProvider.prototype, 'placeCall').mockResolvedValue({ providerCallId: 'CA-out-lead', status: 'queued', direction: 'outbound', from: '+918047182291', to: '+919000005001' } as any);
    const res = await call('POST', '/calls/outbound', admin, { toNumber: '+919000005001', leadId });
    expect(res.status).toBe(201);
    const id = ((await res.json()) as any).data.callLogId;
    const log = (await rows('SELECT lead_id, contact_id, created_by, direction FROM call_logs WHERE id = ?', id))[0];
    expect(log).toEqual({ lead_id: leadId, contact_id: contactId, created_by: ADMIN_ID, direction: 'outbound' });
  });

  it('extraction action items become follow-ups on the call lead, on the real columns', async () => {
    await testEnv.MASTER_DB
      .prepare(`INSERT INTO call_logs (id, contact_id, lead_id, direction, from_number, to_number, status, routed_to, created_by) VALUES ('call-extract', ?, ?, 'inbound', '+919000005001', ?, 'completed', ?, NULL)`)
      .bind(contactId, leadId, AGENCY_NUMBER, ADMIN_ID).run();
    await testEnv.MASTER_DB
      .prepare(`INSERT INTO call_transcripts (id, call_log_id, full_transcript) VALUES ('tr-extract', 'call-extract', 'We want Goa for two')`).run();

    vi.spyOn(AIExtractionService.prototype, 'extractFromTranscript').mockResolvedValue(CANNED as any);
    const acked: string[] = [];
    await handleAIExtractionQueue(
      { messages: [{ body: { type: 'extract_lead', callLogId: 'call-extract', transcriptId: 'tr-extract', tenantId: TENANT_ID }, ack: () => acked.push('ack'), retry: () => acked.push('retry') }] } as any,
      testEnv,
    );
    expect(acked).toEqual(['ack']);

    const followUps = await rows(`SELECT lead_id, type, status, scheduled_at, notes, created_by FROM follow_ups WHERE notes IN ('Send the Goa quote', 'Confirm passports') ORDER BY notes DESC`);
    expect(followUps).toHaveLength(2);
    expect(followUps[0]).toMatchObject({ lead_id: leadId, type: 'call', status: 'pending', created_by: ADMIN_ID, notes: 'Send the Goa quote' });
    expect(followUps[0].scheduled_at).toMatch(/^2026-12-01T/);
    expect(followUps[1].scheduled_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
