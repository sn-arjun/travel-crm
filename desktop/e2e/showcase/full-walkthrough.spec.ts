import { test, expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  startRecording, chapter, caption, clearCaption, highlight, section, settle,
  typeSlowly, scrollThrough, getFailures, getChapters,
} from './showcase-helpers';
import { api, seedContact, seedLead } from '../helpers/api-seed';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../helpers/auth';

const ARTIFACTS = path.resolve(__dirname, '..', '..', 'showcase', '.artifacts');

// ─── Bookkeeping that is NOT a failure ──────────────────────────
// `notes` = places where the tour could not locate a guessed control or had to
// deep-link a page that has no in-app entry point. Written to notes.json so the
// report can be honest about them without them being counted as broken features.
const notes: string[] = [];
let currentSection = '';
const note = (msg: string) => { notes.push(`${currentSection}: ${msg}`); console.log(`  [note] ${currentSection}: ${msg}`); };
/** A real defect seen on camera (form rejected, data did not round-trip). Counted as a failure; the tour continues. */
const softFail = (msg: string) => { getFailures().push({ section: currentSection, error: msg }); console.error(`  [FAIL] ${currentSection}: ${msg}`); };

// ─── Navigation ─────────────────────────────────────────────────

/** Click through the UI: sidebar link first, then an in-page link (optionally via a parent page), deep-link only as a last resort. */
async function go(page: Page, href: string, via?: string) {
  const side = page.locator(`aside a[href="${href}"]`).first();
  if (await side.count()) {
    await side.scrollIntoViewIfNeeded().catch(() => {});
    await side.click();
  } else {
    if (via) await go(page, via);
    const inPage = page.locator(`a[href="${href}"]`).first();
    if (await inPage.count()) await inPage.click();
    else { note(`no in-app link to ${href}; deep-linked`); await page.goto(href); }
  }
  await page.waitForURL((u) => u.pathname.startsWith(href), { timeout: 15_000 }).catch(() => {});
  await settle(page);
}

const scopeOf = async (page: Page): Promise<Locator> => {
  const dlg = page.locator('[role="dialog"]:visible').last();
  if (await dlg.count()) return dlg;
  const main = page.locator('main').first();
  return (await main.count()) ? main : page.locator('body');
};

const GATE_RE = /upgrade|not available on your plan|not included in your plan|available on the .* plan|not in (your )?plan|limit reached/i;

/** Gated feature with the plan flag off: show the upgrade state on purpose. Returns true when gated. */
async function showIfGated(page: Page, feature: string): Promise<boolean> {
  const scope = await scopeOf(page);
  const gated = await scope.getByText(GATE_RE).first().isVisible().catch(() => false);
  if (!gated) return false;
  await caption(page, `${feature} — available on a higher plan. Gated features show an upgrade prompt, never an error`, 3500);
  return true;
}

// ─── Generic UI drivers ─────────────────────────────────────────

async function poke(page: Page, say: string, re: RegExp, hold = 1600): Promise<boolean> {
  const scope = await scopeOf(page);
  const target = scope.getByRole('button', { name: re })
    .or(scope.getByRole('tab', { name: re }))
    .or(scope.getByRole('link', { name: re }))
    .or(page.locator('aside, header').first().getByRole('link', { name: re }))
    .first();
  if (!(await target.count()) || !(await target.isVisible().catch(() => false))) {
    note(`could not locate control ${re}`);
    return false;
  }
  await caption(page, say, 900);
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click({ timeout: 8_000 }).catch(() => note(`click on ${re} failed`));
  await settle(page, hold);
  return true;
}

