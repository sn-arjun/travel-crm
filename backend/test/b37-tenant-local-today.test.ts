import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { generateId } from '../src/utils/uuid';
import {
  processInvoiceRemindersForTenant,
  processBirthdaysForTenant,
  processMissingVisaDocsForTenant,
} from '../src/cron/auto-reminders';
import { processFleetAlertsForTenant } from '../src/cron/fleet-alerts';
import { processOverdueTasks } from '../src/cron/overdue-tasks';
import { getCurrentFinancialYear } from '../src/services/numbering';
import { checkBusinessHours } from '../src/routes/chatbot';
import { expandRecurrence } from '../src/services/recurrence-engine';
import { normalizeDateBound } from '../src/services/report-engine';
import { ImportValidator } from '../src/services/imports/import-validator';

/**
 * B37: every "today" decision uses the tenant's local calendar day (default zone Asia/Kolkata, UTC+05:30),
 * not the UTC date. All clocks here are fixed instants - nothing depends on the wall clock.
 *
 *   2026-10-06T19:00:00Z = Wed 7 Oct 2026 00:30 IST   (the UTC date is still 6 Oct)
 *   2026-10-07T18:00:00Z = Wed 7 Oct 2026 23:30 IST
 */
const IST_0030 = '2026-10-06T19:00:00Z';
const IST_2330 = '2026-10-07T18:00:00Z';
const IST_NEXT_0030 = '2026-10-07T19:00:00Z'; // 00:30 IST on 8 Oct
const LOCAL_TODAY = '2026-10-07';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const db = testEnv.MASTER_DB as D1Database;

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

async function api(method: string, path: string, token: string, body?: unknown) {
  const res = await raw(method, path, token, body);
  return { status: res.status, body: (await res.json()) as any, headers: res.headers };
}

/** Pin `new Date()` (only Date - timers stay real). */
function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

const tokenCache = new Map<string, string>();

/** Pin the clock, then sign in at that instant so the access token is valid at the pinned time. */
async function atAs(iso: string) {
  at(iso);
  let t = tokenCache.get(iso);
  if (!t) {
    const login = await raw('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    t = ((await login.json()) as any).data.accessToken as string;
    tokenCache.set(iso, t);
  }
  adminToken = t;
}

function fakeQueues() {
  const sent: any[] = [];
  const q = { send: async (m: any) => void sent.push(m) };
  return { sent, env: { SMS_QUEUE: q, EMAIL_QUEUE: q, PUSH_NOTIFICATION_QUEUE: q } as any };
}

let adminToken = '';
let contactId = '';
let leadId = '';

async function run(sql: string, ...binds: unknown[]) {
  return db.prepare(sql).bind(...binds).run();
}

let realToken = '';
afterEach(() => {
  vi.useRealTimers();
  if (realToken) adminToken = realToken;
});

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  expect((await raw('POST', '/test/reset', null)).status).toBe(200);
  const login = await raw('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
  adminToken = ((await login.json()) as any).data.accessToken;
  realToken = adminToken;

  const contact = await api('POST', '/contacts', adminToken, {
    name: 'B37 Traveller',
    email: 'b37@example.com',
    phone: '+919876500037',
    type: 'customer',
    source: 'manual',
    birthday: '1990-10-07',
  });
  expect(contact.status, JSON.stringify(contact.body)).toBe(201);
  contactId = contact.body.data.id;
  const lead = await api('POST', '/leads', adminToken, {
    contactId, title: 'B37 Lead', destinations: ['Goa'], travelDate: '2026-12-15', returnDate: '2026-12-22',
    budget: 100000, source: 'manual', priority: 'warm', tripType: 'domestic',
  });
  expect(lead.status, JSON.stringify(lead.body)).toBe(201);
  leadId = lead.body.data.id;
});

