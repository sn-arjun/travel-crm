#!/usr/bin/env node
/**
 * Layout probe: loads routes as the demo admin in Chromium and checks the app shell and page layout.
 *
 *   node scripts/layout-probe.mjs --routes /dashboard,/contacts [--routes-file f] [--slot N]
 *        [--base http://localhost:3100] [--api http://localhost:8787/api/v1]
 *        [--viewports 1366x768,1920x1080] [--themes light,dark] [--locale ar] [--out audit/fix/probe/run] [--warn-only]
 *
 * --base / --api default to audit/fix/stack/slot<N>.json (written by fix-stack.mjs, slot 0 unless --slot),
 * then to http://localhost:3100 and http://localhost:8787/api/v1.
 * --routes-file takes a JSON array or one route per line.
 *
 * Checks per route x viewport x theme (FAIL = makes the exit code 1 unless --warn-only):
 *   1 errors        FAIL  pageerror, console.error (resource-load console errors are skipped; check 2 records them),
 *                         or a redirect to /login (the injected session was not accepted)
 *   2 responses     INFO  every response with status >= 400 (403 on /admin/* is flagged informational)
 *   3 overflow      FAIL  main.scrollWidth > main.clientWidth + 1
 *   4 gutter        FAIL  first visible h1 left - main left < 16, or the right edge of the content box of
 *                         [data-slot=page-container] (fallback: h1.parentElement) > main right (excluding the scrollbar) - 16.
 *                         The content box (border + padding removed) is used so a padded wrapper does not false-fail.
 *                         Skipped (reported as null) when the page has no visible h1.
 *   5 scrollers     FAIL  nested scroll containers inside <main> (overflow-y auto|scroll with scrollHeight > clientHeight + 4)
 *                         except [data-scroll-region], [role=dialog], [role=listbox], [data-radix-popper-content-wrapper],
 *                         textarea, pre
 *   6 topbarTitle   FAIL  `header [data-slot=topbar-title]` has no text
 *   7 sidebarActive WARN  `aside [aria-current=page]` count != 1
 * Signed-out pages (/login, /forgot-password, /reset-password, /setup-account) run in a context without the injected
 * session, and only checks 1 and 3 (document-level) apply to them.
 * Output: <out>/probe.json plus one screenshot per run under <out>/<theme>-<WxH>/.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── args ────────────────────────────────────────────────────
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) {
    console.error(`Unknown argument: ${argv[i]}`);
    process.exit(2);
  }
  const key = argv[i].slice(2);
  if (key === 'warn-only') args[key] = true;
  else args[key] = argv[++i];
}

const slot = Number(args.slot ?? 0);
let slotInfo = null;
const slotFile = path.join(desktopDir, 'audit', 'fix', 'stack', `slot${slot}.json`);
if (existsSync(slotFile)) {
  try {
    slotInfo = JSON.parse(readFileSync(slotFile, 'utf8'));
  } catch {
    /* ignore */
  }
}
const base = (args.base ?? slotInfo?.webUrl ?? `http://localhost:${3100 + 10 * slot}`).replace(/\/$/, '');
const apiUrl = (args.api ?? slotInfo?.apiUrl ?? `http://localhost:${8787 + 10 * slot}/api/v1`).replace(/\/$/, '');
const viewports = (args.viewports ?? '1366x768,1920x1080').split(',').map((v) => {
  const [w, h] = v.trim().split('x').map(Number);
  if (!w || !h) throw new Error(`Bad viewport: ${v}`);
  return { width: w, height: h };
});
const themes = (args.themes ?? 'light,dark').split(',').map((t) => t.trim());
const outDir = path.resolve(desktopDir, args.out ?? path.join('audit', 'fix', 'probe', 'run'));
const warnOnly = Boolean(args['warn-only']);

let routes = [];
if (args.routes) routes = args.routes.split(',').map((r) => r.trim()).filter(Boolean);
if (args['routes-file']) {
  const raw = readFileSync(path.resolve(desktopDir, args['routes-file']), 'utf8').trim();
  routes.push(...(raw.startsWith('[') ? JSON.parse(raw) : raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)));
}
if (routes.length === 0) {
  console.error('layout-probe: no routes - pass --routes a,b,c or --routes-file <file>');
  process.exit(2);
}

