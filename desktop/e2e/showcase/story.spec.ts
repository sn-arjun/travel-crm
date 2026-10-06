/**
 * STORY cut, desktop parts (STORYBOARD section B). Two tests, each records its own video:
 *   story-A  scenes 1-6  (enquiry -> lead -> itinerary -> quote -> invoice/payment/voucher -> airport transfer for Ravi)
 *   story-B  scenes 8-9  (back at the office after the driver clip: the trip timeline, fleet dashboard, dashboard + reports)
 * Scene 7 (the driver on the Android emulator) is recorded by scripts/record-driver.ps1 between the two.
 *
 *   node scripts/record-demo.mjs --slot 2 --only storyA       (or: npx playwright test --config=playwright.showcase.config.ts --grep story-A)
 *
 * Every interaction is hand-written with the values from demo-data.ts. A failure aborts the take (no on-camera failure captions);
 * the orchestrator re-seeds and retakes. SHOWCASE_PACE=0.15 gives a fast dry run.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect, test } from './showcase-fixtures';
import * as D from './demo-data';
import {
  assertClean, attachListeners, card, clearSay, clickOn, dwell, fieldByLabel, finishRecording, hideOverlays, hoverOn, installOverlays, mark,
  moveTo, pause, pickDate, pickRelation, pickSelect, say, scrollSteps, settle, showOverlays, startRecording, typeInto, WORK_DIR,
} from './showcase-helpers';

const HANDOFF = path.resolve(__dirname, '..', '..', 'showcase', '.handoff.json');
const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:8787/api/v1').replace(/\/+$/, '');

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const dm = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortRange = (a: string, b: string) => dm(a) + '–' + dm(b);
const quoteBody = (link: string) => ['Hi Priya,', '', 'Thank you for choosing Sahyadri Holidays. Your 5-night Kerala plan is ready:', '• Munnar — 2 nights in a tea-estate family suite', '• Thekkady — plantation villa and Periyar boat cruise', '• Alleppey — private premium houseboat, all meals', '• Kumarakom — lake-view villa', '• Private Innova Crysta with chauffeur throughout', '', 'Package price: ₹1,23,270 for 2 adults and 2 children, including GST.', 'Day-by-day plan: ' + link, '', 'Warm regards,', 'Ananya Menon', 'Sahyadri Holidays'].join('\n');
const sidebar = (page: import('@playwright/test').Page, href: string) => page.locator(`aside a[href="${href}"]`).first();

interface Handoff { tripId: string; driverPhone: string; driverPhoneE164: string; otp: string; tenantId: string; tPick: string; pickup: string; drop: string; passenger: string; priyaLeadId?: string; priyaInvoiceId?: string; itineraryId?: string; recordedAt: string }

test.describe.configure({ mode: 'serial' });

test('story-A: enquiry to airport transfer (scenes 1-6)', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  await installOverlays(context);
  startRecording();
  attachListeners(page);
  const travelStart = D.day(D.TRAVEL_START_OFFSET);
  const travelEnd = D.day(D.TRAVEL_START_OFFSET + 5);
  const handoff: Partial<Handoff> = {};
  let finished = false;
  try {
    await page.goto('/dashboard');
    await settle(page, 1200);

    // ───────────── Scene 1 — A new enquiry arrives ─────────────
    await card(page, { kicker: 'Scene 1 of 9', title: 'A new enquiry arrives', subtitle: 'WhatsApp, email and web enquiries in one inbox' });
    await expect(page.getByText('Ananya Menon').first()).toBeVisible();
    const bell = page.getByRole('button', { name: 'Notifications' });
    await dwell(page, 1200);
    await clickOn(page, bell);
    await expect(page.getByText('New WhatsApp enquiry')).toBeVisible();
    await expect(page.getByText('Priya Nair: family of 4, Kerala, 5 nights')).toBeVisible();
    mark('1.1');
    await say(page, 'A new WhatsApp enquiry, the moment it arrives');
    await page.keyboard.press('Escape');
    await pause(page, 500);
    await clickOn(page, sidebar(page, '/communication'));
    await page.waitForURL('**/communication');
    await settle(page, 1200);
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toContainText('Priya Nair');
    await expect(firstRow).toContainText("Hi! We're a family of four");
    await hoverOn(page, firstRow, 600);
    mark('1.3');
    await say(page, 'Every client conversation, every channel, one shared inbox', 4500);
    await clickOn(page, firstRow);
    await expect(page.getByRole('dialog').getByText(/Munnar/)).toBeVisible();
    mark('1.4');
    await say(page, 'Full context before anyone replies');
    await assertClean(page, 'scene 1 sheet');
    await clickOn(page, page.getByRole('dialog').getByRole('link', { name: /Open full conversation/i }).or(page.getByRole('dialog').getByRole('button', { name: /Open full conversation/i })).first());
    await page.waitForURL(/\/communication\/[^/]+$/);
    await settle(page, 1200);
    await expect(page.getByText('priya.nair@example.com').first()).toBeVisible();
    mark('1.5');
    await say(page, 'Next: turn this message into a qualified lead', 3500);
    await scrollSteps(page, 1, 250);
    await assertClean(page, 'scene 1');

    // ───────────── Scene 2 — Capture and qualify the lead ─────────────
    await card(page, { kicker: 'Scene 2 of 9', title: 'Capture and qualify the lead', subtitle: 'A structured lead in under a minute' });
    await clickOn(page, sidebar(page, '/leads'));
    await page.waitForURL('**/leads');
    await settle(page, 1200);
    await expect(page.getByText('Maldives Overwater Villa Honeymoon').first()).toBeVisible();
    mark('2.1');
    await say(page, 'Your whole pipeline, searchable and filterable', 3500);
    await clickOn(page, page.getByRole('button', { name: /New lead/i }).or(page.getByRole('link', { name: /New lead/i })).first());
    await page.waitForURL('**/leads/new');
    await settle(page, 800);
    await pickRelation(page, /Select a contact/, /Search contacts/i, 'Priya', 'Priya Nair');
    await expect(page.getByRole('combobox').filter({ hasText: 'Priya Nair' }).first()).toBeVisible();
    mark('2.3');
    await say(page, "Linked to Priya's record — nothing typed twice", 3000);
    await typeInto(page, page.locator('#title'), D.PRIYA.title);
    const dest = page.getByPlaceholder(/Type & press Enter|Add more/i).first();
    for (const d of D.PRIYA.destinations) {
      await typeInto(page, dest, d, { clear: false });
      await page.keyboard.press('Enter');
      await pause(page, 250);
    }
    await pickSelect(page, page.locator('#tripType'), 'Family');
    await pickDate(page, page.locator('button:has-text("Pick travel date")'), travelStart);
    await pickDate(page, page.locator('button:has-text("Pick return date")'), travelEnd);
    mark('2.5');
    await say(page, 'Dates, travellers and budget captured up front', 3000);
    await typeInto(page, page.locator('#paxAdults'), String(D.PRIYA.adults));
    await typeInto(page, page.locator('#paxChildren'), String(D.PRIYA.children));
    await typeInto(page, page.locator('input[inputmode="decimal"]').first(), String(D.PRIYA.budget));
    await pickSelect(page, page.locator('#priority'), 'Hot');
    await pickSelect(page, page.locator('#source'), 'Website');
    await pickRelation(page, /Select agent/, /Search team/i, 'Ananya', 'Ananya Menon');
    await typeInto(page, page.locator('#specialRequirements'), D.PRIYA.specialRequirements, { delay: 25 });
    await assertClean(page, 'scene 2 form');
    await clickOn(page, page.getByRole('button', { name: /Save Lead/i }).first());
    await expect(page.getByText('Lead created successfully').first()).toBeVisible({ timeout: 15_000 });
    mark('2.9');
    await say(page, 'Saved and assigned in one click', 2800);
    await page.waitForURL('**/leads');
    await settle(page, 1000);
    await typeInto(page, page.getByPlaceholder(/Search leads/i).first(), 'Priya');
    await settle(page, 1200);
    await clickOn(page, page.locator('table tbody tr').filter({ hasText: D.PRIYA.title }).first());
    await page.waitForURL(/\/leads\/[^/]+$/);
    await settle(page, 1000);
    handoff.priyaLeadId = page.url().split('/leads/')[1]!.split(/[?#]/)[0];
    await expect(page.getByRole('heading', { name: D.PRIYA.title })).toBeVisible();
    await changeStatus(page, 'Qualified');
    mark('2.11');
    await say(page, 'Qualify it and move it down the pipeline', 3000);
    await clickOn(page, page.getByRole('button', { name: /Add note/i }).first());
    await typeInto(page, page.getByPlaceholder(/Write your note/i), 'Called Priya — dates and budget confirmed. Prefers a private car with an English-speaking chauffeur.', { delay: 22 });
    await clickOn(page, page.getByRole('button', { name: /^Add Note$/ }));
    await expect(page.getByText('Note added').first()).toBeVisible();
    mark('2.12');
    await say(page, "Notes and calls stay on the lead's timeline", 3200);
    // APP: the Activity tab does not pick up the status change made on this same page until the lead is reloaded (reported)
    await page.reload();
    await settle(page, 1200);
    await clickOn(page, page.getByRole('tab', { name: /Activity/i }).or(page.getByRole('button', { name: /^Activity$/ })).first());
    await expect(page.getByText(/Qualified/i).first()).toBeVisible();
    await dwell(page, 2000);
    await assertClean(page, 'scene 2');

    // ───────────── Scene 3 — Build the itinerary from a template ─────────────
    await card(page, { kicker: 'Scene 3 of 9', title: 'Build the itinerary', subtitle: 'From a proven template, priced from supplier rate cards' });
    await clickOn(page, sidebar(page, '/rate-cards'));
    await page.waitForURL('**/rate-cards');
    await settle(page, 1200);
    await typeInto(page, page.getByPlaceholder(/Search/i).first(), 'Vembanad');
    await settle(page, 1400);
    const peakRow = page.locator('table tbody tr').filter({ hasText: 'Vembanad Lake Resort — Lake View Villa (MAP)' }).filter({ hasText: '17,500' }).first();
    await expect(peakRow).toBeVisible();
    await hoverOn(page, peakRow, 600);
    mark('3.1');
    await say(page, 'Negotiated supplier rates, season by season', 4200);
    await clickOn(page, sidebar(page, '/itineraries/templates'));
    await page.waitForURL('**/itineraries/templates');
    await settle(page, 1200);
    expect(await page.locator('table tbody tr').count()).toBeGreaterThanOrEqual(10);
    mark('3.2');
    await say(page, 'Ten ready-made packages your team reuses daily', 3500);
    await typeInto(page, page.getByPlaceholder(/Search templates/i), 'Kerala');
    await settle(page, 1200);
    const tplRow = page.locator('table tbody tr').filter({ hasText: 'Kerala Backwaters & Hills' }).first();
    await clickOn(page, tplRow.locator('button[aria-label="Preview"]'));
    const prev = page.getByRole('dialog');
    await expect(prev.getByText('Kerala', { exact: false }).first()).toBeVisible();
    await expect(prev.getByText('6 days')).toBeVisible();
    await dwell(page, 2500);
    await clickOn(page, prev.getByRole('button', { name: 'Close', exact: true }).first());
    await clickOn(page, tplRow.locator('button[aria-label="Use template"]'));
    const useDlg = page.getByRole('dialog');
    await expect(useDlg.getByText('Create Itinerary from Template')).toBeVisible();
    await typeInto(page, useDlg.locator('#newTitle'), 'Nair Family — Kerala Backwaters & Hills');
    await pickRelation(page, useDlg.getByRole('combobox').first(), /Search leads/i, 'Kerala Backwaters Family', /Kerala Backwaters Family Holiday/);
    mark('3.4');
    await say(page, 'A complete six-day quote in one click', 3000);
    await clickOn(page, useDlg.getByRole('button', { name: /Create itinerary/i }));
    await page.waitForURL(/\/itineraries\/[^/]+$/, { timeout: 20_000 });
    await settle(page, 1500);
    handoff.itineraryId = page.url().split('/itineraries/')[1]!.split(/[?#]/)[0];
    await expect(page.getByText('Misty Hills Tea Resort').first()).toBeVisible();
    await expect(page.getByText(/houseboat/i).first()).toBeVisible();
    mark('3.5');
    await say(page, 'Hotels, transfers and experiences, day by day', 2500);
    await scrollSteps(page, 4, 450);
    await page.mouse.wheel(0, -4000);
    await pause(page, 800);
    await clickOn(page, page.getByRole('tab', { name: 'Costs' }));
    await expect(page.getByText('Total Cost:')).toBeVisible();
    await expect(page.getByText(rupees(D.T_KER_TOTALS.cost)).first()).toBeVisible();
    await expect(page.getByText(rupees(D.T_KER_TOTALS.selling)).first()).toBeVisible();
    await expect(page.getByText(rupees(D.T_KER_TOTALS.grand)).first()).toBeVisible();
    await hoverOn(page, page.getByText(/^Margin/).first(), 600);
    mark('3.6');
    await say(page, 'Cost, price and margin — visible only to your team', 4500);
    await clickOn(page, page.getByRole('tab', { name: 'Share' }));
    await clickOn(page, page.getByRole('button', { name: /Generate Share Link/i }));
    await expect(page.getByText(/Share link generated/i).first()).toBeVisible();
    await settle(page, 800);
    const shareLink = await page.evaluate(() => (Array.from(document.querySelectorAll('input')).find((i) => /^https?:\/\//.test(i.value)) as HTMLInputElement | undefined)?.value ?? '');
    expect(shareLink).toMatch(/^https?:/);
    mark('3.8');
    await say(page, 'A branded, view-only link for the client', 3500);
    await assertClean(page, 'scene 3');

    // ───────────── Scene 4 — Send it through the Communication Hub ─────────────
    await card(page, { kicker: 'Scene 4 of 9', title: 'Send the quote', subtitle: 'Through the Communication Hub, logged automatically' });
    await clickOn(page, page.getByRole('button', { name: /Send via Email/i }).last());
    const sendDlg = page.getByRole('dialog');
    await expect(sendDlg.getByText('Choose Template')).toBeVisible();
    await expect(sendDlg.getByText(/priya\.nair@example\.com/)).toBeVisible();
    mark('4.1');
    await say(page, 'Email, WhatsApp or SMS — always from one place', 3200);
    // The built-in quotation template fills destination/date from the itinerary (Kumarakom, 22 Dec) and leaves the agency name unresolved,
    // so the quote is written in the agent's own words (STORYBOARD 4.3 fallback) - accurate for this client.
    await clickOn(page, sendDlg.getByText('Write custom message'));
    await expect(sendDlg.getByText(/Compose Email/i)).toBeVisible();
    await typeInto(page, sendDlg.locator('#msg-subject'), 'Your Kerala holiday plan — ' + shortRange(travelStart, travelEnd));
    await moveTo(page, sendDlg.locator('#msg-body'));
    await sendDlg.locator('#msg-body').fill(quoteBody(shareLink));
    await pause(page, 600);
    await expect(sendDlg.getByTestId('placeholder-warning')).toHaveCount(0);
    mark('4.3');
    await say(page, 'Personalised in seconds, in your own words', 3200);
    await clickOn(page, sendDlg.getByRole('button', { name: /^Preview$/ }));
    await expect(sendDlg.getByText('Preview & Send')).toBeVisible();
    mark('4.4');
    await say(page, 'Preview exactly what Priya receives', 3500);
    await clickOn(page, sendDlg.getByRole('button', { name: /Send Email/i }));
    await expect(page.getByText('Email sent via Communication Hub').first()).toBeVisible();
    mark('4.5');
    await say(page, "Sent — and logged against Priya's record", 3000);
    await clickOn(page, sidebar(page, '/leads'));
    await page.waitForURL('**/leads');
    await settle(page, 1000);
    await typeInto(page, page.getByPlaceholder(/Search leads/i).first(), 'Priya');
    await settle(page, 1200);
    await clickOn(page, page.locator('table tbody tr').filter({ hasText: D.PRIYA.title }).first());
    await page.waitForURL(/\/leads\/[^/]+$/);
    await settle(page, 1000);
    await changeStatus(page, 'Proposal Sent');
    await expect(page.getByText('Proposal Sent').first()).toBeVisible();
    mark('4.6');
    await say(page, 'Pipeline updated: proposal sent', 3000);
    await assertClean(page, 'scene 4');

    // ───────────── Scene 5 — Invoice, payment, voucher ─────────────
    await card(page, { kicker: 'Scene 5 of 9', title: 'Priya says yes', subtitle: 'Invoice, advance payment and hotel voucher' });
    await changeStatus(page, 'Won');
    mark('5.1');
    await say(page, 'Booked! Mark the lead won', 2600);
    await clickOn(page, sidebar(page, '/invoices'));
    await page.waitForURL('**/invoices');
    await settle(page, 1000);
    await clickOn(page, page.getByRole('button', { name: /New invoice/i }).or(page.getByRole('link', { name: /New invoice/i })).first());
    await page.waitForURL('**/invoices/new');
    await settle(page, 800);
    await pickRelation(page, page.locator('button[role="combobox"]').filter({ hasText: 'Search contacts...' }).first(), 'Type to search contacts...', 'Priya', 'Priya Nair');
    await pickRelation(page, page.locator('button[role="combobox"]').filter({ hasText: 'Search leads...' }).first(), 'Type to search leads...', 'Kerala Backwaters', D.PRIYA.title);
    mark('5.3');
    await say(page, 'GST-ready invoices linked to the booking', 3000);
    await typeInto(page, page.getByPlaceholder(/Flight tickets|e\.g\./i).first(), `Kerala Backwaters & Hills — 5N/6D land package (${shortRange(travelStart, travelEnd)})`);
    await typeInto(page, page.locator('input[placeholder="0"]').first(), '94600');
    await clickOn(page, page.getByRole('button', { name: /Add Item/i }));
    await typeInto(page, page.getByPlaceholder(/Flight tickets|e\.g\./i).nth(1), 'Private Innova Crysta with chauffeur — 6 days incl. airport transfers');
    await typeInto(page, page.locator('input[placeholder="0"]').nth(1), '22800');
    await pickSelect(page, page.locator('[role="combobox"]').filter({ hasText: '18%' }).first(), '5%');
    await dwell(page, 600);
    await expect(page.getByText(rupees(D.T_KER_TOTALS.grand)).first()).toBeVisible();
    mark('5.4');
    await say(page, 'Taxes and totals calculate as you type', 3500);
    await assertClean(page, 'scene 5 invoice form');
    await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
    await expect(page.getByText('Invoice created successfully').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForURL('**/invoices');
    await settle(page, 1000);
    await typeInto(page, page.getByPlaceholder(/Search invoices/i), 'Priya');
    await settle(page, 1200);
    await clickOn(page, page.locator('table tbody tr').filter({ hasText: 'Priya Nair' }).first());
    await page.waitForURL(/\/invoices\/[^/]+$/);
    await settle(page, 1200);
    handoff.priyaInvoiceId = page.url().split('/invoices/')[1]!.split(/[?#]/)[0];
    await clickOn(page, page.getByRole('button', { name: 'More actions' }));
    await clickOn(page, page.getByRole('menuitem', { name: 'Record payment' }));
    await expect(page.getByText('Record Payment').first()).toBeVisible();
    await typeInto(page, page.locator('#invoice-pay-amount'), '60000');
    await pickSelect(page, page.getByRole('dialog').getByRole('combobox').first(), 'Bank Transfer');
    await typeInto(page, page.getByPlaceholder(/utr/i), 'UTR 362100487715');
    mark('5.7');
    await say(page, 'Record the advance — balances update instantly', 3200);
    await clickOn(page, page.getByRole('dialog').getByRole('button', { name: /Record Payment/i }));
    await expect(page.getByText('Payment recorded').first()).toBeVisible();
    await settle(page, 1200);
    await expect(page.getByText(/partially paid/i).first()).toBeVisible();
    await dwell(page, 1800);
    await assertClean(page, 'scene 5 payment');
    await clickOn(page, sidebar(page, '/vouchers'));
    await page.waitForURL('**/vouchers');
    await settle(page, 1000);
    await clickOn(page, page.getByRole('button', { name: /New voucher/i }).or(page.getByRole('link', { name: /New voucher/i })).first());
    await page.waitForURL('**/vouchers/new');
    await settle(page, 800);
    await pickRelation(page, page.getByRole('combobox').filter({ hasText: 'Select lead' }).first(), /Search leads/i, 'Kerala Backwaters', D.PRIYA.title);
    await pickRelation(page, page.getByRole('combobox').filter({ hasText: /Select supplier/ }).first(), /Search/i, 'Vembanad', 'Vembanad Lake Resort');
    await typeInto(page, page.locator('#hotelName'), 'Vembanad Lake Resort, Kumarakom');
    await typeInto(page, page.locator('#hotelAddress'), 'Kumarakom North, Kottayam, Kerala 686563');
    await pickDate(page, page.locator('xpath=//label[@for="checkIn"]/following::button[1]'), D.day(D.TRAVEL_START_OFFSET + 4));
    await pickDate(page, page.locator('xpath=//label[@for="checkOut"]/following::button[1]'), D.day(D.TRAVEL_START_OFFSET + 5));
    await pickSelect(page, page.locator('#roomType'), 'Villa');
    await pickSelect(page, page.locator('#mealPlan'), /MAP/);
    await typeInto(page, page.locator('#confirmationNumber'), 'VLR-26-88417');
    await typeInto(page, page.locator('#guestNames'), 'Priya Nair, Vivek Nair, Aditi Nair, Kabir Nair');
    await typeInto(page, page.locator('#title'), 'Vembanad Lake Resort — Nair family');
    mark('5.10');
    await say(page, 'Supplier-ready hotel vouchers from the same booking', 3200);
    await assertClean(page, 'scene 5 voucher form');
    await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
    await expect(page.getByText('Voucher created successfully').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForURL(/\/vouchers\/[^/]+$/);
    await settle(page, 1200);
    await clickOn(page, page.getByRole('button', { name: /Mark as sent/i }));
    await clickOn(page, page.getByRole('dialog').getByRole('button', { name: /Confirm/i }));
    await expect(page.getByText(/^sent$/i).first()).toBeVisible();
    mark('5.11');
    await say(page, 'Track every voucher from draft to confirmed', 3200);
    await assertClean(page, 'scene 5');

    // ───────────── Scene 6 — Book the airport transfer and assign Ravi ─────────────
    await card(page, { kicker: 'Scene 6 of 9', title: 'Same day: an airport pickup', subtitle: 'The Mehtas land in Kochi this afternoon' });
    await clickOn(page, sidebar(page, '/fleet'));
    await page.waitForURL('**/fleet');
    await settle(page, 1200);
    await expect(page.getByText('Total Vehicles').first()).toBeVisible();
    await expect(page.getByText('Active Trips').first()).toBeVisible();
    await hoverOn(page, page.getByText('Active Trips').first(), 500);
    mark('6.1');
    await say(page, 'Every vehicle, driver and live trip at a glance', 3500);
    await clickOn(page, page.getByRole('button', { name: /New Trip/i }).or(page.getByRole('link', { name: /New Trip/i })).first());
    await page.waitForURL('**/fleet/trips/new');
    await settle(page, 800);
    await pickRelation(page, /Select vehicle/, 'Registration or make/model...', 'Innova', 'KA 05 MN 4521');
    mark('6.3');
    await say(page, 'Choose from available vehicles and active drivers', 3000);
    await pickRelation(page, /Select driver/, 'Driver name or phone...', 'Ravi', 'Ravi Kumar');
    const pick = D.pickupTime(50);
    const pickEnd = new Date(new Date(pick.iso).getTime() + 135 * 60_000);
    const endHHMM = new Date(pickEnd.getTime() + 330 * 60_000).toISOString().slice(11, 16);
    await pickSelect(page, page.locator('#tripType'), /Airport Pickup/i);
    await typeInto(page, page.getByPlaceholder('Enter pickup location'), 'Cochin International Airport (COK), Arrival Gate 2');
    await typeInto(page, page.getByPlaceholder('Enter drop location'), 'Vembanad Lake Resort, Kumarakom');
    await pickDate(page, page.locator('button:has-text("Pick a date")').first(), D.d0());
    await page.locator('#startClock').fill(pick.hhmm);
    await pickDate(page, page.locator('button:has-text("Pick a date")').first(), D.d0());
    await page.locator('#endClock').fill(endHHMM);
    await typeInto(page, page.locator('#passengerName'), 'Arjun Mehta');
    await typeInto(page, page.locator('input[type="tel"]').first(), '9820144562');
    await typeInto(page, page.locator('#specialInstructions'), `IndiGo 6E 6171 lands ${pick.hhmm}. Meet at Gate 2 with a Mehta name board. Honeymooners, 3 bags.`, { delay: 22 });
    mark('6.7');
    await say(page, 'Flight details and instructions go straight to the driver', 3200);
    await typeInto(page, page.locator('#distance'), '82');
    await typeInto(page, page.locator('#fare'), '3200');
    await assertClean(page, 'scene 6 form');
    const created = page.waitForResponse((r) => /\/fleet\/trips$/.test(r.url()) && r.request().method() === 'POST');
    await clickOn(page, page.getByRole('button', { name: /^Save$/ }));
    const body = (await (await created).json()) as { data?: { id?: string } };
    handoff.tripId = body.data?.id;
    await expect(page.getByText('Trip created successfully').first()).toBeVisible({ timeout: 15_000 });
    mark('6.9');
    await say(page, 'Assigned — Ravi sees it in his driver app', 3000);
    await page.waitForURL('**/fleet/trips');
    await settle(page, 1000);
    await typeInto(page, page.getByPlaceholder(/Search trips/i), 'Arjun');
    await settle(page, 1200);
    await clickOn(page, page.locator('table tbody tr').filter({ hasText: 'Arjun Mehta' }).first());
    await page.waitForURL(/\/fleet\/trips\/[^/]+$/);
    await settle(page, 1500);
    await expect(page.getByRole('heading', { name: /Cochin International Airport \(COK\), Arrival Gate 2/ })).toBeVisible();
    await expect(page.getByText('Assigned', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Ravi Kumar').first()).toBeVisible();
    await expect(page.getByText('KA 05 MN 4521').first()).toBeVisible();
    await dwell(page, 1800);
    fs.mkdirSync(WORK_DIR, { recursive: true });
    await hideOverlays(page);
    await page.screenshot({ path: path.join(WORK_DIR, 'trip-assigned.png') });
    await showOverlays(page);
    const full: Handoff = {
      tripId: handoff.tripId!, driverPhone: '9876543210', driverPhoneE164: '+919876543210', otp: '123456', tenantId: D.TENANT_ID,
      tPick: pick.hhmm, pickup: 'Cochin International Airport (COK), Arrival Gate 2', drop: 'Vembanad Lake Resort, Kumarakom', passenger: 'Arjun Mehta',
      priyaLeadId: handoff.priyaLeadId, priyaInvoiceId: handoff.priyaInvoiceId, itineraryId: handoff.itineraryId, recordedAt: new Date().toISOString(),
    };
    fs.writeFileSync(HANDOFF, JSON.stringify(full, null, 2));
    mark('6.10');
    await assertClean(page, 'scene 6');
    await dwell(page, 1500);
    finished = true;
  } finally {
    fs.mkdirSync(WORK_DIR, { recursive: true });
    fs.writeFileSync(path.join(WORK_DIR, 'story-A-state.json'), JSON.stringify(handoff, null, 2));
    if (!finished) await page.screenshot({ path: path.join(WORK_DIR, 'fail-partA.png') }).catch(() => {});
    await finishRecording(page, 'partA', testInfo);
  }

  // Helpers kept below the take so the narrative reads top to bottom.
  async function changeStatus(pg: import('@playwright/test').Page, status: string) {
    await clickOn(pg, pg.getByRole('button', { name: 'Change Status' }));
    await pause(pg, 600);
    const dlg = pg.getByRole('dialog');
    await pickSelect(pg, dlg.getByRole('combobox').first(), status);
    await clickOn(pg, dlg.getByRole('button', { name: /Update Status/i }));
    await expect(pg.getByText('Status updated successfully').first()).toBeVisible();
    await dwell(pg, 1200);
  }
});

void API_URL; void rupees; void fieldByLabel; void hideOverlays; void showOverlays; void moveTo; void clearSay;

test('story-B: back at the office (scenes 8-9)', async ({ page, context }, testInfo) => {
  test.setTimeout(10 * 60_000);
  const handoff = JSON.parse(fs.readFileSync(HANDOFF, 'utf8')) as Handoff;
  await installOverlays(context);
  startRecording();
  attachListeners(page);
  let finished = false;
  try {
    await page.goto('/dashboard');
    await settle(page, 1200);

    // ───────────── Scene 8 — Back at the office ─────────────
    await card(page, { kicker: 'Scene 8 of 9', title: 'Back at the office', subtitle: 'Every step from the road, already on the record' });
    await page.goto(`/fleet/trips/${handoff.tripId}`);
    await settle(page, 1500);
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Ravi Kumar').first()).toBeVisible();
    fs.mkdirSync(WORK_DIR, { recursive: true });
    await hideOverlays(page);
    await page.screenshot({ path: path.join(WORK_DIR, 'trip-completed.png') });
    await showOverlays(page);
    mark('8.1');
    await say(page, "The trip record updated itself from Ravi's phone", 4000);
    await clickOn(page, page.getByRole('tab', { name: 'Activity' }).or(page.getByRole('button', { name: 'Activity' })).first());
    await settle(page, 1000);
    for (const label of [/Accepted/i, /En route/i, /Checked in/i, /Trip started|Started/i, /Completed/i]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
    mark('8.2');
    await say(page, 'Accepted, en route, GPS check-in, completed — all timestamped', 3000);
    for (const label of [/Accepted/i, /En route/i, /Checked in/i, /Completed/i]) {
      await hoverOn(page, page.getByText(label).first(), 900);
    }
    await assertClean(page, 'scene 8 trip');
    await clickOn(page, sidebar(page, '/fleet'));
    await page.waitForURL('**/fleet');
    await settle(page, 1500);
    await expect(page.getByText('Recently Completed').first()).toBeVisible();
    await hoverOn(page, page.getByText('Recently Completed').first(), 1500);
    mark('8.3');
    await say(page, 'Utilisation and availability update automatically', 3200);
    await hoverOn(page, page.getByText('Fleet Status').first(), 1500);
    await expect(page.getByText('Top Drivers').first()).toBeVisible();
    await hoverOn(page, page.getByText('Top Drivers').first(), 800);
    await expect(page.getByText('Ravi Kumar').first()).toBeVisible();
    mark('8.4');
    await say(page, 'See which drivers your clients love', 3200);
    await assertClean(page, 'scene 8');

    // ───────────── Scene 9 — The day at a glance ─────────────
    await card(page, { kicker: 'Scene 9 of 9', title: 'The day at a glance', subtitle: 'Dashboards and reports that run themselves' });
    await clickOn(page, sidebar(page, '/dashboard'));
    await page.waitForURL('**/dashboard');
    await settle(page, 2000);
    for (const t of ['New Leads', 'Follow-ups Today', 'Bookings']) await expect(page.getByText(t).first()).toBeVisible();
    await hoverOn(page, page.getByText('New Leads').first(), 800);
    mark('9.1');
    await say(page, 'Leads, follow-ups, revenue and collections — live', 4500);
    await scrollSteps(page, 5, 450);
    mark('9.2');
    await say(page, "Today's work is already in the pipeline and timeline", 3500);
    await page.mouse.wheel(0, -4000);
    await pause(page, 600);
    await assertClean(page, 'scene 9 dashboard');
    await clickOn(page, sidebar(page, '/reports'));
    await page.waitForURL('**/reports');
    await settle(page, 1200);
    await clickOn(page, page.getByRole('link', { name: /Sales Reports/i }).first());
    await page.waitForURL('**/reports/sales');
    await settle(page, 2200);
    await expect(page.getByText('Total Revenue').first()).toBeVisible();
    mark('9.3');
    await say(page, 'Drill into sales, finance, fleet and marketing', 5000);
    await page.goBack();
    await page.waitForURL('**/reports');
    await settle(page, 1000);
    await clickOn(page, page.getByRole('link', { name: /Fleet Reports/i }).first());
    await page.waitForURL('**/reports/fleet');
    await settle(page, 2200);
    mark('9.4');
    await say(page, 'One platform from first message to final drop-off', 5000);
    await assertClean(page, 'scene 9');
    await dwell(page, 1200);
    finished = true;
  } finally {
    if (!finished) await page.screenshot({ path: path.join(WORK_DIR, 'fail-partB.png') }).catch(() => {});
    await finishRecording(page, 'partB', testInfo);
  }
});
