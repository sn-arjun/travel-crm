/**
 * Film kit: narration-paced recording for the video catalogue (docs/videos/CATALOGUE.md).
 *
 * Each film has a recording spec here (films/<film>.spec.ts) and a clip in studio/clips/<film>.json. Every screen scene of the
 * clip names a `step`; the spec plays the same step with beat(page, '<step>', async () => { ...actions... }):
 *
 *   1. mark "step:<id>" (video-relative, into desktop/showcase/.work/marks-<film>.json)
 *   2. run the actions while a timer runs for the scene's narration (from studio/out/narration/<film>/narration.json, written by
 *      `node studio/src/build.mjs <film> --no-render`; if that file is missing the length is estimated at 2.55 words a second)
 *   3. wait for whichever is longer, check the page is clean (assertClean), mark "step-end:<id>"
 *
 * studio/src/build.mjs then sets each scene's in/out from those marks, so scenes line up without hand-picked times.
 * focus(page, '<id>', locator) records an element's box as "focus:<id>": a scene's zoom/callout with `focus` aims at it.
 * Nothing is burned into the recording except the cursor (Remotion draws lower-thirds and captions); FILM_BURN_CAPTIONS=1 burns
 * the narration in as a caption for reviewing a dry run.
 *
 * Rules (same as the showcase harness): no failure captions, no "continue after failure"; any console error, HTTP error or banned
 * text aborts the take (the orchestrator retakes, at most twice). No live AI and no real provider is ever touched here.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { test as base, expect } from '@playwright/test';

import { DEMO_EMAIL, DEMO_PASSWORD, STAFF, TENANT_ID } from '../demo-data';
import {
  allowHttp, assertClean, attachListeners, clickOn, elapsedMs, finishRecording, hoverOn, installOverlays, mark, moveTo, PACE, pause, settle, startRecording, typeInto,
  scrollSteps, WORK_DIR,
} from '../showcase-helpers';

import type { BrowserContext, Locator, Page, TestInfo } from '@playwright/test';

export { expect };
export { allowHttp, clickOn, hoverOn, moveTo, pause, scrollSteps, settle, typeInto };
export { pickDate, pickDateTime, pickRelation, pickSelect } from '../showcase-helpers';

// ─── Stack addresses ─────────────────────────────────────────────

export const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:8787/api/v1').replace(/\/+$/, '');
export const BASE_URL = (process.env.E2E_BASE_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
/** The super admin console (scripts/showcase/console-up.mjs serves it on the web port + 5). */
export const CONSOLE_URL = (process.env.E2E_CONSOLE_URL ?? BASE_URL.replace(/:(\d+)$/, (_m, p: string) => `:${Number(p) + 5}`)).replace(/\/+$/, '');
export const REPO = path.resolve(__dirname, '..', '..', '..', '..');
export const LANDING_URL = process.env.E2E_LANDING_URL ?? `file:///${path.join(REPO, 'landing', 'index.html').replace(/\\/g, '/')}`;

/** The view-only teammate scripts/showcase/film-prep.mjs adds to the demo agency (the demo seed has none). */
export const VIEW_ONLY = { name: 'Leela Fernandes', email: 'leela.fernandes@example.com', role: 'view_only' as const };
export const staffEmail = (key: string): string => {
  const s = STAFF.find((x) => x.key === key);
  if (!s) throw new Error(`no staff ${key}`);
  return s.email;
};

// ─── Sessions ────────────────────────────────────────────────────

async function mint(email: string, password: string, tenantId: string): Promise<{ cookies: []; origins: { origin: string; localStorage: { name: string; value: string }[] }[] }> {
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, tenantId }) });
    const json = (await res.json().catch(() => ({}))) as { data?: { accessToken?: string; refreshToken?: string; user?: unknown; tenant?: unknown } };
    const d = json.data;
    if (d?.accessToken && d.refreshToken) {
      const state = { accessToken: d.accessToken, refreshToken: d.refreshToken, isAuthenticated: true, user: d.user, tenant: d.tenant };
      return { cookies: [], origins: [{ origin: new URL(BASE_URL).origin, localStorage: [{ name: 'travelcrm-auth', value: JSON.stringify({ state, version: 0 }) }] }] };
    }
    last = `${res.status} ${JSON.stringify(json).slice(0, 300)}`;
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error(`film login failed for ${email}: ${last} (did scripts/showcase/film-prep.mjs run after the demo seed?)`);
}

