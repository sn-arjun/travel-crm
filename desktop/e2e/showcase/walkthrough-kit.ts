/**
 * Shared scaffolding for the full-walkthrough parts (STORYBOARD C). Deliberately thin: every chapter's interactions are
 * hand-written in full-walkthrough.spec.ts with the values from demo-data.ts; this file only holds navigation, the chapter
 * card and the recording envelope so that a part can be re-recorded on its own.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Page, TestInfo } from '@playwright/test';

import { assertClean, attachListeners, card, clickOn, dwell, finishRecording, hoverOn, installOverlays, say, scrollSteps, settle, startRecording, typeInto, WORK_DIR } from './showcase-helpers';

export const sidebar = (page: Page, href: string) => page.locator(`aside a[href="${href}"]`).first();

/** Chapter card (1.8 s) followed by a settle so the first caption never lands on a loading page. */
export async function chapter(page: Page, n: number, title: string, subtitle?: string): Promise<void> {
  await card(page, { kicker: `Chapter ${n}`, title, subtitle, holdMs: 1800 });
  await settle(page, 300);
}

/** Click a sidebar link, wait for the route and for the page to finish loading. */
export async function nav(page: Page, href: string, o: { exact?: boolean; ms?: number } = {}): Promise<void> {
  await clickOn(page, sidebar(page, href));
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
  await clickOn(page, row);
  await page.waitForURL(urlRe, { timeout: 20_000 });
  await settle(page, 1300);
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
