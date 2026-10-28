import { describe, expect, it } from 'vitest';
import { paymentMethodLabel, paymentMethodOptions, paymentMethodsFor } from './payment-methods';
import { translate } from './i18n';

describe('paymentMethodsFor', () => {
  const everywhere = ['cash', 'bank_transfer', 'card', 'cheque', 'online'];

  it('every country gets cash, bank transfer, card, cheque and online', () => {
    for (const c of ['IN', 'NL', 'GB', 'US', 'AE', 'AU', '']) {
      for (const m of everywhere) expect(paymentMethodsFor(c), `${c} ${m}`).toContain(m);
    }
  });

  it('UPI only for India', () => {
    expect(paymentMethodsFor('IN')).toContain('upi');
    for (const c of ['NL', 'GB', 'US', 'AE', 'DE', '']) expect(paymentMethodsFor(c)).not.toContain('upi');
  });

  it('iDEAL and SEPA transfer for EU and EEA countries only', () => {
    for (const c of ['NL', 'DE', 'FR', 'NO', 'CH']) {
      expect(paymentMethodsFor(c)).toEqual(expect.arrayContaining(['ideal', 'sepa_transfer']));
    }
    for (const c of ['IN', 'GB', 'US', 'AE', '']) {
      expect(paymentMethodsFor(c)).not.toContain('ideal');
      expect(paymentMethodsFor(c)).not.toContain('sepa_transfer');
    }
  });

  it('is case-insensitive and never repeats a method', () => {
    expect(paymentMethodsFor('nl')).toEqual(paymentMethodsFor('NL'));
    const list = paymentMethodsFor('NL');
    expect(new Set(list).size).toBe(list.length);
  });
});

describe('paymentMethodOptions and labels', () => {
  it('keeps a stored value outside the country set, so an old UPI row still shows', () => {
    expect(paymentMethodOptions('NL').map((o) => o.value)).not.toContain('upi');
    const withCurrent = paymentMethodOptions('NL', undefined, 'upi');
    expect(withCurrent.map((o) => o.value)).toContain('upi');
    expect(withCurrent.find((o) => o.value === 'upi')?.label).toBe('UPI');
  });

  it('labels current and stored values; an unknown value is humanised', () => {
    expect(paymentMethodLabel('bank_transfer')).toBe('Bank transfer');
    expect(paymentMethodLabel('transfer')).toBe('Bank transfer');
    expect(paymentMethodLabel('check')).toBe('Cheque');
    expect(paymentMethodLabel('ideal')).toBe('iDEAL');
    expect(paymentMethodLabel('sepa_transfer')).toBe('SEPA transfer');
    expect(paymentMethodLabel('neft_rtgs')).toBe('neft rtgs');
    expect(paymentMethodLabel(null)).toBe('—');
  });

  it('has a Dutch label for every method', () => {
    for (const m of paymentMethodsFor('NL')) {
      const nl = translate('nl', `payments.method.${m}`);
      expect(nl, m).not.toMatch(/^payments\.method\./);
    }
    expect(translate('nl', 'payments.method.bank_transfer')).toBe('Bankoverschrijving');
  });
});