// ── auth ────────────────────────────────────────────────────
const loginRes = await fetch(`${apiUrl}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@demo.com',
    password: 'Admin@123',
    tenantId: '01960000-0000-7000-8000-000000000001',
  }),
}).catch((e) => {
  console.error(`layout-probe: cannot reach API at ${apiUrl}: ${e.message}`);
  process.exit(2);
});
const loginJson = await loginRes.json().catch(() => ({}));
if (!loginJson?.data?.accessToken) {
  console.error(`layout-probe: login failed (${loginRes.status}): ${JSON.stringify(loginJson).slice(0, 300)}`);
  process.exit(2);
}
const { accessToken, refreshToken, user, tenant } = loginJson.data;
// Exactly the shape zustand persist writes for src/stores/auth-store.ts (partialize + version 0).
const persistedAuth = JSON.stringify({
  state: { accessToken, refreshToken, user, tenant, isAuthenticated: true },
  version: 0,
});

// ── in-page checks ──────────────────────────────────────────
function inPageChecks() {
  const out = { overflow: null, gutter: null, nestedScrollers: [], topbarTitle: '', sidebarActive: 0 };
  const main = document.querySelector('main');
  if (!main) {
    out.noMain = true;
    return out;
  }
  const mr = main.getBoundingClientRect();
  out.overflow = { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const h1 = [...main.querySelectorAll('h1')].find(visible);
  if (h1) {
    const h1r = h1.getBoundingClientRect();
    const container = h1.closest('[data-slot=page-container]') ?? h1.parentElement;
    const cr = container.getBoundingClientRect();
    const cs = getComputedStyle(container);
    const contentRight =
      cr.right - (parseFloat(cs.paddingRight) || 0) - (parseFloat(cs.borderRightWidth) || 0);
    const mainRight = mr.left + main.clientLeft + main.clientWidth;
    out.gutter = {
      left: Math.round((h1r.left - mr.left) * 10) / 10,
      right: Math.round((mainRight - contentRight) * 10) / 10,
      container: container.getAttribute('data-slot') ?? container.tagName.toLowerCase(),
    };
  }

  const skip = '[data-scroll-region], [role=dialog], [role=listbox], [data-radix-popper-content-wrapper]';
  for (const el of main.querySelectorAll('*')) {
    if (el.matches('textarea, pre') || el.closest(skip)) continue;
    const cs = getComputedStyle(el);
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 4) {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 4).join('.') : '';
      out.nestedScrollers.push({
        el: `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      });
    }
  }

  out.topbarTitle = (document.querySelector('header [data-slot="topbar-title"]')?.textContent ?? '').trim();
  out.sidebarActive = document.querySelectorAll('aside [aria-current=page]').length;
  return out;
}

// Signed-out pages have no shell: only document-level overflow applies; the other shell checks pass as skipped.
function inPageAnonChecks() {
  const el = document.documentElement;
  return {
    overflow: { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth },
    gutter: null,
    nestedScrollers: [],
    topbarTitle: 'n/a (signed-out page)',
    sidebarActive: 1,
  };
}

const AUTH_ROUTE_RE = /^\/(login|forgot-password|reset-password|setup-account)(\/|\?|$)/;

// ── run ─────────────────────────────────────────────────────
const slug = (r) => r.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_') || 'root';
const browser = await chromium.launch();
const runs = [];
let failedRuns = 0;