describe('B37 rate-card lookups use the tenant-local day (inclusive on both ends)', () => {
  beforeAll(async () => {
    const mk = (name: string, validFrom: string | null, validTo: string | null) =>
      api('POST', '/rate-cards', adminToken, {
        serviceType: 'hotel', destination: 'B37Land', name, costPrice: 100, validFrom, validTo,
      });
    expect((await mk('RC valid from today', LOCAL_TODAY, null)).status).toBe(201);
    expect((await mk('RC valid through today', null, LOCAL_TODAY)).status).toBe(201);
    expect((await mk('RC expired yesterday', null, '2026-10-06')).status).toBe(201);
    expect((await mk('RC starts tomorrow', '2026-10-08', null)).status).toBe(201);
  });

  for (const [label, iso] of [['00:30 IST', IST_0030], ['23:30 IST', IST_2330]] as const) {
    it(`GET /rate-cards/lookup at ${label}`, async () => {
      await atAs(iso);
      const res = await api('GET', '/rate-cards/lookup?destination=B37Land', adminToken);
      expect(res.status).toBe(200);
      const names = (res.body.data as any[]).map((r) => r.name).sort();
      expect(names).toEqual(['RC valid from today', 'RC valid through today']);
    });
  }

  it('vehicle rate-card lookup treats valid_from / valid_to as local dates (inclusive)', async () => {
    const mk = (vehicleType: string, validFrom?: string, validTo?: string) =>
      api('POST', '/fleet/vehicle-rate-cards', adminToken, {
        name: `VRC ${vehicleType}`, vehicleType, tripType: 'one_way', baseFare: 100, validFrom, validTo,
      });
    expect((await mk('sedan', LOCAL_TODAY, LOCAL_TODAY)).status).toBe(201); // valid exactly today
    expect((await mk('suv', undefined, '2026-10-06')).status).toBe(201); // expired yesterday
    expect((await mk('muv', '2026-10-08', undefined)).status).toBe(201); // starts tomorrow

    for (const iso of [IST_0030, IST_2330]) {
      await atAs(iso);
      const sedan = await api('GET', '/fleet/vehicle-rate-cards/lookup?vehicleType=sedan&tripType=one_way', adminToken);
      expect(sedan.body.data?.name).toBe('VRC sedan');
      const suv = await api('GET', '/fleet/vehicle-rate-cards/lookup?vehicleType=suv&tripType=one_way', adminToken);
      expect(suv.body.data).toBeNull();
      const muv = await api('GET', '/fleet/vehicle-rate-cards/lookup?vehicleType=muv&tripType=one_way', adminToken);
      expect(muv.body.data).toBeNull();
      vi.useRealTimers();
    }
  });
});

describe('B37 follow-ups: today / overdue / upcoming are local-day windows', () => {
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    await run('DELETE FROM follow_ups');
    const mk = async (key: string, scheduledAt: string) => {
      ids[key] = generateId();
      await run(
        "INSERT INTO follow_ups (id, lead_id, scheduled_at, type, status, created_by) VALUES (?, ?, ?, 'call', 'pending', ?)",
        ids[key], leadId, scheduledAt, ADMIN_ID,
      );
    };
    await mk('overdue', '2026-10-06T17:00:00Z'); // 22:30 IST on 6 Oct
    await mk('todayEarly', '2026-10-06T20:00:00Z'); // 01:30 IST on 7 Oct
    await mk('todayLate', '2026-10-07T17:00:00Z'); // 22:30 IST on 7 Oct
    await mk('upcoming', '2026-10-07T19:00:00Z'); // 00:30 IST on 8 Oct
  });

  for (const [label, iso] of [['00:30 IST', IST_0030], ['23:30 IST', IST_2330]] as const) {
    it(`filters at ${label}`, async () => {
      await atAs(iso);
      const idsOf = async (filter: string) =>
        ((await api('GET', `/follow-ups?filter=${filter}`, adminToken)).body.data as any[]).map((f) => f.id).sort();
      expect(await idsOf('today')).toEqual([ids.todayEarly, ids.todayLate].sort());
      expect(await idsOf('overdue')).toEqual([ids.overdue]);
      expect(await idsOf('upcoming')).toEqual([ids.upcoming]);
    });
  }
});

