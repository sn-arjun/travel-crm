/**
 * Demo seeder (API phase) for the client videos.
 *
 *   node desktop/e2e/showcase/demo-seed.ts [--reset] [--live-trip] [--verify]
 *
 * Env: E2E_API_URL (default http://localhost:8787/api/v1)   DEMO_D0 (optional, YYYY-MM-DD)
 *
 * Default run = POST /test/reset, then seed everything through the public API, then write
 * desktop/showcase/.work/seed.json (logical key -> id). Idempotent: every run starts from the reset.
 * The SQL fixups (STORYBOARD A.9) live in backend/scripts/seed-demo.mjs, which wraps this script.
 *
 *   --live-trip   only: (re)create the "today" airport pickup for Ravi (H5) and write .handoff.json
 *   --verify      only: count entities through the API and scan them for banned strings
 *
 * Erasable TypeScript only; runs with plain `node` >= 22.18.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-expect-error TS5097 - plain `node` type stripping needs the explicit .ts extension
import * as D from './demo-data.ts';

const API = (process.env.E2E_API_URL ?? 'http://localhost:8787/api/v1').replace(/\/+$/, '');
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const WORK_DIR = path.resolve(HERE, '../../showcase/.work');
const SEED_JSON = path.join(WORK_DIR, 'seed.json');
const HANDOFF_JSON = path.resolve(HERE, '../../showcase/.handoff.json');

type Json = any;
let token = '';
const rejections: string[] = [];
const counters: Record<string, number> = {};

function bump(k: string) { counters[k] = (counters[k] ?? 0) + 1; }

async function raw(method: string, p: string, body?: unknown, isForm = false): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${p}`, { method, headers, body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body) });
  let json: Json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

/** Call and record a rejection instead of throwing. Returns data or null. */
async function call(label: string, method: string, p: string, body?: unknown): Promise<Json | null> {
  const r = await raw(method, p, body);
  if (r.status >= 400 || r.json?.success === false) {
    rejections.push(`${label}: ${method} ${p} -> ${r.status} ${JSON.stringify(r.json)?.slice(0, 300)}`);
    return null;
  }
  bump(label);
  return r.json?.data ?? r.json ?? {};
}

async function login(emails: string[] = [D.DEMO_EMAIL, D.BOOTSTRAP_EMAIL], password = D.DEMO_PASSWORD) {
  let last = '';
  for (const email of emails) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, tenantId: D.TENANT_ID }),
    });
    const json: Json = await res.json();
    if (json?.data?.accessToken) { token = json.data.accessToken; return; }
    last = JSON.stringify(json);
  }
  throw new Error(`login failed: ${last}`);
}

const rows = (d: Json): Json[] => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(d?.data) ? d.data : []);

// ─── Seed ────────────────────────────────────────────────────────

interface Ids {
  d0: string; apiUrl: string; tenantId: string; demoEmail: string; demoPassword: string;
  staff: Record<string, string>; contacts: Record<string, string>; leads: Record<string, string>;
  suppliers: Record<string, string>; rateCards: Record<string, string>; templates: Record<string, string>;
  invoices: Record<string, string>; vouchers: Record<string, string>; vehicles: Record<string, string>;
  drivers: Record<string, string>; trips: Record<string, string>; tasks: Record<string, string>;
  segments?: Record<string, string>; campaigns: Record<string, string>;
  liveTrip?: { id: string; pickupHHMM: string };
  rejections: string[]; counters: Record<string, number>;
}

async function setAutomationsPaused(paused: boolean): Promise<void> {
  const res = await fetch(`${API}/automations/pause`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ paused }) });
  if (!res.ok) throw new Error(`could not ${paused ? 'pause' : 'resume'} automations: ${res.status} ${await res.text()}`);
}