/** A test whose page is signed in as `email` in the demo agency (fresh API login per test, so no take ever refreshes a token). */
export function asUser(email: string = DEMO_EMAIL, password: string = DEMO_PASSWORD, tenantId: string = TENANT_ID) {
  return base.extend({
    storageState: async ({}, provide) => {
      await provide(await mint(email, password, tenantId));
    },
  });
}
/** A logged-out visitor (sign-in pages, the console, the landing page). */
export const anonymous = base.extend({ storageState: async ({}, provide) => { await provide({ cookies: [], origins: [] }); } });

// ─── Narration manifest ──────────────────────────────────────────

interface Beat { id: string; narration: string; seconds: number; from: 'tts' | 'estimate'; played: boolean }
let film = '';
let beats = new Map<string, Beat>();
let current = '';
const BURN = process.env.FILM_BURN_CAPTIONS === '1';
const WORDS_PER_SECOND = 2.55; // af_heart at Kokoro's default speed, measured on the pilot

function loadBeats(name: string): Map<string, Beat> {
  const clipFile = path.join(REPO, 'studio', 'clips', `${name}.json`);
  if (!fs.existsSync(clipFile)) throw new Error(`no clip ${clipFile}`);
  const clip = JSON.parse(fs.readFileSync(clipFile, 'utf8')) as { recording?: string; scenes: { type: string; step?: string; narration?: string; recording?: string }[] };
  const manifestFile = path.join(REPO, 'studio', 'out', 'narration', name, 'narration.json');
  const manifest = fs.existsSync(manifestFile) ? (JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as { lines: { id: string; duration: number; text: string }[] }) : null;
  if (!manifest) console.warn(`  [film] no narration manifest for ${name}: pacing from a word-count estimate (run: node studio/src/build.mjs ${name} --no-render)`);
  const out = new Map<string, Beat>();
  clip.scenes.forEach((s, i) => {
    if (!s.step || (s.recording ?? clip.recording) !== name) return;
    const text = s.narration ?? '';
    const line = manifest?.lines.find((l) => l.id === `n${String(i).padStart(2, '0')}`);
    const fromTts = !!line && line.text === text;
    if (line && !fromTts) console.warn(`  [film] narration for step ${s.step} changed since the manifest was built: estimating`);
    const seconds = fromTts ? line!.duration : text.split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND + 0.3;
    out.set(s.step, { id: s.step, narration: text, seconds, from: fromTts ? 'tts' : 'estimate', played: false });
  });
  return out;
}

const sc = (page: Page, fn: string, args: unknown[] = []) =>
  page.evaluate(([f, a]) => (window as any).__sc?.[f as string]?.(...(a as unknown[])), [fn, args] as [string, unknown[]]).catch(() => undefined);

/**
 * One scene of the film. Runs `body` while the scene's narration plays (in the final cut), then holds until the narration would
 * have ended (+0.65 s: the 0.25 s lead-in and 0.4 s tail the timeline adds), checks the page, and marks the scene's end.
 */
export async function beat(page: Page, id: string, body?: () => Promise<void>, o: { extraMs?: number; refusalShown?: boolean } = {}): Promise<void> {
  const b = beats.get(id);
  if (!b) throw new Error(`beat "${id}" has no screen scene with step "${id}" in studio/clips/${film}.json`);
  if (b.played) throw new Error(`beat "${id}" played twice`);
  b.played = true;
  current = id;
  mark(`step:${id}`, { narration: b.narration.slice(0, 80), seconds: +b.seconds.toFixed(2), from: b.from });
  if (BURN) await sc(page, 'say', [b.narration, id]);
  const t0 = Date.now();
  const target = (b.seconds + 0.65) * 1000 * PACE + (o.extraMs ?? 0);
  if (body) await body();
  const left = target - (Date.now() - t0);
  if (left > 0) await page.waitForTimeout(left);
  // A scene that shows a refusal on purpose (seat limit, upgrade prompt) skips the on-screen error check; HTTP refusals it expects
  // are declared with allowHttp() and everything else still counts.
  if (!o.refusalShown) await assertClean(page, id);
  if (BURN) await sc(page, 'clearSay');
  mark(`step-end:${id}`);
  current = '';
}

