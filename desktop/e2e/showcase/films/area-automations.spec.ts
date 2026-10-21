/**
 * Film area-automations: one WhatsApp enquiry to a booked trip through the assistant's suggestions, then the controls
 * (studio/clips/area-automations.json). Same proven path as ../assistant.spec.ts, on the built-in rule reader: no AI request.
 * Two customer messages arrive through POST /test/inbound, the path a provider webhook takes.
 */
import type { Locator, Page } from '@playwright/test';

import { asUser, beat, clickOn, expect, focus, glance, hoverOn, inbound, pause, recordFilm, scrollSteps, settle } from './film-kit';

const test = asUser();
const CUSTOMER = { name: 'Meera Pillai', phone: '+919847061234' };
const ENQUIRY = 'Hi, this is Meera Pillai. We are a family of four (kids aged 6 and 9) planning a 5-night Kerala trip from 18 Dec. '
  + 'We would love Munnar, a houseboat night in Alleppey and some time in Kumarakom. Budget around ₹1.3 lakh. Could you share a plan?';
const CONFIRMATION = 'This looks perfect, please go ahead and book it. I have transferred 60000 as the advance by NEFT, UTR 362100487715.';

const suggestion = (scope: Page | Locator, action: string, status = 'pending'): Locator =>
  scope.locator(`[data-testid="assistant-suggestion"][data-action="${action}"][data-status="${status}"]`);
const toast = (page: Page, text: RegExp | string): Locator => page.locator('[data-sonner-toast]').filter({ hasText: text }).first();

