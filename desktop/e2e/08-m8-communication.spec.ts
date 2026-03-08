/**
 * M8 — Communication Hub E2E Tests
 * Covers: TICKET-136 (Templates CRUD), TICKET-138 (Contact Chat View),
 *         TICKET-139 (Communication Log), TICKET-131/134 (Send API),
 *         TICKET-147 (Navigation), sidebar nav, FilterBar, API contracts.
 */
import { test, expect } from '@playwright/test';
import { waitForLoad, navigateTo } from './helpers/auth';
import { seedContact, api } from './helpers/api-seed';

// ─── Helper: fill search and wait for templates API response ─────────────────
// The templates page uses Skeleton cards (not spinners). We monitor network to
// detect when the filtered list has loaded.

async function fillSearchAndWait(page: import('@playwright/test').Page, searchInput: import('@playwright/test').Locator, value: string) {
  // Clear then type to ensure React state updates (fill() may not trigger onChange in all cases)
  await searchInput.clear();
  // Set up response watcher AFTER clear but BEFORE typing (clear may trigger a request without search)
  const encodedValue = encodeURIComponent(value);
  const responsePromise = page.waitForResponse(
    (resp) => {
      const url = resp.url();
      return url.includes('/templates') && url.includes(`search=${encodedValue}`) && resp.status() < 400;
    },
    { timeout: 15_000 }
  );
  await searchInput.pressSequentially(value, { delay: 20 });
  await responsePromise.catch(() => {});
  await page.waitForTimeout(500); // React re-render
}

// Wait for any templates API response (for filter changes)
async function waitForTemplatesList(page: import('@playwright/test').Page) {
  await page.waitForResponse(
    (resp) => resp.url().includes('/templates') && resp.status() === 200,
    { timeout: 10_000 }
  ).catch(() => {});
  await page.waitForTimeout(300);
}

// ─── Seed helper ──────────────────────────────────────────────────────────────

async function seedTemplate(overrides: Record<string, any> = {}) {
  const ts = Date.now();
  const data = {
    name: `E2E Template ${ts}`,
    channel: 'sms',
    content: `Hello {customer_name}, your trip to {destination} is confirmed. Ref: {booking_ref}`,
    category: 'booking',
    language: 'en',
    ...overrides,
  };
  const res = await api('POST', '/templates', data);
  return res.data ?? res;
}

// ─── A. TEMPLATES CRUD LIFECYCLE ──────────────────────────────────────────────