try {
  for (const theme of themes) {
    for (const vp of viewports) {
      const makeContext = async (withAuth) => {
        const ctx = await browser.newContext({ viewport: vp });
        await ctx.addInitScript(
          ({ auth, themeName, uiLocale }) => {
            try {
              if (auth) localStorage.setItem('travelcrm-auth', auth);
              localStorage.setItem('theme', themeName);
              if (uiLocale) localStorage.setItem('travelcrm.uiLanguage', uiLocale);
            } catch {
              /* storage unavailable */
            }
          },
          { auth: withAuth ? persistedAuth : null, themeName: theme, uiLocale: args.locale || '' },
        );
        return ctx;
      };
      const context = await makeContext(true);
      let anonContext = null;
      const shotDir = path.join(outDir, `${theme}-${vp.width}x${vp.height}`);
      mkdirSync(shotDir, { recursive: true });

      for (const route of routes) {
        // Auth pages render outside the app shell and bounce signed-in users, so they get a signed-out context.
        const anon = AUTH_ROUTE_RE.test(route);
        if (anon && !anonContext) anonContext = await makeContext(false);
        const page = await (anon ? anonContext : context).newPage();
        const errors = [];
        const responses = [];
        page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
        page.on('console', (m) => {
          if (m.type() !== 'error') return;
          const t = m.text();
          if (/^Failed to load resource/i.test(t)) return; // recorded by the response check
          errors.push(`console.error: ${t.slice(0, 300)}`);
        });
        page.on('response', (r) => {
          if (r.status() >= 400) {
            const u = new URL(r.url());
            responses.push({
              status: r.status(),
              url: `${u.pathname}${u.search}`.slice(0, 200),
              informational: r.status() === 403 && u.pathname.includes('/admin/'),
            });
          }
        });

        const rec = { route, theme, viewport: `${vp.width}x${vp.height}`, screenshot: null, finalUrl: null, checks: {} };
        try {
          await page.goto(base + route, { waitUntil: 'load', timeout: 30_000 });
          await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
          await page.waitForTimeout(300);
          rec.finalUrl = page.url();
          if (!anon && new URL(rec.finalUrl).pathname.startsWith('/login')) {
            errors.push('redirected to /login (session not accepted)');
          }
          const shot = path.join(shotDir, `${slug(route)}.png`);
          await page.screenshot({ path: shot });
          rec.screenshot = path.relative(desktopDir, shot).split(path.sep).join('/');
          rec.anonymous = anon;
          const m = anon ? await page.evaluate(inPageAnonChecks) : await page.evaluate(inPageChecks);

          const gutterFail = m.gutter ? m.gutter.left < 16 || m.gutter.right < 16 : false;
          rec.checks = {
            errors: { pass: errors.length === 0, details: errors },
            responses: { pass: true, details: responses },
            overflow: {
              pass: m.noMain ? false : m.overflow.scrollWidth <= m.overflow.clientWidth + 1,
              details: m.noMain ? 'no <main> element' : m.overflow,
            },
            gutter: { pass: !gutterFail, skipped: m.gutter === null, details: m.gutter },
            nestedScrollers: { pass: m.nestedScrollers.length === 0, details: m.nestedScrollers.slice(0, 10) },
            topbarTitle: { pass: m.topbarTitle.length > 0, details: m.topbarTitle },
            sidebarActive: { pass: m.sidebarActive === 1, warning: true, details: m.sidebarActive },
          };
        } catch (e) {
          errors.push(`navigation: ${e.message.split('\n')[0]}`);
          rec.checks = { errors: { pass: false, details: errors } };
        }
        rec.failed = Object.entries(rec.checks)
          .filter(([k, v]) => !v.pass && !v.warning && k !== 'responses')
          .map(([k]) => k);
        if (rec.failed.length) failedRuns++;
        runs.push(rec);
        const tag = rec.failed.length ? `FAIL [${rec.failed.join(',')}]` : 'ok';
        console.log(`${tag.padEnd(28)} ${theme.padEnd(5)} ${rec.viewport.padEnd(10)} ${route}`);
        await page.close();
      }
      await context.close();
      await anonContext?.close();
    }
  }
} finally {
  await browser.close();
}

mkdirSync(outDir, { recursive: true });
const summary = {
  generatedAt: new Date().toISOString(),
  base,
  apiUrl,
  routes,
  viewports: viewports.map((v) => `${v.width}x${v.height}`),
  themes,
  totalRuns: runs.length,
  failedRuns,
  warnOnly,
  runs,
};
writeFileSync(path.join(outDir, 'probe.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`layout-probe: ${runs.length} runs, ${failedRuns} failing -> ${path.relative(desktopDir, path.join(outDir, 'probe.json'))}`);
process.exit(failedRuns > 0 && !warnOnly ? 1 : 0);
