import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';

import { setLocaleContext } from '@/lib/locale';
import { formatPhone, splitPhone, toE164 } from '@/lib/phone';
import { E164PhoneInput } from './phone-input';

/**
 * An agency in the Netherlands (R141-4): national numbers typed with a leading 0, with spaces, or with +31 all give the same
 * E.164 value, and the field shows the national part with the +31 code in the picker.
 */
describe('PhoneInput for an agency in the Netherlands', () => {
  beforeEach(() => setLocaleContext({ country: 'NL', phoneDefaultCountry: 'NL', currency: 'EUR', locale: 'nl-NL' }));

  it('reads every way of writing a Dutch number as the same E.164 value', () => {
    expect(toE164('0612345678')).toBe('+31612345678');
    expect(toE164('06 1234 5678')).toBe('+31612345678');
    expect(toE164('+31 6 1234 5678')).toBe('+31612345678');
    expect(toE164('0031 6 1234 5678')).toBe('+31612345678');
    expect(toE164('0852080400')).toBe('+31852080400');
    expect(toE164('085 208 0400')).toBe('+31852080400');
    expect(toE164('020 123 4567')).toBe('+31201234567');
  });

  it('splits a stored number into the picker code and the national digits', () => {
    expect(splitPhone('+31612345678')).toEqual({ countryCode: '+31', national: '612345678' });
    expect(splitPhone('0612345678')).toEqual({ countryCode: '+31', national: '612345678' });
  });

  it('displays Dutch numbers in the national grouping', () => {
    expect(formatPhone('+31612345678')).toBe('+31 6 1234 5678');
    expect(formatPhone('+31852080400')).toBe('+31 85 208 0400');
    expect(formatPhone('+31201234567')).toBe('+31 20 123 4567');
  });

  function setup(initial = '') {
    const changes: string[] = [];
    function Harness() {
      const [value, setValue] = React.useState(initial);
      return (
        <E164PhoneInput
          value={value}
          onChange={(v) => {
            changes.push(v);
            setValue(v);
          }}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    return { input, changes };
  }

  it('shows the +31 code and the Dutch example before anything is typed', () => {
    const { input } = setup();
    expect(screen.getByRole('combobox').textContent).toContain('+31');
    expect(input.placeholder).toBe('XX XXX XXXX');
  });

  it.each([
    ['0612345678', '+31612345678'],
    ['06 1234 5678', '+31612345678'],
    ['0852080400', '+31852080400'],
  ])('typing %s stores %s and shows the national digits', (typed, e164) => {
    const { input, changes } = setup();
    fireEvent.change(input, { target: { value: typed } });
    expect(changes.at(-1)).toBe(e164);
    expect(input.value).toBe(e164.slice(3));
  });

  it('pasting +31 6 1234 5678 stores +31612345678, without a doubled country code', () => {
    const { input, changes } = setup();
    fireEvent.change(input, { target: { value: '+31 6 1234 5678' } });
    expect(changes.at(-1)).toBe('+31612345678');
    expect(input.value).toBe('612345678');
  });

  it('pasting a number of another country switches the picker to it', () => {
    const { input, changes } = setup();
    fireEvent.change(input, { target: { value: '+44 7911 123456' } });
    expect(changes.at(-1)).toBe('+447911123456');
    expect(screen.getByRole('combobox').textContent).toContain('+44');
  });

  it('shows a stored Dutch number as its national part', () => {
    const { input } = setup('+31852080400');
    expect(input.value).toBe('852080400');
    expect(screen.getByRole('combobox').textContent).toContain('+31');
  });
});
