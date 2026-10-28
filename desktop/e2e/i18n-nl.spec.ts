import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';

/**
 * R136: the Dutch interface. The language is chosen in Settings > Profile (the select writes the device choice to
 * localStorage) or on the sign-in screen's language switch. Dutch is complete for every key that exists, so the
 * shell, the sidebar, the sign-in screen and the converted shared components must show Dutch text, <html lang="nl">,
 * stay left to right, and never warn about a missing key.
 */

const LANG_KEY = 'travelcrm.uiLanguage';

/** Every console warning about a missing catalogue key, collected for the whole test. */
function watchMissingKeys(page: Page): string[] {
  const missing: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[i18n] missing key')) missing.push(text);
  });
  return missing;
}

async function htmlState(page: Page) {
  return page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang }));
}

async function pickLanguage(page: Page, name: string) {
  await page.locator('#profile-language').click();
  await page.getByRole('option', { name, exact: true }).click();
}

test.describe('Dutch interface', () => {
  test('switching to Nederlands translates the shell, and switching back restores English', async ({ page }) => {
    const missing = watchMissingKeys(page);
    await page.goto('/settings/profile');
    await waitForLoad(page);
    await expect(page.locator('#profile-language')).toBeVisible({ timeout: 15_000 });
    expect(await htmlState(page)).toEqual({ dir: 'ltr', lang: 'en' });
    await expect(page.locator('label[for="profile-language"]')).toHaveText('Language');

    // Nederlands is offered next to the other languages, named in its own language
    await page.locator('#profile-language').click();
    await expect(page.getByRole('option', { name: 'Nederlands', exact: true })).toBeVisible();
    await page.getByRole('option', { name: 'Nederlands', exact: true }).click();

    await expect.poll(() => htmlState(page)).toEqual({ dir: 'ltr', lang: 'nl' });
    expect(await page.evaluate((key) => window.localStorage.getItem(key), LANG_KEY)).toBe('nl');
    await expect(page.locator('label[for="profile-language"]')).toHaveText('Taal');

    // The sidebar and the top bar are Dutch
    const aside = page.locator('aside');
    await expect(aside.getByText('Contacten', { exact: true }).first()).toBeVisible();
    await expect(aside.getByText('Taken', { exact: true }).first()).toBeVisible();
    await expect(aside.getByText("Reisschema's", { exact: true }).first()).toBeVisible();
    await expect(aside.getByText('Contacts', { exact: true })).toHaveCount(0);

    // The choice survives a reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('label[for="profile-language"]')).toHaveText('Taal', { timeout: 15_000 });
    expect(await htmlState(page)).toEqual({ dir: 'ltr', lang: 'nl' });

    // Back to English
    await pickLanguage(page, 'English');
    await expect.poll(() => htmlState(page)).toEqual({ dir: 'ltr', lang: 'en' });
    await expect(page.locator('label[for="profile-language"]')).toHaveText('Language');
    await expect(page.locator('aside').getByText('Contacts', { exact: true }).first()).toBeVisible();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), LANG_KEY)).toBe('en');

    expect(missing, 'missing-key warnings').toEqual([]);
  });

  test('the dashboard and the leads list render in Dutch with Dutch shared components', async ({ page }) => {
    const missing = watchMissingKeys(page);
    await page.addInitScript((key) => {
      try {
        window.localStorage.setItem(key, 'nl');
      } catch {
        /* storage blocked */
      }
    }, LANG_KEY);

    await page.goto('/dashboard');
    await waitForLoad(page);
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    expect(await htmlState(page)).toEqual({ dir: 'ltr', lang: 'nl' });
    await expect(page.locator('header [data-slot=topbar-title]')).toHaveText('Dashboard');
    await expect(page.locator('aside').getByText('Leads', { exact: true }).first()).toBeVisible();
    // The account menu, the notification bell and the theme switch use Dutch labels
    await expect(page.getByRole('button', { name: /^Accountmenu van / })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Overschakelen naar donker thema' })).toBeVisible();

    // Shared list components: the filter bar and the language switcher
    await page.goto('/leads');
    await waitForLoad(page);
    await expect(page.locator('header [data-slot=topbar-title]')).toHaveText('Leads', { timeout: 15_000 });
    // The command palette (a shared component) opens in Dutch
    await page.keyboard.press('Control+k');
    await expect(page.getByPlaceholder('Typ een opdracht of zoek contacten, leads en facturen...')).toBeVisible();
    await expect(page.getByText('Snel aanmaken', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto('/contacts');
    await waitForLoad(page);
    await expect(page.locator('header [data-slot=topbar-title]')).toHaveText('Contacten', { timeout: 15_000 });

    expect(missing, 'missing-key warnings').toEqual([]);
  });
});

test.describe('Dutch sign-in', () => {
  test.use({ storageState: undefined });

  test('the sign-in screen switches to Dutch and back, with no missing keys', async ({ page }) => {
    const missing = watchMissingKeys(page);
    await page.goto('/login');
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Select language' }).click();
    await page.getByRole('menuitem', { name: 'Nederlands' }).click();

    await expect.poll(() => htmlState(page)).toEqual({ dir: 'ltr', lang: 'nl' });
    await expect(page.getByText('Welkom terug')).toBeVisible();
    await expect(page.getByText('Voer uw e-mailadres in om uw account te vinden')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Doorgaan' })).toBeVisible();
    // The language switch is labelled in Dutch and still names each language in its own
    await page.getByRole('button', { name: 'Taal kiezen' }).click();
    await expect(page.getByRole('menuitem', { name: 'English' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Nederlands' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'English' }).click();

    await expect.poll(() => htmlState(page)).toEqual({ dir: 'ltr', lang: 'en' });
    await expect(page.getByText('Welcome back')).toBeVisible();
    expect(missing, 'missing-key warnings').toEqual([]);
  });
});
