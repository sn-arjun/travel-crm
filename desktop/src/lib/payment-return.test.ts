import { describe, expect, it } from 'vitest';

import { parsePaymentReturn, paymentReturnAddress, withoutPaymentReturn } from './payment-return';

describe('parsePaymentReturn', () => {
  it('reads what the API pay page answers', () => {
    expect(parsePaymentReturn('?payment=success&ref=BK-1042')).toEqual({ state: 'paid', reference: 'BK-1042' });
    expect(parsePaymentReturn('?payment=failed')).toEqual({ state: 'failed', reference: null });
    expect(parsePaymentReturn('?payment=cancelled')).toEqual({ state: 'cancelled', reference: null });
  });

  it('accepts the other spellings and any case', () => {
    expect(parsePaymentReturn('?payment=paid')?.state).toBe('paid');
    expect(parsePaymentReturn('?payment=Canceled')?.state).toBe('cancelled');
    expect(parsePaymentReturn('?step=pay&payment=FAILURE')?.state).toBe('failed');
  });

  it('is null for a normal visit or an unknown answer', () => {
    expect(parsePaymentReturn('')).toBeNull();
    expect(parsePaymentReturn('?lang=nl')).toBeNull();
    expect(parsePaymentReturn('?payment=maybe')).toBeNull();
  });

  it('ignores a reference that is not a plain reference', () => {
    expect(parsePaymentReturn('?payment=paid&ref=<script>')?.reference).toBeNull();
  });
});

describe('return address', () => {
  it('carries the reference and drops an older answer', () => {
    expect(paymentReturnAddress('http://x.test/book/abc?lang=nl&payment=failed&ref=OLD', 'BK-7')).toBe('http://x.test/book/abc?lang=nl&ref=BK-7');
    expect(paymentReturnAddress('http://x.test/book/abc', null)).toBe('http://x.test/book/abc');
  });

  it('can be cleared for a fresh start', () => {
    expect(withoutPaymentReturn('http://x.test/book/abc?payment=success&ref=BK-7&lang=nl')).toBe('http://x.test/book/abc?lang=nl');
  });
});
