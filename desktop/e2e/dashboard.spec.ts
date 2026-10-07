import { test, expect } from './fixtures';
import { waitForLoad, navigateTo } from './helpers/auth';
import { seedStickyNote, seedBookmark, seedContact, seedLead, api } from './helpers/api-seed';

test.describe('Dashboard', () => {
  test('root path redirects to /dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    await waitForLoad(page);
    await expect(page.locator('text=Dashboard').first()).toBeVisible();
  });

  test('renders KPI tiles with live data and links to their source pages', async ({ page }) => {
    const contact = await seedContact();
    await seedLead(contact.id, { title: 'Dashboard KPI Lead', status: 'new' });

    await page.goto('/dashboard');
    await waitForLoad(page);

    await expect(page.locator('text=New Leads').first()).toBeVisible();
    await expect(page.locator('text=Revenue (Month)').first()).toBeVisible();
    await expect(page.locator('text=Bookings').first()).toBeVisible();
    await expect(page.locator('text=Collection Rate').first()).toBeVisible();

    // KPI tiles are links that route to their source feature.
    const leadsTile = page.locator('a[href="/leads"]').first();
    await expect(leadsTile).toBeVisible();
    await leadsTile.click();
    await page.waitForURL('**/leads*', { timeout: 15_000 });
    await expect(page.locator('text=Leads').first()).toBeVisible();
  });

  test('Quick Add menu offers every creation form and navigates', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);

    await page.getByRole('button', { name: 'Quick Add' }).click();
    for (const href of ['/leads/new', '/contacts/new', '/tasks', '/invoices/new', '/itineraries/new']) {
      await expect(page.locator(`a[role="menuitem"][href^="${href}"]`).first()).toBeVisible();
    }

    await page.getByRole('menuitem', { name: 'New contact' }).click();
    await page.waitForURL('**/contacts/new*', { timeout: 15_000 });
  });

  test('date range changes the KPI figures and shows no placeholder numbers', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);
    await expect(page.getByText('Revenue (Month)')).toBeVisible();

    await page.getByRole('combobox', { name: 'Date range' }).click();
    await page.getByRole('option', { name: 'This Year' }).click();
    // Six report queries run for the new window; the KPI row shows skeletons until they all return.
    await expect(page.getByText('Revenue (Year)')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('87%')).toHaveCount(0);
  });

  test('sidebar navigation links resolve to real routes (no dead links like /planner)', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);

    // The Calendar nav item must point at /calendar, never the retired /planner route.
    const calendarLink = page.locator('aside a', { hasText: 'Calendar' }).first();
    await expect(calendarLink).toHaveAttribute('href', '/calendar');
    await expect(page.locator('aside a[href="/planner"]')).toHaveCount(0);

    const coreRoutes = [
      { href: '/leads', text: 'Leads' },
      { href: '/contacts', text: 'Contacts' },
      { href: '/invoices', text: 'Invoices' },
      { href: '/tasks', text: 'Tasks' },
      { href: '/calendar', text: 'Calendar' },
    ];
    for (const { href, text } of coreRoutes) {
      await navigateTo(page, href, text);
      await page.goto('/dashboard');
      await waitForLoad(page);
    }
  });

  test('sticky notes widget: create, edit, change color, and delete a note (full round trip)', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);

    await expect(page.locator('text=Quick Notes').first()).toBeVisible();

    // Create
    await page.getByRole('button', { name: 'Add note' }).click();
    const textarea = page.locator('textarea[placeholder="Type your note..."]');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('E2E dashboard sticky note');
    await textarea.blur();

    // Assert it persisted (visible as static text after blur, and survives reload).
    await expect(page.locator('text=E2E dashboard sticky note').first()).toBeVisible();
    await page.reload();
    await waitForLoad(page);
    await expect(page.locator('text=E2E dashboard sticky note').first()).toBeVisible();

    // Edit
    await page.locator('text=E2E dashboard sticky note').first().click();
    const editTextarea = page.locator('textarea[placeholder="Type your note..."]');
    await editTextarea.fill('E2E dashboard sticky note EDITED');
    await editTextarea.blur();
    await expect(page.locator('text=E2E dashboard sticky note EDITED').first()).toBeVisible();
    await page.reload();
    await waitForLoad(page);
    await expect(page.locator('text=E2E dashboard sticky note EDITED').first()).toBeVisible();

    // Delete
    const noteCard = page.locator('div', { hasText: 'E2E dashboard sticky note EDITED' }).last();
    await noteCard.hover();
    await page.locator('button[aria-label="Delete note"]').first().click();
    await expect(page.locator('text=E2E dashboard sticky note EDITED')).toHaveCount(0);
    await page.reload();
    await waitForLoad(page);
    await expect(page.locator('text=E2E dashboard sticky note EDITED')).toHaveCount(0);
  });

  test('sticky notes widget shows pre-seeded notes', async ({ page }) => {
    const note = await seedStickyNote({ content: `Pre-seeded dashboard note ${Date.now()}` });

    await page.goto('/dashboard');
    await waitForLoad(page);
    await expect(page.locator(`text=${note.content}`).first()).toBeVisible();

    await api('DELETE', `/sticky-notes/${note.id}`);
  });
});

