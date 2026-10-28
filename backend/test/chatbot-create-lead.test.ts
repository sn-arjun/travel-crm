import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

interface Conversation {
  id: string;
  channel?: string;
  visitorName?: string | null;
  visitorEmail?: string | null;
  visitorPhone?: string | null;
  contactId?: string | null;
  qualification?: Record<string, unknown> | null;
}

async function insertConversation(conv: Conversation): Promise<void> {
  await testEnv.MASTER_DB.prepare(
    `INSERT INTO chatbot_conversations (id, channel, visitor_name, visitor_email, visitor_phone, contact_id, qualification_data, status, messages)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', '[]')`,
  )
    .bind(
      conv.id,
      conv.channel ?? 'website',
      conv.visitorName ?? null,
      conv.visitorEmail ?? null,
      conv.visitorPhone ?? null,
      conv.contactId ?? null,
      conv.qualification ? JSON.stringify(conv.qualification) : null,
    )
    .run();
}

let adminToken = '';

describe('Chatbot: create lead from a conversation', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, {
      email: 'admin@e2e.test',
      password: 'password123',
      tenantId: TENANT_ID,
    });
    expect(login.status).toBe(200);
    adminToken = ((await login.json()) as any).data.accessToken;

    // ai_chatbot is not part of the test tenant's plan; grant it explicitly.
    await testEnv.MASTER_DB.prepare(
      "INSERT OR REPLACE INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES ('chatbot-lead-flag', ?, 'ai_chatbot', 1)",
    )
      .bind(TENANT_ID)
      .run();
  });

  it('creates a contact and a lead for an unlinked visitor, and links both to the conversation', async () => {
    await insertConversation({
      id: 'conv-visitor-1',
      visitorName: 'Farah Khan',
      visitorPhone: '98200 11223',
      visitorEmail: 'Farah.Khan@example.com',
      qualification: { destination: 'Munnar', travelers: 4, budget: '₹85,000' },
    });

    const res = await call('POST', '/chatbot/conversations/conv-visitor-1/create-lead', adminToken);
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.created).toBe(true);
    const { leadId, contactId } = body.data as { leadId: string; contactId: string };

    const lead: any = await (await call('GET', `/leads/${leadId}`, adminToken)).json();
    expect(lead.success).toBe(true);
    expect(lead.data.contactId ?? lead.data.contact_id).toBe(contactId);
    expect(lead.data.status).toBe('new');
    expect(lead.data.source).toBe('website');
    expect(JSON.stringify(lead.data)).toContain('Munnar');
    expect(lead.data.budget).toBe(85000);
    expect(lead.data.paxAdults ?? lead.data.pax_adults).toBe(4);

    const contact: any = await (await call('GET', `/contacts/${contactId}`, adminToken)).json();
    expect(contact.data.name).toBe('Farah Khan');
    expect(contact.data.phone).toBe('+919820011223');
    expect(contact.data.email).toBe('farah.khan@example.com');

    const conv: any = await (await call('GET', '/chatbot/conversations/conv-visitor-1', adminToken)).json();
    const convData = conv.data;
    expect(convData.lead_id ?? convData.leadId).toBe(leadId);
    expect(convData.contact_id ?? convData.contactId).toBe(contactId);
    expect(convData.status).toBe('qualified');
  });

  it('is idempotent: a second call returns the same lead and creates nothing', async () => {
    const first: any = await (await call('GET', '/chatbot/conversations/conv-visitor-1', adminToken)).json();
    const existingLead = first.data.lead_id ?? first.data.leadId;

    const res = await call('POST', '/chatbot/conversations/conv-visitor-1/create-lead', adminToken);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.data.leadId).toBe(existingLead);
    expect(body.data.created).toBe(false);
  });

  it('reuses an existing contact matched by phone instead of creating a duplicate', async () => {
    const created: any = await (
      await call('POST', '/contacts', adminToken, { name: 'Devika Rao', phone: '+919845012345', type: 'customer' })
    ).json();
    expect(created.success).toBe(true);

    await insertConversation({ id: 'conv-known-phone', channel: 'whatsapp', visitorName: 'Devika', visitorPhone: '9845012345' });
    const res = await call('POST', '/chatbot/conversations/conv-known-phone/create-lead', adminToken);
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.data.contactId).toBe(created.data.id);

    const lead: any = await (await call('GET', `/leads/${body.data.leadId}`, adminToken)).json();
    expect(lead.data.source).toBe('whatsapp');
  });

  it('uses the linked contact when the conversation already has one', async () => {
    const created: any = await (
      await call('POST', '/contacts', adminToken, { name: 'Imran Sheikh', email: 'imran@example.com', type: 'customer' })
    ).json();
    await insertConversation({ id: 'conv-linked', contactId: created.data.id });
    const res = await call('POST', '/chatbot/conversations/conv-linked/create-lead', adminToken);
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).data.contactId).toBe(created.data.id);
  });

  it('asks for visitor details when there is nothing to identify the visitor', async () => {
    await insertConversation({ id: 'conv-anonymous' });
    const res = await call('POST', '/chatbot/conversations/conv-anonymous/create-lead', adminToken);
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).toMatch(/name, phone or email/i);
  });

  it('returns 404 for an unknown conversation', async () => {
    const res = await call('POST', '/chatbot/conversations/does-not-exist/create-lead', adminToken);
    expect(res.status).toBe(404);
  });
});