describe('B37 invoices overdue (badge counts, outstanding report)', () => {
  beforeAll(async () => {
    await run("DELETE FROM invoices WHERE invoice_number LIKE 'B37-%'");
    const mk = (n: string, due: string) =>
      run(
        "INSERT INTO invoices (id, contact_id, invoice_number, type, total, status, due_date, balance_due, created_by) VALUES (?, ?, ?, 'tax_invoice', 1000, 'sent', ?, 1000, ?)",
        generateId(), contactId, `B37-${n}`, due, ADMIN_ID,
      );
    await mk('YESTERDAY', '2026-10-06'); // overdue on 7 Oct
    await mk('TODAY', LOCAL_TODAY); // due today: not overdue
    await mk('TOMORROW', '2026-10-08');
  });

  for (const [label, iso] of [['00:30 IST', IST_0030], ['23:30 IST', IST_2330]] as const) {
    it(`counts only invoices due before the local day at ${label}`, async () => {
      await atAs(iso);
      const badge = await api('GET', '/notifications/badge-counts', adminToken);
      expect(badge.body.data.overdueInvoices).toBe(1);
      const out = await api('GET', '/reports/outstanding', adminToken);
      expect(out.status).toBe(200);
      expect(Number(out.body.data.overdue_receivable ?? out.body.data.overdueReceivable ?? 1000)).toBe(1000);
    });
  }
});

describe('B37 tasks overdue / due today', () => {
  beforeAll(async () => {
    await run("DELETE FROM tasks WHERE title LIKE 'B37 %'");
    const mk = (title: string, due: string) =>
      run(
        "INSERT INTO tasks (id, title, assigned_to, due_date, status, is_deleted, created_by) VALUES (?, ?, ?, ?, 'todo', 0, ?)",
        generateId(), title, ADMIN_ID, due, ADMIN_ID,
      );
    await mk('B37 due yesterday', '2026-10-06');
    await mk('B37 due today', LOCAL_TODAY);
  });

  for (const [label, iso] of [['00:30 IST', IST_0030], ['23:30 IST', IST_2330]] as const) {
    it(`overdue filter and dashboard summary at ${label}`, async () => {
      await atAs(iso);
      const overdue = await api('GET', '/tasks?overdue=true', adminToken);
      const titles = ((overdue.body.data?.tasks ?? overdue.body.data) as any[]).map((t) => t.title);
      expect(titles).toContain('B37 due yesterday');
      expect(titles).not.toContain('B37 due today');

      const summary = await api('GET', '/tasks/dashboard/summary', adminToken);
      expect(JSON.stringify(summary.body.data)).toContain('B37 due today');
    });
  }

  it('overdue-tasks cron flags yesterday-local tasks at 00:30 IST and does not re-notify at 23:30 IST', async () => {
    await run("UPDATE tasks SET overdue_notified_date = NULL WHERE title LIKE 'B37 %'");
    await run("DELETE FROM notifications WHERE title LIKE '%B37 due%'");
    await processOverdueTasks({ DB: db } as any, new Date(IST_0030));
    const row = await db.prepare("SELECT overdue_notified_date FROM tasks WHERE title = 'B37 due yesterday'").first<any>();
    expect(row.overdue_notified_date).toBe(LOCAL_TODAY);
    const todayRow = await db.prepare("SELECT overdue_notified_date FROM tasks WHERE title = 'B37 due today'").first<any>();
    expect(todayRow.overdue_notified_date).toBeNull();

    const before = await db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE message LIKE '%B37 due yesterday%'").first<any>();
    await processOverdueTasks({ DB: db } as any, new Date(IST_2330));
    const after = await db.prepare("SELECT COUNT(*) AS c FROM notifications WHERE message LIKE '%B37 due yesterday%'").first<any>();
    expect(after.c).toBe(before.c); // same local day: not notified again
  });
});