async function seedAll(): Promise<Ids> {
  // Wipe + re-create the base tenant/admin (idempotency anchor).
  const reset = await fetch(`${API}/test/reset`, { method: 'POST' });
  if (!reset.ok) throw new Error(`/test/reset failed: ${reset.status} ${await reset.text()}`);
  await login([D.BOOTSTRAP_EMAIL]);
  // Seeding is a bulk load of history: automations stay paused so they do not schedule follow-ups,
  // create checklists or raise suggestions for 25 back-dated leads. main() resumes them.
  await setAutomationsPaused(true);

  const ids: Ids = {
    d0: D.d0(), apiUrl: API, tenantId: D.TENANT_ID, demoEmail: D.DEMO_EMAIL, demoPassword: D.DEMO_PASSWORD,
    staff: { ananya: D.ADMIN_ID }, contacts: {}, leads: {}, suppliers: {}, rateCards: {}, templates: {}, invoices: {},
    vouchers: {}, vehicles: {}, drivers: {}, trips: {}, tasks: {}, campaigns: {}, rejections, counters,
  };

  // settings
  await call('settings', 'PUT', '/settings/company', D.COMPANY);
  await call('settings', 'PUT', '/settings/numbering', D.NUMBERING);
  await call('settings', 'PUT', '/settings/invoice-defaults', D.INVOICE_DEFAULTS);
  await call('settings', 'PUT', '/settings/itinerary-defaults', D.ITINERARY_DEFAULTS);

  // staff
  const me = D.STAFF[0]!;
  await call('staff', 'PUT', '/users/me', { name: me.name, phone: me.phone, department: me.department });
  for (const s of D.STAFF.slice(1)) {
    const u = await call('staff', 'POST', '/users', { email: s.email, name: s.name, role: s.role, phone: s.phone, department: s.department });
    if (!u) continue;
  }
  const team = rows(await call('staffList', 'GET', '/users?limit=100'));
  for (const s of D.STAFF.slice(1)) {
    const u = team.find((x) => String(x.email).toLowerCase() === s.email.toLowerCase());
    if (u?.id) ids.staff[s.key] = u.id; else rejections.push(`staff id missing for ${s.key}`);
  }

  // contacts
  for (const c of D.CONTACTS) {
    const r = await call('contacts', 'POST', '/contacts', {
      name: c.name, email: c.email, phone: c.phone, company: c.company, type: c.type ?? 'customer',
      city: c.city, state: c.state, country: c.country, source: c.source, tags: c.tags, ...(c.extra ?? {}),
    });
    if (r?.id) ids.contacts[c.key] = r.id;
  }

  // itinerary templates (+ assert the T-KER totals the storyboard promises)
  let cost = 0, sell = 0;
  for (const d of D.T_KER.days) for (const it of d.items) { cost += it.cost * it.qty; sell += it.sell * it.qty; }
  const tax = Math.round(sell * 0.05);
  if (cost !== D.T_KER_TOTALS.cost || sell !== D.T_KER_TOTALS.selling || tax !== D.T_KER_TOTALS.tax || sell + tax !== D.T_KER_TOTALS.grand) {
    rejections.push(`T-KER totals mismatch: cost ${cost} sell ${sell} tax ${tax} grand ${sell + tax}`);
  }
  for (const t of [D.T_KER, ...D.OTHER_TEMPLATES]) {
    const r = await call('templates', 'POST', '/itinerary-templates', {
      title: t.title, description: t.description, destination: t.destination, durationDays: t.durationDays, category: t.category, templateData: D.templateData(t),
    });
    if (r?.id) ids.templates[t.key] = r.id;
  }

  // leads (+ walk through the status path)
  const path_: Record<string, string[]> = {
    new: [], contacted: ['contacted'], qualified: ['contacted', 'qualified'],
    proposal_sent: ['contacted', 'qualified', 'proposal_sent'],
    negotiation: ['contacted', 'qualified', 'proposal_sent', 'negotiation'],
    won: ['contacted', 'qualified', 'proposal_sent', 'won'],
    lost: ['contacted', 'qualified', 'lost'], on_hold: ['contacted', 'on_hold'],
  };
  for (const l of D.LEADS) {
    const contactId = ids.contacts[l.contact];
    if (!contactId) { rejections.push(`lead ${l.key}: contact ${l.contact} missing`); continue; }
    const r = await call('leads', 'POST', '/leads', {
      contactId, title: l.title, destinations: l.destinations, travelDate: D.day(l.travel),
      ...(l.ret !== undefined ? { returnDate: D.day(l.ret) } : {}),
      paxAdults: l.adults, paxChildren: l.children, budget: l.budget, currency: 'INR',
      tripType: l.tripType, source: l.source, priority: l.priority,
      ...(l.assignee ? { assignedTo: ids.staff[l.assignee] } : {}),
    });
    if (!r?.id) continue;
    ids.leads[l.key] = r.id;
    const lit = D.LEAD_ITINERARIES[l.key];
    if (lit && ids.templates[lit.template]) await call('itineraries', 'POST', '/itinerary-templates/create-from', { templateId: ids.templates[lit.template], leadId: r.id, title: lit.title });
    for (const st of path_[l.status] ?? []) {
      await call('leadStatus', 'PUT', `/leads/${r.id}/status`, { status: st, ...(st === 'lost' ? { lostReason: l.lostReason } : {}) });
    }
  }
  for (const [k, content] of Object.entries(D.LEAD_NOTES)) await call('leadNotes', 'POST', `/leads/${ids.leads[k]}/notes`, { content });
  for (const a of D.LEAD_ACTIVITIES) await call('leadActivities', 'POST', `/leads/${ids.leads[a.lead]}/activities`, { type: a.type, content: a.content });

  // suppliers
  for (const s of D.SUPPLIERS) {
    const r = await call('suppliers', 'POST', '/suppliers', {
      companyName: s.companyName, category: s.category, contactPerson: s.contactPerson, phone: s.phone, email: s.email,
      city: s.city, state: s.state, country: s.country ?? 'India', ...(s.gst ? { gstNumber: s.gst } : {}), isPreferred: s.preferred, status: 'active',
    });
    if (r?.id) ids.suppliers[s.key] = r.id;
  }

  // rate cards
  const validTo = `${Number(D.d0().slice(0, 4)) + 1}-03-31`;
  for (const rc of D.RATE_CARDS) {
    const r = await call('rateCards', 'POST', '/rate-cards', {
      name: rc.name, serviceType: rc.serviceType, destination: rc.destination, season: rc.season, costPrice: rc.cost,
      sellingPrice: rc.selling, currency: 'INR', unit: rc.unit, validFrom: D.day(-2), validTo, ...(rc.supplier ? { supplierId: ids.suppliers[rc.supplier] } : {}),
    });
    if (r?.id) ids.rateCards[rc.key] = r.id;
  }

  // invoices + payments
  for (const inv of D.INVOICES) {
    const r = await call('invoices', 'POST', '/invoices', {
      contactId: ids.contacts[inv.contact], ...(inv.lead ? { leadId: ids.leads[inv.lead] } : {}), type: inv.type, currency: 'INR',
      items: inv.lines.map((l) => ({ description: l.description, quantity: l.qty ?? 1, rate: l.rate, taxRate: 5 })),
      ...(inv.due !== undefined ? { dueDate: D.day(inv.due) } : {}),
    });
    if (r?.id) ids.invoices[inv.key] = r.id;
  }
  for (const p of D.PAYMENTS) {
    await call('payments', 'POST', '/payments', {
      invoiceId: ids.invoices[p.invoice], amount: p.amount, date: D.day(-p.daysAgo), method: p.method, reference: p.reference,
    });
  }
  await call('invoices', 'POST', `/invoices/${ids.invoices['I-11']}/void`, {});
  await call('creditNotes', 'POST', '/credit-notes', { invoiceId: ids.invoices[D.CREDIT_NOTE.invoice], reason: D.CREDIT_NOTE.reason, items: D.CREDIT_NOTE.items });

  // vouchers
  for (const v of D.VOUCHERS) {
    const r = await call('vouchers', 'POST', '/vouchers', {
      leadId: ids.leads[v.lead], type: v.type, title: v.title, details: v.details(D.day, D.at), ...(v.supplier ? { supplierId: ids.suppliers[v.supplier] } : {}),
    });
    if (!r?.id) continue;
    ids.vouchers[v.key] = r.id;
    const seq = v.status === 'draft' ? [] : v.status === 'sent' ? ['sent'] : ['sent', 'confirmed'];
    for (const st of seq) await call('voucherStatus', 'PATCH', `/vouchers/${r.id}/status`, { status: st });
  }

  // fleet
  for (const v of D.VEHICLES) {
    const r = await call('vehicles', 'POST', '/fleet/vehicles', {
      registrationNumber: v.reg, type: v.type, make: v.make, model: v.model, year: v.year, seatingCapacity: v.seats, color: v.color, notes: v.notes,
    });
    if (r?.id) ids.vehicles[v.key] = r.id;
  }
  for (const d of D.DRIVERS) {
    const exp = typeof d.expiry === 'number' ? D.day(d.expiry) : d.expiry;
    const r = await call('drivers', 'POST', '/fleet/drivers', { name: d.name, phone: d.phone, licenseNumber: d.license, licenseExpiry: exp, ...(d.extra ?? {}) });
    if (!r?.id) continue;
    ids.drivers[d.key] = r.id;
    await call('driverStatus', 'PUT', `/fleet/drivers/${r.id}/status`, { status: 'active' });
  }
  for (const rc of D.FLEET_RATE_CARDS) await call('fleetRateCards', 'POST', '/fleet/vehicle-rate-cards', rc);

  const contactName = (k: string) => D.CONTACTS.find((c) => c.key === k)!;
  for (const t of D.TRIPS) {
    const pax = contactName(t.passenger);
    const live = t.start === 'live';
    const startIso = live ? D.inMinutes(-40) : D.at((t.start as [number, string])[0], (t.start as [number, string])[1]);
    const endIso = live ? D.inMinutes(20) : D.at((t.end as [number, string])[0], (t.end as [number, string])[1]);
    const r = await call('trips', 'POST', '/fleet/trips', {
      vehicleId: ids.vehicles[t.vehicle], driverId: ids.drivers[t.driver], pickupLocation: t.from, dropLocation: t.to,
      pickupDatetime: startIso, dropDatetime: endIso, contactId: ids.contacts[t.passenger], passengerName: pax.name, passengerPhone: pax.phone, tripType: t.tripType,
      estimatedDistanceKm: t.km, estimatedCost: t.fare, autoCreateVoucher: false,
    });
    if (!r?.id) continue;
    ids.trips[t.key] = r.id;
    const seq: Record<string, string[]> = {
      completed: ['accepted', 'en_route', 'started', 'completed'], started: ['accepted', 'en_route', 'started'], accepted: ['accepted'], assigned: [], cancelled: ['cancelled'],
    };
    for (const st of seq[t.final] ?? []) await call('tripStatus', 'PUT', `/fleet/trips/${r.id}/status`, { status: st, ...(st === 'cancelled' ? { reason: t.cancelReason } : {}) });
    if (t.rating) await call('tripRating', 'POST', `/fleet/drivers/${ids.drivers[t.driver]}/rate`, { tripId: r.id, rating: t.rating });
  }
  for (const c of D.TRIP_COSTS) await call('tripCosts', 'POST', `/fleet/trips/${ids.trips[c.trip]}/costs`, { costType: c.costType, amount: c.amount, description: c.description });

  // final vehicle/driver states (after trips, which reset them)
  for (const v of D.VEHICLES) if (v.status) await call('vehicleStatus', 'PUT', `/fleet/vehicles/${ids.vehicles[v.key]}/status`, { status: v.status, reason: 'Brake service' });
  for (const d of D.DRIVERS) if (d.status) await call('driverStatus', 'PUT', `/fleet/drivers/${ids.drivers[d.key]}/status`, { status: d.status });
  const m = D.MAINTENANCE;
  await call('maintenance', 'POST', `/fleet/vehicles/${ids.vehicles[m.vehicle]}/maintenance`, {
    serviceType: m.serviceType, description: m.description, serviceDate: D.day(m.serviceDateOffset), odometerAtService: m.odometerAtService, cost: m.cost,
    vendor: m.vendor, nextServiceDueDate: D.day(m.nextServiceDueOffset),
  });
  // insurance document (1-page PDF)
  {
    const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF';
    const fd = new FormData();
    fd.set('file', new Blob([pdf], { type: 'application/pdf' }), 'insurance-policy.pdf');
    fd.set('type', 'insurance');
    fd.set('expiryDate', D.day(12));
    const r = await raw('POST', `/fleet/vehicles/${ids.vehicles.VH3}/documents`, fd, true);
    if (r.status >= 400) rejections.push(`vehicle document: ${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`); else bump('vehicleDocs');
  }

  // tasks, follow-ups, events, notes, templates
  for (const t of D.TASKS) {
    const r = await call('tasks', 'POST', '/tasks', {
      title: t.title, priority: t.priority, status: t.status, due_date: D.at(t.due[0], t.due[1]), assigned_to: ids.staff[t.assignee],
      ...('lead' in t && t.lead ? { related_lead_id: ids.leads[t.lead] } : {}),
    });
    if (r?.id) ids.tasks[t.title] = r.id;
  }
  if (ids.tasks[D.TASK_COMMENT.task]) await call('taskComments', 'POST', `/tasks/${ids.tasks[D.TASK_COMMENT.task]}/comments`, { content: D.TASK_COMMENT.content });
  for (const f of D.FOLLOW_UPS) await call('followUps', 'POST', '/follow-ups', { leadId: ids.leads[f.lead], scheduledAt: D.at(f.when[0], f.when[1]), type: f.type, notes: f.notes });
  for (const e of D.EVENTS) {
    await call('events', 'POST', '/events', { title: e.title, event_type: e.type, start_at: D.at(e.start[0], e.start[1]), end_at: D.at(e.end[0], e.end[1]), all_day: 'allDay' in e ? e.allDay : false, ...('location' in e ? { location: e.location } : {}) });
  }
  for (const n of D.STICKY_NOTES) await call('stickyNotes', 'POST', '/sticky-notes', n);
  for (const t of D.MESSAGE_TEMPLATES) await call('messageTemplates', 'POST', '/templates', { channel: t.channel, name: t.name, category: t.category, content: t.content, ...('subject' in t ? { subject: t.subject } : {}) });

  // visa desk: travellers + applications
  const travellers: Record<string, string> = {};
  for (const t of D.TRAVELLERS) {
    const r = await call('travellers', 'POST', '/travellers', {
      contactId: ids.contacts[t.contact], firstName: t.firstName, lastName: t.lastName, passportNumber: t.passportNumber,
      dateOfBirth: t.dateOfBirth, gender: t.gender, nationality: t.nationality, passportExpiryDate: t.passportExpiryDate,
      email: D.CONTACTS.find((x) => x.key === t.contact)?.email, phone: D.CONTACTS.find((x) => x.key === t.contact)?.phone,
    });
    if (r?.id) travellers[t.key] = r.id;
  }
  for (const v of D.VISAS) {
    const r = await call('visaApplications', 'POST', '/visa', {
      travellerId: travellers[v.traveller], ...(v.lead ? { leadId: ids.leads[v.lead] } : {}), destinationCountry: v.country, visaType: v.type,
      ...(v.expectedIn !== undefined ? { expectedDate: D.day(v.expectedIn) } : {}),
    });
    if (!r?.id) continue;
    await call('visaApplications', 'PUT', `/visa/${r.id}`, {
      status: v.status, ...(v.applicationNumber ? { applicationNumber: v.applicationNumber } : {}), ...(v.appliedAgo !== undefined ? { appliedDate: D.day(-v.appliedAgo) } : {}),
      ...(v.embassy ? { embassyName: v.embassy } : {}), ...(v.visaNumber ? { visaNumber: v.visaNumber, visaIssueDate: D.day(-3), visaEntryType: 'single', approvedDate: D.day(-3) } : {}),
      ...(v.expiresIn !== undefined ? { visaExpiryDate: D.day(v.expiresIn) } : {}), ...(v.expectedIn !== undefined ? { expectedDate: D.day(v.expectedIn) } : {}),
    });
  }

  // marketing: segments (filters that match seeded contacts) + campaigns
  const segments: Record<string, string> = {};
  for (const s of D.SEGMENTS) {
    const r = await call('segments', 'POST', '/marketing/segments', { name: s.name, description: s.description, filtersJson: JSON.stringify(s.filters), isDynamic: true });
    if (r?.id) segments[s.key] = r.id;
  }
  ids.segments = segments;
  ids.campaigns = {};
  for (const cp of D.CAMPAIGNS) {
    const r = await call('campaigns', 'POST', '/marketing/campaigns', {
      name: cp.name, type: cp.type, segmentId: segments[cp.segment], messageBody: cp.body, ...(cp.subject ? { emailSubject: cp.subject } : {}),
      ...(cp.inDays !== undefined ? { scheduledAt: D.at(cp.inDays, '10:00') } : {}),
    });
    if (r?.id) ids.campaigns[cp.name] = r.id;
  }

  // starred leads for the Bookmarks page
  for (const k of ['L02', 'L03', 'L12']) if (ids.leads[k]) await call('bookmarks', 'POST', '/bookmarks', { entityType: 'lead', entityId: ids.leads[k] });

  // marketing: two unsubscribes, a draft WhatsApp broadcast and three flyer templates (the walkthrough builds a flyer from one)
  for (const [key, channel, reason] of [['C27', 'email', 'Unsubscribed from the Diwali campaign'], ['C20', 'whatsapp', 'Asked to stop promotional messages']] as const) {
    if (ids.contacts[key]) await call('optOuts', 'POST', `/marketing/opt-out/${ids.contacts[key]}`, { channel, reason });
  }
  await call('whatsappCampaigns', 'POST', '/whatsapp-campaigns', {
    name: 'Diwali greetings to past travellers', templateName: 'diwali_greetings',
    templateContent: 'Hi {{1}}, Sahyadri Holidays wishes you and your family a bright and happy Diwali. Our festive Goa and Udaipur offers start from ₹24,999 per person.',
    templateVariables: { '1': 'first_name' }, audienceFilter: { tags: ['repeat'] },
  });
  for (const t of [
    { name: 'Festival offer', category: 'festival', description: 'Headline, offer and contact strip for festival campaigns', sizePreset: 'instagram_post', width: 1080, height: 1080 },
    { name: 'Destination spotlight', category: 'general', description: 'One hero destination with a short pitch', sizePreset: 'instagram_post', width: 1080, height: 1080 },
    { name: 'Last-minute deal', category: 'promotional', description: 'Urgent departures at a special price', sizePreset: 'whatsapp_status', width: 1080, height: 1920 },
  ]) await call('flyerTemplates', 'POST', '/marketing/flyer-templates', { ...t, isQuickCreate: true });

  return ids;
}

