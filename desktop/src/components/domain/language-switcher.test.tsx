import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nContext, LANGUAGES, catalogues, tEn } from '@/lib/i18n';
import { LanguageSwitcher } from './language-switcher';

describe('LanguageSwitcher', () => {
  it('lists Nederlands next to the other enabled languages, each in its own name', async () => {
    render(
      <I18nContext.Provider value={{ locale: 'en', dir: 'ltr', setLocale: () => {}, t: tEn, translations: catalogues }}>
        <LanguageSwitcher />
      </I18nContext.Provider>,
    );
    const trigger = screen.getByRole('button', { name: 'Select language' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(LANGUAGES.filter((l) => l.enabled).map((l) => l.label));
    expect(items.map((i) => i.textContent)).toContain('Nederlands');
  });
});