/** Record where an element is (for a zoom or callout in the cut) and move the visible pointer onto it. */
export async function focus(page: Page, id: string, target: Locator, o: { move?: boolean; dwellMs?: number } = {}): Promise<void> {
  await target.waitFor({ state: 'visible', timeout: 15_000 });
  await target.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => undefined);
  const box = await target.boundingBox();
  const vp = page.viewportSize() ?? { width: 1920, height: 1080 };
  if (box) mark(`focus:${id}`, { step: current, box: { x: box.x / vp.width, y: box.y / vp.height, w: box.width / vp.width, h: box.height / vp.height } });
  if (o.move !== false) await moveTo(page, target);
  if (o.dwellMs) await pause(page, o.dwellMs);
}

/** Hover only if the element shows up within 4 s: for decoration (never for a step the story depends on). */
export async function glance(page: Page, target: Locator, dwellMs = 700): Promise<void> {
  if (await target.first().isVisible().catch(() => false)) { await hoverOn(page, target.first(), dwellMs); return; }
  try { await target.first().waitFor({ state: 'visible', timeout: 4000 }); await hoverOn(page, target.first(), dwellMs); } catch { console.log(`  [film] glance skipped: ${target}`); }
}

/** Navigate (sidebar link when there is one, else a direct load) and wait for the page to finish loading. */
export async function visit(page: Page, href: string, ms = 1100): Promise<void> {
  const link = page.locator(`aside a[href="${href}"]`).first();
  if (await link.isVisible().catch(() => false)) await clickOn(page, link);
  else await page.goto(href);
  await page.waitForURL((u) => u.pathname + u.search === href || u.pathname === href.split('?')[0], { timeout: 25_000 }).catch(() => undefined);
  await settle(page, ms);
}

/** Open a row of the current list (hover, View button when present, else the row) and wait for the detail route. */
export async function openRow(page: Page, rowText: string | RegExp, urlRe: RegExp): Promise<void> {
  const row = page.locator('table tbody tr').filter({ hasText: rowText }).first();
  await hoverOn(page, row, 450);
  const view = row.getByRole('button', { name: 'View', exact: true }).or(row.getByRole('link', { name: 'View', exact: true }));
  await clickOn(page, (await view.count()) ? view.first() : row);
  await page.waitForURL(urlRe, { timeout: 20_000 });
  await settle(page, 1100);
}

export async function search(page: Page, placeholder: RegExp | string, term: string): Promise<void> {
  await typeInto(page, page.getByPlaceholder(placeholder).first(), term);
  await settle(page, 1200);
}

// ─── Envelope ────────────────────────────────────────────────────

/**
 * The recording around one film: overlays (cursor only), listeners, marks, the saved video in desktop/showcase/.work/<name>.webm.
 * Throws at the end if any scene of the clip was not played, so a dry run catches a spec and clip that drifted apart.
 */
export async function recordFilm(page: Page, context: BrowserContext, name: string, testInfo: TestInfo, body: (page: Page) => Promise<void>): Promise<void> {
  film = name;
  beats = loadBeats(name);
  await installOverlays(context);
  startRecording();
  attachListeners(page);
  let finished = false;
  try {
    await body(page);
    await pause(page, 600);
    const missed = [...beats.values()].filter((b) => !b.played).map((b) => b.id);
    if (missed.length) throw new Error(`steps in studio/clips/${name}.json never played: ${missed.join(', ')}`);
    finished = true;
  } finally {
    fs.mkdirSync(WORK_DIR, { recursive: true });
    if (!finished) await page.screenshot({ path: path.join(WORK_DIR, `fail-${name}.png`) }).catch(() => undefined);
    await finishRecording(page, name, testInfo);
    console.log(`  [film] ${name}: ${(elapsedMs() / 1000).toFixed(0)} s recorded, ${[...beats.values()].filter((b) => b.from === 'tts').length}/${beats.size} beats paced from TTS`);
  }
}

// ─── API (off camera) ────────────────────────────────────────────

const tokens = new Map<string, string>();
export async function tokenFor(email = DEMO_EMAIL, password = DEMO_PASSWORD, tenantId = TENANT_ID): Promise<string> {
  const k = `${tenantId}|${email}`;
  const have = tokens.get(k);
  if (have) return have;
  const res = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, tenantId }) });
  const json = (await res.json()) as { data?: { accessToken?: string } };
  if (!json.data?.accessToken) throw new Error(`login failed for ${email}: ${res.status}`);
  tokens.set(k, json.data.accessToken);
  return json.data.accessToken;
}

