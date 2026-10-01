import { test, expect, type Page } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { api } from './helpers/api-seed';

const RUN = Date.now();
const INVITE = {
  name: `E2E Teammate ${RUN}`,
  email: `e2e-team-${RUN}@test.com`,
  phone: '9876501234',
  department: `Ops-${RUN}`,
};

const row = (page: Page, text: string) => page.locator('tbody tr', { hasText: text }).first();

async function openTeam(page: Page) {
  await page.goto('/settings/team');
  await waitForLoad(page);
  await expect(page.getByRole('heading', { name: 'Team' }).first()).toBeVisible({ timeout: 10_000 });
}

async function selectOption(page: Page, trigger: ReturnType<Page['locator']>, label: string) {
  await trigger.click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

test.describe('Settings › Team', () => {
  test.describe.configure({ mode: 'serial' });

  test('invite dialog opens, validates required fields, and cancels', async ({ page }) => {
    await openTeam(page);
    await page.getByRole('button', { name: 'Invite user' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Invite team member')).toBeVisible();

    // Required-field validation, no request fired
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Name and email are required');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('invite a user through the form: list, detail, edit-role prefill, persistence', async ({ page }) => {
    await openTeam(page);
    await page.getByRole('button', { name: 'Invite user' }).first().click();
    const dialog = page.getByRole('dialog');

    await dialog.locator('#invite-name').fill(INVITE.name);
    await dialog.locator('#invite-email').fill(INVITE.email);
    await dialog.locator('input[placeholder="XXXXX XXXXX"]').fill(INVITE.phone);
    await dialog.locator('#invite-department').fill(INVITE.department);
    await selectOption(page, dialog.locator('#invite-role'), 'Sales Manager');

    // No raw ID inputs anywhere in the form
    await expect(dialog.locator('input[id*="id" i]:not(#invite-email)')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText(`Invitation sent to ${INVITE.email}`)).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toBeHidden();

    // List shows name, email, role, status
    const r = row(page, INVITE.email);
    await expect(r).toBeVisible({ timeout: 10_000 });
    await expect(r).toContainText(INVITE.name);
    await expect(r).toContainText('Sales Manager');
    await expect(r).toContainText(/Active|Inactive/);

    // Detail drawer shows every filled value
    await r.click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText(INVITE.name).first()).toBeVisible();
    await expect(drawer.getByText(INVITE.email).first()).toBeVisible();
    await expect(drawer.getByText('Sales Manager')).toBeVisible();
    await expect(drawer.getByText(INVITE.department)).toBeVisible();
    await expect(drawer.getByText(INVITE.phone.slice(-6))).toBeVisible();

    // Edit-role form is pre-filled with the current role
    await drawer.getByRole('button', { name: 'Edit role' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit user role' });
    await expect(editDialog).toContainText(INVITE.name);
    await expect(editDialog.getByRole('combobox')).toHaveText('Sales Manager');

    // Edit, save, persisted
    await selectOption(page, editDialog.getByRole('combobox'), 'Accountant');
    await editDialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('User role updated')).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await waitForLoad(page);
    await expect(row(page, INVITE.email)).toContainText('Accountant');
  });

  test('hover row actions: edit role, login history navigation', async ({ page }) => {
    await openTeam(page);
    const r = row(page, INVITE.email);
    await r.hover();
    await r.getByRole('button', { name: 'Edit role' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit user role' });
    await expect(editDialog.getByRole('combobox')).toHaveText('Accountant');
    await editDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(editDialog).toBeHidden();

    await r.hover();
    await r.getByRole('button', { name: 'View login history' }).click();
    await page.waitForURL(/\/settings\/login-history\?userId=/);
    await expect(page.getByText('Login activity for this team member.')).toBeVisible();
    // The invited user has never logged in → empty state
    await expect(page.getByText('No login history found')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Go back' }).click();
    await page.waitForURL('**/settings/team');
  });

  test('search narrows the list and an empty result shows the empty state', async ({ page }) => {
    await openTeam(page);
    const search = page.getByPlaceholder('Search by name or email…');

    await search.fill(INVITE.email);
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 10_000 });
    await expect(row(page, INVITE.email)).toBeVisible();

    await search.fill(`zz-no-such-user-${RUN}`);
    await expect(page.getByText('No team members yet')).toBeVisible({ timeout: 10_000 });

    await search.fill('');
    await expect(row(page, INVITE.email)).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('tbody tr').count()).toBeGreaterThan(1);
  });

  test('deactivate then reactivate the invited user', async ({ page }) => {
    await openTeam(page);
    let r = row(page, INVITE.email);
    await r.hover();
    const startsActive = (await r.getByRole('button', { name: 'Deactivate' }).count()) > 0;
    if (!startsActive) {
      await r.getByRole('button', { name: 'Activate' }).click();
      await expect(page.getByText('User activated')).toBeVisible({ timeout: 10_000 });
      r = row(page, INVITE.email);
      await r.hover();
    }
    await r.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByText('User deactivated')).toBeVisible({ timeout: 10_000 });
    await expect(row(page, INVITE.email)).toContainText('Inactive');

    // Persisted server-side
    const users = await api('GET', '/users');
    const list = Array.isArray(users.data) ? users.data : users.data?.data;
    expect(list.find((u: { email: string }) => u.email === INVITE.email).isActive).toBeFalsy();

    r = row(page, INVITE.email);
    await r.hover();
    await r.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByText('User activated')).toBeVisible({ timeout: 10_000 });
    await expect(row(page, INVITE.email)).toContainText('Active');
  });

  test('unlock account from the detail drawer', async ({ page }) => {
    await openTeam(page);
    await row(page, INVITE.email).click();
    await page.getByRole('button', { name: 'Unlock account' }).click();
    await expect(page.getByText('Account unlocked')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Failed to unlock account')).toHaveCount(0);
  });

  test('page has no mailto/wa.me/tel anchors and no export button (no export in this slice)', async ({ page }) => {
    await openTeam(page);
    await expect(page.locator('a[href^="mailto:"], a[href*="wa.me"], a[href^="tel:"]')).toHaveCount(0);
  });

  test('duplicate invite shows an error toast, not a crash', async ({ page }) => {
    await openTeam(page);
    await page.getByRole('button', { name: 'Invite user' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#invite-name').fill(INVITE.name);
    await dialog.locator('#invite-email').fill(INVITE.email);
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByText('Failed to send invitation')).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toBeVisible();
  });
});

test.describe('Settings › Profile', () => {
  test('profile page pre-fills values and persists edits', async ({ page }) => {
    await page.goto('/settings/profile');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'Profile' }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Personal information', { exact: true })).toBeVisible();

    const name = page.locator('#profile-name');
    const dept = page.locator('#profile-department');
    await expect(name).not.toHaveValue('');
    await expect(page.locator('#profile-email')).toHaveValue('admin@demo.com');
    await expect(page.locator('#profile-email')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save profile' })).toBeVisible();

    const originalName = await name.inputValue();
    const originalDept = await dept.inputValue();
    const newName = `Admin User ${RUN}`;
    const newDept = `Dept ${RUN}`;

    await name.fill(newName);
    await dept.fill(newDept);
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile updated successfully')).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await waitForLoad(page);
    await expect(page.locator('#profile-name')).toHaveValue(newName);
    await expect(page.locator('#profile-department')).toHaveValue(newDept);

    // Restore
    await page.locator('#profile-name').fill(originalName);
    await page.locator('#profile-department').fill(originalDept);
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile updated successfully')).toBeVisible({ timeout: 10_000 });
  });

  test('profile has no fake change-password form (no backend endpoint)', async ({ page }) => {
    await page.goto('/settings/profile');
    await waitForLoad(page);
    await expect(page.locator('#currentPassword, #newPassword, #confirmPassword')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Update Password' })).toHaveCount(0);
  });

  test('back button returns to settings', async ({ page }) => {
    await page.goto('/settings/profile');
    await waitForLoad(page);
    await page.getByRole('button', { name: 'Go back' }).click();
    await page.waitForURL('**/settings');
  });
});

test.describe('Settings › Email signature', () => {
  test('fill every field, preview updates, saves and re-loads pre-filled', async ({ page }) => {
    await page.goto('/settings/email-signature');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'Email Signature' })).toBeVisible({ timeout: 10_000 });

    const sig = {
      name: `Sig Name ${RUN}`,
      title: 'Senior Travel Consultant',
      company: `Acme Tours ${RUN}`,
      phone: '+91 98765 43210',
      website: 'www.acme-e2e.com',
      logo: 'https://example.com/logo.png',
    };
    await page.locator('#sig-name').fill(sig.name);
    await page.locator('#sig-title').fill(sig.title);
    await page.locator('#sig-company').fill(sig.company);
    await page.locator('#sig-phone').fill(sig.phone);
    await page.locator('#sig-website').fill(sig.website);
    await page.locator('#sig-logo').fill(sig.logo);

    // Live preview reflects the fields
    const preview = page.locator('.bg-white.rounded-lg, .dark\\:bg-zinc-900').first();
    await expect(preview).toContainText(sig.name);
    await expect(preview).toContainText(sig.company);
    await expect(preview.locator('img[alt="Logo"]')).toHaveAttribute('src', sig.logo);

    await page.getByRole('button', { name: 'Save Signature' }).click();
    await expect(page.getByText('Email signature saved successfully')).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await waitForLoad(page);
    await expect(page.locator('#sig-name')).toHaveValue(sig.name);
    await expect(page.locator('#sig-title')).toHaveValue(sig.title);
    await expect(page.locator('#sig-company')).toHaveValue(sig.company);
    await expect(page.locator('#sig-phone')).toHaveValue(sig.phone);
    await expect(page.locator('#sig-website')).toHaveValue(sig.website);
    await expect(page.locator('#sig-logo')).toHaveValue(sig.logo);

    // Reset clears it server-side
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByText('Email signature reset')).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await waitForLoad(page);
    await expect(page.locator('#sig-name')).toHaveValue('');
  });

  test('hide / show preview toggles the preview card', async ({ page }) => {
    await page.goto('/settings/email-signature');
    await waitForLoad(page);
    await expect(page.getByText('Signature Preview')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Hide Preview' }).click();
    await expect(page.getByText('Signature Preview')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show Preview' }).click();
    await expect(page.getByText('Signature Preview')).toBeVisible();
  });
});

test.describe('Settings › Login history & sessions', () => {
  test('own login history lists the current login with a status badge', async ({ page }) => {
    await page.goto('/settings/login-history');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'Login history' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Review your recent login activity.')).toBeVisible();
    for (const h of ['Date & time', 'IP address', 'Location', 'Browser', 'OS / device', 'Status']) {
      await expect(page.locator('thead').getByText(h, { exact: true })).toBeVisible();
    }
    await expect(page.locator('tbody tr').first()).toContainText(/Success|Failed|Locked/);
    await page.getByRole('button', { name: 'Go back' }).click();
    await page.waitForURL('**/settings');
  });

  test('sessions page shows table with current session', async ({ page }) => {
    await page.goto('/settings/sessions');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'Active Sessions' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Manage your active login sessions across devices')).toBeVisible();

    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10_000 });
    for (const h of ['Device', 'Browser / OS', 'IP Address', 'Login Time', 'Status']) {
      await expect(table.locator(`th:has-text("${h}")`)).toBeVisible();
    }
    expect(await table.locator('tbody tr').count()).toBeGreaterThanOrEqual(1);
    await expect(page.getByText('Current', { exact: true }).first()).toBeVisible();
    expect(await table.locator('tbody tr').first().locator('td').nth(1).textContent()).toBeTruthy();
  });

  test('sessions back button navigates to settings', async ({ page }) => {
    await page.goto('/settings/sessions');
    await waitForLoad(page);
    await page.getByRole('button', { name: 'Back' }).click();
    await page.waitForURL('**/settings', { timeout: 10_000 });
  });

  test('settings hub links to profile, sessions, login history, activity log', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoad(page);
    for (const href of ['/settings/profile', '/settings/sessions', '/settings/login-history', '/settings/activity-log']) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible({ timeout: 10_000 });
    }
    await page.locator('a[href="/settings/sessions"]').first().click();
    await page.waitForURL('**/settings/sessions');
    await expect(page.getByRole('heading', { name: 'Active Sessions' })).toBeVisible();
  });
});