test('film:area-automations', async ({ page, context }, testInfo) => {
  test.setTimeout(25 * 60_000);
  await recordFilm(page, context, 'area-automations', testInfo, async () => {
    await page.goto('/dashboard');
    await settle(page, 1600);
    let leadUrl = '';
    let itineraryUrl = '';
    const panel = page.getByTestId('assistant-panel');

    await beat(page, 'enquiry', async () => {
      await inbound({ from: CUSTOMER.phone, fromName: CUSTOMER.name, body: ENQUIRY });
      const waiting = page.getByTestId('attention-list').getByText(`Create contact and lead for ${CUSTOMER.name}`);
      await expect(waiting).toBeVisible({ timeout: 45_000 });
      await hoverOn(page, waiting, 500);
      await clickOn(page, waiting);
      await page.waitForURL('**/communication');
      await settle(page, 1000);
      const row = page.locator('table tbody tr').filter({ hasText: CUSTOMER.phone }).first();
      await expect(row.getByText('Suggestion')).toBeVisible({ timeout: 20_000 });
      await clickOn(page, row);
      const card = suggestion(page.getByRole('dialog'), 'create_lead_from_enquiry');
      await expect(card).toBeVisible({ timeout: 15_000 });
      await focus(page, 'suggestion', card, { dwellMs: 900 });
    });

    await beat(page, 'one-click', async () => {
      const drawer = page.getByRole('dialog');
      await clickOn(page, suggestion(drawer, 'create_lead_from_enquiry').getByRole('button', { name: 'Create lead' }));
      const created = suggestion(drawer, 'create_lead_from_enquiry', 'applied');
      await expect(created).toBeVisible({ timeout: 20_000 });
      await clickOn(page, created.getByRole('link', { name: /^Lead:/ }));
      await page.waitForURL(/\/leads\/[^/]+$/, { timeout: 20_000 });
      await settle(page, 1200);
      leadUrl = page.url();
      const fu = suggestion(panel, 'create_follow_up', 'auto_applied');
      await expect(fu).toBeVisible({ timeout: 20_000 });
      await focus(page, 'auto-followup', fu, { dwellMs: 700 });
    });

    await beat(page, 'template-reply', async () => {
      const template = suggestion(panel, 'create_itinerary_from_template');
      await expect(template).toBeVisible({ timeout: 15_000 });
      await clickOn(page, template.getByRole('button', { name: 'Create itinerary' }));
      const built = suggestion(panel, 'create_itinerary_from_template', 'applied');
      await expect(built).toBeVisible({ timeout: 25_000 });
      itineraryUrl = (await built.getByRole('link', { name: /^Itinerary:/ }).getAttribute('href')) ?? '';
      if (!itineraryUrl) throw new Error('the created itinerary has no link');
      const reply = suggestion(panel, 'draft_reply');
      await expect(reply).toBeVisible({ timeout: 15_000 });
      await clickOn(page, reply.getByRole('button', { name: 'Review and send' }));
      const send = page.getByRole('dialog').filter({ hasText: 'Compose WhatsApp' });
      await expect(send).toBeVisible({ timeout: 15_000 });
      await pause(page, 900);
      await clickOn(page, send.getByRole('button', { name: /^Preview$/ }));
      const preview = page.getByRole('dialog').filter({ hasText: 'Preview & Send' });
      await clickOn(page, preview.getByRole('button', { name: /Send WhatsApp/ }));
      await expect(toast(page, /sent via Communication Hub/)).toBeVisible({ timeout: 15_000 });
    });

    await beat(page, 'quote-out', async () => {
      await page.goto(itineraryUrl);
      await settle(page, 1200);
      await clickOn(page, page.getByRole('tab', { name: 'Share' }));
      await clickOn(page, page.getByRole('button', { name: /Generate Share Link/ }));
      await expect(toast(page, /Share link generated/)).toBeVisible({ timeout: 15_000 });
      await clickOn(page, page.getByRole('button', { name: /Send via WhatsApp/ }));
      const quote = page.getByRole('dialog').filter({ hasText: /Choose Template|Compose WhatsApp/ });
      await expect(quote).toBeVisible({ timeout: 15_000 });
      await clickOn(page, quote.getByText('Itinerary Link WhatsApp', { exact: true }).first());
      await clickOn(page, page.getByRole('dialog').getByRole('button', { name: /^Preview$/ }));
      await clickOn(page, page.getByRole('dialog').getByRole('button', { name: /Send WhatsApp/ }));
      await expect(toast(page, /sent via Communication Hub/)).toBeVisible({ timeout: 15_000 });
      await page.goto(leadUrl);
      await settle(page, 1300);
      const ps = page.getByText('Proposal Sent').first();
      await expect(ps).toBeVisible({ timeout: 20_000 });
      await focus(page, 'proposal-sent', ps, { dwellMs: 500 });
    });

    await beat(page, 'says-yes', async () => {
      await inbound({ from: CUSTOMER.phone, fromName: CUSTOMER.name, body: CONFIRMATION });
      const won = suggestion(panel, 'mark_lead_won');
      await expect(won).toBeVisible({ timeout: 45_000 });
      await clickOn(page, won.getByRole('button', { name: 'Mark as won' }));
      await expect(page.getByText('Won', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
      const invoice = suggestion(panel, 'create_invoice_from_itinerary');
      await expect(invoice).toBeVisible({ timeout: 25_000 });
      await clickOn(page, invoice.getByRole('button', { name: 'Create invoice' }));
      const payment = suggestion(panel, 'record_payment');
      await expect(payment).toBeVisible({ timeout: 25_000 });
      await hoverOn(page, payment, 600);
      await clickOn(page, payment.getByRole('button', { name: 'Record payment' }));
      const vouchers = suggestion(panel, 'create_vouchers');
      await expect(vouchers).toBeVisible({ timeout: 25_000 });
      await clickOn(page, vouchers.getByRole('button', { name: 'Create vouchers' }));
      await expect(suggestion(panel, 'create_vouchers', 'applied')).toBeVisible({ timeout: 30_000 });
      await glance(page, panel.locator('[data-testid="assistant-suggestion"][data-status="pending"]').first(), 800);
    });

    await beat(page, 'activity', async () => {
      await page.goto('/assistant');
      await settle(page, 1100);
      await clickOn(page, page.getByRole('tab', { name: 'Activity' }));
      await expect(page.getByTestId('assistant-activity')).toBeVisible({ timeout: 15_000 });
      await scrollSteps(page, 2, 360);
      await glance(page, page.getByRole('button', { name: /Undo/ }), 800);
      await page.mouse.wheel(0, -2000);
      await pause(page, 300);
    });

    await beat(page, 'modes', async () => {
      await clickOn(page, page.getByRole('tab', { name: 'Automations' }));
      const first = page.locator('[data-recipe="inbox.read_messages"]');
      await expect(first).toBeVisible({ timeout: 15_000 });
      await focus(page, 'modes', first, { dwellMs: 700 });
      await scrollSteps(page, 3, 420);
      await page.mouse.wheel(0, -3000);
      await pause(page, 400);
      await glance(page, page.getByRole('switch', { name: /Pause/i }).or(page.getByText(/Pause all/i)).first(), 900);
    });

    await beat(page, 'daily-checks', async () => {
      await clickOn(page, page.getByRole('button', { name: /Run daily checks now/ }));
      await expect(toast(page, /Daily checks ran/)).toBeVisible({ timeout: 30_000 });
      await clickOn(page, page.getByRole('tab', { name: 'Suggestions' }));
      await expect(page.getByTestId('assistant-queue')).toBeVisible({ timeout: 15_000 });
      await scrollSteps(page, 2, 320);
      await page.mouse.wheel(0, -2000);
      await pause(page, 300);
    });

    await beat(page, 'custom-rules', async () => {
      await clickOn(page, page.getByRole('tab', { name: 'Automations' }));
      await settle(page, 600);
      const add = page.getByRole('button', { name: /New rule|Add rule|Create rule|Your own rule/i }).first();
      await add.scrollIntoViewIfNeeded().catch(() => undefined);
      await glance(page, add, 900);
      if (await add.isVisible().catch(() => false)) { await clickOn(page, add); await pause(page, 1500); await page.keyboard.press('Escape'); }
    });

    await beat(page, 'usage', async () => {
      await clickOn(page, page.getByRole('tab', { name: 'Usage' }));
      await settle(page, 900);
      await page.goto('/settings/ai');
      await settle(page, 1200);
      await page.goto('/settings/ai-usage');
      await settle(page, 1200);
    });
  });
});