// ─── Live trip (H5) ──────────────────────────────────────────────

async function ensureLiveTrip(ids: Ids): Promise<void> {
  const nowT = D.nowIST();
  const p = D.pickupTime(50);
  // The driver app lists a trip under "Today" by tenant (IST) date: the pickup must stay on today's date.
  const pickupDateIST = new Date(new Date(p.iso).getTime() + 330 * 60_000).toISOString().slice(0, 10);
  if (pickupDateIST !== D.d0()) throw new Error(`pickup ${p.hhmm} IST rolls past midnight (now ${nowT.hhmm} IST) - record earlier in the day`);
  if (p.minutesOfDay > 21 * 60 + 30) throw new Error(`pickup ${p.hhmm} IST is after 21:30 IST - too late to record`);

  const vehicleId = ids.vehicles.VH1, driverId = ids.drivers.DR1;
  if (!vehicleId || !driverId) throw new Error("seed.json has no Ravi / KA 05 MN 4521 - run the full seed first");
  // Cancel any earlier open H5 trip for Ravi so the vehicle/driver conflict check passes.
  const open = rows(await call('liveTripList', 'GET', `/fleet/trips?driverId=${driverId}&limit=100`));
  for (const t of open) {
    if (!String(t.pickupLocation ?? t.pickup_location ?? '').includes('Arrival Gate 2')) continue;
    // transitions: assigned|accepted -> cancelled; en_route -> started -> completed (no cancel from there)
    const next: Record<string, string[]> = { assigned: ['cancelled'], accepted: ['cancelled'], en_route: ['started', 'completed'], started: ['completed'] };
    for (const st of next[t.status] ?? []) await call('liveTripClear', 'PUT', `/fleet/trips/${t.id}/status`, { status: st, ...(st === 'cancelled' ? { reason: 'Rescheduled' } : {}) });
  }
  const trip = D.liveAirportTrip(vehicleId, driverId, undefined, ids.leads.L01);
  const r = await call('liveTrip', 'POST', '/fleet/trips', trip.body);
  if (!r?.id) throw new Error(`could not create the live airport trip: ${rejections.at(-1)}`);
  ids.liveTrip = { id: r.id, pickupHHMM: trip.pickupHHMM };
  await call('events', 'POST', '/events', { title: 'Mehta arrival — Kochi airport', event_type: 'reminder', start_at: p.iso, end_at: new Date(new Date(p.iso).getTime() + 3600_000).toISOString() });
  fs.writeFileSync(HANDOFF_JSON, JSON.stringify({ tripId: r.id, driverPhone: '9876543210', otp: '123456', pickupHHMM: trip.pickupHHMM, apiUrl: API, d0: ids.d0 }, null, 2));
}

