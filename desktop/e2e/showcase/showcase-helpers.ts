import type { Page } from '@playwright/test';

/**
 * Presentation helpers for the single-take showcase recording.
 *
 * Two jobs:
 *  1. Make the video self-narrating (chapter cards, lower-third captions,
 *     element highlights) without depending on any app markup.
 *  2. Make the take survivable — a failing section must not abort the
 *     recording, or one broken feature costs the entire deliverable.
 */

// ─── Failure collection ──────────────────────────────────────────

export interface SectionFailure {
  section: string;
  error: string;
}

const failures: SectionFailure[] = [];
const chapters: { title: string; at: number }[] = [];
let recordingStart = 0;

export function startRecording() {
  recordingStart = Date.now();
}

export function getFailures(): SectionFailure[] {
  return failures;
}

export function getChapters() {
  return chapters;
}

/** mm:ss since the recording started — used to build the chapter index. */
function stamp(): string {
  const s = Math.max(0, Math.round((Date.now() - recordingStart) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Overlay styling (injected, never depends on app CSS) ────────

const OVERLAY_CSS = `
@keyframes scFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes scPulse  { 0%,100% { box-shadow: 0 0 0 3px rgba(99,102,241,.9), 0 0 24px rgba(99,102,241,.5); }
                      50%     { box-shadow: 0 0 0 6px rgba(99,102,241,.5), 0 0 36px rgba(99,102,241,.3); } }
#sc-chapter {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0b1020 0%, #1a1440 100%);
  color: #fff; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  animation: scFadeIn .4s ease-out;
}
#sc-chapter .sc-kicker { font-size: 18px; letter-spacing: .34em; text-transform: uppercase;
  color: #a5b4fc; margin-bottom: 22px; }
#sc-chapter .sc-title  { font-size: 76px; font-weight: 700; letter-spacing: -.02em; }
#sc-chapter .sc-sub    { font-size: 26px; color: #c7d2fe; margin-top: 18px; max-width: 60ch;
  text-align: center; line-height: 1.5; }
#sc-caption {
  position: fixed; left: 50%; bottom: 56px; transform: translateX(-50%); z-index: 2147483646;
  background: rgba(11,16,32,.93); color: #fff; padding: 16px 30px; border-radius: 12px;
  font: 500 24px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
  border: 1px solid rgba(165,180,252,.35); box-shadow: 0 12px 40px rgba(0,0,0,.45);
  max-width: 80vw; text-align: center; animation: scFadeIn .3s ease-out;
}
#sc-caption.sc-error { background: rgba(60,10,14,.95); border-color: rgba(248,113,113,.55); }
.sc-highlight { animation: scPulse 1.2s ease-in-out infinite; border-radius: 8px; }
`;

async function ensureStyles(page: Page) {
  const has = await page.evaluate(() => !!document.getElementById('sc-styles'));
  if (!has) {
    await page.addStyleTag({ content: `/* sc */\n${OVERLAY_CSS}` });
    await page.evaluate(() => {
      const tag = document.querySelector('style:last-of-type');
      if (tag) tag.id = 'sc-styles';
    });
  }
}

// ─── Public API ──────────────────────────────────────────────────

/** Full-screen chapter card. Records a timestamped entry for SHOWCASE.md. */
export async function chapter(page: Page, title: string, subtitle = '', holdMs = 2200) {
  chapters.push({ title, at: Date.now() - recordingStart });
  await ensureStyles(page);
  await page.evaluate(
    ({ title, subtitle }) => {
      document.getElementById('sc-chapter')?.remove();
      const el = document.createElement('div');
      el.id = 'sc-chapter';
      el.innerHTML =
        `<div class="sc-kicker">TravelCRM Pro</div>` +
        `<div class="sc-title"></div>` +
        (subtitle ? `<div class="sc-sub"></div>` : '');
      (el.querySelector('.sc-title') as HTMLElement).textContent = title;
      if (subtitle) (el.querySelector('.sc-sub') as HTMLElement).textContent = subtitle;
      document.body.appendChild(el);
    },
    { title, subtitle }
  );
  await page.waitForTimeout(holdMs);
  await page.evaluate(() => document.getElementById('sc-chapter')?.remove());
}

/** Lower-third caption narrating the current action. */
export async function caption(page: Page, text: string, holdMs = 1400, isError = false) {
  await ensureStyles(page);
  await page.evaluate(
    ({ text, isError }) => {
      document.getElementById('sc-caption')?.remove();
      const el = document.createElement('div');
      el.id = 'sc-caption';
      if (isError) el.className = 'sc-error';
      el.textContent = text;
      document.body.appendChild(el);
    },
    { text, isError }
  );
  await page.waitForTimeout(holdMs);
}

export async function clearCaption(page: Page) {
  await page.evaluate(() => document.getElementById('sc-caption')?.remove()).catch(() => {});
}

/** Pulse a ring around an element so the viewer sees what is being used. */
export async function highlight(page: Page, selector: string, holdMs = 1200) {
  const ok = await page
    .evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.classList.add('sc-highlight');
      return true;
    }, selector)
    .catch(() => false);
  if (!ok) return;
  await page.waitForTimeout(holdMs);
  await page
    .evaluate((sel) => document.querySelector(sel)?.classList.remove('sc-highlight'), selector)
    .catch(() => {});
}

/**
 * Run one feature section. A throw is captured, shown on screen, and swallowed
 * so the take continues. Failures are asserted at the very end of the spec —
 * after the recording has safely closed.
 */
export async function section(page: Page, name: string, fn: () => Promise<void>) {
  const at = stamp();
  console.log(`  [${at}] section: ${name}`);
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push({ section: name, error: message.split('\n').slice(0, 3).join(' ') });
    console.error(`  [${at}] SECTION FAILED: ${name} — ${message.split('\n')[0]}`);
    try {
      await caption(page, `⚠ ${name} — section failed, continuing`, 2000, true);
      await clearCaption(page);
      // Return to a known-good surface so the next section can start cleanly.
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
    } catch {
      /* recovery is best-effort; never let it abort the take */
    }
  }
}

/** Settle: no spinners, brief pause so the frame is readable on video. */
export async function settle(page: Page, ms = 900) {
  await page
    .waitForFunction(() => document.querySelectorAll('.animate-spin').length === 0, { timeout: 20_000 })
    .catch(() => {});
  await page.waitForTimeout(ms);
}

/** Slow, visible typing — instant fills read as glitches on video. */
export async function typeSlowly(page: Page, selector: string, text: string, delay = 55) {
  const el = page.locator(selector).first();
  await el.click();
  await el.fill('');
  await el.pressSequentially(text, { delay });
}

/** Smooth scroll so infinite-scroll loading is visible rather than a jump cut. */
export async function scrollThrough(page: Page, steps = 4, stepMs = 700) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(stepMs);
  }
}
