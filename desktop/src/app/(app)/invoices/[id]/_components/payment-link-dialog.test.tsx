import { describe, it, expect } from 'vitest';
import { linkAmountFor } from './payment-link-dialog';
import type { PaymentDefaults } from '@/lib/api/invoices';

const defaults = (deposit: PaymentDefaults['deposit']): PaymentDefaults => ({ deposit, stripeMethodTypes: null, bankReference: '{invoice_number}' });
const invoice = { total: 1000, balanceDue: 1000 };

describe('linkAmountFor', () => {
  it('balance is what is still owed', () => {
    expect(linkAmountFor('balance', { total: 1000, balanceDue: 640.5 }, null, undefined)).toEqual({ amount: 640.5 });
  });

  it('deposit as a percentage of the invoice total, rounded to cents', () => {
    expect(linkAmountFor('deposit', invoice, defaults({ type: 'percent', value: 30 }), undefined)).toEqual({ amount: 300 });
    expect(linkAmountFor('deposit', { total: 333.33, balanceDue: 333.33 }, defaults({ type: 'percent', value: 30 }), undefined).amount).toBe(100);
  });

  it('deposit as a fixed amount, never more than is owed', () => {
    expect(linkAmountFor('deposit', invoice, defaults({ type: 'fixed', value: 250 }), undefined)).toEqual({ amount: 250 });
    expect(linkAmountFor('deposit', { total: 1000, balanceDue: 200 }, defaults({ type: 'fixed', value: 250 }), undefined)).toEqual({ amount: 200 });
  });

  it('deposit with no default (or defaults not loaded) cannot be created', () => {
    expect(linkAmountFor('deposit', invoice, defaults({ type: 'none', value: null }), undefined)).toEqual({ amount: null, problem: 'noDeposit' });
    expect(linkAmountFor('deposit', invoice, null, undefined)).toEqual({ amount: null, problem: 'noDeposit' });
  });

  it('custom amount must be above 0 and at most the balance', () => {
    expect(linkAmountFor('custom', invoice, null, undefined)).toEqual({ amount: null, problem: 'required' });
    expect(linkAmountFor('custom', invoice, null, 0)).toEqual({ amount: null, problem: 'required' });
    expect(linkAmountFor('custom', invoice, null, 1000.01)).toEqual({ amount: null, problem: 'aboveBalance' });
    expect(linkAmountFor('custom', invoice, null, 1000)).toEqual({ amount: 1000 });
    expect(linkAmountFor('custom', invoice, null, 0.01)).toEqual({ amount: 0.01 });
  });
});
