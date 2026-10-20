import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_LOCALE,
  LANGUAGES,
  catalogues,
  directionOf,
  isEnabledLocale,
  isolateLtrVars,
  tEn,
  translate,
  type Catalogue,
  type Locale,
} from './i18n';
import { getPageTitle } from '@/components/layout/nav-config';

const sample: Record<Locale, Catalogue> = {
  en: {
    'x.hello': 'Hello {name}',
    'x.only': 'Only English',
    'x.items_one': '{count} item',
    'x.items_other': '{count} items',
    'x.plain': 'Plain',
  },
  hi: {
    'x.hello': 'नमस्ते {name}',
    'x.items_one': '{count} वस्तु',
    'x.items_other': '{count} वस्तुएं',
  },
  ar: {},
};

describe('translate', () => {
  it('interpolates {placeholders} and keeps unknown ones visible', () => {
    expect(translate('en', 'x.hello', { name: 'Asha' }, sample)).toBe('Hello Asha');
    expect(translate('en', 'x.hello', {}, sample)).toBe('Hello {name}');
    expect(translate('hi', 'x.hello', { name: 'Asha' }, sample)).toBe('नमस्ते Asha');
  });

  it('picks the plural form from vars.count', () => {
    expect(translate('en', 'x.items', { count: 1 }, sample)).toBe('1 item');
    expect(translate('en', 'x.items', { count: 0 }, sample)).toBe('0 items');
    expect(translate('en', 'x.items', { count: 5 }, sample)).toBe('5 items');
    expect(translate('hi', 'x.items', { count: 1 }, sample)).toBe('1 वस्तु');
  });

  it('falls back to the plain key when no plural form exists', () => {
    expect(translate('en', 'x.plain', { count: 3 }, sample)).toBe('Plain');
  });

  it('falls back to English, then to the key itself', () => {
    expect(translate('hi', 'x.only', undefined, sample)).toBe('Only English');
    expect(translate('hi', 'x.plain', undefined, sample)).toBe('Plain');
    expect(translate('ar', 'x.hello', { name: 'A' }, sample)).toBe('Hello A');
    expect(translate('hi', 'x.nowhere', undefined, sample)).toBe('x.nowhere');
  });

  describe('missing keys', () => {
    afterEach(() => vi.restoreAllMocks());

    it('are reported once in development and still render the key', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(translate('en', 'x.reported-once', undefined, sample)).toBe('x.reported-once');
      expect(translate('en', 'x.reported-once', undefined, sample)).toBe('x.reported-once');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('x.reported-once');
    });

    it('are not reported when only a partial language lacks them (English has it)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      translate('hi', 'x.only', undefined, sample);
      expect(warn).not.toHaveBeenCalled();
    });
  });
});

describe('real catalogues', () => {
  it('English is the complete source: brand, nav and auth keys resolve', () => {
    expect(tEn('nav.items.leads')).toBe('Leads');
    expect(tEn('nav.groups.marketing')).toBe('Marketing');
    expect(tEn('auth.login.title')).toBe('Welcome back');
    expect(tEn('shell.support.sessionEnds', { name: 'Sam', time: '10:00' })).toBe('Support session by Sam - ends 10:00');
  });

  it('Hindi changes the shell text and falls back to English for what is not translated yet', () => {
    expect(translate('hi', 'nav.items.leads')).not.toBe(tEn('nav.items.leads'));
    expect(translate('hi', 'nav.groups.operations')).toBe(catalogues.hi['nav.groups.operations']);
    expect(translate('hi', 'auth.setup.namePlaceholder')).toBe(tEn('auth.setup.namePlaceholder'));
  });

  it('every non-English entry has an English key with the same placeholders', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const code of ['hi', 'ar'] as const) {
      for (const [key, value] of Object.entries(catalogues[code])) {
        if (key.startsWith('_')) continue; // notes such as the native-review flag
        expect(catalogues.en[key], `${code}:${key} has no English source`).toBeDefined();
        expect(names(value), `${code}:${key}`).toBe(names(catalogues.en[key] as string));
      }
    }
  });
});

describe('languages', () => {
  it('English is the default; Hindi and Arabic (rtl) are offered', () => {
    expect(DEFAULT_LOCALE).toBe('en');
    expect(isEnabledLocale('en')).toBe(true);
    expect(isEnabledLocale('hi')).toBe(true);
    expect(isEnabledLocale('ar')).toBe(true);
    expect(isEnabledLocale('fr')).toBe(false);
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('hi')).toBe('ltr');
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'hi', 'ar']);
  });
});

describe('page titles follow the language', () => {
  it('English titles are unchanged', () => {
    expect(getPageTitle('/leads')).toBe('Leads');
    expect(getPageTitle('/leads/new')).toBe('New lead');
    expect(getPageTitle('/fleet/trips/new')).toBe('New trip');
    expect(getPageTitle('/leads/0f8fad5b-d9cb-469f-a165-70867728950e')).toBe('Lead details');
    expect(getPageTitle('/settings/ai-usage')).toBe('Usage and limits');
  });

  it('the same paths come out in Hindi with a Hindi translator', () => {
    const t = (key: string, vars?: Record<string, string | number>) => translate('hi', key, vars);
    expect(getPageTitle('/leads', t)).toBe(catalogues.hi['nav.items.leads']);
    expect(getPageTitle('/leads', t)).not.toBe('Leads');
  });
});

describe('isolateLtrVars', () => {
  it('wraps e-mail and phone values only for a right-to-left language', () => {
    expect(isolateLtrVars({ email: 'a@b.co', name: 'Sam' }, 'rtl')).toEqual({ email: '\u2066a@b.co\u2069', name: 'Sam' });
    expect(isolateLtrVars({ phone: '+971 50 123 4567' }, 'rtl')).toEqual({ phone: '\u2066+971 50 123 4567\u2069' });
    expect(isolateLtrVars({ email: 'a@b.co' }, 'ltr')).toEqual({ email: 'a@b.co' });
    expect(isolateLtrVars(undefined, 'rtl')).toBeUndefined();
    expect(isolateLtrVars({ count: 3 }, 'rtl')).toEqual({ count: 3 });
  });
});
