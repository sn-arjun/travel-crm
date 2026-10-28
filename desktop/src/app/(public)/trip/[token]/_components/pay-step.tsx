'use client';

import * as React from 'react';

import { Alert, AlertDescription, Button, Spinner } from '@/components/ui';
import { paymentHref } from '@/lib/booking-form';
import type { TripPage } from '@/lib/extras';
import { useI18n } from '@/lib/i18n';
import { brandStyle, money } from '@/app/(public)/book/[token]/_components/booking-ui';
import { tripRequest } from './use-trip';

interface PayStepProps {
  page: TripPage;
  token: string;
}

type What = 'extras' | 'deposit' | 'balance';

interface BankAnswer {
  lines: Array<{ field: string; label: string; value: string }>;
  reference: string;
  amount: number;
  currency: string;
}

interface PayAnswer {
  payment?: { url: string; amount: number; currency: string };
  bank?: BankAnswer;
  unavailable?: boolean;
  message?: string;
  reference?: string;
}

/** Only a web address is followed: whatever else the answer might hold, the visitor is never sent anywhere else. */
const isWebAddress = (url: string): boolean => /^https?:\/\//i.test(url);

/** What has been chosen, what is paid and what is due, and the way to pay it: the agency's payment page, or its bank details. */
export function PayStep({ page, token }: PayStepProps) {
  const { t } = useI18n();
  const [busy, setBusy] = React.useState<What | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [bank, setBank] = React.useState<BankAnswer | null>(null);

  const invoice = page.invoice;
  const extrasDue = page.extrasMoney.unpaid;
  const depositDue = page.deposit?.due ?? 0;
  const balanceDue = invoice?.balance ?? 0;
  const nothing = extrasDue <= 0.005 && depositDue <= 0.005 && balanceDue <= 0.005;
  // A passenger's own link covers that person only; paying is for the whole booking.
  const canPay = page.scope === 'booking';

  async function pay(what: What) {
    if (busy) return;
    setBusy(what);
    setMessage(null);
    setBank(null);
    const result = await tripRequest<PayAnswer>(token, 'POST', '/pay', { what });
    setBusy(null);
    if (!result.ok) return setMessage(result.refusal.status === 0 ? t('trip.error.network') : result.refusal.message || t('trip.error.generic'));
    const data = result.data;
    if (data.payment && isWebAddress(data.payment.url)) {
      // The test gateway's page sends the visitor back here, on this step, when they are done.
      window.location.assign(paymentHref(data.payment.url, `${window.location.origin}${window.location.pathname}?step=pay`));
      return;
    }
    if (data.bank) return setBank(data.bank);
    setMessage(data.message || t('trip.pay.unavailable'));
  }

  const row = (label: string, value: string, testid?: string) => (
    <div className="flex items-center justify-between gap-ds-3 py-ds-1">
      <dt className="text-ds-foreground-muted">{label}</dt>
      <dd className="tabular-nums" data-testid={testid}>{value}</dd>
    </div>
  );

  return (
    <div className="space-y-ds-4" data-testid="pay-step">
      <section className="space-y-ds-2 rounded-xl border border-ds-border bg-ds-surface p-ds-4">
        <h3 className="font-semibold">{t('trip.pay.summary')}</h3>
        <dl className="divide-y divide-ds-border text-sm">
          {invoice && row(t('trip.pay.booking', { number: invoice.number }), money(invoice.total, page))}
          {invoice && row(t('trip.pay.paid'), money(invoice.paid, page))}
          {invoice && row(t('trip.pay.balance'), money(invoice.balance, page), 'pay-balance')}
          {page.extrasMoney.total > 0 && row(t('trip.pay.extras'), money(page.extrasMoney.total, page), 'pay-extras-total')}
          {page.extrasMoney.total > 0 && row(t('trip.pay.extrasPaid'), money(page.extrasMoney.paid, page), 'pay-extras-paid')}
          {page.extrasMoney.total > 0 && row(t('trip.pay.extrasDue'), money(extrasDue, page), 'pay-extras-due')}
        </dl>
        {!invoice && page.extrasMoney.total === 0 && <p className="text-sm text-ds-foreground-muted">{t('trip.pay.noInvoice')}</p>}
      </section>

      {canPay && !nothing && (
        <div className="flex flex-wrap gap-ds-3">
          {extrasDue > 0.005 && (
            <Button type="button" onClick={() => void pay('extras')} disabled={busy !== null} style={brandStyle(page.agency.primaryColor)} data-testid="pay-extras">
              {busy === 'extras' && <Spinner className="size-4" />}
              {t('trip.pay.payExtras', { amount: money(extrasDue, page) })}
            </Button>
          )}
          {depositDue > 0.005 && (
            <Button type="button" onClick={() => void pay('deposit')} disabled={busy !== null} variant={extrasDue > 0.005 ? 'outline' : undefined} style={extrasDue > 0.005 ? undefined : brandStyle(page.agency.primaryColor)} data-testid="pay-deposit">
              {busy === 'deposit' && <Spinner className="size-4" />}
              {t('trip.pay.payDeposit', { amount: money(depositDue, page) })}
            </Button>
          )}
          {balanceDue > 0.005 && (
            <Button type="button" onClick={() => void pay('balance')} disabled={busy !== null} variant="outline" data-testid="pay-balance-button">
              {busy === 'balance' && <Spinner className="size-4" />}
              {t('trip.pay.payBalance', { amount: money(balanceDue, page) })}
            </Button>
          )}
        </div>
      )}
      {canPay && nothing && (invoice || page.extrasMoney.total > 0) && (
        <p className="rounded-xl border border-ds-border bg-ds-success-subtle p-ds-4 text-sm text-ds-success-on-subtle" role="status" data-testid="pay-nothing">{t('trip.pay.allPaid')}</p>
      )}
      {!canPay && <p className="text-sm text-ds-foreground-muted" data-testid="pay-booking-only">{t('trip.pay.bookingOnly')}</p>}

      {message && (
        <Alert variant="destructive" role="alert" data-testid="pay-error">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {bank && (
        <section className="space-y-ds-2 rounded-xl border border-ds-border bg-ds-surface p-ds-4" data-testid="pay-bank">
          <h3 className="font-semibold">{t('trip.pay.bankTitle', { amount: money(bank.amount, page) })}</h3>
          <dl className="divide-y divide-ds-border text-sm">
            {bank.lines.map((l) => (
              <div key={l.field} className="flex items-center justify-between gap-ds-3 py-ds-1">
                <dt className="text-ds-foreground-muted">{l.label}</dt>
                <dd dir="ltr" className="font-mono">{l.value}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-ds-3 py-ds-1">
              <dt className="text-ds-foreground-muted">{t('trip.pay.reference')}</dt>
              <dd dir="ltr" className="font-mono font-semibold" data-testid="pay-reference">{bank.reference}</dd>
            </div>
          </dl>
          <p className="text-xs text-ds-foreground-muted">{t('trip.pay.bankHint')}</p>
        </section>
      )}
    </div>
  );
}