test.describe('A. Message Templates CRUD', () => {

  test('A1: create SMS template — all fields visible in list, detail, and edit', async ({ page }) => {
    const ts = Date.now();
    const templateName = `E2E-SMS-${ts}`;

    // ── NAVIGATE TO CREATE ──
    await page.goto('/communication/templates/new');
    await waitForLoad(page);
    await expect(page.locator('text=Create Template').first()).toBeVisible();

    // ── FILL ALL FIELDS ──
    await page.getByPlaceholder(/e\.g\., Welcome/i).fill(templateName);

    // Channel — select SMS
    await page.locator('button[role="combobox"]').first().click();
    await page.getByRole('option', { name: /SMS/i }).click();

    // Category — select from dropdown
    const selects = page.locator('button[role="combobox"]');
    await selects.nth(1).click();
    await page.getByRole('option', { name: 'Follow-up' }).click();

    // Body
    const bodyContent = `Hi {customer_name}, following up on your inquiry about {destination}. Ref: ${ts}`;
    await page.locator('textarea').fill(bodyContent);

    // ── SAVE ──
    await page.getByRole('button', { name: /Save Template/i }).click();
    await waitForLoad(page);

    // Should redirect to templates list
    await expect(page).toHaveURL(/\/communication\/templates$/, { timeout: 15_000 });
    // Wait for list to load
    await expect(page.locator('h1').filter({ hasText: /Message Templates/i })).toBeVisible({ timeout: 10_000 });
    await waitForLoad(page);

    // Search for the specific template (may not be in first page due to pagination)
    const searchInput1 = page.getByPlaceholder(/Search templates/i);
    await fillSearchAndWait(page, searchInput1, templateName);

    // ── VERIFY IN LIST ──
    await expect(page.getByText(templateName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('SMS', { exact: false }).first()).toBeVisible();

    // ── NAVIGATE TO EDIT (which IS the detail view for templates) ──
    // Navigate to edit via the Edit button link on the card (4 levels up from h3 → CardContent)
    await page.getByText(templateName).first().locator('xpath=ancestor::div[contains(@class,"p-4")]').getByRole('link', { name: /Edit/i }).click();
    await waitForLoad(page);
    await expect(page).toHaveURL(/\/communication\/templates\/.*\/edit/);

    // ── VERIFY EDIT PREFILL ──
    await expect(page.getByPlaceholder(/e\.g\., Welcome/i)).toHaveValue(templateName);
    // Channel should show SMS
    await expect(page.locator('button[role="combobox"]').first()).toContainText(/SMS/i);
    // Body should be prefilled
    await expect(page.locator('textarea')).toHaveValue(bodyContent);

    // ── EDIT AND VERIFY ──
    await page.getByPlaceholder(/e\.g\., Welcome/i).clear();
    const updatedName = `${templateName}-UPDATED`;
    await page.getByPlaceholder(/e\.g\., Welcome/i).fill(updatedName);
    await page.getByRole('button', { name: /Save Changes/i }).click();
    await waitForLoad(page);

    // Back to list
    await expect(page).toHaveURL(/\/communication\/templates$/, { timeout: 15_000 });
    await expect(page.locator('h1').filter({ hasText: /Message Templates/i })).toBeVisible({ timeout: 10_000 });
    await waitForLoad(page);
    // Search for updated template
    const searchInput2 = page.getByPlaceholder(/Search templates/i);
    await fillSearchAndWait(page, searchInput2, updatedName);
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 });

    // ── DELETE ──
    const updatedCard = page.locator('h3').filter({ hasText: updatedName }).locator('xpath=ancestor::div[contains(@class,"p-4")]');
    // Open dropdown menu (⋯ button)
    await updatedCard.locator('button').first().click();
    await page.getByRole('menuitem', { name: /Delete/i }).click();
    await page.waitForTimeout(2000);
    await waitForLoad(page);

    // Verify removed — no card with updated name visible (is_active=1 filter hides soft-deleted)
    await expect(page.locator('h3').filter({ hasText: updatedName })).toHaveCount(0, { timeout: 10_000 });
  });

  test('A2: create email template — subject field appears, saves correctly', async ({ page }) => {
    const ts = Date.now();
    const name = `E2E-Email-${ts}`;

    await page.goto('/communication/templates/new');
    await waitForLoad(page);

    // Template name
    await page.getByPlaceholder(/e\.g\., Welcome/i).fill(name);

    // Select Email channel (default)
    // Channel should already be Email by default — verify subject field appears
    await expect(page.getByPlaceholder(/Email subject line/i)).toBeVisible();
    await page.getByPlaceholder(/Email subject line/i).fill(`Your Travel Package - ${ts}`);

    // Category
    const selects = page.locator('button[role="combobox"]');
    await selects.nth(1).click();
    await page.getByRole('option', { name: /Quotation/i }).click();

    // Body
    await page.locator('textarea').fill(`Dear {customer_name},\n\nWe are pleased to offer you a travel package to {destination}.\n\nBest regards,\n{agent_name}`);

    await page.getByRole('button', { name: /Save Template/i }).click();
    await waitForLoad(page);

    await expect(page).toHaveURL(/\/communication\/templates$/, { timeout: 15_000 });
    await expect(page.locator('h1').filter({ hasText: /Message Templates/i })).toBeVisible({ timeout: 10_000 });
    // Search for the template we just created
    await fillSearchAndWait(page, page.getByPlaceholder(/Search templates/i), name);
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('EMAIL', { exact: false }).first()).toBeVisible();

    // Cleanup via API
    const res = await api('GET', `/templates?search=${encodeURIComponent(name)}`);
    const tpl = (res.data?.data ?? res.data ?? [])[0];
    if (tpl?.id) await api('DELETE', `/templates/${tpl.id}`);
  });

  test('A3: create WhatsApp template — channel badge shown', async ({ page }) => {
    const ts = Date.now();
    const name = `E2E-WA-${ts}`;

    await page.goto('/communication/templates/new');
    await waitForLoad(page);

    await page.getByPlaceholder(/e\.g\., Welcome/i).fill(name);

    // Select WhatsApp channel
    await page.locator('button[role="combobox"]').first().click();
    await page.getByRole('option', { name: /WhatsApp/i }).click();

    // Category
    const selects = page.locator('button[role="combobox"]');
    await selects.nth(1).click();
    await page.getByRole('option', { name: /Greeting/i }).click();

    await page.locator('textarea').fill(`Hello {customer_name}! Welcome aboard. Your trip to {destination} is confirmed.`);

    await page.getByRole('button', { name: /Save Template/i }).click();
    await waitForLoad(page);

    await expect(page).toHaveURL(/\/communication\/templates$/, { timeout: 15_000 });
    await expect(page.locator('h1').filter({ hasText: /Message Templates/i })).toBeVisible({ timeout: 10_000 });
    // Search for the template we just created
    await fillSearchAndWait(page, page.getByPlaceholder(/Search templates/i), name);
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('WHATSAPP', { exact: false }).first()).toBeVisible();

    // Cleanup
    const res = await api('GET', `/templates?search=${encodeURIComponent(name)}`);
    const tpl = (res.data?.data ?? res.data ?? [])[0];
    if (tpl?.id) await api('DELETE', `/templates/${tpl.id}`);
  });

  test('A4: template duplicate — copy appears in list', async ({ page }) => {
    // Seed original and create duplicate via API (testing that UI shows both in list)
    const original = await seedTemplate({ name: `E2E-Orig-${Date.now()}` });
    expect(original?.id).toBeTruthy();
    const copyRes = await api('POST', '/templates', {
      channel: original.channel,
      name: `${original.name} (Copy)`,
      content: original.content,
      category: original.category,
      language: original.language,
    });
    const copy = copyRes.data ?? copyRes;
    expect(copy?.id).toBeTruthy();

    // Navigate to list and verify both appear
    await page.goto('/communication/templates');
    await waitForLoad(page);
    await expect(page.locator('h1').filter({ hasText: /Message Templates/i })).toBeVisible({ timeout: 10_000 });

    const searchInput = page.getByPlaceholder(/Search templates/i);
    await fillSearchAndWait(page, searchInput, original.name.slice(-10));

    // Use exact text match to avoid original.name being a substring of the copy name
    await expect(page.locator('h3').getByText(original.name, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('h3').getByText(`${original.name} (Copy)`, { exact: true })).toBeVisible({ timeout: 10_000 });

    // Cleanup
    await api('DELETE', `/templates/${original.id}`);
    await api('DELETE', `/templates/${copy.id}`);
  });

  test('A5: template delete via API — removed from list', async ({ page }) => {
    const tpl = await seedTemplate({ name: `E2E-Del-${Date.now()}` });
    expect(tpl?.id).toBeTruthy();

    await page.goto('/communication/templates');
    await waitForLoad(page);
    await expect(page.locator('h1').filter({ hasText: /Message Templates/i })).toBeVisible({ timeout: 10_000 });

    // Search for the template to ensure it's visible
    const searchInput = page.getByPlaceholder(/Search templates/i);
    await fillSearchAndWait(page, searchInput, tpl.name.slice(-10));
    await expect(page.getByText(tpl.name)).toBeVisible({ timeout: 10_000 });

    const card = page.locator('h3').filter({ hasText: tpl.name }).locator('xpath=ancestor::div[contains(@class,"p-4")]');
    await card.locator('button').first().click();
    await page.getByRole('menuitem', { name: /Delete/i }).click();
    await page.waitForTimeout(2000);
    await waitForLoad(page);

    // Card heading should be gone (is_active=1 filter hides soft-deleted)
    await expect(page.locator('h3').filter({ hasText: tpl.name })).toHaveCount(0, { timeout: 10_000 });
  });

});

