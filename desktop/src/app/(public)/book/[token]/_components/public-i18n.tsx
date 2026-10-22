'use client';

import * as React from 'react';

import {
  I18nContext, catalogues, directionOf, isEnabledLocale, isolateLtrVars, translate, useI18n, LANGUAGES,
  type I18nContextType, type Locale, type TranslationVars,
} from '@/lib/i18n';

/**
 * The booking page's own language, apart from the language of whoever uses this browser for the CRM: the agency's default language,
 * a switch between the languages it offers, and a `?lang=nl` in the link to start in one. Everything inside, the phone picker
 * included, reads this language. The choice is not saved on the device.
 */
export function PublicI18n({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>('en');
  const setLocale = React.useCallback((next: Locale) => {
    if (isEnabledLocale(next)) setLocaleState(next);
  }, []);

  const value = React.useMemo<I18nContextType>(() => {
    const dir = directionOf(locale);
    return {
      locale,
      dir,
      setLocale,
      t: (key: string, vars?: TranslationVars) => translate(locale, key, isolateLtrVars(vars, dir)),
      translations: catalogues,
    };
  }, [locale, setLocale]);

  return (
    <I18nContext.Provider value={value}>
      <div dir={value.dir} lang={locale} className="contents">
        {children}
      </div>
    </I18nContext.Provider>
  );
}

/** The languages the page offers: the agency's list, only those this app has an enabled interface language for. */
export function offeredLanguages(available: readonly string[]): Locale[] {
  const out = available.filter((l): l is Locale => isEnabledLocale(l));
  return out.length ? out : ['en'];
}

/** The language to open in: `?lang=` when the agency offers it, else the agency default, else English. */
export function startLanguage(available: readonly string[], agencyDefault: string, requested: string | null): Locale {
  const offered = offeredLanguages(available);
  if (requested && offered.includes(requested as Locale)) return requested as Locale;
  if (offered.includes(agencyDefault as Locale)) return agencyDefault as Locale;
  return offered[0] ?? 'en';
}

export function LanguageSwitch({ available }: { available: readonly string[] }) {
  const { locale, setLocale, t } = useI18n();
  const offered = offeredLanguages(available);
  if (offered.length < 2) return null;
  return (
    <div className="flex items-center gap-ds-1" role="group" aria-label={t('booking.language')} data-testid="language-switch">
      {offered.map((code) => {
        const info = LANGUAGES.find((l) => l.code === code);
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={active}
            onClick={() => setLocale(code)}
            className={`rounded-full px-ds-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-ds-foreground text-ds-surface' : 'text-ds-foreground-muted hover:bg-ds-surface-sunken'}`}
            data-testid={`language-${code}`}
          >
            {info?.label ?? code}
          </button>
        );
      })}
    </div>
  );
}
