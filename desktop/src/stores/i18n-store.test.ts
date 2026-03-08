import { describe, it, expect, beforeEach } from 'vitest';
import { useI18nStore } from './i18n-store';

describe('useI18nStore', () => {
  beforeEach(() => {
    useI18nStore.setState({ locale: 'en' });
  });

  it('should default to English locale', () => {
    expect(useI18nStore.getState().locale).toBe('en');
  });

  it('should set locale to Hindi', () => {
    useI18nStore.getState().setLocale('hi');
    expect(useI18nStore.getState().locale).toBe('hi');
  });

  it('should set locale to Arabic', () => {
    useI18nStore.getState().setLocale('ar');
    expect(useI18nStore.getState().locale).toBe('ar');
  });

  it('should switch between locales', () => {
    useI18nStore.getState().setLocale('hi');
    expect(useI18nStore.getState().locale).toBe('hi');

    useI18nStore.getState().setLocale('en');
    expect(useI18nStore.getState().locale).toBe('en');

    useI18nStore.getState().setLocale('ar');
    expect(useI18nStore.getState().locale).toBe('ar');
  });
});