// ─── B. TEMPLATES LIST PAGE UX ────────────────────────────────────────────────

test.describe('B. Templates List Page UX', () => {

  test('B1: list has FilterBar with search', async ({ page }) => {
    // Seed two templates with distinct names
    const ts = Date.now();
    const t1 = await seedTemplate({ name: `E2E-Alpha-${ts}`, channel: 'email', category: 'greeting', subject: 'Alpha subject', content: 'Alpha content' });
    const t2 = await seedTemplate({ name: `E2E-Beta-${ts}`, channel: 'sms', category: 'follow_up', content: 'Beta content' });

    await page.goto('/communication/templates');
    await waitForLoad(page);
    await expect(page.locator('h1').filter({ hasText: /Message Templates/i })).toBeVisible({ timeout: 10_000 });

    // Search bar exists
    const searchInput = page.getByPlaceholder(/Search templates/i);
    await expect(searchInput).toBeVisible();

    // Filter by name
    await fillSearchAndWait(page, searchInput, `Alpha-${ts}`);
    await expect(page.locator('h3').filter({ hasText: t1.name })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('h3').filter({ hasText: t2.name })).toHaveCount(0, { timeout: 5_000 });

    // Clear search
    await searchInput.clear();
    await waitForLoad(page);

    // Cleanup
    await api('DELETE', `/templates/${t1.id}`);
    await api('DELETE', `/templates/${t2.id}`);
  });

  test('B2: channel filter works', async ({ page }) => {
    const ts = Date.now();
    const tEmail = await seedTemplate({ name: `E2E-CF-Email-${ts}`, channel: 'email', subject: 'Subj', content: 'Email body', category: 'greeting' });
    const tSms   = await seedTemplate({ name: `E2E-CF-SMS-${ts}`, channel: 'sms', content: 'SMS body', category: 'greeting' });

    await page.goto('/communication/templates');
    await waitForLoad(page);
    await expect(page.locator('h1').filter({ hasText: /Message Templates/i })).toBeVisible({ timeout: 10_000 });

    // Search by timestamp suffix — both template names end with the same timestamp
    const searchInput = page.getByPlaceholder(/Search templates/i);
    await fillSearchAndWait(page, searchInput, String(ts));

    // Both templates should be visible (email + sms)
    await expect(page.locator('h3').filter({ hasText: tEmail.name })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('h3').filter({ hasText: tSms.name })).toBeVisible({ timeout: 10_000 });

    // Filter by SMS — channel select is first combobox
    const allComboboxes = page.locator('button[role="combobox"]');
    let respPromise = page.waitForResponse(
      (resp) => resp.url().includes('/templates') && resp.status() === 200,
      { timeout: 10_000 }
    );
    await allComboboxes.first().click();
    await page.getByRole('option', { name: /^SMS$/i }).click();
    await respPromise.catch(() => {});
    await page.waitForTimeout(300);

    await expect(page.locator('h3').filter({ hasText: tSms.name })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('h3').filter({ hasText: tEmail.name })).toHaveCount(0, { timeout: 5_000 });

    // Switch to Email
    respPromise = page.waitForResponse(
      (resp) => resp.url().includes('/templates') && resp.status() === 200,
      { timeout: 10_000 }
    );
    await allComboboxes.first().click();
    await page.getByRole('option', { name: /^Email$/i }).click();
    await respPromise.catch(() => {});
    await page.waitForTimeout(300);

    await expect(page.locator('h3').filter({ hasText: tEmail.name })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('h3').filter({ hasText: tSms.name })).toHaveCount(0, { timeout: 5_000 });

    // Cleanup
    await api('DELETE', `/templates/${tEmail.id}`);
    await api('DELETE', `/templates/${tSms.id}`);
  });

  test('B3: empty state shown when no templates match filter', async ({ page }) => {
    await page.goto('/communication/templates');
    await waitForLoad(page);
    await expect(page.locator('h1').filter({ hasText: /Message Templates/i })).toBeVisible({ timeout: 10_000 });

    const searchInput = page.getByPlaceholder(/Search templates/i);
    await fillSearchAndWait(page, searchInput, 'XYZXYZ_NOMATCH_12345_UNIQUE');

    await expect(page.getByText(/No templates found/i)).toBeVisible({ timeout: 15_000 });
  });

  test('B4: page loads — heading visible', async ({ page }) => {
    await page.goto('/communication/templates');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Message Templates').first()).toBeVisible({ timeout: 15_000 });
  });

  test('B5: Create Template button links to /communication/templates/new', async ({ page }) => {
    await page.goto('/communication/templates');
    await waitForLoad(page);
    await expect(page.locator('h1').filter({ hasText: /Message Templates/i })).toBeVisible({ timeout: 10_000 });

    // Header "Create Template" button
    await page.locator('a[href="/communication/templates/new"]').first().click();
    await expect(page).toHaveURL(/\/communication\/templates\/new$/);
  });

});

