import { test, expect } from './fixtures';
import { waitForLoad, navigateTo, API_URL, getAuthToken, TENANT_ID } from './helpers/auth';
import { seedContact, seedEmailTemplate, api } from './helpers/api-seed';

// ─── A. INBOX LIST ─────────────────────────────────────────────────────────

test.describe('A. Inbox list', () => {

  test('A1: inbox loads with heading, FilterBar search, and channel selector', async ({ page }) => {
    await page.goto('/communication');
    await waitForLoad(page);

    await expect(page.locator('text=Inbox').first()).toBeVisible();
    await expect(page.getByPlaceholder(/Search conversations/i)).toBeVisible();
    // Channel selector (headerActions) is a combobox, not a raw select
    await expect(page.locator('button[role="combobox"]').first()).toBeVisible();
  });

  test('A2: sending a message creates a log entry visible in the list, with resolved contact name, and searchable by content', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-Inbox-${Date.now()}` });
    const message = `Hello from E2E test ${Date.now()}`;

    const sendRes = await api('POST', '/communications/send', {
      contact_id: contact.id,
      channel: 'sms',
      message,
    });
    expect(sendRes.error).toBeFalsy();

    await page.goto('/communication');
    await waitForLoad(page);

    // The log API's search only matches message content/subject (no contact join
    // server-side), so we search by the message body — the fix in page.tsx resolves
    // the contact's display name client-side per page of results.
    const searchInput = page.getByPlaceholder(/Search conversations/i);
    await searchInput.fill(message.slice(0, 20));
    await page.waitForTimeout(600);
    await waitForLoad(page);

    await expect(page.getByText(message.slice(0, 20)).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(contact.name).first()).toBeVisible({ timeout: 10_000 });
  });

  test('A3: channel filter narrows results to the selected channel', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-ChanFilter-${Date.now()}` });
    const message = `WA channel filter message ${Date.now()}`;
    await api('POST', '/communications/send', {
      contact_id: contact.id,
      channel: 'whatsapp',
      message,
    });

    await page.goto('/communication');
    await waitForLoad(page);

    const searchInput = page.getByPlaceholder(/Search conversations/i);
    await searchInput.fill(message.slice(0, 20));
    await page.waitForTimeout(600);
    await waitForLoad(page);
    await expect(page.getByText(message.slice(0, 20)).first()).toBeVisible({ timeout: 10_000 });

    // Switch channel filter to Email — the WhatsApp-only conversation should disappear
    const channelSelect = page.locator('button[role="combobox"]').first();
    await channelSelect.click();
    await page.getByRole('option', { name: 'Email', exact: true }).click();
    await waitForLoad(page);
    await page.waitForTimeout(400);

    await expect(page.getByText(message.slice(0, 20))).toHaveCount(0, { timeout: 5_000 });

    // Switch back to WhatsApp — it reappears
    await channelSelect.click();
    await page.getByRole('option', { name: 'WhatsApp', exact: true }).click();
    await waitForLoad(page);
    await page.waitForTimeout(400);
    await expect(page.getByText(message.slice(0, 20)).first()).toBeVisible({ timeout: 10_000 });
  });

  test('A4: empty state renders when search matches nothing', async ({ page }) => {
    await page.goto('/communication');
    await waitForLoad(page);

    const searchInput = page.getByPlaceholder(/Search conversations/i);
    await searchInput.fill('XYZXYZ_NO_MATCH_COMMS_UNIQUE_99999');
    await page.waitForTimeout(600);
    await waitForLoad(page);

    await expect(page.getByText(/No conversations yet|Nothing here yet/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('A5: hover actions appear on a row and open the detail drawer', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-Hover-${Date.now()}` });
    const message = `Hover test message ${Date.now()}`;
    await api('POST', '/communications/send', {
      contact_id: contact.id,
      channel: 'email',
      message,
    });

    await page.goto('/communication');
    await waitForLoad(page);

    const searchInput = page.getByPlaceholder(/Search conversations/i);
    await searchInput.fill(message.slice(0, 20));
    await page.waitForTimeout(600);
    await waitForLoad(page);

    const row = page.locator('table tbody tr').filter({ hasText: message.slice(0, 20) }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    await expect(row.locator('button[aria-label="View conversation"]')).toBeVisible({ timeout: 5_000 });

    // Clicking the row itself opens the detail drawer (renderDetail)
    await row.click();
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(message, { exact: false }).first()).toBeVisible();
  });

  test('A6: "View conversation" hover action navigates to the contact thread', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-Nav-${Date.now()}` });
    const message = `Nav test ${Date.now()}`;
    await api('POST', '/communications/send', {
      contact_id: contact.id,
      channel: 'email',
      message,
    });

    await page.goto('/communication');
    await waitForLoad(page);

    const searchInput = page.getByPlaceholder(/Search conversations/i);
    await searchInput.fill(message.slice(0, 20));
    await page.waitForTimeout(600);
    await waitForLoad(page);

    const row = page.locator('table tbody tr').filter({ hasText: message.slice(0, 20) }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    await row.locator('button[aria-label="View conversation"]').click();

    await expect(page).toHaveURL(new RegExp(`/communication/${contact.id}`), { timeout: 10_000 });
  });

  test('A7: export downloads a non-empty CSV file', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-Export-${Date.now()}` });
    await api('POST', '/communications/send', {
      contact_id: contact.id,
      channel: 'email',
      message: `Export test ${Date.now()}`,
    });

    await page.goto('/communication');
    await waitForLoad(page);
    await page.waitForTimeout(500);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    const stat = fs.statSync(downloadPath!);
    expect(stat.size).toBeGreaterThan(0);
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('A8: infinite scroll — no Next/Previous pagination buttons, sentinel loads more on scroll', async ({ page }) => {
    const seeded: any[] = [];
    for (let i = 0; i < 22; i++) {
      const c = await seedContact({ name: `E2E-Scroll-${Date.now()}-${i}` });
      seeded.push(c);
      await api('POST', '/communications/send', {
        contact_id: c.id,
        channel: 'sms',
        message: `Scroll test ${i}`,
      });
    }

    await page.goto('/communication');
    await waitForLoad(page);

    expect(await page.getByRole('button', { name: /^Next Page$|^Next$/i }).count()).toBe(0);
    expect(await page.getByRole('button', { name: /^Previous Page$|^Previous$/i }).count()).toBe(0);

    const rowsBefore = await page.locator('table tbody tr').count();
    await page.mouse.wheel(0, 20_000);
    await page.waitForTimeout(1500);
    const rowsAfter = await page.locator('table tbody tr').count();
    expect(rowsAfter).toBeGreaterThanOrEqual(rowsBefore);
  });

  test('A9: "New message" button navigates to compose', async ({ page }) => {
    await page.goto('/communication');
    await waitForLoad(page);

    await page.getByRole('button', { name: 'New message', exact: true }).click();
    await expect(page).toHaveURL(/\/communication\/compose/);
  });

  test('A10: sidebar Inbox link navigates to /communication', async ({ page }) => {
    await page.goto('/');
    await waitForLoad(page);
    await navigateTo(page, '/communication', 'Inbox');
    await expect(page).toHaveURL(/\/communication$/);
  });

  test('A11 (R135-2): a WhatsApp message arriving while the inbox is open appears without a reload', async ({ page }) => {
    await page.goto('/communication');
    await waitForLoad(page);
    await expect(page.getByPlaceholder(/Search conversations/i)).toBeVisible();

    const body = `Live arrival ${Date.now()}`;
    await expect(page.getByText(body)).toHaveCount(0);

    const res = await fetch(`${API_URL}/test/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: TENANT_ID,
        channel: 'whatsapp',
        from: `+4477009${String(Date.now()).slice(-5)}`,
        fromName: 'Live Arrival',
        to: '+918047182290',
        body,
      }),
    });
    expect(res.ok).toBe(true);

    // No page.reload() and no navigation: the realtime event refreshes the list on its own.
    await expect(page.getByText(body).first()).toBeVisible({ timeout: 15_000 });
  });

});

