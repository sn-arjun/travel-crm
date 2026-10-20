'use client';

import * as React from 'react';
import en from '@/messages/en.json';
import hi from '@/messages/hi.json';
import ar from '@/messages/ar.json';
import { LOCALE_STORAGE_KEY } from '@/lib/i18n-boot';

/**
 * Interface text (not number/date/currency formatting: that stays on lib/locale.ts, R202).
 *
 * Adding a language = one catalogue file in src/messages + one entry in LANGUAGES below
 * (code, native name, `dir`, enabled). Nothing else changes.
 */
export type Locale = 'en' | 'hi' | 'ar';
export type Direction = 'ltr' | 'rtl';
export type TranslationVars = Record<string, string | number>;
export type Catalogue = Record<string, string>;

export interface LanguageInfo {
  code: Locale;
  /** Name in its own language, shown in the switch. */
  label: string;
  dir: Direction;
  /** Only enabled languages are offered in the switch. Arabic (rtl) ships in R211. */
  enabled: boolean;
}

export const DEFAULT_LOCALE: Locale = 'en';

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en', label: 'English', dir: 'ltr', enabled: true },
  { code: 'hi', label: 'हिन्दी', dir: 'ltr', enabled: true },
  { code: 'ar', label: 'العربية', dir: 'rtl', enabled: true },
];

export const catalogues: Record<Locale, Catalogue> = { en, hi, ar };

export { LOCALE_STORAGE_KEY };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LANGUAGES.some((l) => l.code === value);
}

export function isEnabledLocale(value: unknown): value is Locale {
  return LANGUAGES.some((l) => l.code === value && l.enabled);
}

export function directionOf(locale: Locale): Direction {
  return LANGUAGES.find((l) => l.code === locale)?.dir ?? 'ltr';
}

/** The language chosen on this device (the users API has no UI-language field), or English. */
export function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isEnabledLocale(stored)) return stored;
  } catch {
    // storage blocked: English
  }
  return DEFAULT_LOCALE;
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // storage blocked: the choice lasts for this session only
  }
}

const reported = new Set<string>();

/** Missing keys are reported once each, in development and test only. */
function reportMissing(locale: Locale, key: string, inEnglishToo: boolean): void {
  if (process.env.NODE_ENV === 'production') return;
  // A key missing from a non-English catalogue is expected while the language is partial: only English gaps are errors.
  if (!inEnglishToo) return;
  const id = `${locale}:${key}`;
  if (reported.has(id)) return;
  reported.add(id);
  console.warn(`[i18n] missing key "${key}" (locale ${locale}); showing the key`);
}

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

function pluralCategory(locale: Locale, count: number): string {
  try {
    return new Intl.PluralRules(locale).select(count);
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

/**
 * Look up `key` in `locale`, then in English, then fall back to the key itself.
 * Plurals: when `vars.count` is a number, `key_one` / `key_other` (or other CLDR categories) are tried
 * first, then `key_other`, then the plain `key`. `{name}` placeholders are replaced from `vars`.
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: TranslationVars,
  catalogueSet: Record<Locale, Catalogue> = catalogues,
): string {
  const own = catalogueSet[locale] ?? {};
  const english = catalogueSet.en ?? {};
  const candidates: string[] = [];
  if (vars && typeof vars.count === 'number') {
    candidates.push(`${key}_${pluralCategory(locale, vars.count)}`, `${key}_other`);
  }
  candidates.push(key);

  for (const k of candidates) {
    const hit = own[k];
    if (typeof hit === 'string') return interpolate(hit, vars);
  }
  for (const k of candidates) {
    const hit = english[k];
    if (typeof hit === 'string') {
      return interpolate(hit, vars);
    }
  }
  reportMissing(locale, key, true);
  return interpolate(key, vars);
}

export type TranslateFn = (key: string, vars?: TranslationVars) => string;

/** English translator for code outside React (data modules, tests). */
export const tEn: TranslateFn = (key, vars) => translate('en', key, vars);

export interface I18nContextType {
  locale: Locale;
  dir: Direction;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
  translations: Record<Locale, Catalogue>;
}

// Without a provider (unit tests, isolated renders) components still render real English.
export const I18nContext = React.createContext<I18nContextType>({
  locale: DEFAULT_LOCALE,
  dir: 'ltr',
  setLocale: () => {},
  t: tEn,
  translations: catalogues,
});

export const useI18n = () => React.useContext(I18nContext);

/** `const t = useT(); t('auth.login.title')` */
export const useT = (): TranslateFn => useI18n().t;

/**
 * Physical sides for the inline start and end, for Radix popper props (`side="left" | "right"`), which have no
 * logical value: `<TooltipContent side={useInlineSides().end}>` opens towards the end of the line in either direction.
 */
export function useInlineSides(): { start: 'left' | 'right'; end: 'left' | 'right' } {
  return useI18n().dir === 'rtl' ? { start: 'right', end: 'left' } : { start: 'left', end: 'right' };
}

/** Placeholders that carry values written left to right (an e-mail address, a phone number). */
const LTR_VARS = new Set(['email', 'phone']);

/**
 * In a right-to-left language, wrap values that must keep their left-to-right order in Unicode isolates
 * (LRI ... PDI), so "user@example.com" or "+971 50 123 4567" inside an Arabic sentence is not reordered or
 * pulled apart by the surrounding punctuation. Left-to-right languages get the values untouched.
 */
export function isolateLtrVars(vars: TranslationVars | undefined, dir: Direction): TranslationVars | undefined {
  if (!vars || dir !== 'rtl') return vars;
  const out: TranslationVars = { ...vars };
  for (const name of Object.keys(out)) {
    const v = out[name];
    if (LTR_VARS.has(name) && typeof v === 'string' && v) out[name] = `\u2066${v}\u2069`;
  }
  return out;
}
