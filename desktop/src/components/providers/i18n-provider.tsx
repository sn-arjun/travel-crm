'use client';

import * as React from 'react';
import { I18nContext, type Locale, t as translateKey } from '@/lib/i18n';
import en from '@/messages/en.json';
import hi from '@/messages/hi.json';
import ar from '@/messages/ar.json';

interface I18nProviderProps {
  children: React.ReactNode;
}

const translations: Record<Locale, Record<string, string>> = {
  en: en,
  hi: hi,
  ar: ar,
};

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocale] = React.useState<Locale>('en');

  const t = React.useCallback(
    (key: string) => translateKey(key, locale, translations),
    [locale]
  );

  const value = React.useMemo(
    () => ({
      locale,
      setLocale,
      t,
      translations,
    }),
    [locale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