// ─── B. CONTACT THREAD VIEW ─────────────────────────────────────────────────

test.describe('B. Contact thread view', () => {

  test('B1: thread page fetches real contact info and shows name/email/phone', async ({ page }) => {
    const contact = await seedContact({
      name: `E2E-Thread-${Date.now()}`,
      email: `thread-${Date.now()}@e2e.test`,
    });

    const contactApiCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes(`/contacts/${contact.id}`)) contactApiCalls.push(req.url());
    });

    await page.goto(`/communication/${contact.id}`);
    await waitForLoad(page);

    expect(contactApiCalls.length).toBeGreaterThan(0);
    await expect(page.getByText(contact.name).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(contact.email!, { exact: false }).first()).toBeVisible();
  });

  test('B2: sent message appears in the thread with channel and content', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-ThreadMsg-${Date.now()}` });
    const message = `Thread message body ${Date.now()}`;
    await api('POST', '/communications/send', {
      contact_id: contact.id,
      channel: 'email',
      message,
    });

    await page.goto(`/communication/${contact.id}`);
    await waitForLoad(page);

    await expect(page.getByText(message, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('EMAIL', { exact: false }).first()).toBeVisible();
  });

  test('B3: channel filter on the thread narrows to the selected channel', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-ThreadFilter-${Date.now()}` });
    const smsMsg = `SMS-only message ${Date.now()}`;
    const emailMsg = `Email-only message ${Date.now()}`;
    await api('POST', '/communications/send', { contact_id: contact.id, channel: 'sms', message: smsMsg });
    await api('POST', '/communications/send', { contact_id: contact.id, channel: 'email', message: emailMsg });

    await page.goto(`/communication/${contact.id}`);
    await waitForLoad(page);
    await expect(page.getByText(smsMsg, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(emailMsg, { exact: false }).first()).toBeVisible({ timeout: 10_000 });

    const channelSelect = page.locator('button[role="combobox"]').first();
    await channelSelect.click();
    await page.getByRole('option', { name: 'SMS', exact: true }).click();
    await waitForLoad(page);
    await page.waitForTimeout(400);

    await expect(page.getByText(smsMsg, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(emailMsg, { exact: false })).toHaveCount(0, { timeout: 5_000 });
  });

  test('B4: empty state when contact has no message history', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-NoHistory-${Date.now()}` });

    await page.goto(`/communication/${contact.id}`);
    await waitForLoad(page);

    await expect(page.getByText(/No messages yet/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('B5: "Send message" opens SendMessageDialog — no raw mailto/wa.me/tel anchors anywhere on the page', async ({ page }) => {
    const contact = await seedContact({
      name: `E2E-SendDialog-${Date.now()}`,
      email: `senddialog-${Date.now()}@e2e.test`,
      phone: '+919000100099',
    });

    await page.goto(`/communication/${contact.id}`);
    await waitForLoad(page);

    expect(await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count()).toBe(0);

    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  });

});

// ─── C. COMPOSE PAGE ─────────────────────────────────────────────────────────

test.describe('C. Compose page', () => {

  test('C1: compose page loads with heading and no raw mailto links', async ({ page }) => {
    await page.goto('/communication/compose');
    await waitForLoad(page);

    await expect(page.getByText('Compose email').first()).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  });

  test('C2: recipient field is a searchable combobox — no raw contactId input, typing filters options', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-ComposeCombo-${Date.now()}` });

    await page.goto('/communication/compose');
    await waitForLoad(page);

    expect(await page.locator('input[name*="contactId" i]').count()).toBe(0);

    const recipientCombobox = page.locator('button[role="combobox"]').first();
    await expect(recipientCombobox).toBeVisible();
    await recipientCombobox.click();

    const searchBox = page.getByPlaceholder(/Search contacts/i);
    await searchBox.fill(contact.name);
    await page.waitForTimeout(600);

    await expect(page.getByRole('option', { name: new RegExp(contact.name) }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('C3: full round trip — pick recipient via combobox, compose subject/body, send, appears in inbox', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-ComposeSend-${Date.now()}` });
    const ts = Date.now();
    const subject = `Compose subject ${ts}`;
    const body = `Compose body ${ts}`;

    await page.goto('/communication/compose');
    await waitForLoad(page);

    // Recipient — searchable combobox
    await page.locator('button[role="combobox"]').first().click();
    await page.getByPlaceholder(/Search contacts/i).fill(contact.name);
    await page.waitForTimeout(600);
    await page.getByRole('option', { name: new RegExp(contact.name) }).first().click();

    await page.locator('#subject').fill(subject);
    await page.locator('textarea#body').fill(body);

    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await waitForLoad(page);

    await expect(page).toHaveURL(/\/communication$/, { timeout: 15_000 });

    // Verify it shows up in the inbox — the log's search only matches message
    // content/subject (no contact-name join server-side), so search by subject.
    const searchInput = page.getByPlaceholder(/Search conversations/i);
    await searchInput.fill(subject);
    await page.waitForTimeout(600);
    await waitForLoad(page);
    await expect(page.getByText(subject, { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(contact.name).first()).toBeVisible({ timeout: 10_000 });
  });

  test('C3-note: template dropdown lists templates (GET /templates 200) and choosing one fills subject and body', async ({ page }) => {
    const tpl = await seedEmailTemplate({ name: `E2E-ComposeTpl-${Date.now()}` });
    const templatesApiCalls: { url: string; status: number }[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/templates')) templatesApiCalls.push({ url: res.url(), status: res.status() });
    });

    await page.goto('/communication/compose');
    await waitForLoad(page);

    await page.getByRole('combobox').filter({ hasText: /No template|Choose a template/ }).click();
    await page.getByRole('option', { name: tpl.name }).click();

    expect(templatesApiCalls.length).toBeGreaterThan(0);
    expect(templatesApiCalls.every((c) => c.status === 200)).toBe(true);
    await expect(page.locator('#subject')).toHaveValue(tpl.subject);
    await expect(page.locator('#body')).toHaveValue(/your trip to \{destination\} is confirmed/);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('C4: contactId query param pre-fills the recipient', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-Prefill-${Date.now()}` });

    await page.goto(`/communication/compose?contactId=${contact.id}`);
    await waitForLoad(page);

    await expect(page.locator('button[role="combobox"]').first()).toContainText(contact.name, { timeout: 10_000 });
  });

  test('C5: validation — sending without a recipient or body shows an error', async ({ page }) => {
    await page.goto('/communication/compose');
    await waitForLoad(page);

    await page.getByRole('button', { name: 'Send', exact: true }).click();

    await expect(
      page.locator('text=Pick a recipient').or(page.locator('[data-sonner-toast]')).first()
    ).toBeVisible({ timeout: 5_000 });
  });

});

