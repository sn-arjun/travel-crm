// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { bootLanguageScript, RTL_LOCALES, LOCALE_STORAGE_KEY as BOOT_KEY } from './i18n-boot';
import { LANGUAGES, LOCALE_STORAGE_KEY, catalogues } from './i18n';

describe('i18n boot script', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = 'en';
    document.documentElement.removeAttribute('dir');
  });

  it('lists exactly the languages LANGUAGES marks right to left', () => {
    expect([...RTL_LOCALES].sort()).toEqual(LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.code).sort());
    expect(BOOT_KEY).toBe(LOCALE_STORAGE_KEY);
  });

  it('sets lang and dir from the saved Arabic choice', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'ar');
    new Function(bootLanguageScript())();
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('leaves the page alone for English, Hindi or nothing saved', () => {
    for (const saved of [null, 'en', 'hi', 'zz']) {
      window.localStorage.clear();
      if (saved) window.localStorage.setItem(LOCALE_STORAGE_KEY, saved);
      new Function(bootLanguageScript())();
      expect(document.documentElement.lang).toBe('en');
      expect(document.documentElement.dir).toBe('');
    }
  });
});

describe('Arabic catalogue', () => {
  it('covers every English key', () => {
    const missing = Object.keys(catalogues.en).filter((k) => !(k in catalogues.ar) || String(catalogues.ar[k]).trim() === '');
    expect(missing).toEqual([]);
  });

  it('is flagged as a draft that needs a native review', () => {
    expect(catalogues.ar._comment).toMatch(/native/i);
  });

  it('contains Arabic letters, and keeps the brand name in Latin letters', () => {
    expect(catalogues.ar['nav.items.leads']).toMatch(/[؀-ۿ]/);
    expect(catalogues.ar['brand.name']).toBe('TravelCRM Pro');
  });
});
