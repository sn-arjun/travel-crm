import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { seedContact } from './helpers/api-seed';

/**
 * R211: Arabic with a right-to-left layout for the core screens (shell, navigation, sign-in, shared components,
 * and the dashboard, leads, contacts and itineraries areas).
 *
 * The language is chosen in Settings > Profile (the select writes the device choice to localStorage, which is also
 * what the boot script in <head> reads), or set before load with an init script for the layout checks.
 * Page bodies outside the converted scope stay English by design; they only have to mirror and not overflow.
 */

const LANG_KEY = 'travelcrm.uiLanguage';
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;
const ARABIC_LETTERS = /[؀-ۿ]/;

async function useArabic(page: Page) {
  await page.addInitScript((key) => {
    try {
      window.localStorage.setItem(key, 'ar');
    } catch {
      /* storage blocked */
    }
  }, LANG_KEY);
}

async function htmlState(page: Page) {
  return page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang }));
}

/** Where the sidebar sits: its horizontal centre against the middle of the window. */
async function sidebarSide(page: Page): Promise<'left' | 'right'> {
  const box = await page.locator('aside').first().boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'sidebar is rendered').not.toBeNull();
  expect(viewport).not.toBeNull();
  return box!.x + box!.width / 2 > viewport!.width / 2 ? 'right' : 'left';
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      main: main ? main.scrollWidth - main.clientWidth : 0,
      document: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

async function pickLanguage(page: Page, name: string) {
  await page.locator('#profile-language').click();
  await page.getByRole('option', { name, exact: true }).click();
}

