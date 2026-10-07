import * as fs from 'node:fs';
import * as path from 'node:path';

import type { BrowserContext, Locator, Page, TestInfo } from '@playwright/test';

import { BANNED_PATTERNS } from './demo-data';
import { cursorOverlayInit } from './cursor-overlay';

/**
 * Recording harness for the client demo videos (STORYBOARD D.2-D.5).
 *
 * Rules baked in:
 *  - the take narrates itself with a visible cursor + click ripple, lower-third captions and brand cards;
 *  - there is NO global slowMo: every pause is an explicit helper call (pacing rules, D.5);
 *  - there are no failure captions and no "continue after failure": any violation throws and the take is
 *    aborted (the orchestrator retakes). Nothing broken is ever shown on camera;
 *  - every card/mark is logged with a video-relative timestamp for chapters + trimming.
 */

/** SHOWCASE_PACE scales every explicit pause (1 = recorded pacing; 0.15 = fast debug run). */
export const PACE = Number(process.env.SHOWCASE_PACE ?? 1);
export const pause = (page: Page, ms: number): Promise<void> => page.waitForTimeout(Math.round(ms * PACE));

export const WORK_DIR = path.resolve(__dirname, '..', '..', 'showcase', '.work');

// ─── Marks (video-relative timeline) ─────────────────────────────

export interface Mark { name: string; atMs: number; type?: 'card' | 'caption' | 'mark'; data?: Record<string, unknown> }
const marks: Mark[] = [];
let videoT0 = Date.now();
const violations: string[] = [];

