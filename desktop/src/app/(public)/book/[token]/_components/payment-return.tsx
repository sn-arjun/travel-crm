'use client';

import * as React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui';
import { paymentHref, type PublicPage } from '@/lib/booking-form';
import { useT } from '@/lib/i18n';
import type { PaymentReturn, PendingPayment } from '@/lib/payment-return';
import { brandStyle, money } from './booking-ui';

interface PaymentReturnCardProps {
  result: PaymentReturn;
  agency: PublicPage['agency'] | null;
  /** The link of the payment that was just left, so a cancelled or failed one can be tried again (booking page only). */
  pending?: PendingPayment | null;
  /** Where the payment page sends the customer back to. */
  returnTo?: string;
  /** Booking page: start another booking. Never offered after a failed payment, which is not the end of this booking. */
  onAnother?: () => void;
  /** Traveller page: a slim notice above the pay step, whose own buttons are the retry. */
  banner?: boolean;
}

/**
 * R164-1: what the customer sees after the payment page sends them back with ?payment=... : a paid confirmation with the booking
 * reference and what happens next, or a clear way to try again. It replaces the empty booking form, which must never come back
 * after a payment.
 */
export function PaymentReturnCard({ result, agency, pending, returnTo, onAnother, banner }: PaymentReturnCardProps) {
  const t = useT();
  const name = agency?.name || t('booking.agency.fallback');
  const paid = result.state === 'paid';
  const Icon = paid ? CheckCircle2 : XCircle;
  const retryUrl = !paid && pending ? paymentHref(pending.url, returnTo ?? '') : null;
  const contact = [agency?.email, agency?.phone].filter(Boolean) as string[];

  if (banner) {
    return (
      <p
        role={paid ? 'status' : 'alert'}
        className={`rounded-md px-ds-3 py-ds-2 text-sm ${paid ? 'bg-ds-success-subtle text-ds-success-on-subtle' : 'bg-ds-warning-subtle text-ds-warning-on-subtle'}`}
        data-testid="payment-return"
        data-state={result.state}
      >
        {t(`booking.payReturn.${result.state}.title`)}. {t(`booking.payReturn.${result.state}.trip`)}
      </p>
    );
  }

  return (
    <section className="space-y-ds-4" aria-live="polite" data-testid="payment-return" data-state={result.state}>
      <div className="rounded-xl border border-ds-border bg-ds-surface p-ds-5 text-center">
        <Icon className={`mx-auto size-10 ${paid ? 'text-ds-success' : 'text-ds-warning'}`} aria-hidden="true" />
        <h1 className="mt-ds-2 text-xl font-semibold" data-testid="payment-return-title">{t(`booking.payReturn.${result.state}.title`)}</h1>
        <p className="mt-1 text-sm text-ds-foreground-muted">{t(`booking.payReturn.${result.state}.body`, { agency: name })}</p>
        {result.reference && (
          <div className="mt-ds-4 rounded-lg bg-ds-surface-sunken p-ds-3">
            <p className="text-xs text-ds-foreground-muted">{t('booking.done.reference')}</p>
            <p className="text-lg font-bold tracking-wide" data-testid="payment-return-reference">{result.reference}</p>
            <p className="text-xs text-ds-foreground-muted">{t('booking.done.referenceHint')}</p>
          </div>
        )}
      </div>

      {paid && (
        <div className="space-y-ds-1 rounded-xl border border-ds-border bg-ds-surface p-ds-4 text-sm" data-testid="payment-return-next">
          <h2 className="font-semibold">{t('booking.payReturn.next.title')}</h2>
          <ul className="list-disc space-y-1 ps-ds-5 text-ds-foreground-muted">
            <li>{t('booking.payReturn.next.email')}</li>
            <li>{t('booking.payReturn.next.agency', { agency: name })}</li>
            <li>{t('booking.payReturn.next.keep')}</li>
          </ul>
        </div>
      )}

      {!paid && (
        <div className="space-y-ds-2 rounded-xl border border-ds-border bg-ds-surface p-ds-4 text-center">
          {retryUrl && pending ? (
            <>
              <Button asChild size="lg" className="w-full sm:w-auto" style={brandStyle(agency?.primaryColor ?? null)}>
                <a href={retryUrl} data-testid="payment-return-retry">
                  {t('booking.payReturn.retry')} ({money(pending.amount, { currency: pending.currency })})
                </a>
              </Button>
              <p className="text-xs text-ds-foreground-muted">{t('booking.payReturn.retryHint')}</p>
            </>
          ) : (
            <p className="text-sm text-ds-foreground-muted" data-testid="payment-return-contact">
              {t('booking.payReturn.noLink', { agency: name })}
              {contact.length > 0 && <span className="mt-1 block" dir="ltr">{contact.join(' · ')}</span>}
            </p>
          )}
        </div>
      )}

      {paid && onAnother && (
        <div className="text-center">
          <Button variant="ghost" onClick={onAnother} data-testid="booking-another">{t('booking.done.another')}</Button>
        </div>
      )}
    </section>
  );
}
