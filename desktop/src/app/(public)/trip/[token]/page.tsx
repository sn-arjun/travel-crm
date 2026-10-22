'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Check } from 'lucide-react';

import { formatDisplayDate } from '@/lib/dates';
import { startStep, type TripPage, type TripStep } from '@/lib/extras';
import { useI18n } from '@/lib/i18n';
import { parsePaymentReturn, type PaymentReturn } from '@/lib/payment-return';
import { PaymentReturnCard } from '@/app/(public)/book/[token]/_components/payment-return';
import { PublicI18n } from '@/app/(public)/book/[token]/_components/public-i18n';
import { AgencyBar, Loading, StateScreen } from '@/app/(public)/book/[token]/_components/tour-header';
import { ExtrasStep } from './_components/extras-step';
import { PayStep } from './_components/pay-step';
import { TravellersStep, travellerComplete } from './_components/travellers-step';
import { useTrip } from './_components/use-trip';

/**
 * The self-service page of one booking (or one traveller): <app>/trip/<token>. No sign-in. Three steps: the travellers' details as on
 * the travel document, extras per person and day, and the review with payment. Every step is saved on its own, so a party can stop
 * and come back from the same link. It shows in the agency's branding and language and never anything about other bookings.
 */
export default function TripPageRoute() {
  return (
    <PublicI18n>
      <TripContent />
    </PublicI18n>
  );
}

function TripContent() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const { state, apply, retry } = useTrip(token);
  const page = state.kind === 'ready' ? state.page : null;

  return (
    <div className="mx-auto max-w-2xl space-y-ds-5 px-4 py-6 sm:py-8" data-testid="trip-page">
      <AgencyBar agency={page?.agency ?? null} available={page?.language.available ?? ['en']} />
      {state.kind === 'loading' && <Loading />}
      {(state.kind === 'missing' || state.kind === 'gone') && <StateScreen kind={state.kind} />}
      {state.kind === 'error' && <StateScreen kind="error" onRetry={retry} />}
      {page && <TripSteps page={page} token={token} onPage={apply} />}
    </div>
  );
}

function TripSteps({ page, token, onPage }: { page: TripPage; token: string; onPage: (page: TripPage) => void }) {
  const { t } = useI18n();
  const hasExtras = page.extras.length > 0;
  const steps: TripStep[] = hasExtras ? ['travellers', 'extras', 'pay'] : ['travellers', 'pay'];
  const [step, setStep] = React.useState<TripStep>(() => {
    const wanted = typeof window === 'undefined' ? 'travellers' : startStep(window.location.search);
    return steps.includes(wanted) ? wanted : 'travellers';
  });
  const [notice, setNotice] = React.useState<string | null>(null);
  // Back from the payment page: the answer shows above the pay step, whose own buttons are the way to try again (R164-1).
  const [paymentReturn] = React.useState<PaymentReturn | null>(() => (typeof window === 'undefined' ? null : parsePaymentReturn(window.location.search)));

  const done: Record<TripStep, boolean> = {
    travellers: page.passengers.every((p) => travellerComplete(page, p)),
    extras: page.passengers.some((p) => p.extras.length > 0),
    pay: page.extrasMoney.unpaid <= 0.005 && (page.invoice?.balance ?? 0) <= 0.005 && (page.invoice !== null || page.extrasMoney.total > 0),
  };
  const next = (from: TripStep) => steps[steps.indexOf(from) + 1] ?? from;
  const dates = page.endDate !== page.startDate ? t('trip.dates', { start: formatDisplayDate(page.startDate), end: formatDisplayDate(page.endDate) }) : formatDisplayDate(page.startDate);

  return (
    <>
      <header className="space-y-ds-1" data-testid="trip-header">
        <h1 className="text-2xl font-bold tracking-tight text-ds-foreground" style={{ fontFamily: 'var(--font-display)' }}>{page.tour.title}</h1>
        <p className="text-sm text-ds-foreground-muted">{[dates, page.tour.destination].filter(Boolean).join(' · ')}</p>
        <p className="text-xs text-ds-foreground-muted">{t('trip.reference', { reference: page.reference })}</p>
        {page.scope === 'passenger' && <p className="text-xs text-ds-foreground-muted" data-testid="trip-personal">{t('trip.personal')}</p>}
      </header>

      <nav aria-label={t('trip.steps')} className="flex flex-wrap gap-ds-2" data-testid="trip-steps">
        {steps.map((s, i) => {
          const active = s === step;
          return (
            <button
              key={s}
              type="button"
              aria-current={active ? 'step' : undefined}
              onClick={() => {
                setNotice(null);
                setStep(s);
              }}
              className={`flex items-center gap-ds-2 rounded-full border px-ds-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-ds-foreground bg-ds-foreground text-ds-surface' : 'border-ds-border text-ds-foreground-muted hover:bg-ds-surface-sunken'}`}
              data-testid={`step-${s}`}
            >
              <span className={`flex size-5 items-center justify-center rounded-full text-xs ${done[s] ? 'bg-ds-success text-ds-surface' : 'bg-ds-surface-sunken text-ds-foreground'}`} aria-hidden="true">
                {done[s] ? <Check className="size-3" /> : i + 1}
              </span>
              {t(`trip.step.${s}`)}
            </button>
          );
        })}
      </nav>

      {paymentReturn && step === 'pay' && <PaymentReturnCard banner result={paymentReturn} agency={page.agency} />}
      {notice && <p role="status" className="rounded-md bg-ds-success-subtle px-ds-3 py-ds-2 text-sm text-ds-success-on-subtle" data-testid="trip-notice">{notice}</p>}

      {step === 'travellers' && (
        <TravellersStep
          // A fresh form after a save, so it shows exactly what was stored.
          key={JSON.stringify(page.passengers.map((p) => [p.ref, p.firstName, p.lastName, p.values]))}
          page={page}
          token={token}
          onSaved={(p) => {
            onPage(p);
            setNotice(t('trip.travellers.saved'));
            setStep(next('travellers'));
          }}
        />
      )}
      {step === 'extras' && (
        <ExtrasStep
          page={page}
          token={token}
          onSaved={(p) => {
            onPage(p);
            setNotice(p.invoiceCreated ? t('trip.extras.savedInvoice', { number: p.invoiceCreated.number }) : t('trip.extras.saved'));
            if (p.invoiceCreated) setStep(next('extras'));
          }}
        />
      )}
      {step === 'pay' && <PayStep page={page} token={token} />}
    </>
  );
}