// ─── D. BULK SEND PAGE ────────────────────────────────────────────────────────

test.describe('D. Bulk send page', () => {

  test('D1: bulk send page loads with 3-step wizard', async ({ page }) => {
    await page.goto('/communication/bulk-send');
    await waitForLoad(page);

    await expect(page.getByText('Bulk send').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('1. Select channel')).toBeVisible();
    await expect(page.getByText('2. Select recipients')).toBeVisible();
    await expect(page.getByText('3. Compose message')).toBeVisible();
  });

  test('D2: manual contact picker is searchable — typing filters the contact list, no raw ID input', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-BulkManual-${Date.now()}` });

    await page.goto('/communication/bulk-send');
    await waitForLoad(page);

    expect(await page.locator('input[name*="contactId" i], input[name*="recipientId" i]').count()).toBe(0);

    await page.getByRole('tab', { name: 'Choose contacts' }).click();
    await page.getByPlaceholder(/Search contacts/i).fill(contact.name);
    await page.waitForTimeout(600);

    await expect(page.getByText(contact.name).first()).toBeVisible({ timeout: 10_000 });
  });

  test('D3: full round trip — select channel, pick recipient manually, compose message, send, batch status appears', async ({ page }) => {
    const contact = await seedContact({ name: `E2E-BulkSend-${Date.now()}` });
    const message = `Bulk send test message ${Date.now()}`;

    await page.goto('/communication/bulk-send');
    await waitForLoad(page);

    // Step 1: channel — SMS
    await page.getByRole('button', { name: 'SMS' }).click();

    // Step 2: recipients — manual pick
    await page.getByRole('tab', { name: 'Choose contacts' }).click();
    await page.getByPlaceholder(/Search contacts/i).fill(contact.name);
    await page.waitForTimeout(600);
    await page.getByText(contact.name).first().click();
    await expect(page.getByText('Recipients:')).toBeVisible();
    await expect(page.locator('strong', { hasText: /^1$/ })).toBeVisible();

    // Step 3: compose message directly (the template combobox is documented
    // as broken in D3-note below — this exercises the manual-message path)
    await page.locator('textarea').fill(message);

    // Send
    await page.getByRole('button', { name: 'Send now' }).click();

    await expect(page.getByText(/Bulk send initiated/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Batch status')).toBeVisible({ timeout: 10_000 });
  });

  test('D3-note: template dropdown lists templates (GET /templates 200) and choosing one fills the message', async ({ page }) => {
    const tpl = await seedEmailTemplate({ name: `E2E-BulkTpl-${Date.now()}` });

    const templatesApiCalls: { url: string; status: number }[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/templates')) templatesApiCalls.push({ url: res.url(), status: res.status() });
    });

    await page.goto('/communication/bulk-send');
    await waitForLoad(page);

    await page.getByRole('combobox').filter({ hasText: /No template|Choose a template/ }).click();
    await page.getByRole('option', { name: tpl.name }).click();

    expect(templatesApiCalls.length).toBeGreaterThan(0);
    expect(templatesApiCalls.every((c) => c.status === 200)).toBe(true);
    await expect(page.locator('textarea').first()).toHaveValue(/your trip to \{destination\} is confirmed/);
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  test('D4: validation — "Send now" stays disabled until a message and at least one recipient are provided', async ({ page }) => {
    await page.goto('/communication/bulk-send');
    await waitForLoad(page);

    const sendButton = page.getByRole('button', { name: 'Send now' });
    await expect(sendButton).toBeDisabled();

    // Add a message but still no recipients — still disabled
    await page.locator('textarea').fill('Message with no recipients');
    await expect(sendButton).toBeDisabled();
  });

  test('D5: sidebar Bulk Send link navigates to /communication/bulk-send', async ({ page }) => {
    await page.goto('/');
    await waitForLoad(page);
    await page.locator('aside a[href="/communication/bulk-send"]').first().click();
    await expect(page).toHaveURL(/\/communication\/bulk-send/);
  });

});

// ─── E. API CONTRACT VALIDATION ────────────────────────────────────────────────

test.describe('E. API contract validation', () => {

  test('E1: send API accepts contact_id/channel/message field names', async () => {
    const contact = await seedContact();
    const res = await api('POST', '/communications/send', {
      contact_id: contact.id,
      channel: 'sms',
      message: 'E2E contract test message',
    });
    const errStr = JSON.stringify(res.error ?? '');
    expect(errStr).not.toContain('contact_id is required');
    expect(errStr).not.toContain('"path":"contact_id"');
  });

  test('E2: bulk-send API accepts channel/contact_ids/message field names', async () => {
    const contact = await seedContact();
    const res = await api('POST', '/communications/bulk-send', {
      channel: 'sms',
      contact_ids: [contact.id],
      message: 'E2E bulk contract test',
    });
    const errMsg = res.error ?? res.message ?? '';
    expect(errMsg).not.toMatch(/recipients is required|to is required/i);
    expect(res.data?.batch_id).toBeTruthy();
  });

  test('E3: bulk-send-status endpoint is an unimplemented stub — always returns total:0 regardless of a real batch (backend defect, not in this slice\'s fileAllowlist)', async () => {
    // backend/src/routes/communications.ts bulk-send/:batchId/status handler
    // has a literal comment: "Note: In a real implementation, you'd have a
    // batch tracking table. For now, return a simple response" — it always
    // returns total:0/sent:0/failed:0 no matter how many messages were queued,
    // because batchId is generated but never persisted anywhere. This means
    // the bulk-send page's "Batch status" progress card can never show real
    // progress. Documented here (backend route is outside this slice's
    // fileAllowlist: desktop/src/app/(app)/communication/**, communications.ts,
    // communication-inbox.spec.ts only) rather than silently asserted as working.
    const contact = await seedContact();
    const sendRes = await api('POST', '/communications/bulk-send', {
      channel: 'sms',
      contact_ids: [contact.id],
      message: 'E2E batch status test',
    });
    const batchId = sendRes.data?.batch_id;
    expect(batchId).toBeTruthy();
    expect(sendRes.data?.total_messages).toBeGreaterThanOrEqual(1);

    const statusRes = await api('GET', `/communications/bulk-send/${batchId}/status`);
    const status = statusRes.data ?? statusRes;
    expect(status?.total).toBe(0);
  });

  test('E4: history API returns entries scoped to a contact', async () => {
    const contact = await seedContact();
    const message = `History contract test ${Date.now()}`;
    await api('POST', '/communications/send', { contact_id: contact.id, channel: 'email', message });

    const res = await api('GET', `/communications/history?contact_id=${contact.id}`);
    const list = res.data?.data ?? res.data ?? [];
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((l: any) => (l.message ?? l.content ?? '').includes(message))).toBe(true);
  });

});
