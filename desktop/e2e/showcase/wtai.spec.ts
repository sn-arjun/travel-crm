/**
 * Walkthrough part "wtai": chapter 37, the ONLY part that touches AI. It makes at most 4 AI requests per take, each one a single deliberate
 * click (or one page load) with the real result shown for a few seconds:
 *   1. Lead extraction   POST /ai/extract-lead         (paste a WhatsApp enquiry, click "Extract Lead Data")
 *   2. Message composer  POST /ai/compose-message      (one click on "Compose")
 *   3. Lead scoring      GET  /ai/lead-score/:id       (opened by "Get lead score")
 *   4. Team performance  GET  /ai/bi/team-performance  (one page load)
 * There are no loops and no retries on AI calls. The stack must run with the remote Workers AI binding for the real results
 * (`node scripts/fix-stack.mjs up --slot N --ai`, billed per request) and the spec must then be started with SHOWCASE_AI=1.
 * Without SHOWCASE_AI=1 (the default stack has no provider) the same clicks run and the page's own "AI is not configured yet" notice
 * is the expected, honest result: that is how the selectors and navigation are developed without spending a single AI request.
 */
import { expect, test } from './showcase-fixtures';
import { assertClean, chapter, clickOn, dwell, hoverOn, recordPart, say, settle, typeInto } from './walkthrough-kit';
import { pause, pickRelation, pickSelect } from './showcase-helpers';

const AI = process.env.SHOWCASE_AI === '1';

/** Wait (once, never retry) until the page stops spinning, then check the outcome matches the stack mode. */
async function aiOutcome(page: import('@playwright/test').Page, resultText: RegExp, noticeWithoutAi = true): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('.animate-spin').length === 0, undefined, { timeout: 90_000, polling: 250 });
  await pause(page, 500);
  if (AI) {
    await expect(page.getByText(resultText).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('AI is not configured yet')).toHaveCount(0);
  } else {
    if (noticeWithoutAi) await expect(page.getByText(/AI is not configured yet/).first()).toBeVisible({ timeout: 10_000 });
    else await expect(page.getByText(resultText).first()).toBeVisible({ timeout: 10_000 });
  }
}

test('wtai: AI assistant, extraction, composer, scoring, business intelligence (chapter 37)', async ({ page, context }, testInfo) => {
  test.setTimeout(15 * 60_000);
  await recordPart(page, context, 'wtai', testInfo, async () => {
    await page.goto('/ai');
    await settle(page, 1800);

    await chapter(page, 37, 'AI assistant', 'Draft, extract and score with AI');
    await hoverOn(page, page.getByRole('link', { name: /Lead Extraction/ }).first(), 700);
    await say(page, 'AI drafts the busywork — you review and decide', 3000);

    // 1 — lead extraction
    await clickOn(page, page.getByRole('link', { name: /Lead Extraction/ }).first());
    await page.waitForURL('**/ai/lead-creation');
    await settle(page, 1200);
    await typeInto(page, page.locator('#lead-text'), "Hi, I'm Neeraj Verma (neeraj.verma@example.com, +91 98450 61234). We are 4 adults planning a 3-night Coorg weekend in November, budget around ₹60,000. Please send a plan.", { delay: 22 });
    await say(page, 'Paste an enquiry — AI pulls out the lead details', 2600);
    await clickOn(page, page.getByRole('button', { name: /Extract Lead Data/ }));
    await aiOutcome(page, /Neeraj/);
    await dwell(page, AI ? 4500 : 1500);
    await assertClean(page, 'ch37 extraction');

    // 2 — message composer
    await page.goto('/ai/compose');
    await settle(page, 1200);
    await pickSelect(page, page.locator('#channel'), 'WhatsApp');
    await typeInto(page, page.locator('#context'), 'Follow up with Neeraj about his Coorg weekend. Ask if he prefers a coffee-estate stay and offer to hold rooms for 48 hours.', { delay: 22 });
    await clickOn(page, page.getByRole('button', { name: /^Compose/ }));
    await aiOutcome(page, /Neeraj|Coorg/);
    await say(page, 'A ready-to-send follow-up in your chosen tone', 3200);
    await dwell(page, AI ? 3500 : 1000);
    await assertClean(page, 'ch37 composer');

    // 3 — lead scoring
    await page.goto('/ai/lead-score');
    await settle(page, 1200);
    await pickRelation(page, page.getByRole('combobox').filter({ hasText: /Select a lead/ }), 'Search leads…', 'Maldives', /Maldives Overwater/);
    await clickOn(page, page.getByRole('button', { name: /Get lead score/ }));
    await page.waitForURL(/\/ai\/lead-score\/[^/]+$/, { timeout: 20_000 });
    // opening the page shows the stored score (no AI request); "Recalculate" is the one deliberate AI request of this step
    await expect(page.getByText('Overall score')).toBeVisible({ timeout: 20_000 });
    await say(page, 'Know which leads to call first, and why', 3000);
    if (AI) {
      await clickOn(page, page.getByRole('button', { name: /Recalculate/ }));
      await page.waitForFunction(() => document.querySelectorAll('.animate-spin').length === 0, undefined, { timeout: 90_000, polling: 250 });
      await pause(page, 500);
      await expect(page.getByText('Overall score')).toBeVisible();
      await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
      await dwell(page, 4000);
    } else {
      await hoverOn(page, page.getByRole('button', { name: /Recalculate/ }), 1000);
    }
    await assertClean(page, 'ch37 scoring');

    // 4 — business intelligence (one page load)
    await page.goto('/ai/bi/team');
    await settle(page, 1500);
    await aiOutcome(page, /Team members/, false);
    await say(page, 'Team performance with AI commentary on top of live numbers', 3600);
    await dwell(page, 1500);
    await assertClean(page, 'ch37 bi');
  });
});
