import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { localDateString, addDaysLocal } from '../src/utils/tz';
import { firstIssueSentence, groupIssues, validationFailureBody } from '../src/utils/validator';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const DEMO_TENANT_ID = '01960000-0000-7000-8000-000000000001';

async function raw(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function json(method: string, path: string, token: string | null, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await raw(method, path, token, body);
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function login(email: string, password: string, tenantId: string): Promise<string> {
  const res = await raw('POST', '/auth/login', null, { email, password, tenantId });
  expect(res.status).toBe(200);
  return ((await res.json()) as any).data.accessToken;
}

let token = '';
let contactId = '';

async function newContact(name: string): Promise<string> {
  const res = await json('POST', '/contacts', token, { name, type: 'customer', email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com` });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function leadBody(over: Record<string, unknown> = {}) {
  return {
    contactId,
    title: 'Kerala backwaters for four',
    destinations: ['Kerala'],
    travelDate: '2027-01-15',
    tripType: 'domestic',
    source: 'website',
    ...over,
  };
}

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  const reset = await raw('POST', '/test/reset', null);
  expect(reset.status).toBe(200);
  token = await login('admin@e2e.test', 'password123', TENANT_ID);
  contactId = await newContact('Anita Rao');
});

// ─────────────────────────────────────────────────────────────
// BUG-027: static routes were shadowed by /:id routes
// ─────────────────────────────────────────────────────────────
describe('B12 route order: static paths are not swallowed by /:id (BUG-027)', () => {
  it('GET /calls/analytics and /calls/missed are not treated as a call id', async () => {
    for (const path of ['/calls/analytics', '/calls/missed']) {
      const res = await json('GET', path, token);
      // voip_calling is a plan feature, so a gated tenant may answer 403; what must never
      // happen is the /:id handler answering "Call log not found".
      expect(res.body?.error?.message, path).not.toBe('Call log not found');
      expect([200, 403], path).toContain(res.status);
    }
  });

  it('GET /fleet/vehicles/availability returns 200', async () => {
    const res = await json('GET', '/fleet/vehicles/availability?from=2027-01-01&to=2027-01-31', token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /fleet/drivers/schedule returns 200', async () => {
    const res = await json('GET', '/fleet/drivers/schedule?from=2027-01-01&to=2027-01-31', token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /fleet/vehicle-rate-cards/lookup finds a card created for that vehicle and trip type', async () => {
    const created = await json('POST', '/fleet/vehicle-rate-cards', token, {
      name: 'Sedan airport pickup',
      vehicleType: 'sedan',
      tripType: 'airport_pickup',
      baseFare: 450,
      perKmRate: 14,
    });
    expect(created.status).toBe(201);

    const res = await json('GET', '/fleet/vehicle-rate-cards/lookup?vehicleType=sedan&tripType=airport_pickup', token);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeTruthy();
    expect(res.body.data.id).toBe(created.body.data.id);
    expect(res.body.data.baseFare).toBe(450);
  });

  it('GET /fleet/vehicle-rate-cards/:id still resolves by id', async () => {
    const created = await json('POST', '/fleet/vehicle-rate-cards', token, {
      name: 'SUV outstation',
      vehicleType: 'suv',
      tripType: 'outstation',
      baseFare: 900,
    });
    const res = await json('GET', `/fleet/vehicle-rate-cards/${created.body.data.id}`, token);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('SUV outstation');
  });
});

// ─────────────────────────────────────────────────────────────
// BUG-028: every report executes
// ─────────────────────────────────────────────────────────────
describe('B12 reports: every registered report executes (BUG-028)', () => {
  it('returns 200 for every report id with date_preset=this_month', async () => {
    const list = await raw('GET', '/reports', token);
    expect(list.status).toBe(200);
    const reports: any[] = ((await list.json()) as any).data;
    expect(reports.length).toBeGreaterThan(20);
    const failures: string[] = [];
    for (const r of reports) {
      const res = await raw('GET', `/reports/${r.id}?date_preset=this_month`, token);
      if (res.status !== 200) failures.push(`${r.id} -> ${res.status} ${await res.text()}`);
    }
    expect(failures).toEqual([]);
  });

  it('returns 200 for every report id with no date range at all', async () => {
    const list = await raw('GET', '/reports', token);
    const reports: any[] = ((await list.json()) as any).data;
    const failures: string[] = [];
    for (const r of reports) {
      const res = await raw('GET', `/reports/${r.id}`, token);
      if (res.status !== 200) failures.push(`${r.id} -> ${res.status} ${await res.text()}`);
    }
    expect(failures).toEqual([]);
  });

  it('upcoming birthdays lists a contact whose birthday is a few days away', async () => {
    // birthdays are counted from the tenant's local today (Asia/Kolkata by default)
    const birthday = `1990-${addDaysLocal(localDateString('Asia/Kolkata'), 5).slice(5)}`;
    const created = await json('POST', '/contacts', token, { name: 'Birthday Person', type: 'customer', birthday });
    expect(created.status).toBe(201);

    // earlier tests cached empty results for these report ids
    await json('DELETE', '/reports/cache', token);
    const res = await json('GET', '/reports/birthday_upcoming?date_preset=this_month', token);
    expect(res.status).toBe(200);
    const row = res.body.data.data.find((r: any) => r.customer_name === 'Birthday Person');
    expect(row).toBeTruthy();
    expect(row.days_until_birthday).toBeGreaterThanOrEqual(4);
    expect(row.days_until_birthday).toBeLessThanOrEqual(5);
  });

  it('fleet utilization reports the registration number of a vehicle', async () => {
    const v = await json('POST', '/fleet/vehicles', token, { registrationNumber: 'KA01AB1234', type: 'sedan' });
    expect(v.status).toBe(201);
    await json('DELETE', '/reports/cache', token);
    const res = await json('GET', '/reports/fleet_utilization', token);
    expect(res.status).toBe(200);
    expect(res.body.data.data.some((r: any) => r.vehicle_reg === 'KA01AB1234')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// BUG-029: campaign recipients
// ─────────────────────────────────────────────────────────────
describe('B12 campaigns: recipients endpoint (BUG-029)', () => {
  it('GET /campaigns/:id/recipients returns 200 with the send time of each message', async () => {
    const campaignId = '01960000-0000-7000-8000-00000000c001';
    await testEnv.MASTER_DB.prepare(
      `INSERT INTO email_campaigns (id, name, subject, status, created_by) VALUES (?, 'Winter offers', 'Winter offers', 'sent', ?)`,
    ).bind(campaignId, '11111111-1111-1111-1111-111111111111').run();
    await testEnv.MASTER_DB.prepare(
      `INSERT INTO email_message_log (id, campaign_id, contact_id, recipient_email, status, failure_reason, created_at)
       VALUES (?, ?, ?, ?, 'failed', 'Mailbox full', '2027-01-02T10:00:00Z')`,
    ).bind('01960000-0000-7000-8000-00000000c002', campaignId, contactId, 'anita.rao@example.com').run();

    const res = await json('GET', `/campaigns/${campaignId}/recipients`, token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].sentAt).toBe('2027-01-02T10:00:00Z');
    expect(res.body.data[0].errorMessage).toBe('Mailbox full');
    expect(res.body.data[0].name).toBe('Anita Rao');
    expect(res.body.pagination.total).toBe(1);
  });

  it('returns an empty list for a campaign nobody was sent to', async () => {
    const res = await json('GET', '/campaigns/01960000-0000-7000-8000-00000000c0ff/recipients', token);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// BUG-061: readable validation errors
// ─────────────────────────────────────────────────────────────
describe('B12 validation errors are human-readable (BUG-061)', () => {
  it('POST /leads with source "walk_in" answers 400 with a sentence, not JSON', async () => {
    const res = await json('POST', '/leads', token, leadBody({ source: 'walk_in' }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(typeof res.body.error.message).toBe('string');
    expect(res.body.error.message).toMatch(/^source: /);
    expect(res.body.error.message).not.toMatch(/[\[\]{}]/);
    expect(res.body.error.message).not.toContain('"code"');
    expect(res.body.error.name).toBeUndefined();
    expect(Array.isArray(res.body.error.fields.source)).toBe(true);
    expect(res.body.errors).toEqual(res.body.error.fields);
  });

  it('reports a missing required field as "<field>: Required" and lists every failing field', async () => {
    const res = await json('POST', '/leads', token, { title: 'ab', destinations: [] });
    expect(res.status).toBe(400);
    const fields = res.body.error.fields;
    expect(fields.contactId).toEqual(['Required']);
    expect(Object.keys(fields)).toEqual(expect.arrayContaining(['contactId', 'title', 'destinations', 'travelDate', 'tripType', 'source']));
    expect(res.body.error.message).toBe(`${Object.keys(fields)[0]}: ${fields[Object.keys(fields)[0]][0]}`);
  });

  it('uses dotted paths for nested fields', () => {
    const issues = [{ path: ['items', 0, 'quantity'], message: 'Too small', code: 'too_small' }];
    expect(groupIssues(issues)).toEqual({ 'items.0.quantity': ['Too small'] });
    expect(firstIssueSentence(issues)).toBe('items.0.quantity: Too small');
  });

  it('puts root-level issues under "_" and never emits an empty message', () => {
    const body = validationFailureBody([{ path: [], message: 'Invalid input', code: 'invalid_type' }]);
    expect(body.error.message).toBe('Invalid input');
    expect(body.error.fields).toEqual({ _: ['Invalid input'] });
    expect(firstIssueSentence([])).toBe('Invalid request');
  });

  it('applies to query-string validation too', async () => {
    const res = await json('GET', '/fleet/vehicles/availability', token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toMatch(/^(from|to): /);
  });
});

// ─────────────────────────────────────────────────────────────
// BUG-070: leads can be left unassigned
// ─────────────────────────────────────────────────────────────
describe('B12 lead assignment on create (BUG-070)', () => {
  it('assignedTo: null leaves the lead unassigned and it appears in /leads/unassigned', async () => {
    const created = await json('POST', '/leads', token, leadBody({ title: 'Unassigned Goa weekend', assignedTo: null }));
    expect(created.status).toBe(201);
    expect(created.body.data.assignedTo).toBeNull();

    const fetched = await json('GET', `/leads/${created.body.data.id}`, token);
    expect(fetched.body.data.assignedTo).toBeNull();

    const unassigned = await json('GET', '/leads/unassigned', token);
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.data.some((l: any) => l.id === created.body.data.id)).toBe(true);
  });

  it('omitting assignedTo keeps auto-assignment (round-robin to an active salesperson)', async () => {
    const created = await json('POST', '/leads', token, leadBody({ title: 'Auto-assigned Manali trip' }));
    expect(created.status).toBe(201);
    expect(created.body.data.assignedTo).toBeTruthy();
  });

  it('an explicit assignedTo is still honoured', async () => {
    const created = await json('POST', '/leads', token, leadBody({
      title: 'Explicitly assigned Jaipur trip',
      assignedTo: '33333333-3333-3333-3333-333333333333',
    }));
    expect(created.status).toBe(201);
    expect(created.body.data.assignedTo).toBe('33333333-3333-3333-3333-333333333333');
  });
});

// ─────────────────────────────────────────────────────────────
// tasks: camelCase aliases
// ─────────────────────────────────────────────────────────────
describe('B12 tasks accept camelCase keys', () => {
  it('creates a task from camelCase and updates it from camelCase', async () => {
    const lead = await json('POST', '/leads', token, leadBody({ title: 'Lead for task', assignedTo: null }));
    const leadId = lead.body.data.id;

    const created = await json('POST', '/tasks', token, {
      title: 'Send the proposal',
      priority: 'high',
      dueDate: '2027-02-01',
      assignedTo: '33333333-3333-3333-3333-333333333333',
      relatedLeadId: leadId,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.due_date).toBe('2027-02-01');
    expect(created.body.data.assigned_to).toBe('33333333-3333-3333-3333-333333333333');
    expect(created.body.data.related_lead_id).toBe(leadId);

    const updated = await json('PUT', `/tasks/${created.body.data.id}`, token, { dueDate: '2027-02-09' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.due_date).toBe('2027-02-09');
  });

  it('snake_case still works and wins when both spellings are sent', async () => {
    const created = await json('POST', '/tasks', token, {
      title: 'Collect passport copies',
      due_date: '2027-03-01',
      dueDate: '2027-04-01',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.due_date).toBe('2027-03-01');
  });

  it('filters the list by camelCase assignedTo', async () => {
    const res = await json('GET', '/tasks?view=all&assignedTo=33333333-3333-3333-3333-333333333333', token);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((t: any) => t.assigned_to === '33333333-3333-3333-3333-333333333333')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// whoami
// ─────────────────────────────────────────────────────────────
describe('B12 GET /admin/whoami', () => {
  it('requires authentication', async () => {
    const res = await json('GET', '/admin/whoami', null);
    expect(res.status).toBe(401);
  });

  it('answers 200 {isSuperAdmin:false} for a tenant admin', async () => {
    const res = await json('GET', '/admin/whoami', token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { isSuperAdmin: false } });
  });

  it('answers false for the demo tenant admin', async () => {
    const demoToken = await login('admin@demo.com', 'Admin@123', DEMO_TENANT_ID);
    const res = await json('GET', '/admin/whoami', demoToken);
    expect(res.status).toBe(200);
    expect(res.body.data.isSuperAdmin).toBe(false);
  });

  it('answers false even for a tenant session whose email is in the super admin registry (R111: operators use their own token)', async () => {
    const email = 'sales@e2e.test';
    await testEnv.MASTER_DB.prepare('DELETE FROM super_admins WHERE lower(email) = ?').bind(email).run();
    const salesToken = await login(email, 'password123', TENANT_ID);
    expect((await json('GET', '/admin/whoami', salesToken)).body.data.isSuperAdmin).toBe(false);

    await testEnv.MASTER_DB.prepare(
      `INSERT INTO super_admins (id, email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)`,
    ).bind('01960000-0000-7000-8000-0000000000f9', email, 'Platform Owner', 'unused', 'super_admin').run();
    try {
      const res = await json('GET', '/admin/whoami', salesToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { isSuperAdmin: false } });
    } finally {
      await testEnv.MASTER_DB.prepare('DELETE FROM super_admins WHERE id = ?').bind('01960000-0000-7000-8000-0000000000f9').run();
    }
  });

  it('leaves the rest of /admin guarded for tenant admins', async () => {
    const res = await json('GET', '/admin/config', token);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────
// contactId filters
// ─────────────────────────────────────────────────────────────
describe('B12 contactId filters for the contact detail page', () => {
  let otherContactId = '';
  let leadId = '';
  let otherLeadId = '';

  beforeAll(async () => {
    otherContactId = await newContact('Vikram Shah');
    const mine = await json('POST', '/leads', token, leadBody({ title: 'Anita Singapore trip', assignedTo: null }));
    leadId = mine.body.data.id;
    const theirs = await json('POST', '/leads', token, leadBody({ contactId: otherContactId, title: 'Vikram Dubai trip', assignedTo: null }));
    otherLeadId = theirs.body.data.id;
  });

  it('GET /leads?contactId= returns only that contact\'s leads', async () => {
    const res = await json('GET', `/leads?contactId=${otherContactId}`, token);
    expect(res.status).toBe(200);
    expect(res.body.data.map((l: any) => l.id)).toEqual([otherLeadId]);

    const mine = await json('GET', `/leads?contactId=${contactId}&limit=100`, token);
    expect(mine.body.data.length).toBeGreaterThan(0);
    expect(mine.body.data.every((l: any) => l.contactId === contactId)).toBe(true);
    expect(mine.body.data.some((l: any) => l.id === otherLeadId)).toBe(false);
  });

  it('GET /itineraries?contactId= goes through the lead', async () => {
    const mk = async (forLead: string, title: string) => {
      const r = await json('POST', '/itineraries', token, { leadId: forLead, title, days: [{ dayNumber: 1, title: 'Arrival' }] });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.data.id as string;
    };
    const mineId = await mk(leadId, 'Singapore 5 nights');
    const theirsId = await mk(otherLeadId, 'Dubai 4 nights');

    const res = await json('GET', `/itineraries?contactId=${contactId}`, token);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((i: any) => i.id);
    expect(ids).toContain(mineId);
    expect(ids).not.toContain(theirsId);
  });

  it('GET /follow-ups?contactId= goes through the lead', async () => {
    const mk = async (forLead: string) => {
      const r = await json('POST', '/follow-ups', token, { leadId: forLead, scheduledAt: '2027-01-20T09:00:00.000Z', type: 'call' });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.data.id as string;
    };
    const mineId = await mk(leadId);
    const theirsId = await mk(otherLeadId);

    const res = await json('GET', `/follow-ups?contactId=${contactId}`, token);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((f: any) => f.id);
    expect(ids).toContain(mineId);
    expect(ids).not.toContain(theirsId);
  });

  it('GET /tasks?contactId= goes through the related lead', async () => {
    const mk = async (forLead: string, title: string) => {
      const r = await json('POST', '/tasks', token, { title, relatedLeadId: forLead });
      expect(r.status).toBe(201);
      return r.body.data.id as string;
    };
    const mineId = await mk(leadId, 'Book Singapore hotel');
    const theirsId = await mk(otherLeadId, 'Book Dubai hotel');

    const res = await json('GET', `/tasks?view=all&contactId=${contactId}`, token);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((t: any) => t.id);
    expect(ids).toContain(mineId);
    expect(ids).not.toContain(theirsId);
  });

  it('GET /documents?contactId= returns documents on the contact and on its leads', async () => {
    const insert = (id: string, relatedTo: string, relatedId: string) =>
      testEnv.MASTER_DB.prepare(
        `INSERT INTO documents (id, name, file_url, related_to, related_id, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, 0, '2027-01-01T00:00:00Z')`,
      ).bind(id, `${id}.pdf`, `docs/${id}.pdf`, relatedTo, relatedId).run();
    await insert('01960000-0000-7000-8000-00000000d001', 'contact', contactId);
    await insert('01960000-0000-7000-8000-00000000d002', 'lead', leadId);
    await insert('01960000-0000-7000-8000-00000000d003', 'lead', otherLeadId);
    await insert('01960000-0000-7000-8000-00000000d004', 'contact', otherContactId);

    const res = await json('GET', `/documents?contactId=${contactId}`, token);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((d: any) => d.id).sort();
    expect(ids).toEqual(['01960000-0000-7000-8000-00000000d001', '01960000-0000-7000-8000-00000000d002']);
  });
});

// ─────────────────────────────────────────────────────────────
// fleet dashboard: top drivers
// ─────────────────────────────────────────────────────────────
describe('B12 fleet dashboard top drivers', () => {
  it('lists active drivers even before any trip has been completed', async () => {
    for (const [name, phone] of [['Ramesh Kumar', '9876500011'], ['Suresh Patil', '9876500012'], ['Imran Khan', '9876500013']]) {
      const r = await json('POST', '/fleet/drivers', token, { name, phone });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    }
    const res = await json('GET', '/fleet/dashboard', token);
    expect(res.status).toBe(200);
    const names = res.body.data.topDrivers.map((d: any) => d.name);
    expect(names).toEqual(expect.arrayContaining(['Ramesh Kumar', 'Suresh Patil', 'Imran Khan']));
    expect(res.body.data.topDrivers[0]).toEqual(expect.objectContaining({ id: expect.any(String), totalTrips: expect.any(Number) }));
  });

  it('ranks drivers by completed trips', async () => {
    const drivers = await json('GET', '/fleet/drivers?limit=50', token);
    const imran = drivers.body.data.find((d: any) => d.name === 'Imran Khan');
    const veh = await json('POST', '/fleet/vehicles', token, { registrationNumber: 'MH12ZZ9999', type: 'suv' });
    const now = '2027-01-10T10:00:00Z';
    for (let i = 0; i < 2; i++) {
      await testEnv.MASTER_DB.prepare(
        `INSERT INTO trip_assignments (id, tenant_id, vehicle_id, driver_id, pickup_location, drop_location, pickup_datetime, status, is_deleted, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, 'Airport', 'Hotel', ?, 'completed', 0, ?, ?, ?)`,
      ).bind(`01960000-0000-7000-8000-00000000e00${i}`, TENANT_ID, veh.body.data.id, imran.id, now, now, now, now).run();
    }
    const res = await json('GET', '/fleet/dashboard', token);
    expect(res.body.data.topDrivers[0].name).toBe('Imran Khan');
    expect(res.body.data.topDrivers[0].totalTrips).toBe(2);
  });
});