async function closeOverlays(page: Page) {
  for (let i = 0; i < 2; i++) {
    if (await page.locator('[role="dialog"]:visible, [role="menu"]:visible, [role="listbox"]:visible').count()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  }
}

async function listTour(page: Page, opts: { search?: string; label: string }) {
  await page.mouse.move(1000, 600);
  const searchBox = page.locator('main input[placeholder*="earch" i]').first();
  if (await searchBox.count()) {
    await caption(page, `Search ${opts.label} instantly — results update as you type`, 900);
    await highlight(page, 'main input[placeholder*="earch" i]', 600);
    const term = opts.search ?? 'a';
    await typeSlowly(page, 'main input[placeholder*="earch" i]', term);
    await settle(page, 1200);
    await searchBox.fill('');
    await settle(page, 800);
  }
  const filterBtn = page.locator('main').getByRole('button', { name: /filter/i }).first();
  if (await filterBtn.count()) {
    await caption(page, 'Filters stack as removable chips', 900);
    await filterBtn.click().catch(() => {});
    await page.waitForTimeout(1200);
    await closeOverlays(page);
  }
  await caption(page, 'Lists load more as you scroll — no pagination clicks', 900);
  await scrollThrough(page, 4, 700);
  await page.mouse.wheel(0, -4000);
  await page.waitForTimeout(500);
  const row = page.locator('main tbody tr').first();
  if (await row.count()) { await row.hover().catch(() => {}); await page.waitForTimeout(900); }
}

/** Describe visible inputs inside `scope` and tag them so we can fill by index without per-field round trips. */
async function tagFields(scope: Locator) {
  return scope.evaluate((root) => {
    const out: { i: number; kind: string; label: string; type: string; mode: string; value: string }[] = [];
    let n = 0;
    root.querySelectorAll('input, textarea').forEach((el) => {
      const e = el as HTMLInputElement;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || e.disabled || e.readOnly) return;
      if (['hidden', 'checkbox', 'radio', 'file', 'password', 'submit', 'button'].includes(e.type)) return;
      if (e.getAttribute('role') === 'combobox' || e.closest('[cmdk-root]')) return;
      if (/search/i.test(e.placeholder || '') ) return;
      const lab = (e.id && root.querySelector(`label[for="${e.id}"]`)?.textContent) || e.getAttribute('aria-label') || e.placeholder || e.name || e.id || '';
      e.setAttribute('data-sc-f', String(n));
      out.push({ i: n++, kind: e.tagName.toLowerCase(), label: lab.trim().replace(/\*/g, '').trim(), type: e.type, mode: e.inputMode || '', value: e.value });
    });
    return out;
  });
}

const digits = (n: number) => String(Date.now()).slice(-n);
function valueFor(f: { label: string; type: string; mode: string; kind: string }, entity: string, first: boolean): string {
  const l = f.label;
  if (f.type === 'email' || /e-?mail/i.test(l)) return `showcase.${digits(6)}@example.com`;
  if (f.type === 'tel' || /phone|mobile|whatsapp/i.test(l)) return '9876' + digits(6);
  if (f.type === 'date') return '2026-12-15';
  if (f.type === 'datetime-local') return '2026-12-15T10:00';
  if (f.type === 'time') return '10:00';
  if (f.type === 'number' || f.mode === 'decimal' || f.mode === 'numeric') return /year|day|pax|adult|seat|qty|quantity|count/i.test(l) ? '2' : '25000';
  if (/gst/i.test(l)) return '27ABCDE1234F1Z5';
  if (/passport/i.test(l)) return 'P' + digits(7);
  if (/regist|plate/i.test(l)) return 'MH12SC' + digits(4);
  if (/licen[cs]e/i.test(l)) return 'DL' + digits(10);
  if (/url|website|link/i.test(l)) return 'https://example.com';
  if (f.kind === 'textarea') return 'Created live during the product walkthrough.';
  return first ? `Showcase ${entity}` : `Showcase ${l || 'value'}`.slice(0, 40);
}

/** Fill a form the way a person would: type, pick from searchable pickers, choose dates. Returns the first text value typed. */
async function fillForm(page: Page, entity: string): Promise<string> {
  const scope = await scopeOf(page);
  await settle(page, 600);
  let primary = '';
  const fields = await tagFields(scope);
  let first = true;
  for (const f of fields) {
    if (f.value && f.type !== 'number') continue;
    const sel = `[data-sc-f="${f.i}"]`;
    const textual = f.type === 'text';
    const v = valueFor(f, entity, first && textual);
    try {
      if (first && textual) { await typeSlowly(page, sel, v); primary = v; first = false; }
      else await page.locator(sel).first().fill(v, { timeout: 4_000 });
    } catch { /* leave optional field empty */ }
  }

  // Pickers: relation comboboxes and selects share role=combobox.
  const combos = scope.locator('button[role="combobox"]');
  const n = await combos.count();
  let pointedOut = false;
  for (let i = 0; i < n; i++) {
    const c = combos.nth(i);
    const txt = ((await c.innerText().catch(() => '')) || '').trim();
    if (txt && !/select|choose|search|pick|none|all|^$/i.test(txt)) continue;
    try {
      await c.scrollIntoViewIfNeeded();
      if (!pointedOut) {
        await c.evaluate((el) => el.setAttribute('data-sc-cb', '1'));
        await caption(page, 'Relation fields are searchable pickers — no IDs to memorise', 900);
        await highlight(page, '[data-sc-cb="1"]', 1100);
        pointedOut = true;
      }
      await c.click({ timeout: 4_000 });
      const opt = page.getByRole('option').first();
      await opt.waitFor({ state: 'visible', timeout: 5_000 });
      await page.waitForTimeout(500);
      await opt.click();
      await page.waitForTimeout(300);
    } catch { await closeOverlays(page); }
  }

  // Date pickers (popover calendars).
  const dateBtns = scope.locator('button', { hasText: /^(pick|select|choose)[^\n]*date/i });
  for (let i = 0, m = await dateBtns.count(); i < m; i++) {
    try {
      await dateBtns.nth(0).click({ timeout: 3_000 });
      const cal = page.locator('.p-3.w-\\[280px\\], [role="grid"]').first();
      await cal.waitFor({ state: 'visible', timeout: 3_000 });
      await cal.locator('button').filter({ has: page.locator('svg') }).last().click().catch(() => {});
      await cal.getByRole('button', { name: '15', exact: true }).first().click({ timeout: 3_000 });
    } catch { await closeOverlays(page); }
  }
  return primary;
}

