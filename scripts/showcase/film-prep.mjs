#!/usr/bin/env node
/**
 * Off-camera preparation for the video catalogue films (docs/videos/RECORDING-RUNBOOK.md). Local TEST_MODE stacks only:
 * every step uses the local D1 files or TEST_MODE routes, never a provider, never AI.
 *
 *   node scripts/showcase/film-prep.mjs --demo            single-agency stack, after backend/scripts/seed-demo.mjs:
 *                                                         staff passwords, a view-only teammate, demo agency on Enterprise
 *   node scripts/showcase/film-prep.mjs --transcript <callLogId>
 *                                                         store a sample transcript on a call (the calls film; no AI runs)
 *   node scripts/showcase/film-prep.mjs --operator        add the console operator (Asha Rao) to the master database
 *   node scripts/showcase/film-prep.mjs --agencies [--with-a]
 *                                                         multi-agency stack: agencies B (UK, Pro) and C (UAE, Enterprise),
 *                                                         first login done, a few records each; --with-a also creates A
 *                                                         (India, Basic) when the platform film did not
 *
 * Env: E2E_API_URL (default http://localhost:8787/api/v1), D1_DIR (default backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject).
 * Writes desktop/showcase/.work/film-agencies.json (credentials of the film agencies; the folder is gitignored).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = (process.env.E2E_API_URL ?? 'http://localhost:8787/api/v1').replace(/\/+$/, '');
const D1_DIR = process.env.D1_DIR ?? path.join(root, 'backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const WORK = path.join(root, 'desktop/showcase/.work');
const TENANT_ID = '01960000-0000-7000-8000-000000000001';
const DEMO_EMAIL = 'ananya.menon@example.com';
const PASSWORD = 'Admin@123';
const STAFF = ['rahul.nair@example.com', 'sneha.iyer@example.com', 'farhan.qureshi@example.com', 'deepa.thomas@example.com', 'vikram.rao@example.com'];
export const VIEW_ONLY = { name: 'Leela Fernandes', email: 'leela.fernandes@example.com', role: 'view_only', department: 'Partners' };
export const OPERATOR = { name: 'Asha Rao', email: 'asha.rao@travelcrm.example', password: 'Console-Operator-2026' };
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const log = (m) => console.log(`[film-prep] ${m}`);
const bcrypt = createRequire(path.join(root, 'backend', 'package.json'))('bcryptjs');

// UUIDv7 (project rule)
let lastMs = 0, seq = 0;
function uuid7() {
  let ms = Date.now();
  if (ms === lastMs) seq = (seq + 1) & 0xfff; else { lastMs = ms; seq = Math.floor(Math.random() * 0x400); }
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[0] = (ms / 2 ** 40) & 255; b[1] = (ms / 2 ** 32) & 255; b[2] = (ms / 2 ** 24) & 255; b[3] = (ms / 2 ** 16) & 255; b[4] = (ms / 2 ** 8) & 255; b[5] = ms & 255;
  b[6] = 0x70 | (seq >> 8); b[7] = seq & 255; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function call(method, p, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}
async function login(email, password, tenantId) {
  const r = await call('POST', '/auth/login', { email, password, tenantId });
  if (!r.json?.data?.accessToken) throw new Error(`login ${email}: ${r.status} ${r.text.slice(0, 200)}`);
  return r.json.data;
}
async function superToken() {
  const r = await call('POST', '/test/super-admin');
  if (!r.json?.data?.accessToken) throw new Error(`/test/super-admin: ${r.status} (is this a TEST_MODE stack?)`);
  return r.json.data.accessToken;
}
const must = (r, what) => { if (r.status >= 300) throw new Error(`${what}: ${r.status} ${r.text.slice(0, 300)}`); return r.json?.data; };

/** The D1 sqlite files of the local stack; `want(db)` picks the one we need. */
async function openDb(want, label) {
  const { DatabaseSync } = await import('node:sqlite');
  const files = fs.readdirSync(D1_DIR).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  for (const f of files) {
    const db = new DatabaseSync(path.join(D1_DIR, f));
    db.exec('PRAGMA busy_timeout = 15000');
    try { if (want(db)) return db; } catch { /* not this one */ }
    db.close();
  }
  throw new Error(`no local D1 file holds ${label} (looked in ${D1_DIR})`);
}
const hasTable = (db, t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);

