/**
 * Showcase part "assistant": the embedded assistant and automations, from a WhatsApp enquiry to a booked trip.
 *
 * Everything on screen is the real app reacting to two simulated incoming WhatsApp messages (POST /test/inbound, the same
 * path a provider webhook takes). No record is staged: the contact, lead, itinerary, invoice, payment and vouchers are all
 * created live by clicking the assistant's suggestions.
 *
 * AI: with SHOWCASE_AI=1 on a stack started with `fix-stack.mjs up --ai`, each incoming message is read by the model
 * (2 requests per message: label, then understand), so a take spends 4 AI requests. Without it the same flow runs on the
 * built-in rules, which is how the script is developed and dry-run without spending anything. Nothing is retried.
 */
import type { Locator, Page } from '@playwright/test';

import { TENANT_ID } from './demo-data';
import { expect, test } from './showcase-fixtures';
import { pause } from './showcase-helpers';
import { assertClean, chapter, clickOn, dwell, hoverOn, recordPart, say, scrollSteps, settle, sidebar } from './walkthrough-kit';

const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:8787/api/v1').replace(/\/+$/, '');
const AI = process.env.SHOWCASE_AI === '1';

const CUSTOMER = { name: 'Meera Pillai', phone: '+919847061234' };
const ENQUIRY =
  'Hi, this is Meera Pillai. We are a family of four (kids aged 6 and 9) planning a 5-night Kerala trip from 18 Dec. ' +
  'We would love Munnar, a houseboat night in Alleppey and some time in Kumarakom. Budget around ₹1.3 lakh. Could you share a plan?';
const CONFIRMATION =
  'This looks perfect, please go ahead and book it. I have transferred 60000 as the advance by NEFT, UTR 362100487715.';