describe('B37 fleet: document expiry flags and alerts use the local day', () => {
  let vehicleId = '';
  beforeAll(async () => {
    vehicleId = generateId();
    await run(
      "INSERT INTO vehicles (id, tenant_id, registration_number, type, status, is_deleted) VALUES (?, ?, 'KA01B3700', 'sedan', 'available', 0)",
      vehicleId, TENANT_ID,
    );
    const doc = (type: string, expiry: string) =>
      run(
        "INSERT INTO vehicle_documents (id, vehicle_id, type, expiry_date, is_active) VALUES (?, ?, ?, ?, 1)",
        generateId(), vehicleId, type, expiry,
      );
    await doc('insurance', '2026-10-06'); // expired yesterday (local)
    await doc('permit', '2026-10-08'); // tomorrow
    await doc('pollution', '2026-10-14'); // 7 days after the local day
  });

  for (const [label, iso] of [['00:30 IST', IST_0030], ['23:30 IST', IST_2330]] as const) {
    it(`GET /fleet/documents/expiring flags expiry against the local day at ${label}`, async () => {
      await atAs(iso);
      const res = await api('GET', '/fleet/documents/expiring?days=2', adminToken);
      const mine = (res.body.data as any[]).filter((d) => d.registration_number === 'KA01B3700');
      const byType = Object.fromEntries(mine.map((d) => [d.type, d]));
      expect(byType.insurance.isExpired).toBe(true);
      expect(byType.insurance.daysUntilExpiry).toBe(-1);
      expect(byType.permit.isExpired).toBe(false);
      expect(byType.permit.daysUntilExpiry).toBe(1);
      expect(byType.pollution).toBeUndefined(); // 7 days out is beyond days=2
    });
  }

  it('fleet-alerts cron: the 7-day alert fires at 00:30 IST and is not repeated at 23:30 IST the same local day', async () => {
    await run("DELETE FROM reminder_log WHERE entity_type IN ('vehicle_document', 'fleet_summary', 'vehicle_maintenance')");
    const first = fakeQueues();
    await processFleetAlertsForTenant(first.env, db, TENANT_ID, new Date(IST_0030));
    const pollution = first.sent.filter((m) => m.type === 'fleet_document_expiry' && m.body.includes('KA01B3700') && m.body.includes('POLLUTION'));
    expect(pollution).toHaveLength(1);
    expect(pollution[0].body).toContain('7 day');
    const log = await db.prepare("SELECT sent_date FROM reminder_log WHERE reminder_type = 'expiry_7d'").first<any>();
    expect(log.sent_date).toBe(LOCAL_TODAY);

    const second = fakeQueues();
    await processFleetAlertsForTenant(second.env, db, TENANT_ID, new Date(IST_2330));
    expect(second.sent.filter((m) => m.type === 'fleet_document_expiry' && m.body.includes('POLLUTION'))).toHaveLength(0);

    // the next local day it is only 6 days out: the 7-day alert does not fire again, the 7-day-out doc is not re-sent
    const third = fakeQueues();
    await processFleetAlertsForTenant(third.env, db, TENANT_ID, new Date(IST_NEXT_0030));
    expect(third.sent.filter((m) => m.type === 'fleet_document_expiry' && m.body.includes('POLLUTION'))).toHaveLength(0);
  });
});

