'use client';

import * as React from 'react';
import { useAuthStore } from '@/stores/auth-store';
import {
  I18nContext,
  catalogues,
  directionOf,
  isEnabledLocale,
  readStoredLocale,
  storeLocale,
  translate,
  DEFAULT_LOCALE,
  type Locale,
  type TranslationVars,
} from '@/lib/i18n';

interface I18nProviderProps {
  children: React.ReactNode;
}

/**
 * Holds the interface language. It starts in English (matches the server render), then switches to the language
 * saved on this device. The `lang` and `dir` attributes of <html> follow the language.
 */
export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = React.useState<Locale>(DEFAULT_LOCALE);

  React.useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  // Signing in: a language saved on the profile (anything but the default) wins over the device choice.
  const userId = useAuthStore((st) => st.user?.id);
  const profileLanguage = useAuthStore((st) => (st.user as { language?: string } | null)?.language);
  React.useEffect(() => {
    if (userId && profileLanguage && profileLanguage !== DEFAULT_LOCALE && isEnabledLocale(profileLanguage)) {
      storeLocale(profileLanguage);
      setLocaleState(profileLanguage);
    }
    // only when the signed-in user changes, so a later switch in this session is not overridden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  React.useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
  }, [locale]);

  const setLocale = React.useCallback((next: Locale) => {
    if (!isEnabledLocale(next)) return;
    storeLocale(next);
    setLocaleState(next);
  }, []);

  const t = React.useCallback(
    (key: string, vars?: TranslationVars) => translate(locale, key, vars),
    [locale],
  );

  const value = React.useMemo(
    () => ({ locale, dir: directionOf(locale), setLocale, t, translations: catalogues }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
