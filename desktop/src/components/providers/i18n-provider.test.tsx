// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { I18nProvider } from './i18n-provider';
import { useI18n, LOCALE_STORAGE_KEY, catalogues } from '@/lib/i18n';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FilterBar } from '@/components/domain/filter-bar';
import { navigation } from '@/components/layout/nav-config';
import { useAuthStore } from '@/stores/auth-store';

function Probe() {
  const { t, locale, setLocale } = useI18n();
  return (
    <div>
      <span data-testid="leads">{t('nav.items.leads')}</span>
      <span data-testid="locale">{locale}</span>
      <button onClick={() => setLocale('hi')}>to-hi</button>
      <button onClick={() => setLocale('ar')}>to-ar</button>
      <button onClick={() => setLocale('en')}>to-en</button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('dir');
  document.documentElement.lang = 'en';
  act(() => useAuthStore.setState({ user: null }));
});

describe('I18nProvider', () => {
  it('starts in English, switches to Hindi, and remembers the choice on this device', () => {
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId('leads').textContent).toBe('Leads');

    fireEvent.click(screen.getByText('to-hi'));
    expect(screen.getByTestId('leads').textContent).toBe(catalogues.hi['nav.items.leads']);
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('hi');
    expect(document.documentElement.lang).toBe('hi');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('reads the saved language on load', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'hi');
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByTestId('locale').textContent).toBe('hi');
  });

  it('refuses a language that is not offered yet (Arabic ships in the next batch)', () => {
    render(<I18nProvider><Probe /></I18nProvider>);
    fireEvent.click(screen.getByText('to-ar'));
    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it('uses the language saved on the profile of the user who signs in', () => {
    render(<I18nProvider><Probe /></I18nProvider>);
    act(() => {
      useAuthStore.setState({ user: { id: 'u1', language: 'hi' } as never });
    });
    expect(screen.getByTestId('locale').textContent).toBe('hi');
  });

  it('a profile on the default language does not override a language chosen on the device', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'hi');
    render(<I18nProvider><Probe /></I18nProvider>);
    act(() => {
      useAuthStore.setState({ user: { id: 'u1', language: 'en' } as never });
    });
    expect(screen.getByTestId('locale').textContent).toBe('hi');
  });
});

describe('shared components', () => {
  it('render the same English text with no provider mounted', () => {
    render(
      <div>
        <Pagination page={2} pageSize={10} total={35} onPageChange={() => {}} onPageSizeChange={() => {}} />
        <FilterBar onOpenFilters={() => {}} activeFilters={[{ id: 'a', label: 'Status', value: 'Open' }]} onClearFilters={() => {}} />
        <ConfirmDialog open onOpenChange={() => {}} title="T" description="D" onConfirm={() => {}} />
      </div>,
    );
    expect(screen.getByText('11–20 of 35')).toBeTruthy();
    expect(screen.getByText('Page 2 of 4')).toBeTruthy();
    expect(screen.getByLabelText('Next page')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search...')).toBeTruthy();
    expect(screen.getByText('Clear all')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('switch to Hindi inside the provider', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'hi');
    render(
      <I18nProvider>
        <Pagination page={1} pageSize={10} total={5} onPageChange={() => {}} />
        <FilterBar onClearFilters={() => {}} activeFilters={[{ id: 'a', label: 'S', value: 'O' }]} />
      </I18nProvider>,
    );
    expect(await screen.findByText(catalogues.hi['ui.filterBar.clearAll'] as string)).toBeTruthy();
    expect(screen.getByLabelText(catalogues.hi['ui.pagination.next'] as string)).toBeTruthy();
  });
});

describe('navigation data', () => {
  it('every group and item carries a catalogue key whose English text is the old label', () => {
    for (const group of navigation) {
      expect(group.labelKey).toMatch(/^nav\.groups\./);
      expect(group.label).toBe(catalogues.en[group.labelKey]);
      for (const item of group.items) {
        expect(item.titleKey).toMatch(/^nav\.items\./);
        expect(item.title).toBe(catalogues.en[item.titleKey]);
      }
    }
  });
});
