import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getLocaleContext, usesLakhCrore } from './locale';

/**
 * Merge Tailwind classes with clsx + tailwind-merge.
 * Use this everywhere instead of raw className strings.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a currency amount. `currency` and `locale` default to the active agency locale (lib/locale.ts),
 * so a UK agency sees pounds in en-GB and an Indian agency rupees in en-IN. Pass them for a document that
 * has its own currency (an invoice in USD for an Indian agency).
 */
export function formatCurrency(
  amount: number,
  currency: string = getLocaleContext().currency,
  locale: string = getLocaleContext().locale,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

const LAKH = 100_000;
const CRORE = 10_000_000;

function trimZero(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Short money for stat tiles. Under 1 lakh, or in any locale other than en-IN, this is a plain currency amount
 * (other locales get Intl compact notation from 1 million up: $1.2M). In en-IN, 1 lakh and above reads as
 * "₹1.5 L" and 1 crore and above as "₹2.3 Cr".
 */
export function formatCompactCurrency(
  amount: number,
  currency: string = getLocaleContext().currency,
  locale: string = getLocaleContext().locale,
): string {
  const value = Number.isFinite(amount) ? amount : 0;
  if (usesLakhCrore(locale)) {
    if (Math.abs(value) < LAKH) return formatCurrency(value, currency, locale);
    const symbol = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency;
    if (Math.abs(value) >= CRORE) return `${symbol}${trimZero(value / CRORE)} Cr`;
    return `${symbol}${trimZero(value / LAKH)} L`;
  }
  if (Math.abs(value) < 1_000_000) return formatCurrency(value, currency, locale);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format a date string to a localized display format.
 */
export function formatDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(getLocaleContext().locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

/**
 * Format relative time (e.g., "2 hours ago").
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

/**
 * Truncate text with ellipsis.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

/**
 * Get initials from a full name (for avatar fallbacks).
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Debounce a function call.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
