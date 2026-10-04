import { expect, type Locator, type Page } from '@playwright/test';

/** 'YYYY-MM-DD' from local parts - matches the DatePicker's `data-day` attribute. */
export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The open DatePicker popover (role=dialog, aria-label "Choose date..."). */
export function calendarDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: /^Choose date/ }).last();
}

/** The day button for `date` inside the open calendar. */
export function dayButton(page: Page, date: Date): Locator {
  return calendarDialog(page).locator(`[data-day="${localDay(date)}"]`);
}

/**
 * Opens the DatePicker behind `trigger`, jumps to the date's year and month via
 * the labelled selects, and clicks the day. Resolves once the popover closed.
 */
export async function pickDate(page: Page, trigger: Locator, date: Date): Promise<void> {
  await trigger.click();
  const dialog = calendarDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Year', { exact: true }).selectOption(String(date.getFullYear()));
  await dialog.getByLabel('Month', { exact: true }).selectOption(String(date.getMonth()));
  await dialog.locator(`[data-day="${localDay(date)}"]`).click();
  await expect(dialog).toBeHidden();
}
