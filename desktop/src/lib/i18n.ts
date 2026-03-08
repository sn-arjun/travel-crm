'use client';

import * as React from 'react';

export type Locale = 'en' | 'hi' | 'ar';

export interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  translations: Record<Locale, Record<string, string>>;
}

// Translation function
export function t(
  key: string,
  locale: Locale,
  translations: Record<Locale, Record<string, string>>
): string {
  return translations[locale]?.[key] ?? translations['en']?.[key] ?? key;
}

// i18n context
export const I18nContext = React.createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key: string) => key,
  translations: { en: {}, hi: {}, ar: {} },
});

export const useI18n = () => {
  const context = React.useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
};