/** Call right after the page is created (the video starts then). Resets marks and violations. */
export function startRecording(): void {
  videoT0 = Date.now();
  marks.length = 0;
  violations.length = 0;
}
export const elapsedMs = (): number => Date.now() - videoT0;
export function mark(name: string, data?: Record<string, unknown>, type: Mark['type'] = 'mark'): void {
  marks.push({ name, atMs: elapsedMs(), type, data });
  console.log(`  [${fmt(elapsedMs())}] ${type === 'mark' ? 'mark' : type}: ${name}`);
}
export const getMarks = (): Mark[] => marks;
export const getViolations = (): string[] => violations;
function fmt(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Overlays ────────────────────────────────────────────────────

/** Inject the cursor/caption/card overlay into every page of the context (survives navigations). */
export async function installOverlays(context: BrowserContext): Promise<void> {
  await context.addInitScript(cursorOverlayInit);
}

const sc = (page: Page, fn: string, args: unknown[] = []) =>
  page.evaluate(([f, a]) => (window as any).__sc?.[f as string](...(a as unknown[])), [fn, args] as [string, unknown[]]);

/** Full-screen brand card (scene/chapter). Hides the cursor while shown. Logs a `card` mark. */
export async function card(page: Page, o: { kicker?: string; title: string; subtitle?: string; holdMs?: number }): Promise<void> {
  mark(o.title, { kicker: o.kicker, subtitle: o.subtitle }, 'card');
  await sc(page, 'card', [{ kicker: o.kicker, title: o.title, subtitle: o.subtitle }]);
  await pause(page, o.holdMs ?? 2600);
  await sc(page, 'hideCard');
  await pause(page, 350);
}

/** Hold time rule (B.0): max(2.2 s, 1.0 s + 55 ms x characters). */
export const holdFor = (text: string): number => Math.max(2200, 1000 + 55 * text.length);

/** Lower-third caption, shown for `holdMs` (default: B.0 formula) and then faded out, so it never lingers over the next screen. */
export async function say(page: Page, text: string, holdMs?: number, kicker?: string): Promise<void> {
  mark(text, undefined, 'caption');
  await sc(page, 'say', [text, kicker]);
  await pause(page, holdMs ?? holdFor(text));
  await sc(page, 'clearSay');
  await pause(page, 220);
}
export async function clearSay(page: Page): Promise<void> {
  await sc(page, 'clearSay');
  await pause(page, 250);
}
export const hideOverlays = (page: Page) => sc(page, 'hide');
export const showOverlays = (page: Page) => sc(page, 'show');

// ─── Pointer ─────────────────────────────────────────────────────

let pointer = { x: 960, y: 540 };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const jitter = (n: number) => (Math.random() * 2 - 1) * n;

/** Visible, never-teleporting pointer move to the centre of a locator. */
export async function moveTo(page: Page, target: Locator): Promise<void> {
  // lists re-render after a search/refetch: retry when the node is swapped out under us
  let box = null;
  for (let attempt = 0; attempt < 5 && !box; attempt++) {
    try {
      await target.waitFor({ state: 'visible', timeout: 10_000 });
      await target.scrollIntoViewIfNeeded({ timeout: 5000 });
      box = await target.boundingBox();
    } catch (e) {
      if (attempt === 4) throw e;
    }
    if (!box) await page.waitForTimeout(500);
  }
  if (!box) throw new Error(`moveTo: no bounding box for ${target}`);
  const x = box.x + box.width / 2 + jitter(3);
  const y = box.y + box.height / 2 + jitter(2);
  const dist = Math.hypot(x - pointer.x, y - pointer.y);
  await page.mouse.move(x, y, { steps: clamp(Math.round(dist / 22), 12, 40) });
  pointer = { x, y };
  await pause(page, 120);
}

export async function clickOn(page: Page, target: Locator): Promise<void> {
  await moveTo(page, target);
  await pause(page, 180);
  await target.click();
  await settle(page);
}

export async function hoverOn(page: Page, target: Locator, dwellMs = 900): Promise<void> {
  await moveTo(page, target);
  await pause(page, dwellMs);
}

// ─── Input ───────────────────────────────────────────────────────

/** Click, select-all, clear, then human-speed typing (45 ms/char; 18 ms for text over 140 chars). */
export async function typeInto(page: Page, target: Locator, text: string, o: { delay?: number; clear?: boolean } = {}): Promise<void> {
  await moveTo(page, target);
  await pause(page, 180);
  await target.click();
  if (o.clear !== false) {
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
  }
  await target.pressSequentially(text, { delay: Math.round((o.delay ?? (text.length > 140 ? 18 : 45)) * PACE) });
  await pause(page, 250);
}

export const fieldByLabel = (page: Page, label: string): Locator => {
  const exact = page.getByLabel(label, { exact: true });
  return exact.or(page.locator(`label:text-is("${label}")`).locator('xpath=ancestor::*[self::div][1]').locator('input, textarea').first()).first();
};

/** Radix Select: open, pause, choose. */
export async function pickSelect(page: Page, trigger: Locator, optionName: string | RegExp): Promise<void> {
  await clickOn(page, trigger);
  await pause(page, 400);
  await clickOn(page, page.getByRole('option', { name: optionName, exact: typeof optionName === 'string' }).first());
}

/** Searchable relation combobox (cmdk): open, type the query, choose the option. */
export async function pickRelation(page: Page, trigger: RegExp | Locator, searchPlaceholder: string | RegExp, query: string, optionText: string | RegExp): Promise<void> {
  const t = trigger instanceof RegExp ? page.getByRole('combobox').filter({ hasText: trigger }).first() : trigger;
  await clickOn(page, t);
  await pause(page, 400);
  const search = page.getByPlaceholder(searchPlaceholder).last();
  await typeInto(page, search, query);
  await settle(page, 600);
  const cmdk = page.locator('[cmdk-item]').filter({ hasText: optionText }).first();
  const opt = (await cmdk.count()) ? cmdk : page.getByRole('option').filter({ hasText: optionText }).first();
  await clickOn(page, opt);
}

/** DatePicker popover: open, choose year + month in the labelled selects, click the day (data-day=YYYY-MM-DD). */
export async function pickDate(page: Page, trigger: Locator, isoDate: string): Promise<void> {
  const [y, m] = isoDate.split('-').map(Number) as [number, number];
  await clickOn(page, trigger);
  await pause(page, 400);
  const dlg = page.getByRole('dialog', { name: /^Choose date/ }).last();
  await dlg.getByLabel('Year', { exact: true }).selectOption(String(y));
  await dlg.getByLabel('Month', { exact: true }).selectOption(String(m - 1));
  await pause(page, 300);
  await clickOn(page, dlg.locator(`[data-day="${isoDate}"]`));
}

/** Date-and-time picker (follow-ups, events): year + month selects, the day, then hour and minute selects and Done. */
export async function pickDateTime(page: Page, trigger: Locator, isoDate: string, hour: number, minute: number): Promise<void> {
  const [y, m] = isoDate.split('-').map(Number) as [number, number];
  await clickOn(page, trigger);
  await pause(page, 400);
  const dlg = page.getByRole('dialog', { name: /^Choose date/ }).last();
  await dlg.getByLabel('Year', { exact: true }).selectOption(String(y));
  await dlg.getByLabel('Month', { exact: true }).selectOption(String(m - 1));
  await pause(page, 250);
  await clickOn(page, dlg.locator(`[data-day="${isoDate}"]`));
  await dlg.getByLabel('Hour', { exact: true }).selectOption(String(hour));
  await pause(page, 200);
  await dlg.getByLabel('Minute', { exact: true }).selectOption(String(minute));
  await pause(page, 300);
  await clickOn(page, dlg.getByRole('button', { name: 'Done' }));
}

// ─── Timing ──────────────────────────────────────────────────────

/** No spinners + network quiet, then dwell. */
export async function settle(page: Page, ms = 900): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('.animate-spin, [data-slot="skeleton"]').length === 0, undefined, { timeout: 20_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await pause(page, ms);
}
export const dwell = (page: Page, ms: number) => pause(page, ms);

/** Smooth scroll in 500px wheel steps, 650 ms apart (never jumps). */
export async function scrollSteps(page: Page, steps = 3, dy = 500): Promise<void> {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy);
    await pause(page, 650);
  }
}

