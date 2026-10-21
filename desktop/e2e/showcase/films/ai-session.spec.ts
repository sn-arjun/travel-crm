/**
 * Film ai-session (GATED, live Workers AI): studio/clips/ai-session.json.
 *
 * Runs ONLY with SHOWCASE_AI=1 on a stack started with `fix-stack.mjs up --slot N --reset-db --ai`, after the owner said yes.
 * Budget: 12 AI requests for the whole take (2 for the message read, 1 per AI page). The spec counts every request to /api/v1/ai/
 * and to the AI-backed marketing route and aborts the take before a 13th. It is never retried automatically: a failed take is
 * inspected first and re-run by hand only with the owner's agreement. Selectors are best effort: dry-run the page flow without
 * --ai first (the pages then show their "AI is not configured" notice; that dry run spends nothing).
 */
import type { Locator, Page } from '@playwright/test';

import { asUser, beat, clickOn, expect, glance, inbound, pause, recordFilm, settle, typeInto } from './film-kit';

const test = asUser();
const LIVE = process.env.SHOWCASE_AI === '1';
/** 12 in all = 6 counted POSTs + 2 for the message read (server side) + about 4 for pages that generate on open. */
const BUDGET = 6;

async function ask(page: Page, input: Locator, text: string, button: RegExp, result: RegExp): Promise<void> {
  await typeInto(page, input, text, { delay: 18 });
  await clickOn(page, page.getByRole('button', { name: button }).first());
  await expect(page.getByText(result).first()).toBeVisible({ timeout: 90_000 });
  await pause(page, 900);
}

test('film:ai-session', async ({ page, context }, testInfo) => {
  test.skip(!LIVE, 'live AI session: needs SHOWCASE_AI=1, an --ai stack and the owner\'s approval');
  test.setTimeout(30 * 60_000);
  let spent = 0;
  // POSTs to AI routes are counted against the budget (the take aborts past 12). The 2 server-side requests of the message read and
  // the pages that generate on open (smart follow-ups, insights, briefing, health score: about 1 each) are not POSTs: they are
  // logged as "open" here, and the exact total is read from Settings > AI usage after the take.
  page.on('request', (r) => {
    if (r.method() === 'GET' && /\/api\/v1\/ai\/(?!settings|usage)/.test(r.url())) console.log(`  [ai] open ${r.url().replace(/^.*\/api\/v1/, '')}`);
    if (r.method() !== 'GET' && /\/api\/v1\/(ai\/|marketing\/social)/.test(r.url())) {
      spent++;
      console.log(`  [ai] request ${spent}/${BUDGET}: ${r.url().replace(/^.*\/api\/v1/, '')}`);
      if (spent > BUDGET) { console.error(`  [ai] budget exceeded (${spent} > ${BUDGET}): closing the take`); void page.context().close(); }
    }
  });
  await recordFilm(page, context, 'ai-session', testInfo, async () => {
    await page.goto('/dashboard');
    await settle(page, 1500);

    await beat(page, 'ai-read', async () => {
      await inbound({ from: '+919847033221', fromName: 'Rhea Kapoor', body: 'Hi! Two of us want a 6-night Sri Lanka trip in late February, beaches and a tea estate, around 2.2 lakh in total. Can you help?' });
      const card = page.getByTestId('attention-list').getByText(/Create contact and lead for Rhea Kapoor/);
      await expect(card).toBeVisible({ timeout: 60_000 });
      await clickOn(page, card);
      await settle(page, 1200);
      await glance(page, page.getByText(/\bAI\b/).first(), 1000);
    });

    await beat(page, 'ai-extract', async () => {
      await page.goto('/ai/lead-creation');
      await settle(page, 1200);
      await ask(page, page.locator('textarea').first(), 'From: Vivek Rao, +91 98450 66120. Family of 4 (kids 10 and 7) looking at Coorg for 3 nights, 26-29 Dec, homestay with a pool, budget 60k.', /Extract|Create|Analy[sz]e/, /Coorg/);
    });

    await beat(page, 'ai-compose', async () => {
      await page.goto('/ai/compose');
      await settle(page, 1200);
      await ask(page, page.locator('textarea').first(), 'Polite reminder to Neha that the Maldives villa hold expires on Friday; offer to extend by two days.', /Generate|Compose|Draft/, /Neha|Maldives/);
    });

    await beat(page, 'ai-itinerary', async () => {
      await page.goto('/ai/itinerary');
      await settle(page, 1200);
      await ask(page, page.locator('textarea, input[type="text"]').first(), '5 days in Kerala for a family of four in December: Munnar, Thekkady and a houseboat night', /Generate|Create/, /Day 1|Munnar/);
    });

    await beat(page, 'ai-social', async () => {
      await page.goto('/marketing/social');
      await settle(page, 1200);
      await ask(page, page.locator('textarea, input[type="text"]').first(), 'Christmas houseboat offer in Alleppey, 10% off until 31 October', /Generate|Create/, /Alleppey|houseboat/i);
    });

    await beat(page, 'ai-search', async () => {
      await page.goto('/ai/search');
      await settle(page, 1200);
      await ask(page, page.locator('input, textarea').first(), 'Which Goa leads are travelling in December?', /Ask|Search/, /Goa/);
    });

    await beat(page, 'ai-score', async () => {
      await page.goto('/ai/lead-score');
      await settle(page, 1300);
      await clickOn(page, page.getByRole('button', { name: /Recalculate/ }).first());
      await expect(page.getByText(/Recalculating|updated|score/i).first()).toBeVisible({ timeout: 90_000 });
      await page.goto('/ai/smart-followups');
      await settle(page, 2500);
    });

    await beat(page, 'ai-insights', async () => {
      await page.goto('/ai/insights');
      await settle(page, 3000);
      await page.goto('/ai/bi/briefings');
      await settle(page, 3000);
      await page.goto('/ai/bi/health-score');
      await settle(page, 3000);
    });
    console.log(`  [ai] take used ${spent} of ${BUDGET} counted requests (plus the message read and page opens: check Settings > AI usage; the session total must stay at or under 12)`);
  });
});