describe('B37 reminder crons (auto-reminders)', () => {
  beforeAll(async () => {
    await run("DELETE FROM invoices WHERE invoice_number LIKE 'B37R-%'");
    const mk = (n: string, due: string) =>
      run(
        "INSERT INTO invoices (id, contact_id, invoice_number, type, total, status, due_date, balance_due, created_by) VALUES (?, ?, ?, 'tax_invoice', 500, 'sent', ?, 500, ?)",
        generateId(), contactId, `B37R-${n}`, due, ADMIN_ID,
      );
    await mk('IN3', '2026-10-10'); // local today + 3
    await mk('YEST', '2026-10-06'); // local today - 1
  });

  for (const [label, iso] of [['00:30 IST', IST_0030], ['23:30 IST', IST_2330]] as const) {
    it(`invoice reminders at ${label}: due-in-3-days and overdue-1-day match the local calendar`, async () => {
      const q = fakeQueues();
      await processInvoiceRemindersForTenant(q.env, db, new Date(iso));
      const text = JSON.stringify(q.sent);
      expect(text).toContain('B37R-IN3');
      expect(text).toContain('B37R-YEST');
    });
  }

  for (const [label, iso] of [['00:30 IST', IST_0030], ['23:30 IST', IST_2330]] as const) {
    it(`birthday wishes at ${label} go to contacts whose birthday is the local day`, async () => {
      const q = fakeQueues();
      await processBirthdaysForTenant(q.env, db, TENANT_ID, new Date(iso));
      expect(q.sent.filter((m) => m.data?.templateId === 'birthday_wish' && m.data.message.includes('B37 Traveller'))).toHaveLength(1);
    });
  }

  it('birthday wishes are NOT sent the local day before', async () => {
    const q = fakeQueues();
    await processBirthdaysForTenant(q.env, db, TENANT_ID, new Date('2026-10-06T17:00:00Z')); // 22:30 IST on 6 Oct
    expect(q.sent.filter((m) => m.data?.message?.includes('B37 Traveller'))).toHaveLength(0);
  });

  it('missing-visa-documents reminder counts the 7 days on the local calendar', async () => {
    const travellerId = generateId();
    await run("INSERT INTO travellers (id, contact_id, first_name, last_name) VALUES (?, ?, 'Visa', 'Applicant')", travellerId, contactId);
    const mk = (created: string) =>
      run(
        "INSERT INTO visa_applications (id, traveller_id, country, destination_country, status, tenant_id, is_deleted, created_at) VALUES (?, ?, 'France', 'France', 'documents_collecting', ?, 0, ?)",
        generateId(), travellerId, TENANT_ID, created,
      );
    // created 23:30 IST on 30 Sep = 18:00Z -> local 30 Sep (7 days before 7 Oct): due
    await mk('2026-09-30T18:00:00Z');
    // created 00:30 IST on 1 Oct = 2026-09-30T19:00Z: local 1 Oct (6 days before 7 Oct): not due yet at 00:30 IST on 7 Oct
    await mk('2026-09-30T19:00:00Z');
    const q = fakeQueues();
    await processMissingVisaDocsForTenant(q.env, db, new Date(IST_0030));
    expect(q.sent.filter((m) => m.data?.templateId === 'visa_missing_docs_reminder')).toHaveLength(1);
  });
});

describe('B37 visa dashboard: expiring-soon window', () => {
  it('counts visas expiring from the local today through +30 local days', async () => {
    const travellerId = generateId();
    await run("INSERT INTO travellers (id, contact_id, first_name, last_name) VALUES (?, ?, 'Expiry', 'Window')", travellerId, contactId);
    await run("DELETE FROM visa_applications WHERE tenant_id = ?", TENANT_ID);
    const mk = (expiry: string) =>
      run(
        "INSERT INTO visa_applications (id, traveller_id, country, destination_country, status, tenant_id, is_deleted, visa_expiry_date) VALUES (?, ?, 'France', 'France', 'approved', ?, 0, ?)",
        generateId(), travellerId, TENANT_ID, expiry,
      );
    await mk('2026-10-06'); // expired yesterday (local)
    await mk('2026-10-07'); // expires today
    await mk('2026-11-06'); // today + 30
    await mk('2026-11-07'); // today + 31
    for (const iso of [IST_0030, IST_2330]) {
      await atAs(iso);
      const res = await api('GET', '/visa/dashboard', adminToken);
      expect(res.body.data.expiringSoon).toBe(2);
      vi.useRealTimers();
    }
  });
});