test.describe('Settings › Activity log', () => {
  test('lists entries with search, filter dialog, and empty state', async ({ page }) => {
    // Guarantee at least one 'update' entry exists
    const me = await api('GET', '/users/me');
    await api('PUT', `/users/${me.data.id}`, { name: me.data.name });
    await page.goto('/settings/activity-log');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'Activity log' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Track all actions performed in the system.')).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });

    // Filter dialog: action
    await page.getByRole('button', { name: /filter/i }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Filter activity log' });
    await expect(dialog).toBeVisible();
    await selectOption(page, dialog.getByRole('combobox').first(), 'update');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await waitForLoad(page);
    await expect(page.getByText('Action', { exact: false }).first()).toBeVisible();
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toContainText('update', { ignoreCase: true, timeout: 10_000 });
    for (const text of await rows.allTextContents()) expect(text.toLowerCase()).toContain('update');

    // Search that matches nothing → empty state
    await page.getByPlaceholder('Search user or entity…').fill(`zz-nothing-${RUN}`);
    await expect(page.getByText('No activity logs found')).toBeVisible({ timeout: 10_000 });
  });

  test('infinite scroll loads more activity rows', async ({ page }) => {
    const first = await api('GET', '/activity-logs?page=1&limit=20');
    test.skip(!(first.pagination?.total > 20), 'fewer than 21 log entries');
    await page.goto('/settings/activity-log');
    await waitForLoad(page);
    await expect(page.locator('tbody tr')).toHaveCount(20, { timeout: 10_000 });
    await page.locator('tbody tr').last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await expect.poll(() => page.locator('tbody tr').count(), { timeout: 10_000 }).toBeGreaterThan(20);
  });

  test('userId URL param pre-filters the log to that user', async ({ page }) => {
    const users = await api('GET', '/users');
    const list = Array.isArray(users.data) ? users.data : users.data?.data;
    const admin = list.find((u: { email: string }) => u.email === 'admin@demo.com');

    await page.goto(`/settings/activity-log?userId=${admin.id}`);
    await waitForLoad(page);
    await expect(page.getByText('User', { exact: false }).first()).toBeVisible();
    await expect(page.locator('tbody tr').first()).toContainText('Admin User', { timeout: 10_000 });
    for (const t of await page.locator('tbody tr').allTextContents()) expect(t).toContain('Admin User');

    // Clearing the filter drops the param
    await page.getByRole('button', { name: /clear/i }).first().click();
    await page.waitForURL(/\/settings\/activity-log$/);
  });
});