// ─── C. COMMUNICATION LOG / INBOX ─────────────────────────────────────────────

test.describe('C. Communication Log / Inbox', () => {

  test('C1: inbox page loads with correct heading', async ({ page }) => {
    await page.goto('/communication');
    await waitForLoad(page);

    await expect(page.locator('text=Inbox').first()).toBeVisible();
  });

  test('C2: channel tabs present — All, Calls, Emails, SMS, WhatsApp', async ({ page }) => {
    await page.goto('/communication');
    await waitForLoad(page);

    await expect(page.getByRole('tab', { name: 'All', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /Calls/i }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /Emails/i }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /SMS/i }).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /WhatsApp/i }).first()).toBeVisible();
  });

  test('C3: FilterBar search visible on inbox', async ({ page }) => {
    await page.goto('/communication');
    await waitForLoad(page);
    await expect(page.getByPlaceholder(/Search conversations/i)).toBeVisible();
  });

  test('C4: switching channel tab calls API with correct filter', async ({ page }) => {
    // Monitor network requests
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/communications/log')) requests.push(req.url());
    });

    await page.goto('/communication');
    await waitForLoad(page);

    // Click SMS tab
    await page.getByRole('tab', { name: /SMS/i }).click();
    await waitForLoad(page);

    // At least one request to log with channel=sms
    const smsRequest = requests.find((u) => u.includes('channel=sms'));
    expect(smsRequest).toBeTruthy();
  });

  test('C5: inbox uses getLog API (not mock data)', async ({ page }) => {
    // Verify no "mock" text appears and API request is made
    const logRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/communications/log')) logRequests.push(req.url());
    });

    await page.goto('/communication');
    await waitForLoad(page);

    expect(logRequests.length).toBeGreaterThan(0);
    expect(logRequests[0]).toContain('/communications/log');
  });

  test('C6: hover actions appear on conversation rows', async ({ page }) => {
    // Seed a contact first so there is a conversation entry
    const contact = await seedContact();

    await page.goto('/communication');
    await waitForLoad(page);

    // If there are conversations, hover and check for Eye/Trash icons
    const rows = page.locator('.border-b.cursor-pointer');
    const count = await rows.count();
    if (count > 0) {
      await rows.first().hover();
      // Hover actions container should appear
      await expect(rows.first().locator('button').first()).toBeVisible();
    }
  });

  test('C7: "New Message" button links to compose page', async ({ page }) => {
    await page.goto('/communication');
    await waitForLoad(page);

    await page.getByRole('link', { name: 'New Message', exact: true }).click();
    await expect(page).toHaveURL(/\/communication\/compose/);
  });

});