/** A WhatsApp message arriving at the agency's number: stored and read exactly as a provider webhook delivery is. */
async function incoming(body: string): Promise<void> {
  const res = await fetch(`${API_URL}/test/inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: TENANT_ID, channel: 'whatsapp', from: CUSTOMER.phone, fromName: CUSTOMER.name, to: '+918047182290', body }),
  });
  if (!res.ok) throw new Error(`simulated message failed: ${res.status} ${await res.text()}`);
}

const suggestion = (scope: Page | Locator, action: string, status = 'pending'): Locator =>
  scope.locator(`[data-testid="assistant-suggestion"][data-action="${action}"][data-status="${status}"]`);

const toast = (page: Page, text: RegExp | string): Locator => page.locator('[data-sonner-toast]').filter({ hasText: text }).first();

test('assistant: automations and AI assistance, enquiry to booking', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  await recordPart(page, context, 'assistant', testInfo, async () => {
    await page.goto('/dashboard');
    await settle(page, 1800);

    // ── 1 An enquiry arrives ──
    // The message is sent as the chapter card comes up, so the screen is never left waiting on the model.
    const enquiry = incoming(ENQUIRY);
    await chapter(page, 1, 'An enquiry arrives', 'The assistant reads every incoming message');
    await enquiry;
    const waiting = page.getByTestId('attention-list').getByText(`Create contact and lead for ${CUSTOMER.name}`);
    await expect(waiting).toBeVisible({ timeout: 45_000 });
    await hoverOn(page, waiting, 700);
    await say(page, 'A WhatsApp enquiry just arrived. The assistant has already read it.', 3600);
    await clickOn(page, waiting);
    await page.waitForURL('**/communication');
    await settle(page, 1300);

    const row = page.locator('table tbody tr').filter({ hasText: CUSTOMER.phone }).first();
    await expect(row.getByText('Suggestion')).toBeVisible({ timeout: 20_000 });
    await hoverOn(page, row, 600);
    await say(page, 'Every channel lands in one inbox, with a suggestion where one is waiting', 3400);
    await clickOn(page, row);
    const drawer = page.getByRole('dialog');
    const newLead = suggestion(drawer, 'create_lead_from_enquiry');
    await expect(newLead).toBeVisible({ timeout: 15_000 });
    await expect(newLead.getByText('Kerala', { exact: false }).first()).toBeVisible();
    await hoverOn(page, newLead, 900);
    await say(page, 'Destinations, dates, travellers and budget, read straight from the message', 4200);
    await assertClean(page, 'enquiry');

    // ── 2 One click ──
    await chapter(page, 2, 'One click', 'Contact, lead and the message, linked');
    await clickOn(page, newLead.getByRole('button', { name: 'Create lead' }));
    const created = suggestion(drawer, 'create_lead_from_enquiry', 'applied');
    await expect(created).toBeVisible({ timeout: 20_000 });
    await say(page, 'One click: the contact and the lead are created, nothing typed', 3400);
    const leadLink = created.getByRole('link', { name: /^Lead:/ });
    await clickOn(page, leadLink);
    await page.waitForURL(/\/leads\/[^/]+$/, { timeout: 20_000 });
    await settle(page, 1500);
    const leadUrl = page.url();

    const panel = page.getByTestId('assistant-panel');
    await expect(suggestion(panel, 'create_follow_up', 'auto_applied')).toBeVisible({ timeout: 20_000 });
    await hoverOn(page, suggestion(panel, 'create_follow_up', 'auto_applied'), 800);
    await say(page, 'The first follow-up was scheduled automatically', 3000);
    await assertClean(page, 'lead created');

    // ── 3 Itinerary and reply ──
    await chapter(page, 3, 'Itinerary and reply', 'The next steps are already prepared');
    const template = suggestion(panel, 'create_itinerary_from_template');
    await expect(template).toBeVisible({ timeout: 15_000 });
    await hoverOn(page, template, 900);
    await say(page, 'The closest itinerary template is already picked for this trip', 3400);
    await clickOn(page, template.getByRole('button', { name: 'Create itinerary' }));
    const builtItinerary = suggestion(panel, 'create_itinerary_from_template', 'applied');
    await expect(builtItinerary).toBeVisible({ timeout: 25_000 });
    // Remembered now: later cards may push this one out of the panel's short "recently done" list.
    const itineraryUrl = await builtItinerary.getByRole('link', { name: /^Itinerary:/ }).getAttribute('href');
    if (!itineraryUrl) throw new Error('the created itinerary has no link');
    await say(page, 'A priced, day-by-day itinerary in one click', 2800);

    const reply = suggestion(panel, 'draft_reply');
    await expect(reply).toBeVisible({ timeout: 15_000 });
    await hoverOn(page, reply, 700);
    await clickOn(page, reply.getByRole('button', { name: 'Review and send' }));
    const send = page.getByRole('dialog').filter({ hasText: 'Compose WhatsApp' });
    await expect(send).toBeVisible({ timeout: 15_000 });
    await say(page, 'A drafted reply. You read it, change it if you like, then send', 3600);
    await clickOn(page, send.getByRole('button', { name: /^Preview$/ }));
    const preview = page.getByRole('dialog').filter({ hasText: 'Preview & Send' });
    await expect(preview).toBeVisible();
    await dwell(page, 1200);
    await clickOn(page, preview.getByRole('button', { name: /Send WhatsApp/ }));
    await expect(toast(page, /sent via Communication Hub/)).toBeVisible({ timeout: 15_000 });
    await dwell(page, 1500);
    await assertClean(page, 'itinerary and reply');

    // ── 4 The quote goes out ──
    await chapter(page, 4, 'The quote goes out', 'And the pipeline moves itself');
    await page.goto(itineraryUrl);
    await page.waitForURL(/\/itineraries\/[^/]+$/, { timeout: 20_000 });
    await settle(page, 1500);
    await clickOn(page, page.getByRole('tab', { name: 'Share' }));
    await settle(page, 600);
    await clickOn(page, page.getByRole('button', { name: /Generate Share Link/ }));
    await expect(toast(page, /Share link generated/)).toBeVisible({ timeout: 15_000 });
    await dwell(page, 900);
    await clickOn(page, page.getByRole('button', { name: /Send via WhatsApp/ }));
    const quote = page.getByRole('dialog').filter({ hasText: /Choose Template|Compose WhatsApp/ });
    await expect(quote).toBeVisible({ timeout: 15_000 });
    await clickOn(page, quote.getByText('Itinerary Link WhatsApp', { exact: true }).first());
    await expect(page.getByRole('dialog').filter({ hasText: 'Compose WhatsApp' })).toBeVisible();
    await say(page, 'The quote goes out through the Communication Hub', 2800);
    await clickOn(page, page.getByRole('dialog').getByRole('button', { name: /^Preview$/ }));
    await clickOn(page, page.getByRole('dialog').getByRole('button', { name: /Send WhatsApp/ }));
    await expect(toast(page, /sent via Communication Hub/)).toBeVisible({ timeout: 15_000 });
    await dwell(page, 1200);

    await page.goto(leadUrl);
    await settle(page, 1600);
    await expect(page.getByText('Proposal Sent').first()).toBeVisible({ timeout: 20_000 });
    await hoverOn(page, page.getByText('Proposal Sent').first(), 700);
    await say(page, 'Sent: the lead moved to Proposal Sent by itself, with a follow-up in two days', 4200);
    await assertClean(page, 'quote sent');

    // ── 5 The customer says yes ──
    const confirmation = incoming(CONFIRMATION);
    await chapter(page, 5, 'The customer says yes', 'From a reply to a booked trip');
    await confirmation;
    const won = suggestion(panel, 'mark_lead_won');
    await expect(won).toBeVisible({ timeout: 45_000 });
    await hoverOn(page, won, 900);
    await say(page, 'Meera replies: go ahead, advance paid. The assistant understood both', 3800);
    await clickOn(page, won.getByRole('button', { name: 'Mark as won' }));
    await expect(page.getByText('Won', { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    const invoice = suggestion(panel, 'create_invoice_from_itinerary');
    await expect(invoice).toBeVisible({ timeout: 25_000 });
    await hoverOn(page, panel.locator('[data-testid="assistant-suggestion"][data-status="auto_applied"]').first(), 700);
    await say(page, 'Won: the booking checklist was created automatically', 3000);
    await clickOn(page, invoice.getByRole('button', { name: 'Create invoice' }));

    const payment = suggestion(panel, 'record_payment');
    await expect(payment).toBeVisible({ timeout: 25_000 });
    await hoverOn(page, payment, 900);
    await say(page, 'Invoice drafted. The payment she mentioned is matched, bank reference included', 4200);
    await clickOn(page, payment.getByRole('button', { name: 'Record payment' }));

    const vouchers = suggestion(panel, 'create_vouchers');
    await expect(vouchers).toBeVisible({ timeout: 25_000 });
    await hoverOn(page, vouchers, 900);
    await say(page, 'Advance in: hotel vouchers are drafted for every stay, dates worked out', 4000);
    await clickOn(page, vouchers.getByRole('button', { name: 'Create vouchers' }));
    await expect(suggestion(panel, 'create_vouchers', 'applied')).toBeVisible({ timeout: 30_000 });
    await dwell(page, 1500);
    await assertClean(page, 'booked');

    // ── 6 You stay in control ──
    await chapter(page, 6, 'You stay in control', 'Every step recorded, every automation yours to set');
    await clickOn(page, sidebar(page, '/assistant'));
    await page.waitForURL('**/assistant');
    await settle(page, 1400);
    await clickOn(page, page.getByRole('tab', { name: 'Activity' }));
    await expect(page.getByTestId('assistant-activity')).toBeVisible({ timeout: 15_000 });
    await say(page, 'Everything the assistant suggested or did is on record', 3000);
    await scrollSteps(page, 2, 380);
    await page.mouse.wheel(0, -2000);
    await pause(page, 500);

    await clickOn(page, page.getByRole('tab', { name: 'Automations' }));
    const firstRecipe = page.locator('[data-recipe="inbox.read_messages"]');
    await expect(firstRecipe).toBeVisible({ timeout: 15_000 });
    await say(page, 'Each automation: off, suggest, or automatic. Money and messages always ask first', 4400);
    await scrollSteps(page, 3, 420);
    await page.mouse.wheel(0, -3000);
    await pause(page, 600);
    await clickOn(page, page.getByRole('button', { name: /Run daily checks now/ }));
    await expect(toast(page, /Daily checks ran/)).toBeVisible({ timeout: 30_000 });

    await clickOn(page, page.getByRole('tab', { name: 'Suggestions' }));
    await expect(page.getByTestId('assistant-queue')).toBeVisible({ timeout: 15_000 });
    await say(page, 'Daily checks draft reminders for overdue invoices and quiet quotes', 3600);
    await scrollSteps(page, 1, 320);
    await page.mouse.wheel(0, -2000);
    await pause(page, 500);

    await clickOn(page, page.getByRole('tab', { name: 'Usage' }));
    await settle(page, 900);
    await say(page, AI ? 'AI use is metered in credits. Rule-based automations are always free' : 'Rule-based automations are free; AI reading is metered in credits', 3800);
    await assertClean(page, 'control');
  });
});
