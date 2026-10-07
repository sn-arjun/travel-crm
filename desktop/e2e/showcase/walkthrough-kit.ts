/**
 * Shared scaffolding for the full-walkthrough parts (STORYBOARD C). Deliberately thin: every chapter's interactions are
 * hand-written in full-walkthrough.spec.ts with the values from demo-data.ts; this file only holds navigation, the chapter
 * card and the recording envelope so that a part can be re-recorded on its own.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { assertClean, attachListeners, card, clickOn, dwell, finishRecording, hoverOn, installOverlays, say, scrollSteps, settle, startRecording, typeInto, WORK_DIR } from './showcase-helpers';

import type { Page, TestInfo } from '@playwright/test';


export const sidebar = (page: Page, href: string) => page.locator(`aside a[href="${href}"]`).first();

/** Chapter card (1.8 s) followed by a settle so the first caption never lands on a loading page. */
export async function chapter(page: Page, n: number, title: string, subtitle?: string): Promise<void> {
  await card(page, { kicker: `Chapter ${n}`, title, subtitle, holdMs: 1800 });
  await settle(page, 300);
}

/** Click a sidebar link, wait for the route and for the page to finish loading. */
export async function nav(page: Page, href: string, o: { exact?: boolean; ms?: number } = {}): Promise<void> {
  if ((await sidebar(page, href).count()) === 0) await page.goto(href); // pages the sidebar does not link to directly
  else await clickOn(page, sidebar(page, href));
  await page.waitForURL(o.exact === false ? `**${href}*` : `**${href}`, { timeout: 20_000 });
  await settle(page, o.ms ?? 1200);
}

/** Type a search term into the list's search box and wait for the list to re-render. */
export async function search(page: Page, placeholder: RegExp | string, term: string): Promise<void> {
  await typeInto(page, page.getByPlaceholder(placeholder).first(), term);
  await settle(page, 1300);
}

/** Open a record from a list: hover the row, click it, wait for the detail route. */
export async function openRow(page: Page, rowText: string | RegExp, urlRe: RegExp): Promise<void> {
  const row = page.locator('table tbody tr').filter({ hasText: rowText }).first();
  await hoverOn(page, row, 500);
  const view = row.getByRole('button', { name: 'View', exact: true }).or(row.getByRole('link', { name: 'View', exact: true }));
  await clickOn(page, (await view.count()) ? view.first() : row);
  await page.waitForURL(urlRe, { timeout: 20_000 });
  await settle(page, 1300);
}

const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:8787/api/v1').replace(/\/+$/, '');

/** Off-camera setup: log in as the demo user and POST/GET through the API (used to stage records the story creates live). */
export async function apiCall(method: string, p: string, body?: unknown): Promise<any> {
  const login = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ananya.menon@example.com', password: 'Admin@123', tenantId: '01960000-0000-7000-8000-000000000001' }) });
  const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;
  const res = await fetch(API_URL + p, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return res.json();
}

/** The Nair family lead is created live in the story; the walkthrough stages it through the API so chapters can link to it. */
export async function ensurePriyaLead(): Promise<string> {
  const existing = await apiCall('GET', `/leads?search=${encodeURIComponent('Kerala Backwaters Family Holiday')}`);
  const list = (existing?.data?.data ?? existing?.data ?? []) as { id: string; title: string }[];
  const found = list.find((l) => l.title === 'Kerala Backwaters Family Holiday');
  if (found) return found.id;
  const contacts = await apiCall('GET', `/contacts?search=${encodeURIComponent('Priya Nair')}`);
  const c = ((contacts?.data?.data ?? contacts?.data ?? []) as { id: string; name: string }[]).find((x) => x.name === 'Priya Nair');
  if (!c) throw new Error('Priya Nair contact missing: run the demo seed first');
  const r = await apiCall('POST', '/leads', {
    contactId: c.id, title: 'Kerala Backwaters Family Holiday', destinations: ['Munnar', 'Thekkady', 'Alleppey', 'Kumarakom'], tripType: 'family',
    travelDate: '2026-12-22', returnDate: '2026-12-27', paxAdults: 2, paxChildren: 2, budget: 125000, priority: 'hot', source: 'website',
  });
  if (!r?.data?.id) throw new Error(`could not stage Priya's lead: ${JSON.stringify(r).slice(0, 300)}`);
  return r.data.id;
}

export interface PartCtx { page: Page; created: Record<string, string> }

/** Everything a part needs around its body: overlays, listeners, marks, a failure screenshot and the saved video. */
export async function recordPart(page: Page, context: import('@playwright/test').BrowserContext, name: string, testInfo: TestInfo, body: (ctx: PartCtx) => Promise<void>): Promise<void> {
  await installOverlays(context);
  startRecording();
  attachListeners(page);
  const created: Record<string, string> = {};
  let finished = false;
  try {
    await body({ page, created });
    await dwell(page, 800);
    finished = true;
  } finally {
    fs.mkdirSync(WORK_DIR, { recursive: true });
    fs.writeFileSync(path.join(WORK_DIR, `${name}-created.json`), JSON.stringify(created, null, 2));
    if (!finished) await page.screenshot({ path: path.join(WORK_DIR, `fail-${name}.png`) }).catch(() => {});
    await finishRecording(page, name, testInfo);
  }
}

export { assertClean, card, clickOn, dwell, hoverOn, say, scrollSteps, settle, typeInto };