// ── --demo ───────────────────────────────────────────────────
async function demo() {
  const db = await openDb((d) => hasTable(d, 'users') && !!d.prepare('SELECT 1 FROM users WHERE email = ?').get(DEMO_EMAIL), 'the demo agency (run backend/scripts/seed-demo.mjs first)');
  const hash = bcrypt.hashSync(PASSWORD, 10);
  for (const email of STAFF) {
    const r = db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE email = ?').run(hash, email);
    log(`${email}: ${r.changes ? 'password set' : 'not found'}`);
  }
  db.close();
  const me = await login(DEMO_EMAIL, PASSWORD, TENANT_ID);
  const team = await call('GET', '/users?limit=100', undefined, me.accessToken);
  const list = team.json?.data?.data ?? team.json?.data ?? [];
  if (!list.some((u) => String(u.email).toLowerCase() === VIEW_ONLY.email)) {
    const inv = await call('POST', '/users', { email: VIEW_ONLY.email, name: VIEW_ONLY.name, role: VIEW_ONLY.role, department: VIEW_ONLY.department }, me.accessToken);
    const token = must(inv, 'invite the view-only teammate')?.inviteToken;
    if (!token) throw new Error('the invite returned no inviteToken');
    must(await call('POST', '/auth/setup-account', { token, name: VIEW_ONLY.name, password: PASSWORD }), 'accept the invitation');
    log(`${VIEW_ONLY.email}: view-only teammate added`);
  } else log(`${VIEW_ONLY.email}: already there`);
  // Every feature is visible in the area films: the demo agency runs on Enterprise (the plans film shows the limits).
  must(await call('PUT', `/admin/tenants/${TENANT_ID}/plan`, { plan: 'enterprise', reason: 'video catalogue: show every feature' }, await superToken()), 'plan change');
  log('demo agency is on Enterprise');
  await call('DELETE', '/test/outbox');
}

// ── --transcript <callLogId> ─────────────────────────────────
const SAMPLE = [
  ['agent', 'Good afternoon, Sahyadri Holidays, Sneha speaking.'],
  ['customer', 'Hi Sneha, this is Rohit. We are four adults looking at Coorg for a long weekend in January.'],
  ['agent', 'Lovely. Do you have dates in mind, and would you like a homestay or a resort?'],
  ['customer', 'The twenty-third to the twenty-sixth. A coffee estate homestay would be perfect, with a driver for the three days.'],
  ['agent', 'Noted. I will send two homestay options with an Innova and a driver by this evening.'],
  ['customer', 'Great, WhatsApp is best. Thank you.'],
];
async function transcript(callLogId) {
  if (!callLogId) throw new Error('--transcript needs a call log id');
  const db = await openDb((d) => hasTable(d, 'call_logs') && !!d.prepare('SELECT 1 FROM call_logs WHERE id = ?').get(callLogId), `call ${callLogId}`);
  let t = 0; const segs = SAMPLE.map(([speaker, text]) => { const d = Math.max(2.5, text.split(' ').length / 2.6); const s = { speaker, text, start: +t.toFixed(1), end: +(t + d).toFixed(1), confidence: 0.94 }; t += d + 0.6; return s; });
  const full = SAMPLE.map(([s, x]) => `${s === 'agent' ? 'Agent' : 'Customer'}: ${x}`).join('\n');
  db.prepare('DELETE FROM call_transcripts WHERE call_log_id = ?').run(callLogId);
  db.prepare(`INSERT INTO call_transcripts (id, call_log_id, full_transcript, speaker_segments, language, confidence, word_count, duration_seconds, transcription_model, created_at)
              VALUES (?, ?, ?, ?, 'en', 0.94, ?, ?, 'sample (video catalogue)', strftime('%Y-%m-%dT%H:%M:%SZ','now'))`)
    .run(uuid7(), callLogId, full, JSON.stringify(segs), full.split(/\s+/).length, Math.round(t));
  db.close();
  log(`sample transcript stored on call ${callLogId}`);
}

// ── --operator ───────────────────────────────────────────────
async function operator() {
  const db = await openDb((d) => hasTable(d, 'super_admins') && hasTable(d, 'tenants'), 'the master database');
  db.prepare('DELETE FROM super_admins WHERE email = ?').run(OPERATOR.email);
  db.prepare("INSERT INTO super_admins (id, email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, 'super_admin', 1)").run(uuid7(), OPERATOR.email, OPERATOR.name, bcrypt.hashSync(OPERATOR.password, 10));
  db.close();
  log(`console operator ${OPERATOR.email} ready`);
}