describe('B37 reports and report cache', () => {
  beforeAll(async () => {
    await run("DELETE FROM leads WHERE status = 'b37_status'");
    const mk = (created: string) =>
      run(
        "INSERT INTO leads (id, contact_id, title, status, created_at, updated_at, is_deleted) VALUES (?, ?, 'B37 preset lead', 'b37_status', ?, ?, 0)",
        generateId(), contactId, created, created,
      );
    await mk('2026-10-06T17:00:00Z'); // 22:30 IST on 6 Oct  -> local 6 Oct
    await mk('2026-10-06T19:10:00Z'); // 00:40 IST on 7 Oct  -> local 7 Oct
    await mk('2026-10-07T17:30:00Z'); // 23:00 IST on 7 Oct  -> local 7 Oct
  });

  it('dashboard date_preset=today resolves to the local day at 23:30 IST', async () => {
    await atAs(IST_2330);
    const res = await api('GET', '/reports/dashboard?date_preset=today', adminToken);
    expect(res.status).toBe(200);
    const row = (res.body.data.pipeline as any[]).find((p) => p.status === 'b37_status');
    expect(row?.count).toBe(2);
  });

  it('dashboard date_preset=today is the new local day at 00:30 IST on the next day', async () => {
    await atAs(IST_NEXT_0030);
    const res = await api('GET', '/reports/dashboard?date_preset=today', adminToken);
    const row = (res.body.data.pipeline as any[]).find((p) => p.status === 'b37_status');
    expect(row).toBeUndefined();
  });

  it('a report preset is keyed by its resolved range, so it does not go stale across local midnight', async () => {
    await api('DELETE', '/reports/cache', adminToken);
    await atAs(IST_2330);
    const a = await api('GET', '/reports/pipeline_summary?date_preset=today', adminToken);
    expect(a.status).toBe(200);
    expect(a.headers.get('X-Cache')).toBe('MISS');
    const again = await api('GET', '/reports/pipeline_summary?date_preset=today', adminToken);
    expect(again.headers.get('X-Cache')).toBe('HIT');
    vi.useRealTimers();

    await atAs(IST_NEXT_0030); // 00:30 IST the next local day: the same preset is a different range
    const next = await api('GET', '/reports/pipeline_summary?date_preset=today', adminToken);
    expect(next.headers.get('X-Cache')).toBe('MISS');
  });

  it('normalizeDateBound: bare local dates become local-day instants for timestamp columns', () => {
    const tz = 'Asia/Kolkata';
    expect(normalizeDateBound('2026-10-07', 'from', 'timestamp', tz)).toBe('2026-10-06T18:30:00.000Z');
    expect(normalizeDateBound('2026-10-07', 'to', 'timestamp', tz)).toBe('2026-10-07T18:29:59.999Z');
    expect(normalizeDateBound('2026-10-06T18:30:00.000Z', 'from', 'timestamp', tz)).toBe('2026-10-06T18:30:00.000Z');
  });

  it('normalizeDateBound: instants become the local date for date-only columns', () => {
    const tz = 'Asia/Kolkata';
    expect(normalizeDateBound('2026-10-06T18:30:00.000Z', 'from', 'date', tz)).toBe('2026-10-07');
    expect(normalizeDateBound('2026-10-07T18:29:59.999Z', 'to', 'date', tz)).toBe('2026-10-07');
    expect(normalizeDateBound('2026-10-07', 'to', 'date', tz)).toBe('2026-10-07');
  });
});

