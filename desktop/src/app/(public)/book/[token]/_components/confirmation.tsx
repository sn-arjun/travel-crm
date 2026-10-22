'use client';

import * as React from 'react';
import { CheckCircle2, Clock } from 'lucide-react';

import { Button } from '@/components/ui';
import { formatDisplayDateTime } from '@/lib/dates';
import { paymentHref, type PublicPage } from '@/lib/booking-form';
import { useT } from '@/lib/i18n';
import { brandStyle, money } from './booking-ui';

/** The answer of POST /public/departures/:token/bookings. */
export interface BookingResult {
  status: 'held' | 'confirmed' | 'waitlisted';
  reference: string;
  holdExpiresAt: string | null;
  seats: number;
  currency: string;
  total?: number;
  depositAmount?: number;
  payment?: { url: string; amount: number; currency: string };
  bank?: { lines: Array<{ field: string; label: string; value: string }>; reference: string; amount: number; currency: string };
}

const BANK_FIELDS = new Set(['accountName', 'bankName', 'iban', 'bic', 'sortCode', 'accountNumber', 'routingNumber', 'bsb', 'swift', 'ifsc', 'upiId', 'branch']);

/** What the visitor sees after booking: the reference, until when the seats are held, and how to pay the deposit. */
export function Confirmation({ page, result, onAnother }: { page: PublicPage; result: BookingResult; onAnother: () => void }) {
  const t = useT();
  const agency = page.agency.name || t('booking.agency.fallback');
  const until = result.holdExpiresAt ? formatDisplayDateTime(result.holdExpiresAt) : '';
  const returnTo = typeof window !== 'undefined' ? window.location.href : '';
  const money2 = (n: number) => money(n, { currency: result.currency });
  const Icon = result.status === 'waitlisted' ? Clock : CheckCircle2;

  return (
    <section className="space-y-ds-4" aria-live="polite" data-testid="booking-confirmation" data-status={result.status}>
      <div className="rounded-xl border border-ds-border bg-ds-surface p-ds-5 text-center">
        <Icon className={`mx-auto size-10 ${result.status === 'waitlisted' ? 'text-ds-warning' : 'text-ds-success'}`} aria-hidden="true" />
        <h1 className="mt-ds-2 text-xl font-semibold" data-testid="confirmation-title">{t(`booking.done.${result.status}.title`)}</h1>
        <p className="mt-1 text-sm text-ds-foreground-muted">
          {result.status === 'held' ? t('booking.done.held.body', { until, agency }) : result.status === 'confirmed' ? t('booking.done.confirmed.body', { agency }) : t('booking.done.waitlisted.body')}
        </p>
        <div className="mt-ds-4 rounded-lg bg-ds-surface-sunken p-ds-3">
          <p className="text-xs text-ds-foreground-muted">{t('booking.done.reference')}</p>
          <p className="text-lg font-bold tracking-wide" data-testid="confirmation-reference">{result.reference}</p>
          <p className="text-xs text-ds-foreground-muted">{t('booking.done.referenceHint')}</p>
        </div>
      </div>

      {typeof result.total === 'number' && result.total > 0 && (
        <dl className="grid grid-cols-2 gap-ds-2 rounded-xl border border-ds-border bg-ds-surface p-ds-4 text-sm">
          <dt className="text-ds-foreground-muted">{t('booking.done.total')}</dt>
          <dd className="text-end tabular-nums font-medium">{money2(result.total)}</dd>
          {typeof result.depositAmount === 'number' && result.depositAmount > 0 && (
            <>
              <dt className="text-ds-foreground-muted">{t('booking.done.deposit')}</dt>
              <dd className="text-end tabular-nums font-medium" data-testid="confirmation-deposit">{money2(result.depositAmount)}</dd>
            </>
          )}
        </dl>
      )}

      {result.payment && (
        <div className="space-y-ds-2 rounded-xl border border-ds-border bg-ds-surface p-ds-4 text-center">
          <Button asChild size="lg" className="w-full sm:w-auto" style={brandStyle(page.agency.primaryColor)}>
            <a href={paymentHref(result.payment.url, returnTo)} data-testid="confirmation-pay">
              {t('booking.done.pay')} ({money2(result.payment.amount)})
            </a>
          </Button>
          <p className="text-xs text-ds-foreground-muted">{t('booking.done.payHint', { agency })}</p>
        </div>
      )}

      {result.bank && (
        <div className="space-y-ds-2 rounded-xl border border-ds-border bg-ds-surface p-ds-4" data-testid="confirmation-bank">
          <h2 className="font-semibold">{t('booking.done.bank.title')}</h2>
          <p className="text-sm text-ds-foreground-muted">{t('booking.done.bank.body', { amount: money2(result.bank.amount) })}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-ds-3 gap-y-1 text-sm">
            {result.bank.lines.map((l) => (
              <React.Fragment key={l.field}>
                <dt className="text-ds-foreground-muted">{BANK_FIELDS.has(l.field) ? t(`booking.bank.${l.field}`) : l.label}</dt>
                <dd className="font-mono" dir="ltr">{l.value}</dd>
              </React.Fragment>
            ))}
            <dt className="font-medium">{t('booking.done.bank.reference')}</dt>
            <dd className="font-mono font-semibold" dir="ltr" data-testid="bank-reference">{result.bank.reference}</dd>
          </dl>
        </div>
      )}

      <div className="text-center">
        <Button variant="ghost" onClick={onAnother} data-testid="booking-another">{t('booking.done.another')}</Button>
      </div>
    </section>
  );
}
