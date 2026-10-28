import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import * as React from 'react';

import { BudgetField } from './budget-field';
import { resetLocaleContext, setLocaleContext } from '@/lib/locale';

describe('AI itinerary budget field', () => {
  afterEach(() => {
    cleanup();
    resetLocaleContext();
  });

  it('is labelled with the agency currency (EUR)', () => {
    setLocaleContext({ currency: 'EUR', locale: 'en-IE', timeZone: 'Europe/Amsterdam', country: 'NL' });
    render(<BudgetField value={undefined} onChange={() => {}} />);
    expect(screen.getByText('Budget (EUR)')).toBeTruthy();
    expect(screen.queryByText(/INR/)).toBeNull();
  });

  it('follows a pound agency too', () => {
    setLocaleContext({ currency: 'GBP', locale: 'en-GB', timeZone: 'Europe/London', country: 'GB' });
    render(<BudgetField value={undefined} onChange={() => {}} />);
    expect(screen.getByText('Budget (GBP)')).toBeTruthy();
  });
});