// ── --agencies ───────────────────────────────────────────────
export const AGENCIES = {
  A: { slug: 'skyline-holidays', companyName: 'Skyline Holidays', ownerName: 'Kavya Rao', email: 'kavya.rao@example.com', plan: 'basic', country: 'India', currency: 'INR', timezone: 'Asia/Kolkata', taxSystem: 'gst', region: 'in', password: 'Skyline-Voyage-2026', city: 'Pune', phone: '+919822013344' },
  B: { slug: 'thames-tide', companyName: 'Thames & Tide Travel', ownerName: 'Oliver Grant', email: 'oliver.grant@example.co.uk', plan: 'pro', country: 'United Kingdom', currency: 'GBP', timezone: 'Europe/London', taxSystem: 'vat', region: 'uk', password: 'Thames-Voyage-2026', city: 'Bristol', phone: '+447700900611' },
  C: { slug: 'desert-pearl', companyName: 'Desert Pearl Tours', ownerName: 'Layla Haddad', email: 'layla.haddad@example.com', plan: 'enterprise', country: 'United Arab Emirates', currency: 'AED', timezone: 'Asia/Dubai', taxSystem: 'vat', region: 'gulf', password: 'Pearl-Voyage-2026', city: 'Dubai', phone: '+971501112233' },
};
const RECORDS = {
  A: { contacts: [['Meera Joshi', '+919822045566', 'meera.joshi@example.com', 'Pune'], ['Aakash Patil', '+919822077881', 'aakash.patil@example.com', 'Nashik']], lead: ['Goa Monsoon Break', ['Goa'], 42000], invoice: ['Goa Monsoon Break — 3N, transfers', 40000, 5] },
  B: { contacts: [['Charlotte Hughes', '+447700900144', 'charlotte.hughes@example.co.uk', 'Bath'], ['Tom Walker', '+447700900277', 'tom.walker@example.co.uk', 'Cardiff']], lead: ['Kerala Spice Trail — 10 nights', ['Kochi', 'Munnar', 'Alleppey'], 6800], invoice: ['Kerala Spice Trail — 10 nights, private driver', 5650, 20] },
  C: { contacts: [['Omar Al Farsi', '+971501234890', 'omar.alfarsi@example.com', 'Abu Dhabi'], ['Sara Mansour', '+971502345901', 'sara.mansour@example.com', 'Sharjah']], lead: ['Maldives Family Escape', ['Maldives'], 28000], invoice: ['Maldives Family Escape — 5N water villa', 26500, 5] },
};
function saveAgency(key, a) {
  fs.mkdirSync(WORK, { recursive: true });
  const file = path.join(WORK, 'film-agencies.json');
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  all[key] = a;
  fs.writeFileSync(file, JSON.stringify(all, null, 2));
}
export async function ensureAgency(key, sa) {
  const p = AGENCIES[key];
  const found = (await call('GET', `/admin/tenants?search=${p.slug}`, undefined, sa)).json?.data;
  const listed = (Array.isArray(found) ? found : found?.tenants ?? found?.data ?? []).find((t) => t.slug === p.slug || t.subdomain === p.slug);
  let tenantId = listed?.id;
  if (!tenantId) {
    const made = must(await call('POST', '/admin/tenants', { companyName: p.companyName, slug: p.slug, ownerName: p.ownerName, ownerEmail: p.email, plan: p.plan, country: p.country, currency: p.currency, timezone: p.timezone, taxSystem: p.taxSystem, region: p.region }, sa), `create ${p.companyName}`);
    tenantId = made.tenantId;
    const first = await login(p.email, made.temporaryPassword, tenantId);
    must(await call('POST', '/auth/change-password', { currentPassword: made.temporaryPassword, newPassword: p.password }, first.accessToken), 'first password');
    log(`${p.companyName} created (${p.plan}, ${p.country})`);
  } else log(`${p.companyName} already exists`);
  const me = await login(p.email, p.password, tenantId);
  const t = me.accessToken;
  must(await call('PUT', '/settings/company', { company_name: p.companyName, company_city: p.city, company_phone: p.phone, company_email: p.email, onboarding_completed: 'true' }, t), 'company settings');
  const r = RECORDS[key];
  const contacts = (await call('GET', '/contacts?limit=50', undefined, t)).json?.data ?? [];
  if (!(Array.isArray(contacts) ? contacts : contacts.data ?? []).length) {
    const ids = [];
    for (const [name, phone, email, city] of r.contacts) ids.push(must(await call('POST', '/contacts', { name, phone, email, city, country: p.country, source: 'website', type: 'customer' }, t), `contact ${name}`).id);
    const lead = must(await call('POST', '/leads', { contactId: ids[0], title: r.lead[0], destinations: r.lead[1], budget: r.lead[2], currency: p.currency, paxAdults: 2, tripType: 'international', source: 'website', priority: 'hot' }, t), 'lead');
    const day = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
    const inv = must(await call('POST', '/invoices', { contactId: ids[0], leadId: lead.id, type: 'tax_invoice', currency: p.currency, items: [{ description: r.invoice[0], quantity: 1, rate: r.invoice[1], taxRate: r.invoice[2] }], dueDate: day(21) }, t), 'invoice');
    must(await call('POST', '/payments', { invoiceId: inv.id, amount: Math.round(r.invoice[1] * 0.4), date: day(-1), method: 'transfer', reference: `${p.currency}-ADV-2201` }, t), 'payment');
    log(`${p.companyName}: 2 contacts, a lead, an invoice and an advance`);
  }
  const a = { key, tenantId, slug: p.slug, companyName: p.companyName, email: p.email, password: p.password, plan: p.plan, country: p.country };
  saveAgency(key, a);
  return a;
}

try {
  if (has('--demo')) await demo();
  if (has('--transcript')) await transcript(argv[argv.indexOf('--transcript') + 1]);
  if (has('--operator')) await operator();
  if (has('--agencies')) {
    const sa = await superToken();
    if (has('--with-a')) await ensureAgency('A', sa);
    await ensureAgency('B', sa);
    await ensureAgency('C', sa);
  }
  if (!['--demo', '--transcript', '--operator', '--agencies'].some(has)) { console.error('usage: film-prep.mjs --demo | --transcript <callLogId> | --operator | --agencies [--with-a]'); process.exit(2); }
} catch (e) {
  console.error(`[film-prep] FAILED: ${e.message}`);
  process.exit(1);
}
