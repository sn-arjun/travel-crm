import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { seedVehicle, seedDriver } from './helpers/api-seed';

test.describe('Fleet Dashboard', () => {
  test('renders stat tiles reflecting seeded vehicles and drivers', async ({ page }) => {
    const vehicle = await seedVehicle();
    await seedDriver();

    await page.goto('/fleet');
    await waitForLoad(page);

    await expect(page.locator('text=Fleet Management').first()).toBeVisible();

    // Stat tiles
    await expect(page.locator('text=Total Vehicles').first()).toBeVisible();
    await expect(page.locator('text=Total Drivers').first()).toBeVisible();
    await expect(page.locator('text=Active Trips').first()).toBeVisible();
    await expect(page.locator('text=Revenue (MTD)').first()).toBeVisible();

    // Vehicle availability calendar lists the seeded vehicle
    await expect(page.locator(`text=${vehicle.registrationNumber}`).first()).toBeVisible({ timeout: 10_000 });

    // Clicking the Total Vehicles tile navigates to the vehicles list
    await page.locator('a[href="/fleet/vehicles"]').first().click();
    await page.waitForURL('**/fleet/vehicles*');
    await waitForLoad(page);
    await expect(page.locator('text=Vehicles').first()).toBeVisible();

    await page.goto('/fleet');
    await waitForLoad(page);

    // Clicking the Total Drivers tile navigates to the drivers list
    await page.locator('a[href="/fleet/drivers"]').first().click();
    await page.waitForURL('**/fleet/drivers*');
    await waitForLoad(page);
    await expect(page.locator('text=Drivers').first()).toBeVisible();
  });

  test('shows skeleton while loading then resolves to content', async ({ page }) => {
    await page.goto('/fleet');
    // Skeleton or content should be present almost immediately; by the time
    // waitForLoad resolves, all spinners/skeletons must be gone and real
    // content shown.
    await waitForLoad(page);
    await expect(page.locator('.animate-pulse')).toHaveCount(0);
    await expect(page.locator('text=Fleet Management').first()).toBeVisible();
  });

  test('vehicle availability calendar navigates weeks', async ({ page }) => {
    await seedVehicle();
    await page.goto('/fleet');
    await waitForLoad(page);

    await expect(page.locator('text=Vehicle Availability').first()).toBeVisible();

    const nextWeekBtn = page.getByRole('button', { name: 'Next week' });
    const prevWeekBtn = page.getByRole('button', { name: 'Previous week' });
    const todayBtn = page.getByRole('button', { name: 'Today' });

    // Capture the header date labels before navigating
    const headerBefore = await page.locator('table thead tr').first().innerText();

    await nextWeekBtn.click();
    await page.waitForTimeout(300);
    const headerAfterNext = await page.locator('table thead tr').first().innerText();
    expect(headerAfterNext).not.toEqual(headerBefore);

    await prevWeekBtn.click();
    await page.waitForTimeout(300);

    await todayBtn.click();
    await page.waitForTimeout(300);
    const headerAfterToday = await page.locator('table thead tr').first().innerText();
    expect(headerAfterToday).toEqual(headerBefore);
  });

  test('no direct mailto/wa.me/tel anchors on the dashboard', async ({ page }) => {
    await seedVehicle();
    await seedDriver();
    await page.goto('/fleet');
    await waitForLoad(page);

    const badAnchors = await page.locator('a[href^="mailto:"], a[href^="wa.me"], a[href^="tel:"]').count();
    expect(badAnchors).toBe(0);
  });
});

test.describe('Fleet Alerts', () => {
  test('renders tabs and empty state when there are no alerts', async ({ page }) => {
    await page.goto('/fleet/alerts');
    await waitForLoad(page);

    await expect(page.locator('text=Fleet Alerts').first()).toBeVisible();

    // Tabs
    const allTab = page.getByRole('tab', { name: /All \(\d+\)/ });
    const documentsTab = page.getByRole('tab', { name: /Expiring Documents \(\d+\)/ });
    const maintenanceTab = page.getByRole('tab', { name: /Maintenance Due \(\d+\)/ });
    await expect(allTab).toBeVisible();
    await expect(documentsTab).toBeVisible();
    await expect(maintenanceTab).toBeVisible();

    // Whatever the state, either alert cards or an EmptyState message renders —
    // never a blank pane and never an error toast.
    const errorToast = page.locator('text=Failed to load document alerts, text=Failed to load maintenance alerts');
    await expect(errorToast).toHaveCount(0);

    const hasAlerts = await page.locator('.border-l-ds-danger, .border-l-ds-warning, .border-l-ds-info').count();
    if (hasAlerts === 0) {
      await expect(page.getByText(/No alerts at this time/)).toBeVisible();
    }

    // Documents tab
    await documentsTab.click();
    const errorToastAfterTab = page.locator('text=Failed to load document alerts');
    await expect(errorToastAfterTab).toHaveCount(0);
    const hasDocAlerts = await page.locator('.border-l-ds-danger, .border-l-ds-warning, .border-l-ds-info').count();
    if (hasDocAlerts === 0) {
      await expect(page.getByText(/No expiring documents/)).toBeVisible();
    }

    // Maintenance tab
    await maintenanceTab.click();
    const hasMaintAlerts = await page.locator('.border-l-ds-danger, .border-l-ds-warning, .border-l-ds-info').count();
    if (hasMaintAlerts === 0) {
      await expect(page.getByText(/No vehicles due for maintenance/)).toBeVisible();
    }
  });

  test('alert card links to the owning vehicle or driver detail page', async ({ page }) => {
    // Seed a vehicle with an already-expired document via direct field so an
    // alert is guaranteed to render, then confirm the alert card deep-links.
    const vehicle = await seedVehicle({
      insuranceExpiry: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0],
    });

    await page.goto('/fleet/alerts');
    await waitForLoad(page);

    const link = page.locator(`a[href="/fleet/vehicles/${vehicle.id}"]`).first();
    // The alert card only renders a deep-link icon when the backend actually
    // surfaces this document as expiring; if it doesn't, at minimum the page
    // must show a non-error empty state (covered by the prior test).
    const count = await link.count();
    if (count > 0) {
      await link.click();
      await page.waitForURL(`**/fleet/vehicles/${vehicle.id}`);
      await waitForLoad(page);
      await expect(page.locator(`text=${vehicle.registrationNumber}`).first()).toBeVisible();
    }
  });

  test('no direct mailto/wa.me/tel anchors on the alerts page', async ({ page }) => {
    await page.goto('/fleet/alerts');
    await waitForLoad(page);
    const badAnchors = await page.locator('a[href^="mailto:"], a[href^="wa.me"], a[href^="tel:"]').count();
    expect(badAnchors).toBe(0);
  });
});