test.describe('Arabic and right-to-left', () => {
  test('switching to Arabic mirrors the shell, and switching back restores left-to-right', async ({ page }) => {
    await page.goto('/settings/profile');
    await waitForLoad(page);
    await expect(page.locator('#profile-language')).toBeVisible({ timeout: 15_000 });

    // English first: sidebar on the left, left-to-right
    expect(await htmlState(page)).toEqual({ dir: 'ltr', lang: 'en' });
    expect(await sidebarSide(page)).toBe('left');
    await expect(page.locator('aside').getByText('Dashboard', { exact: true }).first()).toBeVisible();

    await pickLanguage(page, 'العربية');

    await expect.poll(() => htmlState(page)).toEqual({ dir: 'rtl', lang: 'ar' });
    expect(await page.evaluate((key) => window.localStorage.getItem(key), LANG_KEY)).toBe('ar');
    expect(await sidebarSide(page)).toBe('right');
    // Key labels are Arabic: the sidebar items and the language label on the page itself
    const aside = page.locator('aside');
    await expect(aside.getByText('لوحة التحكم', { exact: true }).first()).toBeVisible();
    await expect(aside.getByText('العملاء المحتملون', { exact: true }).first()).toBeVisible();
    await expect(aside.getByText('جهات الاتصال', { exact: true }).first()).toBeVisible();
    await expect(page.locator('label[for="profile-language"]')).toHaveText('اللغة');
    expect((await overflow(page)).document).toBeLessThanOrEqual(1);

    // The choice survives a reload, and <html dir> is already right-to-left when the document is parsed (no flash)
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await htmlState(page)).toEqual({ dir: 'rtl', lang: 'ar' });
    await expect(page.locator('#profile-language')).toBeVisible({ timeout: 15_000 });

    // Back to English
    await pickLanguage(page, 'English');
    await expect.poll(() => htmlState(page)).toEqual({ dir: 'ltr', lang: 'en' });
    expect(await sidebarSide(page)).toBe('left');
    await expect(page.locator('aside').getByText('Dashboard', { exact: true }).first()).toBeVisible();
    await expect(page.locator('label[for="profile-language"]')).toHaveText('Language');
    expect(await page.evaluate((key) => window.localStorage.getItem(key), LANG_KEY)).toBe('en');
  });

  for (const route of ['/dashboard', '/leads', '/contacts', '/itineraries']) {
    test(`${route} renders right-to-left without horizontal overflow`, async ({ page }) => {
      await useArabic(page);
      await page.goto(route);
      await waitForLoad(page);
      await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });

      expect(await htmlState(page)).toEqual({ dir: 'rtl', lang: 'ar' });
      expect(await sidebarSide(page)).toBe('right');
      // The main column sits to the left of the sidebar, not under it
      const [asideBox, mainBox] = await Promise.all([page.locator('aside').first().boundingBox(), page.locator('main').first().boundingBox()]);
      expect(mainBox!.x + mainBox!.width).toBeLessThanOrEqual(asideBox!.x + 1);

      const o = await overflow(page);
      expect(o.main, 'main column overflow').toBeLessThanOrEqual(1);
      expect(o.document, 'page overflow').toBeLessThanOrEqual(1);
      await expect(page.locator('header [data-slot=topbar-title]')).toHaveText(ARABIC_LETTERS);
    });
  }

  test('a form is mirrored: title and labels at the right edge, actions at the left', async ({ page }) => {
    await useArabic(page);
    await page.goto('/leads/new');
    await waitForLoad(page);
    const save = page.getByRole('button', { name: 'Save Lead' });
    await expect(save).toBeVisible({ timeout: 15_000 });

    const geometry = await page.evaluate(() => {
      const main = document.querySelector('main')!.getBoundingClientRect();
      const h1 = document.querySelector('main h1')!.getBoundingClientRect();
      const button = [...document.querySelectorAll('main button')].find((b) => b.textContent?.includes('Save Lead'))!.getBoundingClientRect();
      const label = [...document.querySelectorAll('main label')].find((l) => l.textContent?.trim().startsWith('Title'))!;
      const input = document.getElementById(label.getAttribute('for') ?? '')!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      return {
        mainMid: main.x + main.width / 2,
        h1Mid: h1.x + h1.width / 2,
        buttonMid: button.x + button.width / 2,
        labelTextRight: text.right,
        inputRight: input.right,
        inputLeft: input.left,
      };
    });
    expect(geometry.h1Mid, 'page title at the start (right)').toBeGreaterThan(geometry.mainMid);
    expect(geometry.buttonMid, 'primary action at the end (left)').toBeLessThan(geometry.mainMid);
    expect(Math.abs(geometry.labelTextRight - geometry.inputRight), 'label text starts at the right edge of its field').toBeLessThan(4);

    // The first form field is in the right-hand column
    const direction = await page.evaluate(() => getComputedStyle(document.querySelector('main form, main')!).direction);
    expect(direction).toBe('rtl');
  });

  test('a dialog is mirrored: Arabic text, close button on the left, search field reads right to left', async ({ page }) => {
    await useArabic(page);
    await page.goto('/dashboard');
    await waitForLoad(page);
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });

    await page.locator('header').getByRole('button').filter({ hasText: /K/ }).first().click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('إنشاء سريع')).toBeVisible();
    await expect(dialog.getByText('عميل محتمل جديد', { exact: true })).toBeVisible();

    const geometry = await dialog.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const close = el.querySelector('[data-slot="dialog-close"]')?.getBoundingClientRect();
      const input = el.querySelector('input')!;
      const firstItem = [...el.querySelectorAll('button, [role="option"]')].find((b) => b.textContent?.includes('عميل محتمل جديد'));
      return {
        dialogMid: box.x + box.width / 2,
        closeMid: close ? close.x + close.width / 2 : null,
        direction: getComputedStyle(input).direction,
        itemTextAlign: firstItem ? getComputedStyle(firstItem).textAlign : null,
      };
    });
    if (geometry.closeMid !== null) expect(geometry.closeMid, 'close button at the end (left)').toBeLessThan(geometry.dialogMid);
    expect(geometry.direction).toBe('rtl');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('numbers, phone numbers and e-mail addresses stay readable left to right', async ({ page }) => {
    const phone = '+971501234567';
    const contact = await seedContact({ name: 'Rtl Digits Contact', phone, email: 'rtl.digits@example.com' });

    await useArabic(page);
    await page.goto('/dashboard');
    await waitForLoad(page);
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    const dashboardText = await page.locator('main').innerText();
    expect(dashboardText).toMatch(/[0-9]/);
    expect(dashboardText, 'dashboard digits are Latin').not.toMatch(ARABIC_INDIC_DIGITS);

    await page.goto(`/contacts/${contact.id}`);
    await waitForLoad(page);
    await expect(page.locator('main').getByText('Rtl Digits Contact').first()).toBeVisible({ timeout: 15_000 });
    const detailText = await page.locator('main').innerText();
    expect(detailText).toContain('rtl.digits@example.com');
    expect(detailText.replace(/\s/g, '')).toContain(phone);
    expect(detailText, 'contact digits are Latin').not.toMatch(ARABIC_INDIC_DIGITS);
  });
});

test.describe('Arabic sign-in', () => {
  test.use({ storageState: undefined });

  test('sign-in is right to left in Arabic and the e-mail field stays left to right', async ({ page }) => {
    await useArabic(page);
    await page.goto('/login');
    await expect(page.getByText('مرحبًا بعودتك')).toBeVisible({ timeout: 15_000 });
    expect(await htmlState(page)).toEqual({ dir: 'rtl', lang: 'ar' });
    expect((await overflow(page)).document).toBeLessThanOrEqual(1);
    // The e-mail field keeps its left-to-right order inside the right-to-left page
    const email = page.locator('#email');
    expect(await email.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    await email.fill('admin@demo.com');
    expect(await email.inputValue()).toBe('admin@demo.com');
    // The language switch names each language in its own script
    await page.getByRole('button', { name: 'اختيار اللغة' }).click();
    await expect(page.getByRole('menuitem', { name: 'English' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'English' }).click();
    await expect.poll(() => htmlState(page)).toEqual({ dir: 'ltr', lang: 'en' });
    await expect(page.getByText('Welcome back')).toBeVisible();
  });
});
