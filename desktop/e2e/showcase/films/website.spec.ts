/**
 * Film website: the landing page (the built site in landing/dist/, so run `npm run build` in landing/ first; served under a stand-in
 * origin, its API calls proxied to the local stack) and the
 * agency website tools in the console (studio/clips/website.json). Multi-agency stack + console + film-prep --operator/--agencies.
 * Creating a site only queues it locally (no WordPress server runs here); the film says what happens next and shows "queued".
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Page } from '@playwright/test';

import { admin, agency, anonymous as test, API_URL, beat, clickOn, CONSOLE_URL, expect, focus, glance, pause, recordFilm, REPO, scrollSteps, settle, typeInto } from './film-kit';

const LANDING = 'http://landing.travelcrm.local';
const OPERATOR = { email: 'asha.rao@travelcrm.example', password: 'Console-Operator-2026' };
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.woff2': 'font/woff2', '.woff': 'font/woff' };

/** Serve landing/dist at LANDING (/x/ serves x/index.html); config.js gets a same-origin API base, and /api/* is forwarded to the local stack. */
async function serveLanding(page: Page): Promise<void> {
  const apiOrigin = new URL(API_URL).origin;
  await page.route(`${LANDING}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      const res = await route.fetch({ url: `${apiOrigin}${url.pathname}${url.search}` });
      await route.fulfill({ response: res });
      return;
    }
    const rel = decodeURIComponent(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
    const dist = path.join(REPO, 'landing', 'dist');
    const file = path.join(dist, rel);
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { await route.fulfill({ status: 404, body: 'not found' }); return; }
    let body: Buffer | string = fs.readFileSync(file);
    if (rel === '/config.js') body = body.toString('utf8').replace(/apiBase:\s*[^,\n]+,/, "apiBase: '',");
    await route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] ?? 'application/octet-stream', body });
  });
}

test('film:website', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  const B = agency('C'); // agency B's website request was used up in the dry run (it failed: no provisioner on a local stack)
  await recordFilm(page, context, 'website', testInfo, async () => {
    await serveLanding(page);
    await page.goto(`${LANDING}/`);
    await settle(page, 1800);

    await beat(page, 'landing', async () => {
      await scrollSteps(page, 4, 500);
      await page.locator('#pricing').scrollIntoViewIfNeeded();
      await pause(page, 1500);
      await glance(page, page.locator('#cookie-notice'), 900);
      const ok = page.locator('#cookie-notice-dismiss');
      if (await ok.isVisible().catch(() => false)) await clickOn(page, ok);
    });

    await beat(page, 'landing-enquiry', async () => {
      await page.locator('#enquire').scrollIntoViewIfNeeded();
      await pause(page, 600);
      await typeInto(page, page.locator('#f-name'), 'Sunil Bhat');
      await typeInto(page, page.locator('#f-email'), 'sunil.bhat@westernghats.example');
      await typeInto(page, page.locator('#f-company'), 'Western Ghats Journeys');
      await typeInto(page, page.locator('#f-country'), 'India');
      await typeInto(page, page.locator('#f-message'), 'We are six people in Mangaluru. Could we see a demo with one of our WhatsApp enquiries?', { delay: 22 });
      const send = page.locator('#enquiry-form button[type="submit"]');
      await focus(page, 'send', send);
      await clickOn(page, send);
      await expect(page.locator('#enquiry-success')).toBeVisible({ timeout: 15_000 });
    });

    await beat(page, 'landing-legal', async () => {
      await page.goto(`${LANDING}/legal/privacy.html`);
      await settle(page, 1200);
      await scrollSteps(page, 1, 400);
      await page.goto(`${LANDING}/legal/subprocessors.html`);
      await settle(page, 1100);
    });

    await beat(page, 'wp-create', async () => {
      await page.goto(`${CONSOLE_URL}/login`);
      await settle(page, 800);
      await typeInto(page, page.locator('#email'), OPERATOR.email);
      await typeInto(page, page.locator('#password'), OPERATOR.password, { delay: 30 });
      await clickOn(page, page.locator('button[type="submit"]'));
      await page.waitForURL(/\/dashboard$/, { timeout: 20_000 });
      await page.goto(`${CONSOLE_URL}/tenants/${B.tenantId}`);
      await settle(page, 1200);
      await clickOn(page, page.getByRole('tab', { name: 'Website' }));
      const create = page.getByRole('button', { name: 'Create website' });
      if (await create.isVisible().catch(() => false)) {
        // product limit on a local stack: no web server is attached yet (it is set up at go-live), so the click is not filmed
        await focus(page, 'create-site', create, { dwellMs: 900 });
      }
    });

    await beat(page, 'wp-console', async () => {
      await page.goto(`${CONSOLE_URL}/wordpress`);
      await settle(page, 1300);
      await glance(page, page.locator('table tbody tr').first(), 1000);
    });
  });
});

void admin;