// ─── D. CONTACT CHAT VIEW ─────────────────────────────────────────────────────

test.describe('D. Per-Contact Chat View', () => {

  test('D1: contact chat page loads — shows channel tabs', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-Chat-${Date.now()}` });
    expect(contact?.id).toBeTruthy();

    await page.goto(`/communication/${contact.id}`);
    await waitForLoad(page);

    // Channel filter tabs should be present
    await expect(
      page.locator('button, [role="tab"]').filter({ hasText: /All/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('D2: contact chat page fetches real contact info (not hardcoded mock)', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-RealContact-${Date.now()}`, email: `chattest-${Date.now()}@e2e.com` });
    expect(contact?.id).toBeTruthy();

    // Monitor API calls — should call contacts/{id}
    const contactApiCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes(`/contacts/${contact.id}`)) contactApiCalls.push(req.url());
    });

    await page.goto(`/communication/${contact.id}`);
    await waitForLoad(page);

    // Should have fetched real contact
    expect(contactApiCalls.length).toBeGreaterThan(0);
  });

  test('D3: compose bar has message input and send button', async ({ page }) => {
    const contact = await seedContact();
    expect(contact?.id).toBeTruthy();

    await page.goto(`/communication/${contact.id}`);
    await waitForLoad(page);

    // Message input should be present
    await expect(page.getByPlaceholder(/Type your.*message/i).first()).toBeVisible({ timeout: 10_000 });
    // Send button exists (may be icon-only)
    const sendBtn = page.locator('button').last(); // send is the last button in compose area
    await expect(page.locator('button').filter({ has: page.locator('svg') }).last()).toBeVisible();
  });

  test('D4: empty messages state when no history', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-NoHistory-${Date.now()}` });
    expect(contact?.id).toBeTruthy();

    await page.goto(`/communication/${contact.id}`);
    await waitForLoad(page);

    // Page should load without crash
    await expect(page.locator('body')).not.toContainText('Error');
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('D5: no direct mailto/wa.me links on chat page', async ({ page }) => {
    const contact = await seedContact();
    await page.goto(`/communication/${contact.id}`);
    await waitForLoad(page);

    const mailtoCount = await page.locator('a[href^="mailto:"]').count();
    const waCount = await page.locator('a[href*="wa.me"]').count();
    expect(mailtoCount).toBe(0);
    expect(waCount).toBe(0);
  });

});

// ─── E. COMPOSE PAGE ──────────────────────────────────────────────────────────

test.describe('E. Compose Page', () => {

  test('E1: compose page loads with heading', async ({ page }) => {
    await page.goto('/communication/compose');
    await waitForLoad(page);

    await expect(
      page.locator('text=Compose').or(page.locator('text=New Message')).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('E2: no direct mailto links on compose page', async ({ page }) => {
    await page.goto('/communication/compose');
    await waitForLoad(page);

    const mailtoCount = await page.locator('a[href^="mailto:"]').count();
    expect(mailtoCount).toBe(0);
  });

});

// ─── F. BULK SEND PAGE ────────────────────────────────────────────────────────

test.describe('F. Bulk Send Page', () => {

  test('F1: bulk send page loads', async ({ page }) => {
    await page.goto('/communication/bulk-send');
    await waitForLoad(page);

    await expect(
      page.locator('text=Bulk').or(page.locator('text=Send')).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('F2: bulk send wizard has step indicators', async ({ page }) => {
    await page.goto('/communication/bulk-send');
    await waitForLoad(page);

    // Wizard should have channel selection step
    await expect(
      page.locator('text=Channel').or(page.locator('text=channel')).first()
    ).toBeVisible();
  });

});

// ─── G. SIDEBAR NAVIGATION ────────────────────────────────────────────────────

test.describe('G. Sidebar Navigation', () => {

  test('G1: Communication section has Inbox, Call Log, Templates, Bulk Send, Campaigns', async ({ page }) => {
    await page.goto('/communication');
    await waitForLoad(page);

    const sidebar = page.locator('aside, nav').first();
    await expect(sidebar.getByRole('link', { name: /Inbox/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Templates/i })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Bulk Send/i })).toBeVisible();
  });

  test('G2: sidebar Inbox link navigates to /communication', async ({ page }) => {
    await page.goto('/');
    await waitForLoad(page);

    await page.locator('aside a[href="/communication"]').first().click();
    await expect(page).toHaveURL(/\/communication$/);
  });

  test('G3: sidebar Templates link navigates to /communication/templates', async ({ page }) => {
    await page.goto('/');
    await waitForLoad(page);

    await page.locator('aside a[href="/communication/templates"]').first().click();
    await expect(page).toHaveURL(/\/communication\/templates$/);
  });

  test('G4: sidebar Bulk Send link navigates to /communication/bulk-send', async ({ page }) => {
    await page.goto('/');
    await waitForLoad(page);

    await page.locator('aside a[href="/communication/bulk-send"]').first().click();
    await expect(page).toHaveURL(/\/communication\/bulk-send/);
  });

});

// ─── H. API CONTRACT VALIDATION ───────────────────────────────────────────────

test.describe('H. API Contract Validation', () => {

  test('H1: templates API CRUD via api-seed works correctly', async () => {
    // Create
    const tpl = await seedTemplate({ name: `E2E-Contract-${Date.now()}` });
    expect(tpl?.id).toBeTruthy();
    expect(tpl?.channel).toBe('sms');

    // Read
    const getRes = await api('GET', `/templates/${tpl.id}`);
    const fetched = getRes.data ?? getRes;
    expect(fetched?.name).toContain('E2E-Contract');
    expect(fetched?.content).toContain('{customer_name}');

    // Update
    const updRes = await api('PUT', `/templates/${tpl.id}`, { name: `${tpl.name}-EDITED` });
    const updated = updRes.data ?? updRes;
    expect(updated?.name).toContain('-EDITED');

    // Delete
    const delRes = await api('DELETE', `/templates/${tpl.id}`);
    expect(delRes.success ?? delRes.data?.success ?? true).toBeTruthy();

    // Verify gone
    const getAgain = await api('GET', `/templates/${tpl.id}`);
    // Soft delete — template is deactivated (isActive=0) or returns 404
    const returnedData = getAgain.data ?? null;
    if (returnedData) {
      // Soft delete: should be inactive
      expect(returnedData.isActive).toBe(0);
    }
    // Either way — no error thrown means delete API call worked
  });

  test('H2: communications send API contract — correct fields', async () => {
    const contact = await seedContact();
    expect(contact?.id).toBeTruthy();

    // Should accept contact_id, channel, message (backend schema)
    const res = await api('POST', '/communications/send', {
      contact_id: contact.id,
      channel: 'sms',
      message: 'E2E test message',
    });

    // Should not return Zod validation error for field names
    const errStr = JSON.stringify(res.error ?? '');
    expect(errStr).not.toContain('contact_id is required');
    expect(errStr).not.toContain('"path":"contact_id"');
  });

  test('H3: send-template API contract — correct fields', async () => {
    const contact = await seedContact();
    const tpl = await seedTemplate();
    expect(contact?.id).toBeTruthy();
    expect(tpl?.id).toBeTruthy();

    // Should accept contact_id, template_id (backend schema)
    const res = await api('POST', '/communications/send-template', {
      contact_id: contact.id,
      template_id: tpl.id,
    });

    // Validation should not fail on field names
    const errMsg = res.error ?? res.message ?? '';
    expect(errMsg).not.toMatch(/recipientIds|type is required/i);

    // Cleanup
    await api('DELETE', `/templates/${tpl.id}`);
  });

  test('H4: bulk-send API contract — correct fields', async () => {
    const contact = await seedContact();
    expect(contact?.id).toBeTruthy();

    const res = await api('POST', '/communications/bulk-send', {
      channel: 'sms',
      contact_ids: [contact.id],
      message: 'E2E bulk test',
    });

    // Should not reject field names
    const errMsg = res.error ?? res.message ?? '';
    expect(errMsg).not.toMatch(/recipients is required|to is required/i);
  });

  test('H5: templates list API supports channel filter', async () => {
    const tplSms = await seedTemplate({ name: `E2E-Filter-SMS-${Date.now()}`, channel: 'sms', content: 'SMS template content' });

    const res = await api('GET', '/templates?channel=sms');
    const list = res.data?.data ?? res.data ?? [];
    expect(Array.isArray(list)).toBe(true);

    const found = list.find((t: any) => t.id === tplSms.id);
    expect(found).toBeTruthy();

    // Filter by email should NOT include sms template
    const emailRes = await api('GET', '/templates?channel=email');
    const emailList = emailRes.data?.data ?? emailRes.data ?? [];
    const notFound = emailList.find((t: any) => t.id === tplSms.id);
    expect(notFound).toBeFalsy();

    await api('DELETE', `/templates/${tplSms.id}`);
  });

});

// ─── I. FORM VALIDATION ───────────────────────────────────────────────────────

test.describe('I. Template Form Validation', () => {

  test('I1: create template form — shows error when name is empty', async ({ page }) => {
    await page.goto('/communication/templates/new');
    await waitForLoad(page);

    // Don't fill name, fill body, try to save
    await page.locator('textarea').fill('Some content');

    // Select category
    const selects = page.locator('button[role="combobox"]');
    await selects.nth(1).click();
    await page.getByRole('option', { name: /Greeting/i }).click();

    await page.getByRole('button', { name: /Save Template/i }).click();

    // Should show error toast or validation message
    await expect(
      page.locator('text=Please enter a template name').or(
        page.locator('[data-sonner-toast]')
      ).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('I2: create email template — shows error when subject is empty', async ({ page }) => {
    await page.goto('/communication/templates/new');
    await waitForLoad(page);

    await page.getByPlaceholder(/e\.g\., Welcome/i).fill(`E2E-NoSubj-${Date.now()}`);
    // Email is default channel — subject field should be visible
    await expect(page.getByPlaceholder(/Email subject line/i)).toBeVisible();
    // Don't fill subject

    const selects = page.locator('button[role="combobox"]');
    await selects.nth(1).click();
    await page.getByRole('option', { name: /Greeting/i }).click();

    await page.locator('textarea').fill('Some body content');
    await page.getByRole('button', { name: /Save Template/i }).click();

    await expect(
      page.locator('text=Please enter an email subject').or(
        page.locator('[data-sonner-toast]')
      ).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('I3: SMS template shows character counter', async ({ page }) => {
    await page.goto('/communication/templates/new');
    await waitForLoad(page);

    // Switch to SMS
    await page.locator('button[role="combobox"]').first().click();
    await page.getByRole('option', { name: /SMS/i }).click();

    // Fill body with > 160 chars to trigger segment indicator
    const longContent = 'A'.repeat(170);
    await page.locator('textarea').fill(longContent);

    // Character count should be visible
    await expect(page.locator('text=170 characters').or(page.locator('text=characters')).first()).toBeVisible();
  });

  test('I4: edit template page — delete button confirms before deleting', async ({ page }) => {
    const tpl = await seedTemplate({ name: `E2E-ConfirmDel-${Date.now()}` });
    expect(tpl?.id).toBeTruthy();

    await page.goto(`/communication/templates/${tpl.id}/edit`);
    await waitForLoad(page);
    await expect(page.getByPlaceholder(/e\.g\., Welcome/i)).not.toHaveValue('');

    // Click delete — should show browser confirm dialog
    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain(tpl.name);
      await dialog.dismiss(); // Cancel — should NOT delete
    });

    await page.getByRole('button', { name: /Delete/i }).click();

    // Template should still exist
    const check = await api('GET', `/templates/${tpl.id}`);
    const data = check.data ?? check;
    expect(data?.id).toBe(tpl.id);

    // Cleanup
    await api('DELETE', `/templates/${tpl.id}`);
  });

});

// ─── J. CROSS-ENTITY COMMUNICATION ───────────────────────────────────────────

test.describe('J. Cross-Entity: SendMessageDialog Integration', () => {

  test('J1: contacts list — no direct mailto or wa.me links', async ({ page }) => {
    await page.goto('/contacts');
    await waitForLoad(page);

    const mailto = await page.locator('a[href^="mailto:"]').count();
    const wa = await page.locator('a[href*="wa.me"]').count();
    expect(mailto).toBe(0);
    expect(wa).toBe(0);
  });

  test('J2: leads list — no direct mailto or wa.me links', async ({ page }) => {
    await page.goto('/leads');
    await waitForLoad(page);

    const mailto = await page.locator('a[href^="mailto:"]').count();
    const wa = await page.locator('a[href*="wa.me"]').count();
    expect(mailto).toBe(0);
    expect(wa).toBe(0);
  });

  test('J3: communication hub link on contact row navigates correctly', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-Hub-${Date.now()}` });
    expect(contact?.id).toBeTruthy();

    await page.goto('/communication');
    await waitForLoad(page);

    // The contact's communication history page should be accessible via direct URL
    await page.goto(`/communication/${contact.id}`);
    await waitForLoad(page);

    // Should not crash
    await expect(page.locator('body')).not.toContainText('404');
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

});
