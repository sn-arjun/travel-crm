import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { conditionHolds, validateRule, canRunAutomatically, describeRule, type CustomRuleInput } from '../src/services/automation/custom-rules';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

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

async function data(res: Response): Promise<any> {
  return ((await res.json()) as any).data;
}

async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

let admin = '';
let sales = '';

async function login(email: string): Promise<string> {
  return (await data(await call('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID }))).accessToken;
}

async function contact(name: string, phone: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await call('POST', '/contacts', admin, { name, phone, type: 'customer', ...extra });
  expect(res.status).toBe(201);
  return (await data(res)).id;
}

async function lead(contactId: string, title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await call('POST', '/leads', admin, {
    contactId, title, destinations: ['Goa'], travelDate: isoDay(60), tripType: 'family', source: 'website', assignedTo: ADMIN_ID, ...extra,
  });
  expect(res.status).toBe(201);
  return (await data(res)).id;
}

async function createRule(rule: Record<string, unknown>, token = admin): Promise<Response> {
  return call('POST', '/automations/custom', token, rule);
}

async function forLead(leadId: string, ruleKey: string, status = 'all'): Promise<any[]> {
  const all = await data(await call('GET', `/assistant/suggestions?leadId=${leadId}&status=${status}`, admin));
  return all.filter((s: any) => s.ruleKey === ruleKey);
}

describe('Custom rules: building blocks', () => {
  it('compares text without caring about case, and numbers as numbers', () => {
    expect(conditionHolds({ field: 'trip_type', op: 'equals', value: 'Honeymoon' }, 'honeymoon')).toBe(true);
    expect(conditionHolds({ field: 'destination', op: 'contains', value: 'bali' }, 'Bali, Lombok')).toBe(true);
    expect(conditionHolds({ field: 'source', op: 'not_equals', value: 'website' }, 'referral')).toBe(true);
    expect(conditionHolds({ field: 'budget', op: 'greater_than', value: '200000' }, 250000)).toBe(true);
    expect(conditionHolds({ field: 'budget', op: 'greater_than', value: '200000' }, 200000)).toBe(false);
    expect(conditionHolds({ field: 'days_to_travel', op: 'less_than', value: '14' }, 7)).toBe(true);
  });

  it('a missing value never satisfies a condition, except "is not"', () => {
    expect(conditionHolds({ field: 'budget', op: 'greater_than', value: '0' }, null)).toBe(false);
    expect(conditionHolds({ field: 'budget', op: 'less_than', value: '100' }, null)).toBe(false);
    expect(conditionHolds({ field: 'trip_type', op: 'equals', value: 'family' }, '')).toBe(false);
    expect(conditionHolds({ field: 'trip_type', op: 'not_equals', value: 'family' }, null)).toBe(true);
  });

  const base: CustomRuleInput = {
    name: 'Big budget',
    trigger: 'lead.created',
    conditions: [{ field: 'budget', op: 'greater_than', value: '200000' }],
    actions: [{ type: 'create_task', title: 'Call {{customer_name}}', dueInDays: 0, priority: 'high' }],
    mode: 'suggest',
  };

  it('only rules whose every step is low risk may run on their own', () => {
    expect(canRunAutomatically(base.actions)).toBe(true);
    expect(canRunAutomatically([...base.actions, { type: 'draft_message', channel: 'whatsapp', body: 'Hi' }])).toBe(false);
    expect(validateRule({ ...base, mode: 'auto' })).toBeNull();
    expect(validateRule({ ...base, mode: 'auto', actions: [{ type: 'draft_message', channel: 'whatsapp', body: 'Hi' }] })).toMatch(/always asks first/);
  });

  it('refuses conditions that cannot work', () => {
    expect(validateRule({ ...base, conditions: [{ field: 'budget', op: 'contains', value: '2' }] })).toMatch(/cannot be compared/);
    expect(validateRule({ ...base, conditions: [{ field: 'budget', op: 'greater_than', value: 'lots' }] })).toMatch(/needs a number/);
    expect(validateRule({ ...base, conditions: [{ field: 'budget', op: 'greater_than', value: ' ' }] })).toMatch(/needs a value/);
    // "Payment amount" only exists when a payment is recorded.
    expect(validateRule({ ...base, conditions: [{ field: 'amount', op: 'greater_than', value: '1' }] })).toMatch(/cannot be used with this trigger/);
    expect(validateRule({ ...base, trigger: 'payment.recorded', conditions: [{ field: 'amount', op: 'greater_than', value: '1' }] })).toBeNull();
  });

  it('describes a rule in one sentence', () => {
    expect(describeRule(base, 'en-IN')).toBe('When a lead is created, and budget is more than 2,00,000: create the task "Call {{customer_name}}".');
    // The number grouping follows the agency locale, not India's.
    expect(describeRule(base, 'en-GB')).toContain('more than 200,000:');
  });
});

describe('Custom rules: in the workspace', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    admin = await login('admin@e2e.test');
    sales = await login('sales@e2e.test');
  });

  it('only an administrator can add, change or remove a rule', async () => {
    const rule = { name: 'Sales may not add this', trigger: 'lead.created', actions: [{ type: 'create_task', title: 'x' }] };
    expect((await createRule(rule, sales)).status).toBe(403);
    expect((await createRule(rule, null as unknown as string)).status).toBe(401);

    const created = await data(await createRule({ ...rule, name: 'Admin adds this' }));
    expect((await call('PUT', `/automations/custom/${created.id}`, sales, { ...rule, name: 'Renamed' })).status).toBe(403);
    expect((await call('DELETE', `/automations/custom/${created.id}`, sales)).status).toBe(403);
    expect((await call('DELETE', `/automations/custom/${created.id}`, admin)).status).toBe(200);
    expect((await call('DELETE', `/automations/custom/${created.id}`, admin)).status).toBe(404);
  });

  it('rejects rules that are not built from the allowed parts', async () => {
    const ok = { name: 'Valid enough', trigger: 'lead.created', actions: [{ type: 'create_task', title: 'x' }] };
    expect((await createRule({ ...ok, trigger: 'invoice.deleted' })).status).toBe(400);
    expect((await createRule({ ...ok, actions: [] })).status).toBe(400);
    // Money and record creation are not offered to rules at all.
    expect((await createRule({ ...ok, actions: [{ type: 'record_payment', invoiceId: 'i', amount: 1 }] })).status).toBe(400);
    expect((await createRule({ ...ok, actions: [{ type: 'advance_lead_status', status: 'won' }] })).status).toBe(400);
    expect((await createRule({ ...ok, mode: 'auto', actions: [{ type: 'draft_message', channel: 'whatsapp', body: 'Hi' }] })).status).toBe(400);
    expect((await createRule({ ...ok, conditions: [{ field: 'password_hash', op: 'equals', value: 'x' }] })).status).toBe(400);
    expect(await rows(`SELECT id FROM automation_rules WHERE recipe_key LIKE 'custom:%'`)).toHaveLength(0);
  });

  it('a rule in Suggest mode proposes its steps only when its conditions hold', async () => {
    const created = await data(await createRule({
      name: 'High value honeymoon',
      trigger: 'lead.created',
      conditions: [
        { field: 'trip_type', op: 'equals', value: 'honeymoon' },
        { field: 'budget', op: 'greater_than', value: '200000' },
      ],
      actions: [
        { type: 'create_task', title: 'Senior consultant to call {{customer_name}} about {{destination}}', dueInDays: 0, priority: 'high' },
        { type: 'draft_message', channel: 'whatsapp', body: 'Hi {{first_name}}, congratulations! We would love to plan your {{destination}} honeymoon.' },
      ],
    }));
    expect(created.key).toBe(`custom:${created.id}`);

    const contactId = await contact('Ananya Rao', '9000002001');
    const match = await lead(contactId, 'Maldives honeymoon', { tripType: 'honeymoon', budget: 350000, destinations: ['Maldives'] });
    const tooSmall = await lead(contactId, 'Budget honeymoon', { tripType: 'honeymoon', budget: 90000 });
    const wrongType = await lead(contactId, 'Family trip', { tripType: 'family', budget: 500000 });

    const proposed = await forLead(match, created.key);
    expect(proposed).toHaveLength(2);
    const task = proposed.find((s) => s.action.type === 'create_task');
    expect(task.status).toBe('pending');
    expect(task.title).toBe('Senior consultant to call Ananya Rao about Maldives');
    expect(task.ruleTitle).toBe('High value honeymoon');
    expect(task.reason).toBe('Your rule "High value honeymoon"');
    const draft = proposed.find((s) => s.action.type === 'draft_reply');
    expect(draft.params.body).toBe('Hi Ananya, congratulations! We would love to plan your Maldives honeymoon.');
    expect(draft.action.clientHandled).toBe(true);

    expect(await forLead(tooSmall, created.key)).toHaveLength(0);
    expect(await forLead(wrongType, created.key)).toHaveLength(0);

    // One click creates the task for the lead owner.
    expect((await call('POST', `/assistant/suggestions/${task.id}/apply`, admin, {})).status).toBe(200);
    const tasks = await rows('SELECT title, priority, assigned_to FROM tasks WHERE related_lead_id = ?', match);
    expect(tasks).toEqual([{ title: 'Senior consultant to call Ananya Rao about Maldives', priority: 'high', assigned_to: ADMIN_ID }]);
  });

  it('a rule in Auto mode runs without a click and can be undone', async () => {
    const created = await data(await createRule({
      name: 'Negotiation follow-up',
      trigger: 'lead.status_changed',
      conditions: [{ field: 'new_status', op: 'equals', value: 'negotiation' }],
      actions: [{ type: 'create_task', title: 'Prepare final price for {{lead_title}}', dueInDays: 1, priority: 'high' }],
      mode: 'auto',
    }));

    const contactId = await contact('Auto Rule', '9000002002');
    const leadId = await lead(contactId, 'Auto rule lead');
    expect((await call('PUT', `/leads/${leadId}/status`, admin, { status: 'contacted' })).status).toBe(200);
    expect(await forLead(leadId, created.key)).toHaveLength(0);

    expect((await call('PUT', `/leads/${leadId}/status`, admin, { status: 'negotiation' })).status).toBe(200);
    const [done] = await forLead(leadId, created.key);
    expect(done.status).toBe('auto_applied');
    expect(await rows('SELECT title FROM tasks WHERE related_lead_id = ? AND title LIKE ?', leadId, 'Prepare final price%')).toHaveLength(1);

    // Moving away and back does not create the task a second time.
    await call('PUT', `/leads/${leadId}/status`, admin, { status: 'proposal_sent' });
    await call('PUT', `/leads/${leadId}/status`, admin, { status: 'negotiation' });
    expect(await rows('SELECT title FROM tasks WHERE related_lead_id = ? AND title LIKE ?', leadId, 'Prepare final price%')).toHaveLength(1);

    expect((await call('POST', `/assistant/suggestions/${done.id}/undo`, admin)).status).toBe(200);
    expect(await rows('SELECT title FROM tasks WHERE related_lead_id = ? AND title LIKE ? AND COALESCE(is_deleted, 0) = 0', leadId, 'Prepare final price%')).toHaveLength(0);
  });

  it('never drafts a message to someone who opted out or has no number', async () => {
    const created = await data(await createRule({
      name: 'Welcome message',
      trigger: 'lead.created',
      conditions: [{ field: 'source', op: 'equals', value: 'referral' }],
      actions: [{ type: 'draft_message', channel: 'whatsapp', body: 'Welcome {{first_name}}' }],
    }));

    const optedOut = await contact('Opted Out', '9000002003');
    await testEnv.MASTER_DB.prepare('UPDATE contacts SET opted_out = 1 WHERE id = ?').bind(optedOut).run();
    const reachable = await contact('Reachable Person', '9000002004');

    const quiet = await lead(optedOut, 'Opted out lead', { source: 'referral' });
    const welcomed = await lead(reachable, 'Reachable lead', { source: 'referral' });
    expect(await forLead(quiet, created.key)).toHaveLength(0);
    expect(await forLead(welcomed, created.key)).toHaveLength(1);
  });

  it('switched off, changed and deleted rules behave accordingly', async () => {
    const rule = {
      name: 'Corporate desk',
      trigger: 'lead.created',
      conditions: [{ field: 'trip_type', op: 'equals', value: 'corporate' }],
      actions: [{ type: 'create_follow_up', inDays: 1, followUpType: 'call' }],
    };
    const created = await data(await createRule(rule));
    expect((await createRule(rule)).status).toBe(409);

    const contactId = await contact('Corporate Client', '9000002005');
    expect(await forLead(await lead(contactId, 'Offsite 1', { tripType: 'corporate' }), created.key)).toHaveLength(1);

    expect((await call('PUT', `/automations/custom/${created.id}`, admin, { ...rule, mode: 'off' })).status).toBe(200);
    expect(await forLead(await lead(contactId, 'Offsite 2', { tripType: 'corporate' }), created.key)).toHaveLength(0);

    expect((await call('PUT', `/automations/custom/${created.id}`, admin, { ...rule, mode: 'suggest' })).status).toBe(200);
    const third = await lead(contactId, 'Offsite 3', { tripType: 'corporate' });
    expect(await forLead(third, created.key)).toHaveLength(1);

    // The library lists it with a readable summary and its counts.
    const library = await data(await call('GET', '/automations', admin));
    const listed = library.customRules.find((r: any) => r.id === created.id);
    expect(listed).toMatchObject({ name: 'Corporate desk', mode: 'suggest', autoEligible: true });
    expect(listed.description).toBe('When a lead is created, and trip type is corporate: schedule a call follow-up in 1 day.');
    expect(listed.last30Days.suggested).toBe(2);
    expect(library.builder.triggers.length).toBeGreaterThan(0);

    // Deleting the rule stops it; what it already suggested stays, labelled as from a deleted rule.
    expect((await call('DELETE', `/automations/custom/${created.id}`, admin)).status).toBe(200);
    expect(await forLead(await lead(contactId, 'Offsite 4', { tripType: 'corporate' }), created.key)).toHaveLength(0);
    expect((await forLead(third, created.key))[0].ruleTitle).toBe('A rule that was deleted');
  });

  it('nothing runs while automations are paused', async () => {
    const created = await data(await createRule({ name: 'Paused check', trigger: 'lead.created', actions: [{ type: 'create_task', title: 'Paused check task' }] }));
    await call('PUT', '/automations/pause', admin, { paused: true });
    const contactId = await contact('Paused Person', '9000002006');
    const leadId = await lead(contactId, 'Paused lead');
    await call('PUT', '/automations/pause', admin, { paused: false });
    expect(await forLead(leadId, created.key)).toHaveLength(0);
  });
});