/** Off-camera API call as the demo admin (or a given token). Returns the parsed JSON; throws on a transport error only. */
export async function api(method: string, p: string, body?: unknown, token?: string): Promise<any> {
  const t = token ?? (await tokenFor());
  const res = await fetch(API_URL + p, { method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  try { return { status: res.status, ...(JSON.parse(text) as object) }; } catch { return { status: res.status, text }; }
}
export const rows = (r: any): any[] => (Array.isArray(r?.data) ? r.data : Array.isArray(r?.data?.data) ? r.data.data : []);

/** First record of a list endpoint matching `pred` (search narrows it server side). */
export async function findOne(p: string, pred: (x: any) => boolean, token?: string): Promise<any> {
  const hit = rows(await api('GET', p, undefined, token)).find(pred);
  if (!hit) throw new Error(`nothing in ${p} matched (run the demo seed and film-prep first)`);
  return hit;
}

/** The platform's super admin token (TEST_MODE route; the console itself is signed in through its login page). */
export async function superAdminToken(): Promise<string> {
  const res = await fetch(`${API_URL}/test/super-admin`, { method: 'POST' });
  if (!res.ok) throw new Error(`test super admin: ${res.status}`);
  return ((await res.json()) as { data: { accessToken: string } }).data.accessToken;
}
export async function admin(method: string, p: string, body?: unknown): Promise<any> {
  return api(method, `/admin${p}`, body, await superAdminToken());
}

// ─── Simulators (TEST_MODE stacks only; the same code paths a provider webhook takes) ──────────

/** A WhatsApp, SMS or email message arriving at the agency (POST /test/inbound). */
export async function inbound(o: { from: string; fromName: string; body: string; channel?: 'whatsapp' | 'sms' | 'email'; to?: string; tenantId?: string }): Promise<void> {
  const res = await fetch(`${API_URL}/test/inbound`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: o.tenantId ?? TENANT_ID, channel: o.channel ?? 'whatsapp', from: o.from, fromName: o.fromName, to: o.to ?? '+918047182290', body: o.body }),
  });
  if (!res.ok) throw new Error(`simulated message failed: ${res.status} ${await res.text()}`);
}

export const AGENCY_LINE = '+918047184404';

/** The agency's phone line and caller id on the mock provider (no telephony account is contacted). */
export async function ensureInboundLine(tenantId = TENANT_ID): Promise<void> {
  const settings = await api('GET', '/voip/settings');
  await api('PUT', '/voip/settings', { voipProvider: 'twilio', providerAuthToken: 'film-simulator-token', ...(settings?.data?.defaultCallerId ? {} : { defaultCallerId: AGENCY_LINE }) });
  await fetch(`${API_URL}/test/voip/own-number`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, phoneNumber: AGENCY_LINE }) });
  await api('POST', '/integrations/channels', { channel: 'voice', address: AGENCY_LINE, provider: 'twilio', label: 'Main line' });
}

/** Calling on for the demo agency: one sub-account on the mock provider (resumed if an earlier take suspended it). */
export async function callingOn(): Promise<void> {
  await admin('POST', `/tenants/${TENANT_ID}/voip/resume`, {});
  const r = await api('POST', '/voip/account/enable', {});
  if (!r?.success) throw new Error(`calling could not be enabled: ${JSON.stringify(r).slice(0, 300)}`);
  await expect.poll(async () => (await fetch(`${API_URL}/voip/token`, { headers: { Authorization: `Bearer ${await tokenFor()}` } })).status, { timeout: 15_000 }).toBe(200);
}