test.describe('Bookmarks', () => {
  // Bookmarks are capped at 50 per user and /test/reset only wipes the
  // master DB (not the tenant DB bookmarks live in), so specs must clean up
  // their own seeded bookmarks rather than relying on a shared reset.
  const createdBookmarkIds: string[] = [];

  async function trackedBookmark(entityType: string, entityId: string) {
    const bm = await seedBookmark(entityType, entityId);
    createdBookmarkIds.push(bm.id);
    return bm;
  }

  test.afterEach(async () => {
    await Promise.all(createdBookmarkIds.splice(0).map((id) => api('DELETE', `/bookmarks/${id}`)));
  });

  test('lists bookmarked entities with type badges and bookmarked date', async ({ page }) => {
    const contact = await seedContact({ name: `Bookmark Target Contact ${Date.now()}` });
    const lead = await seedLead(contact.id, { title: `Bookmark Target Lead ${Date.now()}` });
    await trackedBookmark('contact', contact.id);
    await trackedBookmark('lead', lead.id);

    await page.goto('/bookmarks');
    await waitForLoad(page);

    await expect(page.locator('text=Bookmarks').first()).toBeVisible();
    await expect(page.locator(`text=${contact.name}`).first()).toBeVisible();
    await expect(page.locator(`text=${lead.title}`).first()).toBeVisible();
    await expect(page.getByText('Contact', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Lead', { exact: true }).first()).toBeVisible();
  });

  test('search narrows the bookmark list', async ({ page }) => {
    const contactA = await seedContact({ name: `Findable Bookmark ${Date.now()}` });
    const contactB = await seedContact({ name: `OtherEntity Bookmark ${Date.now()}` });
    await trackedBookmark('contact', contactA.id);
    await trackedBookmark('contact', contactB.id);

    await page.goto('/bookmarks');
    await waitForLoad(page);

    const searchInput = page.getByPlaceholder('Search bookmarks...');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Findable Bookmark');
    await page.waitForTimeout(500); // debounce
    await waitForLoad(page);

    await expect(page.locator(`text=${contactA.name}`).first()).toBeVisible();
    await expect(page.locator(`text=${contactB.name}`)).toHaveCount(0);
  });

  test('empty state renders when a search matches nothing', async ({ page }) => {
    await page.goto('/bookmarks');
    await waitForLoad(page);

    const searchInput = page.getByPlaceholder('Search bookmarks...');
    await searchInput.fill('zzz-no-such-bookmark-xyz');
    await page.waitForTimeout(500);
    await waitForLoad(page);

    await expect(page.locator('text=No bookmarks yet').first()).toBeVisible();
  });

  test('opening a bookmark row navigates to the source entity', async ({ page }) => {
    const contact = await seedContact({ name: `Navigable Bookmark ${Date.now()}` });
    await trackedBookmark('contact', contact.id);

    await page.goto('/bookmarks');
    await waitForLoad(page);

    await page.locator(`text=${contact.name}`).first().click();
    await page.waitForURL(`**/contacts/${contact.id}*`, { timeout: 15_000 });
  });

  test('removing a bookmark deletes it and removes it from the list', async ({ page }) => {
    const contact = await seedContact({ name: `Removable Bookmark ${Date.now()}` });
    const bookmark = await seedBookmark('contact', contact.id); // removed via UI, not afterEach

    await page.goto('/bookmarks');
    await waitForLoad(page);

    const row = page.locator('tr', { hasText: contact.name });
    await expect(row).toBeVisible();
    await row.hover();
    await row.getByRole('button', { name: 'Remove bookmark' }).click();

    await expect(page.locator(`text=${contact.name}`)).toHaveCount(0);
    await page.reload();
    await waitForLoad(page);
    await expect(page.locator(`text=${contact.name}`)).toHaveCount(0);
    void bookmark; // already removed through the UI above
  });

  test('export downloads a non-empty CSV file', async ({ page }) => {
    const contact = await seedContact({ name: `Export Bookmark ${Date.now()}` });
    await trackedBookmark('contact', contact.id);

    await page.goto('/bookmarks');
    await waitForLoad(page);
    await expect(page.locator(`text=${contact.name}`).first()).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^bookmarks-.*\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk as Buffer);
    const content = Buffer.concat(chunks).toString('utf-8');
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('Name');
    expect(content).toContain(contact.name);
  });

  test('infinite scroll loads more bookmarks beyond the first page', async ({ page }) => {
    const contacts = await Promise.all(
      Array.from({ length: 25 }, (_, i) => seedContact({ name: `Scroll Bookmark ${Date.now()}-${i}` })),
    );
    for (const c of contacts) {
      await trackedBookmark('contact', c.id);
    }

    await page.goto('/bookmarks');
    await waitForLoad(page);

    const rows = page.locator('tbody tr');
    const initialCount = await rows.count();
    expect(initialCount).toBeGreaterThan(0);

    await page.locator('tbody tr').last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await waitForLoad(page);

    const afterScrollCount = await page.locator('tbody tr').count();
    expect(afterScrollCount).toBeGreaterThan(initialCount);
  });

  test('no raw mailto/wa.me/tel outbound links exist on dashboard or bookmarks pages', async ({ page }) => {
    for (const path of ['/dashboard', '/bookmarks']) {
      await page.goto(path);
      await waitForLoad(page);
      const badAnchors = page.locator('a[href^="mailto:"], a[href^="wa.me:"], a[href^="tel:"], a[href*="wa.me/"]');
      await expect(badAnchors).toHaveCount(0);
    }
  });

  test('no raw entity ID inputs are present on the bookmarks page', async ({ page }) => {
    await page.goto('/bookmarks');
    await waitForLoad(page);
    const idInputs = page.locator('input[name*="Id" i], input[placeholder*="entity id" i]');
    await expect(idInputs).toHaveCount(0);
  });
});