// ─── Verify ──────────────────────────────────────────────────────

async function verify(ids: Ids): Promise<boolean> {
  await login();
  const expected: [string, string, number][] = [
    ['contacts', '/contacts?limit=100', D.CONTACTS.length],
    ['leads', '/leads?limit=100', D.LEADS.length],
    ['suppliers', '/suppliers?limit=100', D.SUPPLIERS.length],
    ['rate-cards', '/rate-cards?limit=100', D.RATE_CARDS.length],
    ['itinerary-templates', '/itinerary-templates?limit=100', 1 + D.OTHER_TEMPLATES.length],
    ['invoices', '/invoices?limit=100', D.INVOICES.length + 1 /* + the credit note */],
    ['vouchers', '/vouchers?limit=100', D.VOUCHERS.length],
    ['fleet/vehicles', '/fleet/vehicles?limit=100', D.VEHICLES.length],
    ['fleet/drivers', '/fleet/drivers?limit=100', D.DRIVERS.length],
    ['fleet/trips', '/fleet/trips?limit=100', D.TRIPS.length + (ids.liveTrip ? 1 : 0)],
    ['tasks', '/tasks?view=all&limit=100', D.TASKS.length],
    ['users', '/users?limit=100', D.STAFF.length],
    ['visa', '/visa?limit=100', D.VISAS.length],
    ['marketing/segments', '/marketing/segments?limit=100', D.SEGMENTS.length],
    ['marketing/campaigns', '/marketing/campaigns?limit=100', D.CAMPAIGNS.length],
  ];
  let ok = true;
  const dump: string[] = [];
  const report: string[] = [];
  for (const [name, p, want] of expected) {
    const r = await raw('GET', p);
    const list = rows(r.json?.data ?? r.json);
    const total = r.json?.pagination?.total ?? r.json?.data?.total ?? r.json?.total ?? list.length;
    const got = name === 'users' ? list.filter((u) => u.isActive !== 0 && u.is_active !== 0).length : Math.max(list.length, Number(total) || 0);
    const good = name === 'users' ? got === want : got >= want;
    if (!good) ok = false;
    report.push(`${good ? 'ok  ' : 'FAIL'} ${name}: ${got} (expected ${want}${name === 'fleet/trips' ? '+' : ''})`);
    dump.push(JSON.stringify(list));
  }

  // every segment must resolve to real contacts (a campaign "Send" needs recipients)
  for (const [key, id] of Object.entries(ids.segments ?? {})) {
    const r = await raw('GET', `/marketing/segments/${id}/contacts?limit=1`);
    const n = Number(r.json?.pagination?.total ?? r.json?.data?.total ?? 0);
    if (n < 1) ok = false;
    report.push(`${n >= 1 ? 'ok  ' : 'FAIL'} segment ${key}: ${n} matching contacts`);
  }

  // plan / feature flags: the tenant is on a plan that un-gates every module the story shows
  {
    const r = await raw('GET', '/ai/settings');
    const feats: Json = r.json?.data?.features ?? r.json?.data ?? {};
    const list: Json[] = Array.isArray(feats) ? feats : Object.entries(feats).map(([k, v]) => ({ key: k, ...(typeof v === 'object' ? (v as object) : { enabled: v }) }));
    const off = list.filter((f) => (f.enabled ?? f.isEnabled) === false).map((f) => f.key ?? f.featureKey);
    if (r.status >= 400 || off.length) ok = false;
    report.push(`${r.status < 400 && !off.length ? 'ok  ' : 'FAIL'} feature flags: ${list.length} features, disabled: ${off.length ? off.join(', ') : 'none'}`);
  }

  // dashboard/report figures: closed sales in the current month and invoiced revenue in each of the last six months
  {
    const [y, m] = D.d0().split('-').map(Number) as [number, number];
    const iso = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd)).toISOString().slice(0, 10);
    await raw('DELETE', '/reports/cache');
    const sales = await raw('GET', `/reports/sales_summary?date_from=${iso(y, m - 1, 1)}&date_to=${iso(y, m, 0)}`);
    const srows: Json[] = rows(sales.json?.data?.data ?? sales.json?.data ?? []);
    const won = srows.reduce((a, r) => a + Number(r.won_leads ?? 0), 0);
    const rev = srows.reduce((a, r) => a + Number(r.total_revenue ?? 0), 0);
    if (won < 1 || rev <= 0) ok = false;
    report.push(`${won >= 1 && rev > 0 ? 'ok  ' : 'FAIL'} sales this month: ${won} won, revenue ${rev}`);
    const trend: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const res = await raw('GET', `/reports/revenue_summary?date_from=${iso(y, m - 1 - i, 1)}&date_to=${iso(y, m - i, 0)}`);
      const r2: Json[] = rows(res.json?.data?.data ?? res.json?.data ?? []);
      const total = r2.filter((r) => r.status !== 'cancelled').reduce((a, r) => a + Number(r.total_amount ?? 0), 0);
      trend.push(`${iso(y, m - 1 - i, 1).slice(0, 7)}=${Math.round(total)}`);
      if (total <= 0) ok = false;
    }
    report.push(`${trend.some((t) => t.endsWith('=0')) ? 'FAIL' : 'ok  '} invoiced revenue by month: ${trend.join('  ')}`);
  }

  const text = dump.join('\n');
  for (const re of D.BANNED_PATTERNS) {
    const m = text.match(re);
    if (m) { ok = false; report.push(`FAIL banned pattern ${re} found: "...${text.slice(Math.max(0, m.index! - 40), m.index! + 60)}..."`); }
  }
  console.log(report.join('\n'));
  return ok;
}

// ─── main ────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  fs.mkdirSync(WORK_DIR, { recursive: true });
  if (argv.includes('--verify')) {
    const ids: Ids = JSON.parse(fs.readFileSync(SEED_JSON, 'utf8'));
    process.exit((await verify(ids)) ? 0 : 1);
  }
  if (argv.includes('--live-trip')) {
    await login();
    const ids: Ids = JSON.parse(fs.readFileSync(SEED_JSON, 'utf8'));
    await ensureLiveTrip(ids);
    fs.writeFileSync(SEED_JSON, JSON.stringify(ids, null, 2));
    console.log(`live trip ${ids.liveTrip!.id} pickup ${ids.liveTrip!.pickupHHMM} IST`);
    if (rejections.length) { console.error(rejections.join('\n')); process.exit(1); }
    return;
  }
  const ids = await seedAll();
  await login();
  await setAutomationsPaused(false);
  fs.writeFileSync(SEED_JSON, JSON.stringify(ids, null, 2));
  console.log('seeded:', JSON.stringify(counters));
  if (rejections.length) {
    console.error(`\n${rejections.length} REJECTION(S):\n${rejections.join('\n')}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
