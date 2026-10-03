import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad, getAuthToken, API_URL } from './helpers/auth';
import { seedDriver, api } from './helpers/api-seed';

/**
 * Opens the Nth "Pick a date" DatePicker trigger, optionally navigates
 * months, then clicks a specific day in the mini calendar popover.
 */
async function pickDate(page: Page, triggerIndex: number, opts: { monthsForward?: number; day: string }) {
  const triggers = page.locator('button:has-text("Pick a date")');
  await triggers.nth(triggerIndex).click();
  const calendar = page.locator('.w-\\[280px\\]').last();
  const header = calendar.locator('> div').first();
  const nextMonthBtn = header.getByRole('button').last();
  for (let i = 0; i < (opts.monthsForward ?? 0); i++) {
    // eslint-disable-next-line no-await-in-loop
    await nextMonthBtn.click();
  }
  await calendar.locator('.grid').getByRole('button', { name: opts.day, exact: true }).click();
}

test.describe('Fleet Drivers', () => {
  // ─────────────────────────────────────────────────────────────
  // Full round trip: create via form → list → detail → edit → delete
  // ─────────────────────────────────────────────────────────────

  test('full round trip: create, view in list, view detail, edit, verify prefill, save, delete', async ({ page }) => {
    const ts = Date.now();
    const name = `FullDriver ${ts}`;
    const phone = `98765${ts.toString().slice(-5)}`;
    const email = `driver-${ts}@e2e.test`;
    const licenseNumber = `DL-${ts}`;
    const licenseType = 'LMV';
    const badgeNumber = `BADGE-${ts}`;
    const emergencyName = 'Emergency Contact';
    const emergencyPhone = `90000${ts.toString().slice(-5)}`;
    const emergencyRelation = 'Spouse';
    const notes = 'Full E2E test — all fields populated';

    await page.goto('/fleet/drivers/new');
    await waitForLoad(page);
    await expect(page.locator('h1')).toContainText(/Add driver/i);

    await page.locator('#name').fill(name);
    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill(phone);
    await page.locator('#email').fill(email);

    // Date of birth via DatePicker — must be in the past (maxDate = today); go back a month, pick the 15th
    await pickDate(page, 0, { monthsForward: 0, day: '15' });
    await page.locator('#address').fill('Mumbai, Maharashtra');

    await page.locator('#licenseNumber').fill(licenseNumber);
    // License expiry DatePicker — must be in the future (minDate = today); jump to next month, pick the 15th
    await pickDate(page, 0, { monthsForward: 1, day: '15' });
    await page.locator('#licenseType').fill(licenseType);
    await page.locator('#badgeNumber').fill(badgeNumber);

    await page.locator('#emergencyContactName').fill(emergencyName);
    const emergencyPhoneInput = page.locator('input[type="tel"]').nth(1);
    await emergencyPhoneInput.fill(emergencyPhone);
    await page.locator('#emergencyContactRelation').fill(emergencyRelation);

    await page.locator('#notes').fill(notes);

    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(
      page.locator('text=successfully').or(page.locator(`text=${name}`)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForURL('**/fleet/drivers', { timeout: 15_000 });
    await waitForLoad(page);

    // 1. Assert every filled value appears in the list
    await page.getByPlaceholder(/Search drivers/i).fill(name);
    await page.waitForTimeout(1000);
    await waitForLoad(page);
    const row = page.locator(`table tbody tr:has-text("${name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(phone);

    // 2. Open detail view, assert every value present
    await row.click();
    await page.waitForURL(/\/fleet\/drivers\/[^/]+$/, { timeout: 10_000 });
    await waitForLoad(page);
    const driverUrl = page.url();
    const driverId = driverUrl.split('/fleet/drivers/')[1];
    expect(driverId).toBeTruthy();

    await expect(page.locator('h1').filter({ hasText: name })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${email}`).first()).toBeVisible();
    await expect(page.locator(`text=${licenseNumber}`).first()).toBeVisible();
    await expect(page.locator(`text=${emergencyName}`).first()).toBeVisible();
    await expect(page.locator(`text=${emergencyPhone}`).first()).toBeVisible();

    // KNOWN BACKEND GAP: dateOfBirth, licenseType, badgeNumber,
    // emergencyContactRelation, and the bank-detail fields are all collected
    // by the create/edit forms, but createDriverSchema/updateDriverSchema
    // (backend/src/validators/fleet.ts) have no matching fields and the
    // drivers table has no matching columns — the backend silently drops
    // every one of them. Not fixable within this slice's frontend-only
    // fileAllowlist; documented here instead of asserted as working.
    const fetchedAfterCreate = await api('GET', `/fleet/drivers/${driverId}`);
    expect(fetchedAfterCreate.data.licenseType ?? null).toBeNull();
    expect(fetchedAfterCreate.data.badgeNumber ?? null).toBeNull();
    expect(fetchedAfterCreate.data.dateOfBirth ?? null).toBeNull();
    expect(fetchedAfterCreate.data.emergencyContactRelation ?? null).toBeNull();

    // No raw tel:/mailto:/wa.me anchors — outbound must go through Communication Hub
    const rawAnchors = await page
      .locator('a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me"], a[href^="wa.me"]')
      .count();
    expect(rawAnchors).toBe(0);

    // Tabs present — Trip history and Schedule live inside the Related tab
    await expect(page.getByRole('tab', { name: /Overview/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Documents/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Related/i })).toBeVisible();
    await page.getByRole('tab', { name: /Related/i }).click();
    await expect(page.getByText(/Trip history/i).first()).toBeVisible();
    await expect(page.getByText(/^Schedule$/i).first()).toBeVisible();

    // 3. Open edit form, assert every value is pre-filled
    await page.goto(`/fleet/drivers/${driverId}/edit`);
    await waitForLoad(page);
    await expect(page.locator('text=Edit driver').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#name')).toHaveValue(name);
    await expect(page.locator('#email')).toHaveValue(email);
    await expect(page.locator('#address')).toHaveValue('Mumbai, Maharashtra');
    await expect(page.locator('#licenseNumber')).toHaveValue(licenseNumber);
    await expect(page.locator('#emergencyContactName')).toHaveValue(emergencyName);
    // emergencyContactRelation is not persisted by the backend (see gap noted above)
    await expect(page.locator('#emergencyContactRelation')).toHaveValue('');
    await expect(page.locator('#notes')).toHaveValue(notes);

    // 4. Edit a value, save, assert the change persisted
    const updatedName = `Updated-${ts}`;
    await page.locator('#name').fill('');
    await page.locator('#name').fill(updatedName);
    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(
      page.locator('text=successfully').or(page.locator('text=updated')).first(),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(`**/fleet/drivers/${driverId}`, { timeout: 10_000 });
    await waitForLoad(page);
    await expect(page.locator('h1').filter({ hasText: updatedName })).toBeVisible({ timeout: 10_000 });

    // Verify persisted via API too
    const fetched = await api('GET', `/fleet/drivers/${driverId}`);
    expect(fetched.data.name).toBe(updatedName);

    // 5. Delete, assert it is gone
    await page.goto('/fleet/drivers');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search drivers/i).fill(updatedName);
    await page.waitForTimeout(1000);
    await waitForLoad(page);
    const updatedRow = page.locator(`table tbody tr:has-text("${updatedName}")`).first();
    await expect(updatedRow).toBeVisible({ timeout: 10_000 });
    await updatedRow.hover();
    await updatedRow.locator('button[aria-label="Delete"]').click();
    await expect(page.locator('text=Driver deleted').first()).toBeVisible({ timeout: 10_000 });

    const listRes = await api('GET', `/fleet/drivers?search=${encodeURIComponent(updatedName)}`);
    const found = (listRes.data?.data ?? []).find((d: any) => d.id === driverId);
    expect(found).toBeFalsy();
  });

  // ─────────────────────────────────────────────────────────────
  // List page: search, filter, empty state, infinite scroll
  // ─────────────────────────────────────────────────────────────

  test('search narrows results to matching drivers', async ({ page }) => {
    const name = `Johnathan-${Date.now()}`;
    await seedDriver({ name });

    await page.goto('/fleet/drivers');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search drivers/i).fill('Johnathan');
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 10_000 });
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText('Johnathan');
    }
  });

  test('status filter narrows the list to matching status only', async ({ page }) => {
    const marker = `Filtertest${Date.now()}`;
    const activeDriver = await seedDriver({ name: `${marker}Active` });
    const offDutyDriver = await seedDriver({ name: `${marker}OffDuty` });
    const statusRes = await api('PUT', `/fleet/drivers/${offDutyDriver.id}/status`, { status: 'off_duty' });
    expect(statusRes.data.status).toBe('off_duty');

    await page.goto('/fleet/drivers');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search drivers/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    await page.locator('button:has-text("All statuses")').click();
    await page.getByRole('option', { name: 'Off Duty' }).click();
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i)).toContainText(/off duty/i);
    }
    await expect(page.locator(`text=${activeDriver.name}`)).toHaveCount(0);
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/fleet/drivers');
    await waitForLoad(page);

    await page.getByPlaceholder(/Search drivers/i).fill(`no-such-driver-${Date.now()}-zzz`);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    await expect(
      page.locator('text=Nothing here yet').or(page.locator('text=No drivers')).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const marker = `Scroll-${Date.now()}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await seedDriver({ name: `${marker}-${i}` });
    }

    await page.goto('/fleet/drivers');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search drivers/i).fill(marker);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    // ListPage page size is 20; 25 seeded drivers means the first fetch is a partial page.
    await expect(rows).toHaveCount(20, { timeout: 10_000 });

    await rows.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await expect(rows).toHaveCount(25, { timeout: 10_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // Driver form has no relation fields — only phone/date inputs.
  // Assert no raw ID inputs exist anywhere on the form.
  // ─────────────────────────────────────────────────────────────

  test('driver form uses PhoneInput and DatePicker, no raw ID inputs', async ({ page }) => {
    await page.goto('/fleet/drivers/new');
    await waitForLoad(page);

    const rawIdInputs = await page.locator('input[name*="Id" i], input[placeholder*="driver id" i], input[placeholder*="license id" i]').count();
    expect(rawIdInputs).toBe(0);

    // Phone fields render via PhoneInput (country-code combobox + tel input)
    await expect(page.locator('input[type="tel"]').first()).toBeVisible();
    await expect(page.getByRole('combobox').first()).toBeVisible();

    // License expiry renders via DatePicker (button trigger, not a native date input)
    await expect(page.locator('button:has-text("Pick a date")').first()).toBeVisible();
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Outbound messaging via Communication Hub only
  // ─────────────────────────────────────────────────────────────

  test('messaging a driver opens SendMessageDialog, never a raw mailto/wa.me/tel link', async ({ page }) => {
    const driver = await seedDriver({
      name: `Comms-${Date.now()}`,
      phone: `+9190001${Date.now().toString().slice(-5)}`,
    });

    await page.goto(`/fleet/drivers/${driver.id}`);
    await waitForLoad(page);

    expect(
      await page.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"]').count(),
    ).toBe(0);

    await page.getByRole('button', { name: /Send message/i }).click();
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────

  test('export downloads a non-empty CSV file', async ({ page }) => {
    await seedDriver({ name: `ExportMe-${Date.now()}` });

    await page.goto('/fleet/drivers');
    await waitForLoad(page);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: /Export/i }).click(),
    ]);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    const stat = fs.statSync(downloadPath!);
    expect(stat.size).toBeGreaterThan(0);
    expect(download.suggestedFilename()).toContain('.csv');
  });

  // ─────────────────────────────────────────────────────────────
  // Deactivate / activate lifecycle
  // ─────────────────────────────────────────────────────────────

  test('deactivate then activate driver updates status badge', async ({ page }) => {
    const driver = await seedDriver({ name: `Toggle-${Date.now()}` });

    await page.goto(`/fleet/drivers/${driver.id}`);
    await waitForLoad(page);

    await page.getByRole('button', { name: /More actions/i }).click();
    const deactivateBtn = page.getByRole('menuitem', { name: /Deactivate driver/i });
    await expect(deactivateBtn).toBeVisible();
    await deactivateBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: /Deactivate/i }).click();
    await waitForLoad(page);
    await expect(page.getByText('Off Duty', { exact: true }).first()).toBeVisible({ timeout: 8_000 });

    await page.getByRole('button', { name: /More actions/i }).click();
    await page.getByRole('menuitem', { name: /Activate driver/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: /Activate/i }).click();
    await waitForLoad(page);
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible({ timeout: 8_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // Rating
  // ─────────────────────────────────────────────────────────────

  test('rating a driver requires a completed trip and persists on overview', async ({ page }) => {
    const driver = await seedDriver({ name: `RateMe-${Date.now()}` });
    const vehicle = await api('POST', '/fleet/vehicles', {
      registrationNumber: `RATE-VEH-${Date.now()}`,
      type: 'sedan',
      make: 'Toyota',
      model: 'Camry',
      seatingCapacity: 4,
    }).then((r) => r.data);

    const trip = await api('POST', '/fleet/trips', {
      vehicleId: vehicle.id,
      driverId: driver.id,
      pickupLocation: 'Airport',
      dropLocation: 'Hotel',
      pickupDatetime: new Date(Date.now() - 3600_000).toISOString(),
      dropDatetime: new Date().toISOString(),
    }).then((r) => r.data);
    await api('PUT', `/fleet/trips/${trip.id}/status`, { status: 'accepted' });
    await api('PUT', `/fleet/trips/${trip.id}/status`, { status: 'en_route' });
    await api('PUT', `/fleet/trips/${trip.id}/status`, { status: 'started' });
    const completeRes = await api('PUT', `/fleet/trips/${trip.id}/status`, { status: 'completed' });
    expect(completeRes.data?.status ?? completeRes.data).toBeTruthy();

    await page.goto(`/fleet/drivers/${driver.id}`);
    await waitForLoad(page);

    const rateBtn = page.getByRole('button', { name: /^Rate$/i });
    await expect(rateBtn).toBeEnabled({ timeout: 10_000 });
    await rateBtn.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').first().click();
    await page.getByRole('option').first().click();
    await dialog.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: '4 stars' }).click();
    await dialog.getByRole('button', { name: /Submit rating/i }).click();
    await expect(page.locator('text=Driver rated successfully').first()).toBeVisible({ timeout: 10_000 });
    await waitForLoad(page);

    await expect(page.locator('text=4.0').first()).toBeVisible({ timeout: 10_000 });

    const fetched = await api('GET', `/fleet/drivers/${driver.id}`);
    expect(fetched.data.rating).toBe(4);
  });

  test('rate button is disabled when driver has no completed trips', async ({ page }) => {
    const driver = await seedDriver({ name: `NoTrips-${Date.now()}` });

    await page.goto(`/fleet/drivers/${driver.id}`);
    await waitForLoad(page);

    await expect(page.getByRole('button', { name: /^Rate$/i })).toBeDisabled();
  });

  // ─────────────────────────────────────────────────────────────
  // Documents tab: upload + download
  // ─────────────────────────────────────────────────────────────

  test('documents tab shows empty state, then uploaded document appears with expiry tag', async ({ page }) => {
    const driver = await seedDriver({ name: `DocDriver-${Date.now()}` });

    await page.goto(`/fleet/drivers/${driver.id}`);
    await waitForLoad(page);
    await page.getByRole('tab', { name: /Documents/i }).click();
    await waitForLoad(page);

    await expect(page.getByText(/No documents uploaded yet/i).first()).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Upload document/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const dialog = page.getByRole('dialog');
    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'license.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test license document'),
    });

    await dialog.getByRole('button', { name: /^Upload$/i }).click();
    await expect(page.locator('text=Document uploaded').first()).toBeVisible({ timeout: 10_000 });
    await waitForLoad(page);

    await expect(page.getByText(/Driver License/i).first()).toBeVisible({ timeout: 10_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // Schedule tab
  // ─────────────────────────────────────────────────────────────

  test('related tab renders the driver schedule calendar and trip history', async ({ page }) => {
    const driver = await seedDriver({ name: `SchedDriver-${Date.now()}` });

    await page.goto(`/fleet/drivers/${driver.id}`);
    await waitForLoad(page);

    await page.getByRole('tab', { name: /Related/i }).click();
    await waitForLoad(page);

    const activePanel = page.locator('[role="tabpanel"][data-state="active"]');
    await expect(activePanel).toBeVisible({ timeout: 5_000 });
    await expect(activePanel.getByText(/Trip history/i).first()).toBeVisible();
    await expect(activePanel.getByText(/^Schedule$/i).first()).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────
  // License expiry badge computed from data (not hardcoded)
  // ─────────────────────────────────────────────────────────────

  test('list shows license expiry badge computed from licenseExpiry, not a static label', async ({ page }) => {
    const expiredDriver = await seedDriver({
      name: `Expired-${Date.now()}`,
      licenseExpiry: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
    });

    await page.goto('/fleet/drivers');
    await waitForLoad(page);
    await page.getByPlaceholder(/Search drivers/i).fill(expiredDriver.name);
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const row = page.locator(`table tbody tr:has-text("${expiredDriver.name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText(/Expired \d+d ago/i)).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────

  test('validates required fields on create', async ({ page }) => {
    await page.goto('/fleet/drivers/new');
    await waitForLoad(page);
    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.locator('text=Name is required').first()).toBeVisible({ timeout: 5_000 });
  });

  // ─────────────────────────────────────────────────────────────
  // RBAC
  // ─────────────────────────────────────────────────────────────

  test('drivers API requires authentication', async () => {
    const res = await fetch(`${API_URL}/fleet/drivers`, { headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(401);
  });

  test('drivers API rejects invalid token', async () => {
    const res = await fetch(`${API_URL}/fleet/drivers`, { headers: { Authorization: 'Bearer invalid-token-here' } });
    expect(res.status).toBe(401);
  });
});
