import { create } from 'zustand';

export type Locale = 'en' | 'hi' | 'ar';

interface I18nStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useI18nStore = create<I18nStore>((set) => ({
  locale: 'en',
  setLocale: (locale) => set({ locale }),
}));