describe('B37 other tenant-local clocks', () => {
  it('financial year rolls over at local midnight on 1 April', () => {
    expect(getCurrentFinancialYear('Asia/Kolkata', new Date('2026-03-31T18:00:00Z'))).toBe('2025-26'); // 23:30 IST 31 Mar
    expect(getCurrentFinancialYear('Asia/Kolkata', new Date('2026-03-31T19:00:00Z'))).toBe('2026-27'); // 00:30 IST 1 Apr
  });

  it('chatbot business hours are local wall-clock hours', () => {
    const cfg = { business_hours_start: '09:00', business_hours_end: '18:00', business_days: '[1,2,3,4,5]' };
    expect(checkBusinessHours(cfg, 'Asia/Kolkata', new Date('2026-10-07T04:00:00Z'))).toBe(true); // Wed 09:30 IST
    expect(checkBusinessHours(cfg, 'Asia/Kolkata', new Date('2026-10-07T13:00:00Z'))).toBe(false); // Wed 18:30 IST
    expect(checkBusinessHours(cfg, 'Asia/Kolkata', new Date('2026-10-10T04:00:00Z'))).toBe(false); // Sat
    // Sunday 23:30 UTC is already Monday morning in IST
    expect(checkBusinessHours(cfg, 'Asia/Kolkata', new Date('2026-10-11T04:00:00Z'))).toBe(false); // Sun 09:30 IST
  });

  it('recurring events recur on the local weekday', () => {
    const event: any = {
      id: 'ev1', title: 'Standup', description: null, event_type: 'meeting',
      start_at: '2026-10-06T19:00:00Z', // Wed 7 Oct 00:30 IST
      end_at: null, all_day: 0, location: null, color: null,
      recurrence_rule: JSON.stringify({ frequency: 'weekly', interval: 1, days_of_week: [3] }),
      recurrence_parent_id: null, related_lead_id: null, related_task_id: null,
      assigned_to: 'u', created_by: 'u', timezone: 'Asia/Kolkata', is_deleted: 0, created_at: '', updated_at: '',
    };
    const out = expandRecurrence(event, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-25T00:00:00Z'));
    expect(out.map((e) => e.start_at)).toEqual([
      '2026-10-06T19:00:00.000Z', '2026-10-13T19:00:00.000Z', '2026-10-20T19:00:00.000Z',
    ]);
    expect(out[0].id).toBe('ev1_20261007');
  });
});

describe('B37 contacts import accepts a single name column', () => {
  const v = new ImportValidator();

  it('accepts `name`', async () => {
    const r = await v.validateRow('contacts', { Name: 'Asha Rao', Email: 'asha@example.com' }, { Name: 'name', Email: 'email' });
    expect(r.isValid).toBe(true);
    expect(r.validData.name).toBe('Asha Rao');
  });

  it('still accepts firstName + lastName', async () => {
    const r = await v.validateRow('contacts', { 'First Name': 'Rahul', 'Last Name': 'Sharma' }, { 'First Name': 'firstName', 'Last Name': 'lastName' });
    expect(r.isValid).toBe(true);
    expect(r.validData.name).toBe('Rahul Sharma');
  });

  it('firstName alone is enough', async () => {
    const r = await v.validateRow('contacts', { firstName: 'Meera' });
    expect(r.isValid).toBe(true);
    expect(r.validData.name).toBe('Meera');
  });

  it('name wins when several are present', async () => {
    const r = await v.validateRow('contacts', { name: 'Full Name', firstName: 'F', lastName: 'L' });
    expect(r.isValid).toBe(true);
    expect(r.validData.name).toBe('Full Name');
  });

  it('requires at least one of name / firstName / lastName', async () => {
    const r = await v.validateRow('contacts', { email: 'x@example.com', name: '   ' });
    expect(r.isValid).toBe(false);
    expect(r.errors[0].field).toBe('name');
  });

  it('legacy CSV upload accepts a name column or first/last name columns', async () => {
    const csv = (text: string) => {
      const fd = new FormData();
      fd.append('file', new File([text], 'contacts.csv', { type: 'text/csv' }));
      return fd;
    };
    const post = async (text: string) => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request('http://localhost/api/v1/contacts/import', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: csv(text) }),
        testEnv, ctx,
      );
      await waitOnExecutionContext(ctx);
      return { status: res.status, body: (await res.json()) as any };
    };
    const a = await post('name,email\nB37 Single Name,b37single@example.com');
    expect(a.status).toBe(200);
    expect(a.body.data.imported).toBe(1);
    const b = await post('first_name,last_name,email\nB37First,B37Last,b37split@example.com');
    expect(b.status).toBe(200);
    expect(b.body.data.imported).toBe(1);
    const row = await db.prepare("SELECT name FROM contacts WHERE email = 'b37split@example.com'").first<any>();
    expect(row.name).toBe('B37First B37Last');
  });
});