export type CallScenario = 'inbound_answered' | 'inbound_missed' | 'inbound_voicemail' | 'outbound_answered' | 'outbound_no_answer' | 'inbound_ring' | 'inbound_finish';
/** Play a whole call as the provider would (POST /test/voip/simulate). */
export async function simulateCall(scenario: CallScenario, from: string, o: { durationSeconds?: number; withRecording?: boolean; callSid?: string; to?: string } = {}): Promise<{ callSid: string }> {
  const res = await fetch(`${API_URL}/test/voip/simulate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, to: o.to ?? AGENCY_LINE, from, tenantId: TENANT_ID, durationSeconds: o.durationSeconds, withRecording: o.withRecording, callSid: o.callSid }),
  });
  const json = (await res.json()) as { data?: { callSid: string; steps: { status: number }[] } };
  if (res.status !== 200 || !json.data || !json.data.steps.every((s) => s.status === 200)) throw new Error(`call simulator ${scenario}: ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json.data;
}

/** The pop is pushed over the realtime socket: wait for the app's socket before a call rings. */
export async function waitForSocket(page: Page, goTo: string): Promise<void> {
  const socket = page.waitForEvent('websocket', { predicate: (ws) => ws.url().includes('/ws'), timeout: 20_000 });
  await page.goto(goTo);
  await settle(page, 900);
  await socket;
  await page.waitForTimeout(500);
}

// ─── Local outbox (TEST_MODE): show an email as it was sent ─────────────

export interface Mail { to: string; subject: string; template: string; text: string; html: string }
export async function outbox(to: string): Promise<Mail[]> {
  const res = await fetch(`${API_URL}/test/outbox?to=${encodeURIComponent(to)}`);
  return (((await res.json()) as { data?: Mail[] }).data ?? []);
}

/** Render a captured email in the page (a plain mail-client frame around the real HTML), so the viewer sees what arrived. */
export async function showMail(page: Page, mail: Mail, from = 'TravelCRM Pro <no-reply@travelcrm.example>'): Promise<void> {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
  const bodyHtml = mail.html && mail.html.trim() ? mail.html : `<pre style="font:16px/1.5 system-ui;white-space:pre-wrap">${esc(mail.text)}</pre>`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(mail.subject)}</title>
<style>body{margin:0;background:#F4F4F6;font-family:'Segoe UI',system-ui,sans-serif;color:#111117}.bar{background:#fff;border-bottom:1px solid #E4E4E9;padding:18px 40px}
.s{font-size:26px;font-weight:700;margin-bottom:8px}.m{font-size:15px;color:#55555F}.wrap{max-width:900px;margin:28px auto;background:#fff;border:1px solid #E4E4E9;border-radius:16px;overflow:hidden}
.wrap>iframe{width:100%;height:780px;border:0}</style></head><body>
<div class="bar"><div class="s">${esc(mail.subject)}</div><div class="m">From ${esc(from)} &nbsp;·&nbsp; To ${esc(mail.to)}</div></div>
<div class="wrap"><iframe id="mail" sandbox=""></iframe></div>
<script>document.getElementById('mail').srcdoc=${JSON.stringify(bodyHtml)};</script></body></html>`;
  await page.setContent(doc, { waitUntil: 'load' });
  await pause(page, 600);
}

// ─── Agencies on the multi-agency stack (platform, plans, international, website films) ─────

export interface FilmAgency { key: 'A' | 'B' | 'C'; tenantId: string; slug: string; companyName: string; email: string; password: string; plan: string; country: string }
const AGENCIES_FILE = path.join(WORK_DIR, 'film-agencies.json');
export function savedAgencies(): Record<string, FilmAgency> {
  return fs.existsSync(AGENCIES_FILE) ? (JSON.parse(fs.readFileSync(AGENCIES_FILE, 'utf8')) as Record<string, FilmAgency>) : {};
}
export function saveAgency(a: FilmAgency): void {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(AGENCIES_FILE, JSON.stringify({ ...savedAgencies(), [a.key]: a }, null, 2));
}
export function agency(key: 'A' | 'B' | 'C'): FilmAgency {
  const a = savedAgencies()[key];
  if (!a) throw new Error(`agency ${key} missing: run "node scripts/showcase/film-prep.mjs --agencies" on the multi-agency stack (and the platform film for A)`);
  return a;
}
/** Sign the page in as an agency owner through the real login form (email step, then password). */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('text=Welcome back');
  for (let attempt = 0; attempt < 3; attempt++) {
    await typeInto(page, page.locator('#email'), email);
    await clickOn(page, page.locator('button[type="submit"]'));
    try { await page.waitForSelector('#password', { timeout: 5000 }); break; } catch { /* not hydrated yet */ }
  }
  await typeInto(page, page.locator('#password'), password, { delay: 40 });
  await clickOn(page, page.locator('button[type="submit"]'));
  await page.waitForURL(/\/(dashboard|change-password|onboarding)/, { timeout: 25_000 });
  await settle(page, 900);
}
