/**
 * Display formatting that follows the active locale (R203): numbers, exact money, times and date-times in the
 * agency's locale and the user's time zone (lib/locale.ts). Pages call these instead of `toLocaleString('en-IN')`
 * or an `Intl` call with a literal locale, currency or zone.
 *
 * Date rules match lib/dates.ts: a calendar date ('2026-10-15') and a zone-less wall-clock time
 * ('2026-10-07 14:45') never move to another zone; a timestamp that carries its own zone ('...Z', '+05:30')
 * and a Date object (an instant) are shown in the user's zone.
 */
import { isTimestampString, toDisplayDate } from './dates';
import { getLocaleContext, usesLakhCrore } from './locale';

type DateInput = Date | string | number | null | undefined;

const ZONE_SUFFIX_RE = /(Z|[+-]\d{2}:?\d{2})$/;

function activeZone(): string | undefined {
  return getLocaleContext().timeZone || undefined;
}

function prepare(d: DateInput): { date: Date; timeZone: string | undefined } | null {
  if (d === null || d === undefined || d === '') return null;
  let date: Date;
  let timeZone: string | undefined;
  if (typeof d === 'string') {
    date = toDisplayDate(d);
    timeZone = isTimestampString(d) && ZONE_SUFFIX_RE.test(d) ? activeZone() : undefined;
  } else {
    date = typeof d === 'number' ? new Date(d) : d;
    timeZone = activeZone();
  }
  return Number.isNaN(date.getTime()) ? null : { date, timeZone };
}

/** A number in the active locale's digit grouping (lakh grouping only for an en-IN agency). */
export function formatLocaleNumber(n: number | null | undefined, options?: Intl.NumberFormatOptions): string {
  const value = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat(getLocaleContext().locale, options).format(value);
}

/**
 * Money with the currency's own number of decimals (2 for rupees, pounds and dollars: "₹1,500.00"), for
 * ledgers and rate tables where the paise matter. `currency` and `locale` default to the active agency.
 */
export function formatExactCurrency(
  amount: number | null | undefined,
  currency: string = getLocaleContext().currency,
  locale: string = getLocaleContext().locale,
): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

/** Money without decimals ("₹1,500"), for headline figures. Defaults to the active agency's currency and locale. */
export function formatWholeCurrency(
  amount: number | null | undefined,
  currency: string = getLocaleContext().currency,
  locale: string = getLocaleContext().locale,
): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

/**
 * Tight headline money for charts and tiles, no space before the unit: lakh and crore ("₹1.5L", "₹2.3Cr", "₹45K")
 * for an en-IN agency, Intl compact notation ("£1.5K", "$2.3M") for every other locale. Small amounts are whole numbers.
 */
export function formatTightCurrency(
  amount: number | null | undefined,
  currency: string = getLocaleContext().currency,
  locale: string = getLocaleContext().locale,
): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (usesLakhCrore(locale)) {
    const symbol = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency;
    if (abs >= 10_000_000) return `${sign}${symbol}${(abs / 10_000_000).toFixed(1)}Cr`;
    if (abs >= 100_000) return `${sign}${symbol}${(abs / 100_000).toFixed(1)}L`;
    if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(0)}K`;
    return `${sign}${symbol}${Math.round(abs)}`;
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: abs >= 1_000 ? 1 : 0,
  }).format(value);
}

/** How a currency is written where only Latin-1 glyphs exist (the PDF fonts): the code, with the usual short form where one is common. */
const PDF_PREFIX: Record<string, string> = { INR: 'Rs.' };

/** Money for a generated PDF: "Rs. 1,50,000" for rupees, "GBP 1,500" for others, grouped in the active locale. */
export function formatPdfMoney(amount: number | null | undefined, currency: string = getLocaleContext().currency): string {
  return `${PDF_PREFIX[currency] ?? currency} ${formatLocaleNumber(amount)}`;
}

/** A date in the active locale; `options` default to the platform's numeric date. '' for empty or invalid input. */
export function formatLocaleDate(d: DateInput, options?: Intl.DateTimeFormatOptions): string {
  const p = prepare(d);
  if (!p) return '';
  return p.date.toLocaleDateString(getLocaleContext().locale, p.timeZone ? { ...options, timeZone: p.timeZone } : options);
}

/** A clock time in the active locale and the user's zone. '' for empty or invalid input. */
export function formatLocaleTime(d: DateInput, options?: Intl.DateTimeFormatOptions): string {
  const p = prepare(d);
  if (!p) return '';
  return p.date.toLocaleTimeString(getLocaleContext().locale, p.timeZone ? { ...options, timeZone: p.timeZone } : options);
}

/** Date and time in the active locale and the user's zone. '' for empty or invalid input. */
export function formatLocaleDateTime(d: DateInput, options?: Intl.DateTimeFormatOptions): string {
  const p = prepare(d);
  if (!p) return '';
  return p.date.toLocaleString(getLocaleContext().locale, p.timeZone ? { ...options, timeZone: p.timeZone } : options);
}

/**
 * A Date built from local calendar parts (a calendar cell, a week-day header): shown in the active locale
 * without moving it to another zone.
 */
export function formatCalendarDay(d: Date, options?: Intl.DateTimeFormatOptions): string {
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(getLocaleContext().locale, options);
}