async function submitForm(page: Page): Promise<void> {
  const scope = await scopeOf(page);
  const btn = scope.locator('button[type="submit"]').last()
    .or(scope.getByRole('button', { name: /^(save|create|submit|issue|record|generate|invite|add|send|schedule)/i }).last()).first();
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await caption(page, 'One click to save', 700);
  await btn.click({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  await settle(page, 1500);
}

interface Tour {
  name: string;            // chapter title
  sub: string;             // chapter subtitle
  nav: string;             // list route (sidebar href)
  via?: string;            // parent route to click through when nav is not in the sidebar
  entity?: string;         // singular noun for created record names
  create?: boolean;        // drive the "New …" flow and round-trip it
  gate?: string;           // feature label when plan-gated
  search?: string;
  say?: string;            // product-copy caption for the list
  list?: [string, RegExp][];    // distinctive controls to use on the list page
  detail?: [string, RegExp][];  // distinctive controls to use on the detail page
  visit?: { href: string; say: string }[]; // sibling pages reached by in-app links
  skipList?: boolean;
}

/** One feature area: list → create through the form → detail round-trip → distinctive actions. */
async function tourFeature(page: Page, t: Tour) {
  currentSection = t.name;
  await chapter(page, t.name, t.sub);
  await go(page, t.nav, t.via);
  if (t.gate && (await showIfGated(page, t.gate))) { await page.waitForTimeout(2000); return; }
  if (t.say) await caption(page, t.say, 2200);
  if (!t.skipList) await listTour(page, { search: t.search, label: t.name.toLowerCase() });
  for (const [say, re] of t.list ?? []) { await poke(page, say, re); await closeOverlays(page); }

  let made = '';
  if (t.create) {
    const root = (await scopeOf(page));
    const newBtn = root.getByRole('button', { name: /^\s*(\+\s*)?(new|add|create|issue|record|invite|schedule)\b/i })
      .or(root.getByRole('link', { name: /^\s*(\+\s*)?(new|add|create|issue|record|invite|schedule)\b/i })).first();
    if (!(await newBtn.count())) { note('no "New" control on the list page'); }
    else {
      const listPath = new URL(page.url()).pathname;
      await caption(page, `Create a ${t.entity ?? 'record'} — ${t.sub.toLowerCase()}`, 1200);
      await newBtn.click();
      await settle(page, 1200);
      made = await fillForm(page, t.entity ?? t.name);
      const before = page.url();
      await submitForm(page);
      const stillOnForm = /\/new(\/|$)/.test(new URL(page.url()).pathname) && page.url() === before;
      const errors = await page.locator('[role="alert"]:visible, .text-ds-danger:visible').count();
      if (stillOnForm && errors) softFail(`create form rejected the submission (${errors} validation message(s) on screen)`);
      await closeOverlays(page);

      // Round-trip: land on the detail view of what we just made.
      if (made && (new URL(page.url()).pathname === listPath || /\/new/.test(page.url()))) {
        if (!/\/new/.test(page.url())) {
          const sb = page.locator('main input[placeholder*="earch" i]').first();
          if (await sb.count()) { await sb.fill(made); await settle(page, 1500); }
          const row = page.locator('main tbody tr', { hasText: made }).first();
          if (await row.count()) {
            await caption(page, 'Open the record — everything you entered is there', 1000);
            await row.hover();
            const view = row.locator('button[aria-label="View"], a[aria-label="View"]').first();
            if (await view.count()) await view.click(); else await row.click();
            await settle(page, 1200);
          } else if (!t.skipList) {
            softFail(`created record "${made}" not found in the list afterwards`);
          }
        }
      }
      const body = await page.locator('main').first().innerText().catch(() => '');
      if (made && /\/[^/]+$/.test(new URL(page.url()).pathname) && !/\/new/.test(page.url()) && body && !body.includes(made)) {
        note(`detail view did not echo "${made}" verbatim (may be formatted differently)`);
      }
      await scrollThrough(page, 2, 700);
    }
  }
  for (const [say, re] of t.detail ?? []) { await poke(page, say, re); }
  for (const v of t.visit ?? []) {
    await go(page, v.href, t.nav);
    await caption(page, v.say, 2200);
    await scrollThrough(page, 2, 700);
  }
  await closeOverlays(page);
  await clearCaption(page);
  await page.waitForTimeout(800);
}

// ─── The tour ───────────────────────────────────────────────────

test('TravelCRM Pro — complete feature walkthrough', async ({ page }) => {
  startRecording();

  // Lists must not be empty on camera. Seed bulk background rows only when the tenant is thin.
  try {
    const r = await api('GET', '/contacts?limit=1');
    const total = r?.pagination?.total ?? r?.data?.pagination?.total ?? 0;
    if (total < 45) {
      const base = await seedContact({ name: 'Showcase Anchor Contact' });
      for (let i = 0; i < 25; i++) {
        const c = await seedContact({ name: `Showcase Guest ${String(i + 1).padStart(2, '0')}` });
        if (i < 22 && c?.id) await seedLead(c.id, { title: `Showcase Enquiry ${i + 1}`, destinations: [['Bali', 'Goa', 'Dubai', 'Kerala'][i % 4]] });
      }
      if (base?.id) await seedLead(base.id, { title: 'Showcase Honeymoon Package' });
    }
  } catch (e) { console.log('  [seed] skipped:', (e as Error).message); }

  await page.goto('/dashboard');
  await settle(page);
  await chapter(page, 'TravelCRM Pro', 'Multi-tenant CRM for tours & travels', 3200);

  // 1 ── Auth & shell (real sign-out → sign-in) ──────────────────
  await section(page, 'Authentication & App Shell', async () => {
    currentSection = 'Authentication & App Shell';
    await chapter(page, 'Sign in & workspace', 'Secure login, tenant-aware navigation, global search');
    await caption(page, 'Every user gets a tenant-scoped workspace', 1800);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(900);
    await caption(page, 'Global search and commands — one shortcut away', 1800);
    await closeOverlays(page);

    await caption(page, 'Signing out…', 900);
    await page.getByRole('banner').getByRole('button').last().click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();
    await page.waitForURL('**/login', { timeout: 15_000 });
    await page.waitForSelector('#email');
    await caption(page, 'Sign in with email and password', 900);

    const doLogin = async () => {
      await typeSlowly(page, '#email', ADMIN_EMAIL);
      await page.locator('button[type="submit"]').click();
      await page.waitForSelector('#password', { timeout: 15_000 });
      await typeSlowly(page, '#password', ADMIN_PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });
    };
    try { await doLogin(); }
    catch {
      // Login rate-limiter quirk (see global-setup): wait out the window and retry once.
      await caption(page, 'Login rate-limit window — retrying', 1000);
      await page.waitForTimeout(65_000);
      await page.goto('/login');
      await doLogin();
    }
    await settle(page);
    await caption(page, 'Signed in — straight to the dashboard', 1600);
    await go(page, '/settings');
    await poke(page, 'Manage active sessions and revoke other devices', /sessions/i);
  });

  // 2 ── Dashboard ───────────────────────────────────────────────
  await section(page, 'Dashboard', async () => {
    currentSection = 'Dashboard';
    await chapter(page, 'Dashboard', 'Live KPIs, sticky notes, one-click drill-down');
    await go(page, '/dashboard');
    await caption(page, 'Live KPI tiles: leads, revenue, overdue invoices', 2500);
    await scrollThrough(page, 3, 800);
    await poke(page, 'Pin a sticky note right on the dashboard', /note|sticky/i);
    await closeOverlays(page);
    await page.mouse.wheel(0, -3000);
    await caption(page, 'Click a KPI tile to jump straight to the records behind it', 1500);
    const tile = page.locator('main a[href="/leads"], main [role="link"]').first();
    if (await tile.count()) { await tile.click().catch(() => {}); await settle(page); }
    await go(page, '/bookmarks').catch(() => {});
  });

  // 3–4 ── Core CRM ───────────────────────────────────────────────
  await section(page, 'Contacts', () => tourFeature(page, {
    name: 'Contacts', sub: 'Every traveller and client in one place', nav: '/contacts', entity: 'Contact', create: true,
    say: 'Every list filters, searches, and scrolls infinitely',
    list: [['Merge duplicates in a guided flow', /merge|duplicate/i]],
    detail: [['Message the contact through the Communication Hub — templates and preview included', /message|send/i]],
  }));

  await section(page, 'Leads', () => tourFeature(page, {
    name: 'Leads', sub: 'Capture, qualify, convert', nav: '/leads', entity: 'Lead', create: true,
    say: 'Your pipeline, searchable and filterable by status',
    detail: [['Log an activity on the timeline', /activity|note/i], ['Convert the lead into an itinerary', /convert/i]],
  }));

  await section(page, 'Accounts', () => tourFeature(page, {
    name: 'Accounts', sub: 'Corporate accounts, powered by the supplier directory', nav: '/accounts', create: false,
    say: 'Accounts is a focused view over Suppliers — open a row for the full record',
  }));

  await section(page, 'Itineraries', () => tourFeature(page, {
    name: 'Itineraries', sub: 'Multi-day quotations with versions and share links', nav: '/itineraries', entity: 'Itinerary', create: true,
    detail: [['Generate a public share link for the customer', /share/i], ['Preview the branded quotation', /pdf|preview|quotation/i], ['Spin off a new version', /version/i]],
  }));

  await section(page, 'Itinerary Templates', () => tourFeature(page, {
    name: 'Itinerary Templates', sub: 'Reusable trip blueprints', nav: '/itineraries/templates', entity: 'Template', create: true,
    say: 'Save any itinerary as a template and start new quotes in seconds',
  }));

  await section(page, 'Rate Cards', () => tourFeature(page, {
    name: 'Rate Cards', sub: 'Seasonal supplier pricing', nav: '/rate-cards', entity: 'Rate Card', create: true,
    list: [['Look up the applicable rate for a date and pax count', /lookup|find rate|applicable/i]],
  }));

  await section(page, 'Suppliers', () => tourFeature(page, {
    name: 'Suppliers', sub: 'Hotels, transport and activity partners', nav: '/suppliers', entity: 'Supplier', create: true,
    detail: [['Record a supplier payment and view the ledger', /payment|ledger/i]],
    visit: [{ href: '/suppliers/compare', say: 'Compare supplier rates side by side for one service' }],
  }));

  await section(page, 'Invoices', () => tourFeature(page, {
    name: 'Invoices', sub: 'GST-ready invoices with branded PDFs', nav: '/invoices', entity: 'Invoice', create: true,
    list: [['Jump to overdue invoices', /overdue/i]],
    detail: [['Tax breakdown, line items and PDF preview', /pdf|preview/i], ['Email the invoice through the Communication Hub', /email|send/i]],
  }));

  await section(page, 'Payments', () => tourFeature(page, {
    name: 'Payments', sub: 'Record money in, watch balances update', nav: '/payments', entity: 'Payment', create: true,
    say: 'Each payment links back to its invoice and updates the balance',
  }));

  await section(page, 'Credit & Debit Notes', async () => {
    await tourFeature(page, { name: 'Credit & Debit Notes', sub: 'Adjustments against invoices', nav: '/credit-notes', entity: 'Credit Note', create: true });
    currentSection = 'Credit & Debit Notes';
    await go(page, '/debit-notes');
    await caption(page, 'Debit notes work the same way', 2200);
    await listTour(page, { label: 'debit notes' });
  });

  // 5 ── Operations ─────────────────────────────────────────────
  await section(page, 'Vouchers', () => tourFeature(page, {
    name: 'Vouchers', sub: 'Hotel, transfer and activity vouchers', nav: '/vouchers', entity: 'Voucher', create: true,
    detail: [['Preview the branded voucher PDF', /pdf|preview/i], ['Send to supplier and traveller', /send/i]],
  }));

  await section(page, 'Travellers', () => tourFeature(page, {
    name: 'Travellers', sub: 'Passports, expiries and linked contacts', nav: '/travellers', entity: 'Traveller', create: true, search: 'Showcase',
  }));

  await section(page, 'Visa', () => tourFeature(page, {
    name: 'Visa', sub: 'Applications tracked by stage', nav: '/visa', entity: 'Visa Application', create: true,
    detail: [['Tick off the document checklist', /checklist|document/i], ['Move the application forward', /approve|status|stage/i]],
  }));

  await section(page, 'Fleet — Vehicles', () => tourFeature(page, {
    name: 'Fleet — Vehicles', sub: 'Vehicles, documents and maintenance', nav: '/fleet/vehicles', via: '/fleet', entity: 'Vehicle', create: true,
    detail: [['Log a maintenance entry', /maintenance/i], ['Check availability for a date range', /availab/i]],
  }));
  await section(page, 'Fleet — Drivers', () => tourFeature(page, {
    name: 'Fleet — Drivers', sub: 'Drivers, licences and schedules', nav: '/fleet/drivers', via: '/fleet', entity: 'Driver', create: true,
    detail: [['Open the driver schedule', /schedule|calendar/i]],
  }));
  await section(page, 'Fleet — Trips', () => tourFeature(page, {
    name: 'Fleet — Trips', sub: 'Dispatch board for every trip', nav: '/fleet/trips', via: '/fleet', entity: 'Trip', create: true,
    list: [['Switch to the Kanban board', /kanban|board/i]],
    detail: [['Add trip costs — fuel, tolls', /cost|expense/i], ['Generate the trip invoice', /invoice/i]],
  }));
  await section(page, 'Fleet — Rate Cards', () => tourFeature(page, {
    name: 'Fleet — Rate Cards', sub: 'Per-km pricing by vehicle type', nav: '/fleet/rate-cards', via: '/fleet', entity: 'Fleet Rate', create: true,
    list: [['Estimate a 300 km trip from the rate card', /estimate/i]],
  }));
  await section(page, 'Fleet — Dashboard', () => tourFeature(page, {
    name: 'Fleet — Dashboard', sub: 'Utilisation, active trips, revenue and alerts', nav: '/fleet', skipList: true,
    say: 'Fleet utilisation, active trips and revenue at a glance',
    visit: [{ href: '/fleet/alerts', say: 'Alerts surface expiring documents and maintenance that is due' }],
  }));

  await section(page, 'Tasks', () => tourFeature(page, {
    name: 'Tasks', sub: 'Kanban and list views for the whole team', nav: '/tasks', entity: 'Task', create: true,
    list: [['Switch to the Kanban board', /kanban|board/i]],
    detail: [['Add a comment', /comment/i], ['Add a subtask', /subtask/i]],
  }));
  await section(page, 'Calendar', () => tourFeature(page, {
    name: 'Calendar', sub: 'Month, week and day views', nav: '/calendar', entity: 'Event', create: true, skipList: true,
    list: [['Switch to week view', /^week$/i], ['Back to month view', /^month$/i]],
  }));
  await section(page, 'Follow-ups', () => tourFeature(page, {
    name: 'Follow-ups', sub: 'Never miss a callback', nav: '/follow-ups', entity: 'Follow-up', create: true,
    list: [['Focus on overdue follow-ups', /overdue/i]],
  }));
  await section(page, 'Documents', () => tourFeature(page, {
    name: 'Documents', sub: 'Files attached to any record', nav: '/documents', entity: 'Document', create: false,
    list: [['Upload against a lead', /upload/i]],
  }));

  // 6 ── Communication, marketing & AI ──────────────────────────
  await section(page, 'Communication Inbox', () => tourFeature(page, {
    name: 'Communication Inbox', sub: 'Every conversation, one inbox', nav: '/communication', create: false,
    list: [['Compose from a template', /compose|new message/i]],
    visit: [{ href: '/communication/bulk-send', say: 'Bulk-send to a segment and watch batch status' }],
  }));
  await section(page, 'Message Templates', () => tourFeature(page, {
    name: 'Message Templates', sub: 'Email, SMS and WhatsApp templates with merge variables', nav: '/communication/templates', entity: 'Template', create: true,
    detail: [['Preview with a real contact substituted', /preview/i]],
  }));
  await section(page, 'Calls', () => tourFeature(page, {
    name: 'Calls', sub: 'VoIP call log, recordings and analytics', nav: '/communication/calls', gate: 'VoIP calling',
    list: [['Show only missed calls', /missed/i], ['Open call analytics', /analytics/i]],
  }));
  await section(page, 'VoIP Settings', () => tourFeature(page, {
    name: 'VoIP Settings', sub: 'Twilio connection and phone numbers', nav: '/settings/voip', via: '/settings', gate: 'VoIP calling', skipList: true,
    list: [['Test the Twilio connection', /test/i]],
  }));
  await section(page, 'Chatbot', () => tourFeature(page, {
    name: 'Chatbot', sub: 'AI conversations that turn into leads', nav: '/chatbot', gate: 'AI Chatbot',
    detail: [['Hand off to a human agent', /hand ?off|human/i], ['Convert to a lead', /lead/i]],
    visit: [{ href: '/settings/chatbot', say: 'Copy the website widget snippet from settings' }],
  }));

  await section(page, 'Campaigns', () => tourFeature(page, {
    name: 'Campaigns', sub: 'Email campaigns with open and click tracking', nav: '/marketing/campaigns', entity: 'Campaign', create: true,
    list: [['Filter by status', /status|draft|sent/i]],
  }));
  await section(page, 'Marketing Dashboard', () => tourFeature(page, {
    name: 'Marketing Dashboard', sub: 'Everything marketing, one overview', nav: '/marketing', skipList: true,
    say: 'Campaign performance, segments and flyers in one overview',
  }));
  await section(page, 'Marketing Segments', () => tourFeature(page, {
    name: 'Marketing Segments', sub: 'Rule-based audiences', nav: '/marketing/segments', entity: 'Segment', create: true,
    detail: [['Refresh the count and preview matching contacts', /refresh|preview/i]],
  }));
  await section(page, 'Marketing Flyers', async () => {
    await tourFeature(page, { name: 'Marketing Flyers', sub: 'Branded flyers from festival templates', nav: '/marketing/flyers', create: false,
      list: [['Pick a template and customise it', /template|new|create/i]] });
    currentSection = 'Marketing Flyers';
    await go(page, '/marketing/branding');
    await caption(page, 'Set the company logo and palette once — every flyer follows', 2400);
  });
  await section(page, 'Marketing Social', () => tourFeature(page, {
    name: 'Marketing Social', sub: 'AI-assisted social content', nav: '/marketing/social', gate: 'AI social content',
    list: [['Generate Instagram captions', /generate/i]],
    visit: [{ href: '/marketing/festivals', say: 'Festival-offer suggestions, ready to accept' }],
  }));
  await section(page, 'Marketing Opted-Out', () => tourFeature(page, {
    name: 'Marketing Opted-Out', sub: 'Unsubscribes honoured automatically', nav: '/marketing/opted-out',
    say: 'Everyone who unsubscribed, and when — re-subscribe on request',
  }));
  await section(page, 'WhatsApp Campaigns', () => tourFeature(page, {
    name: 'WhatsApp Campaigns', sub: 'Template-based broadcasts', nav: '/marketing/whatsapp', gate: 'WhatsApp campaigns',
    list: [['Create from an approved template', /new|create/i]],
  }));

  await section(page, 'AI Assistant', () => tourFeature(page, {
    name: 'AI Assistant', sub: 'Draft leads and itineraries from a sentence', nav: '/ai', gate: 'AI Co-Pilot', skipList: true,
    say: 'Paste an enquiry — AI drafts the lead. Describe a trip — AI drafts the itinerary',
  }));
  await section(page, 'AI Extractions', () => tourFeature(page, {
    name: 'AI Extractions', sub: 'Review queue for parsed enquiries', nav: '/ai/extractions', gate: 'AI extraction',
  }));
  await section(page, 'AI Intelligence', async () => {
    await tourFeature(page, { name: 'AI Intelligence', sub: 'Insights, lead scores and OCR', nav: '/ai/insights', gate: 'AI intelligence', skipList: true,
      say: 'Generated recommendations and natural-language questions about your pipeline' });
    currentSection = 'AI Intelligence';
    await go(page, '/ai/lead-score');
    await caption(page, 'Lead scores with the factors behind them', 2200);
    await go(page, '/ai/ocr');
    await caption(page, 'Scan a passport and apply the extracted fields', 2200);
  });
  await section(page, 'AI Business Intelligence', () => tourFeature(page, {
    name: 'AI Business Intelligence', sub: 'Executive briefing, health score and forecast', nav: '/ai/bi', via: '/ai', gate: 'Business Intelligence', skipList: true,
    list: [['Generate today\'s briefing', /briefing|generate/i]],
  }));
  await section(page, 'AI Settings', async () => {
    currentSection = 'AI Settings';
    await chapter(page, 'AI Settings', 'Feature toggles, provider and usage against the daily cap');
    await go(page, '/settings/ai', '/settings');
    if (await showIfGated(page, 'AI settings')) return;
    await caption(page, 'Turn individual AI features on and off, see the active provider and model', 2600);
    await scrollThrough(page, 2, 700);
    await go(page, '/settings/ai-usage', '/settings');
    await caption(page, 'AI usage against the daily cap', 2400);
  });

  // 7 ── Reports, import/export ─────────────────────────────────
  await section(page, 'Reports', async () => {
    await tourFeature(page, { name: 'Reports', sub: 'Sales, financial and lead analytics', nav: '/reports', skipList: true,
      say: 'Pick a report, change the range, watch the chart update',
      list: [['Run the Sales report', /sales/i]], detail: [['Export as a branded Excel file', /export|excel|download/i]] });
    currentSection = 'Reports';
    await scrollThrough(page, 3, 800);
  });
  await section(page, 'Import / Export', async () => {
    await tourFeature(page, { name: 'Import / Export', sub: 'Bring data in, take it out', nav: '/import', skipList: true,
      say: 'Download the template, upload, map columns, watch live progress',
      list: [['Download the contacts CSV template', /template/i]] });
    currentSection = 'Import / Export';
    await go(page, '/settings/export', '/settings');
    await caption(page, 'Export any module as a branded Excel file', 2400);
    const dl = page.waitForEvent('download', { timeout: 8_000 }).catch(() => null);
    await poke(page, 'Download an export', /export|download/i, 800);
    if (await dl) await caption(page, 'Download started', 1500);
  });

  // 8 ── Notifications, settings & admin ────────────────────────
  await section(page, 'Notifications', () => tourFeature(page, {
    name: 'Notifications', sub: 'In-app alerts that deep-link to the record', nav: '/notifications', skipList: true,
    list: [['Filter to unread', /unread/i], ['Mark everything read', /mark all/i]],
    visit: [{ href: '/settings/notifications', say: 'Set quiet hours and per-channel preferences' }],
  }));
  await section(page, 'Settings — Company', () => tourFeature(page, {
    name: 'Settings — Company', sub: 'GSTIN, numbering, invoice defaults, assignment rules', nav: '/settings/company', via: '/settings', skipList: true,
    say: 'Company identity and invoice defaults drive every document',
    visit: [{ href: '/settings/numbering', say: 'Invoice numbering prefix and next number' },
            { href: '/settings/assignment-rules', say: 'Lead assignment rules by destination' }],
  }));
  await section(page, 'Settings — Team', () => tourFeature(page, {
    name: 'Settings — Team', sub: 'Users, roles and the activity log', nav: '/settings/team', via: '/settings', entity: 'Teammate', create: true,
    visit: [{ href: '/settings/activity-log', say: 'Every change is logged — filter by user' }],
  }));
  await section(page, 'Integrations & Webhooks', () => tourFeature(page, {
    name: 'Integrations & Webhooks', sub: 'Lead-capture webhooks and delivery status', nav: '/settings/integrations', via: '/settings', skipList: true,
    say: 'Copy the lead-capture webhook URL and review recent deliveries',
  }));
  await section(page, 'Super Admin', async () => {
    currentSection = 'Super Admin';
    await chapter(page, 'Super Admin', 'A separate application for tenant management');
    await go(page, '/dashboard');
    await caption(page, 'Super Admin ships as its own app — the CRM carries no dead /admin pages', 3200);
  });
  await section(page, 'Driver App API', async () => {
    currentSection = 'Driver App API';
    await chapter(page, 'Driver mobile API', 'Trip updates from the field land on the dispatch board');
    await go(page, '/fleet/trips', '/fleet');
    await caption(page, 'Drivers accept and check in from the mobile app — status shows up here live', 3200);
  });
  await section(page, 'Demo Data', async () => {
    currentSection = 'Demo Data';
    await chapter(page, 'Demo dataset', 'Seeded records used throughout this walkthrough');
    await go(page, '/contacts');
    await caption(page, 'The tenant is seeded with a realistic demo dataset', 2800);
  });

  await go(page, '/dashboard');
  await chapter(page, 'Thank you', 'TravelCRM Pro — every feature, one platform', 3000);

  // Assert AFTER the tour, so the recording always completes first.
  const failed = getFailures();
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACTS, 'chapters.json'), JSON.stringify(getChapters()));
  fs.writeFileSync(path.join(ARTIFACTS, 'notes.json'), JSON.stringify({ failed, notes }, null, 2));
  expect(failed, `Sections failed: ${failed.map((f) => f.section).join(', ')}`).toEqual([]);
});
