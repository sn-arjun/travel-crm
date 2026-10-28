/**
 * Self-test of the film kit helpers (R163): per-scene speed in beat(), multi-part recordings, sidebar navigation, tabs, the phone
 * frame, the PDF viewer and the AI request guard. Needs the demo stack (fix-stack up + seed-demo + film-prep --demo) like any film.
 * No AI is ever called: the guard is tested with budget 0 and a request that a route answers or the guard aborts.
 *
 *   cd desktop && E2E_BASE_URL=http://localhost:3150 E2E_API_URL=http://localhost:8837/api/v1 \
 *     npx playwright test --config=e2e/showcase/films/playwright.films.config.ts --grep "kit:"
 *
 * showPdf needs the pdfjs-dist devDependency of desktop and is skipped while it is missing.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  aiGuard, API_URL, asUser, beat, expect, hasPdfjs, hoverNav, isAiRequest, navTo, recordFilm, REPO, settle, showInPhoneFrame, showPdf, tab,
} from './film-kit';
import { getMarks, PACE } from '../showcase-helpers';

const test = asUser();

const CLIP = 'prospect-kit-selftest'; // prospect-* clips are gitignored: this file never reaches the repo
const CLIP_FILE = path.join(REPO, 'studio', 'clips', `${CLIP}.json`);
const PART = 'prospect-kit-selftest-part2'; // a second recording of the same clip
const LINE = 'Two quick words here.'; // 4 words: the word-count estimate is 4 / 2.55 + 0.3 s

test.beforeAll(() => {
  fs.writeFileSync(CLIP_FILE, JSON.stringify({
    title: 'kit self-test',
    recording: CLIP,
    scenes: [
      { type: 'screen', step: 'normal', narration: LINE },
      { type: 'screen', step: 'fast', speed: 3, narration: LINE },
      { type: 'screen', step: 'other-part', recording: PART, speed: 1.5, narration: LINE },
    ],
  }, null, 2));
});
test.afterAll(() => { fs.rmSync(CLIP_FILE, { force: true }); });

const seconds = (id: string): number => {
  const m = getMarks();
  const a = m.find((x) => x.name === `step:${id}`);
  const b = m.find((x) => x.name === `step-end:${id}`);
  if (!a || !b) throw new Error(`no marks for ${id}`);
  return (b.atMs - a.atMs) / 1000;
};
const holds = (n: number) => (LINE.split(/\s+/).length / 2.55 + 0.3 + 0.65) * n * PACE; // estimate path: the manifest is not built for this clip

test('kit: beat holds (narration + 0.65) x speed, and a clip can be recorded in parts', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  await recordFilm(page, context, CLIP, testInfo, async () => {
    await page.goto('/dashboard');
    await settle(page, 600);
    await beat(page, 'normal');
    await beat(page, 'fast');
    expect(seconds('normal')).toBeGreaterThanOrEqual(holds(1) - 0.2);
    expect(seconds('normal')).toBeLessThan(holds(1) + 1.5);
    expect(seconds('fast')).toBeGreaterThanOrEqual(holds(3) - 0.2);
    expect(seconds('fast')).toBeLessThan(holds(3) + 1.5);
    expect(getMarks().find((x) => x.name === 'step:fast')?.data?.speed).toBe(3);
    // 'other-part' belongs to the other recording: it is not a beat of this one
    await expect(beat(page, 'other-part')).rejects.toThrow(/has no screen scene/);
  });
});

test('kit: the second part of a clip loads only its own scenes', async ({ page, context }, testInfo) => {
  test.setTimeout(120_000);
  await recordFilm(page, context, PART, testInfo, async () => {
    await page.goto('/dashboard');
    await settle(page, 600);
    await beat(page, 'other-part');
    expect(seconds('other-part')).toBeGreaterThanOrEqual(holds(1.5) - 0.2);
    await expect(beat(page, 'normal')).rejects.toThrow(/has no screen scene/);
  }, { clip: CLIP });
});

test('kit: navTo and hoverNav use the real sidebar, tab clicks a sub-tab', async ({ page }) => {
  await page.goto('/dashboard');
  await settle(page, 800);
  await hoverNav(page, ['/leads', '/contacts'], 200);
  await navTo(page, '/leads');
  expect(new URL(page.url()).pathname).toBe('/leads');
  await navTo(page, '/assistant');
  await tab(page, 'Activity');
  await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('data-state', 'active');
  // no silent direct load: a link that is not in the sidebar fails the film
  await expect(navTo(page, '/definitely-not-in-the-sidebar')).rejects.toThrow(/no sidebar link/);
});

test('kit: showInPhoneFrame puts a real app page in a 390 px frame', async ({ page }) => {
  await page.goto('/dashboard');
  await showInPhoneFrame(page, '/dashboard', { label: 'On the phone' });
  const frame = page.frameLocator('#phone');
  await expect(frame.locator('body')).toBeVisible();
  expect(await page.locator('#phone').evaluate((el) => el.getBoundingClientRect().width)).toBe(390);
  await expect(frame.locator('main, [role="main"], h1').first()).toBeVisible({ timeout: 25_000 });
  await expect(showInPhoneFrame(page, 'https://example.com/')).rejects.toThrow(/not a page of the app/);
});

test('kit: showPdf renders the pages with pdf.js from node_modules', async ({ page }) => {
  test.skip(!hasPdfjs(), 'pdfjs-dist is not installed: add it as a devDependency of desktop');
  const pages = await showPdf(page, path.join(REPO, 'desktop', 'e2e', 'showcase', 'fixtures', 'nair-family-passports.pdf'));
  expect(pages).toBeGreaterThan(0);
  expect(await page.locator('canvas').count()).toBe(pages);
});

test('kit: showPdf says what is missing when pdfjs-dist is not installed', async ({ page }) => {
  test.skip(hasPdfjs(), 'pdfjs-dist is installed');
  await expect(showPdf(page, path.join(REPO, 'desktop', 'e2e', 'showcase', 'fixtures', 'nair-family-passports.pdf'))).rejects.toThrow(/pdfjs-dist.*not installed/);
});

test('kit: isAiRequest knows what spends AI', () => {
  const u = (p: string) => `http://localhost:8787/api/v1${p}`;
  expect(isAiRequest('POST', u('/ai/compose'))).toBe(true);
  expect(isAiRequest('PUT', u('/ai/settings'))).toBe(false);
  expect(isAiRequest('GET', u('/ai/settings'))).toBe(false);
  expect(isAiRequest('GET', u('/ai/usage'))).toBe(false);
  expect(isAiRequest('POST', u('/marketing/social-content/generate'))).toBe(true);
  expect(isAiRequest('POST', u('/marketing/suggestions/generate'))).toBe(true);
  expect(isAiRequest('GET', u('/marketing/suggestions'))).toBe(false);
  expect(isAiRequest('GET', u('/ai/bi/seasonal-demand?x=1'))).toBe(true);
  expect(isAiRequest('GET', u('/ai/intelligence/insights'))).toBe(true);
  expect(isAiRequest('GET', u('/leads'))).toBe(false);
});

test('kit: aiGuard with budget 0 throws on an AI request, whether a route answers it or the guard aborts it', async ({ page }) => {
  await page.goto('/dashboard');
  await settle(page, 600);
  const guard = await aiGuard(page, { budget: 0, live: true });
  // 1) a fake AI endpoint answered by the spec's own route (no network at all)
  await page.route('**/api/v1/ai/compose', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"data":{}}' }));
  const post = (p: string) => page.evaluate(async ([url]) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then((r) => r.status).catch(() => -1), [`${API_URL}${p}`] as [string]);
  expect(await post('/ai/compose')).toBe(200);
  expect(() => guard.check()).toThrow(/AI budget 0 exceeded.*POST \/ai\/compose/);
  expect(guard.used).toBe(0);
  // 2) no route of the spec: the guard itself aborts the request before it leaves the browser
  expect(await post('/ai/search')).toBe(-1);
  expect(() => guard.report()).toThrow(/POST \/ai\/search/);
});

test('kit: aiGuard allows up to the budget and counts server-side reads', async ({ page }) => {
  await page.goto('/dashboard');
  const guard = await aiGuard(page, { budget: 2, live: true });
  guard.server(1);
  await page.route('**/api/v1/ai/compose', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"data":{}}' }));
  const post = () => page.evaluate(async ([url]) => fetch(url, { method: 'POST', body: '{}' }).then((r) => r.status).catch(() => -1), [`${API_URL}/ai/compose`] as [string]);
  expect(await post()).toBe(200);
  expect(guard.used).toBe(2);
  expect(() => guard.check()).not.toThrow();
  expect(() => guard.server(1)).toThrow(/AI budget 2 exceeded/);
  const off = await aiGuard(page, { budget: 5, live: false }); // not live: budget 0 whatever was asked
  expect(() => off.server(1)).toThrow(/AI budget 0 exceeded/);
  expect(() => off.report()).toThrow(/AI budget 0 exceeded/);
  expect(() => guard.report()).toThrow(/AI budget 2 exceeded/);
});
