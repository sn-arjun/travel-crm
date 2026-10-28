/**
 * Film ai-session (GATED, live Workers AI): studio/clips/ai-session.json.
 *
 * Runs ONLY with SHOWCASE_AI=1 on a stack started with `fix-stack.mjs up --slot N --reset-db --ai`, after the owner said yes.
 * Budget: 12 AI requests for the whole take. Planned use: 2 for the message read (server side), 1 each for lead extraction,
 * compose, itinerary, one social post (a single platform), natural-language search and a lead score recalculation, and 1 for the
 * insights page that generates on open: 9 in all, which leaves 3 spare. The smart follow-ups, briefing and health score pages are
 * not opened (they also generate on open), so those features are named in the closing "not shown running here" scene.
 * The spec uses film-kit's aiGuard: it counts every AI request the browser makes (see isAiRequest) plus the 2 server-side reads of
 * the message read, and blocks the one that would pass the budget of 7 (the 6 planned + 1 spare). It is never retried automatically.
 */
import type { Locator, Page } from '@playwright/test';

import { aiGuard, asUser, beat, clickOn, expect, glance, inbound, pause, pickRelation, recordFilm, settle, typeInto } from './film-kit';

const test = asUser();
const LIVE = process.env.SHOWCASE_AI === '1';
const BUDGET = 7; // extract, compose, social, search (4 from the browser) + the 2 server-side requests of the message read = 6 planned, 1 spare

/** Click the one action button, then wait until the page has its answer (the busy label goes and the button is usable again). */
async function run(page: Page, button: Locator): Promise<void> {
  await clickOn(page, button);
  await page.waitForTimeout(1500);
  await expect(button).toBeEnabled({ timeout: 90_000 });
  await settle(page, 1200);
  await pause(page, 900);
}

test('film:ai-session', async ({ page, context }, testInfo) => {
  test.skip(!LIVE, 'live AI session: needs SHOWCASE_AI=1, an --ai stack and the owner\'s approval');
  test.setTimeout(30 * 60_000);
  const ai = await aiGuard(page, { budget: BUDGET, live: LIVE, onExceed: 'close' });
  await recordFilm(page, context, 'ai-session', testInfo, async () => {
    await page.goto('/dashboard');
    await settle(page, 1500);

    await beat(page, 'ai-read', async () => {
      ai.server(2); // the message read: two model calls made by the server, not the browser
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
      await typeInto(page, page.locator('#lead-text'), 'From: Vivek Rao, +91 98450 66120. Family of 4 (kids 10 and 7) looking at Coorg for 3 nights, 26-29 Dec, homestay with a pool, budget 60k.', { delay: 18 });
      await run(page, page.getByRole('button', { name: /Extract Lead Data/ }));
    });

    await beat(page, 'ai-compose', async () => {
      await page.goto('/ai/compose');
      await settle(page, 1200);
      await typeInto(page, page.locator('#context'), 'Polite reminder to Neha that the Maldives villa hold expires on Friday; offer to extend by two days.', { delay: 18 });
      await run(page, page.getByRole('button', { name: /Compose Message/ }));
    });

    await beat(page, 'ai-social', async () => {
      await page.goto('/marketing/social');
      await settle(page, 1500);
      // not the "Generate" of the festival suggestions panel (that is a second AI request): the header's Generate posts
      await clickOn(page, page.getByRole('button', { name: /^Generate posts$|Generate your first post/ }).first());
      const dlg = page.getByRole('dialog');
      await typeInto(page, dlg.locator('#gen-topic'), 'Christmas houseboat offer: 10% off until 31 October');
      await typeInto(page, dlg.locator('#gen-destination'), 'Alleppey');
      // one platform only: several would generate in a batch (more requests)
      const platforms = dlg.getByRole('checkbox');
      const n = await platforms.count();
      for (let i = 1; i < n; i++) if (await platforms.nth(i).isChecked().catch(() => false)) await platforms.nth(i).uncheck();
      await clickOn(page, dlg.getByRole('button', { name: /^Generate$/ }));
      await expect(dlg).toBeHidden({ timeout: 90_000 });
      await settle(page, 1500);
      await pause(page, 900);
    });

    await beat(page, 'ai-search', async () => {
      await page.goto('/ai/search');
      await settle(page, 1200);
      await typeInto(page, page.getByPlaceholder(/Ask anything about your CRM data/), 'Which Goa leads are travelling in December?', { delay: 18 });
      await run(page, page.getByRole('button', { name: /^Search$/ }));
    });

    ai.report(); // the session total must stay at or under 12: check Settings > AI usage afterwards
  });
});
