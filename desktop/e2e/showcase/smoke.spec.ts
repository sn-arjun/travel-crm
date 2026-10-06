/**
 * Harness smoke clip (~30 s): login -> dashboard -> contacts, with cursor, one title card and two captions.
 * Proves the recording harness end to end (overlays visible in the video, marks, clean-page gate).
 *
 *   E2E_BASE_URL=http://localhost:3120 E2E_API_URL=http://localhost:8807/api/v1 \
 *     npx playwright test --config=playwright.showcase.config.ts smoke
 * Out: desktop/showcase/.work/smoke.webm, marks-smoke.json, violations-smoke.json
 */
import { test, expect } from './showcase-fixtures';
import {
  assertClean, attachListeners, card, clearSay, clickOn, finishRecording, hoverOn, installOverlays, mark, say, scrollSteps, settle, startRecording, typeInto,
} from './showcase-helpers';

test('smoke: dashboard to contacts', async ({ page, context }, testInfo) => {
  test.setTimeout(3 * 60_000);
  await installOverlays(context);
  startRecording();
  attachListeners(page);
  try {
    await page.goto('/dashboard');
    await settle(page, 1200);
    await card(page, { kicker: 'Smoke test', title: 'A day at Sahyadri Holidays', subtitle: 'Recording harness check', holdMs: 2600 });

    // Dashboard
    await expect(page.getByText('Dashboard').first()).toBeVisible();
    mark('dashboard');
    await say(page, 'Leads, follow-ups and revenue at a glance', undefined, 'Dashboard');
    await hoverOn(page, page.locator('aside a[href="/contacts"]').first(), 700);
    await assertClean(page, 'dashboard');

    // Contacts
    await clickOn(page, page.locator('aside a[href="/contacts"]').first());
    await page.waitForURL('**/contacts');
    await settle(page, 1200);
    await expect(page.getByText('Priya Nair').first()).toBeVisible();
    await say(page, 'Every enquiry and traveller in one searchable list', undefined, 'Contacts');
    await typeInto(page, page.getByPlaceholder(/search/i).first(), 'Nair');
    await settle(page, 1500);
    await scrollSteps(page, 2, 300);
    await clearSay(page);
    await assertClean(page, 'contacts');
    mark('end');
  } finally {
    await finishRecording(page, 'smoke', testInfo);
  }
});