// ─── Cleanliness gate (D.9 #1, #3, #4) ───────────────────────────

const CHROME_ALLOW = /Test connection|Test Connection|Send test|Test webhook/g;
const NET_ALLOW: RegExp[] = [/\/auth\/refresh$/, /\/photo(\?|$)/, /maps\.googleapis\.com|maps\.gstatic\.com|google\.com\/maps/];

/** Wire console/pageerror/response listeners; violations are thrown at the next assertClean(). */
export function attachListeners(page: Page): void {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return; // statuses are judged by the response listener
    if (/Google Maps|maps\.googleapis/i.test(t)) return;
    // Radix accessibility warning for the command palette dialog: nothing is visible; reported in SHOWCASE.md
    if (/requires a `DialogTitle`|Missing `Description`|aria-describedby/.test(t)) return;
    violations.push(`console error: ${t.slice(0, 240)}`);
  });
  page.on('pageerror', (e) => violations.push(`pageerror: ${String(e).slice(0, 240)}`));
  page.on('response', (r) => {
    const s = r.status();
    if (s < 400) return;
    const url = r.url();
    if (NET_ALLOW.some((re) => re.test(url))) return;
    violations.push(`HTTP ${s} ${r.request().method()} ${url.slice(0, 160)}`);
  });
}

/** Throws (aborting the take) if the visible page contains a banned string, validation/error UI, or any listener hit. */
export async function assertClean(page: Page, where = ''): Promise<void> {
  const problems: string[] = [...violations];
  const dom = await page.evaluate(() => {
    const vals = Array.from(document.querySelectorAll('input, textarea')).map((e) => (e as HTMLInputElement).value ?? '').join('\n');
    const visible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return {
      text: `${document.body?.innerText ?? ''}\n${vals}`,
      invalid: Array.from(document.querySelectorAll('[aria-invalid="true"]')).filter(visible).length,
      danger: Array.from(document.querySelectorAll('.text-ds-danger')).filter((e) => visible(e) && !e.closest('button, a, [role="button"], [role="menuitem"]') && !/^[*₹$+\-−\d.,\s%KLCr()]*$/.test((e.textContent ?? '').trim()) && !/^(Exclusions|Overdue|Cancelled|Lost)$/i.test((e.textContent ?? '').trim())).map((e) => (e.textContent ?? '').trim().slice(0, 80)),
      errToast: document.querySelectorAll('[data-sonner-toast][data-type="error"]').length,
    };
  });
  const text = dom.text.replace(CHROME_ALLOW, '');
  for (const re of BANNED_PATTERNS) {
    const m = text.match(re);
    if (m) problems.push(`banned text ${re}: "${text.slice(Math.max(0, (m.index ?? 0) - 30), (m.index ?? 0) + 50).replace(/\s+/g, ' ')}"`);
  }
  if (/Failed to load/i.test(text)) problems.push('"Failed to load" visible');
  if (dom.invalid) problems.push(`${dom.invalid} aria-invalid field(s) visible`);
  if (dom.danger.length) problems.push(`error text visible: ${dom.danger.join(' | ')}`);
  if (dom.errToast) problems.push('error toast visible');
  if (problems.length) {
    const msg = `assertClean${where ? ` (${where})` : ''} @${fmt(elapsedMs())} failed:\n  - ${problems.join('\n  - ')}`;
    violations.length = 0;
    throw new Error(msg);
  }
}

// ─── Finish ──────────────────────────────────────────────────────

/**
 * Close the page (finalises the video), copy it to .work/<name>.webm and write marks + violations.
 * Call in a `finally` so a failed take still leaves its marks for debugging.
 */
export async function finishRecording(page: Page, name: string, info?: TestInfo): Promise<{ video: string | null }> {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const video = page.video();
  fs.writeFileSync(path.join(WORK_DIR, `marks-${name}.json`), JSON.stringify({ name, durationMs: elapsedMs(), marks }, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, `violations-${name}.json`), JSON.stringify(violations, null, 2));
  await page.context().close().catch(() => {});
  let out: string | null = null;
  if (video) {
    out = path.join(WORK_DIR, `${name}.webm`);
    await video.saveAs(out).catch((e) => { console.error(`video save failed: ${e}`); out = null; });
  }
  info?.annotations.push({ type: 'showcase-video', description: out ?? 'none' });
  return { video: out };
}
