'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';

import { getApiBaseUrl } from '@/lib/api/config';
import type { PublicPage } from '@/lib/booking-form';
import { useI18n } from '@/lib/i18n';
import { setLocaleContext } from '@/lib/locale';
import { BookingForm } from './_components/booking-form';
import { Confirmation, type BookingResult } from './_components/confirmation';
import { PublicI18n, startLanguage } from './_components/public-i18n';
import { AgencyBar, Loading, StateScreen, TourHeader } from './_components/tour-header';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; page: PublicPage }
  | { kind: 'missing' }
  | { kind: 'gone' }
  | { kind: 'error' };

/**
 * The booking page of one departure: <app>/book/<token>. No sign-in. It reads GET /public/departures/:token (a fixed projection:
 * dates, prices by age band, pickup points, terms, the passenger fields to collect) and posts the booking to the same address.
 * It shows in the agency's branding and language, never anything about other customers, and it works inside an iframe of a
 * website the agency allowed.
 */
export default function PublicBookingPage() {
  return (
    <PublicI18n>
      <BookingPageContent />
    </PublicI18n>
  );
}

function BookingPageContent() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const { setLocale } = useI18n();
  const [state, setState] = React.useState<State>({ kind: 'loading' });
  const [result, setResult] = React.useState<BookingResult | null>(null);
  const [formKey, setFormKey] = React.useState(0);
  const first = React.useRef(true);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/public/departures/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' }, signal });
        if (res.status === 404) return setState({ kind: 'missing' });
        if (res.status === 410) return setState({ kind: 'gone' });
        if (!res.ok) return setState({ kind: 'error' });
        const body = (await res.json()) as { data?: PublicPage };
        if (!body.data) return setState({ kind: 'error' });
        const page = body.data;
        // Money, dates and the phone picker follow the agency, whatever this visitor's browser says.
        setLocaleContext({ currency: page.currency, locale: page.locale.locale, timeZone: page.locale.timeZone, country: page.locale.country, phoneDefaultCountry: page.locale.phoneDefaultCountry });
        if (first.current) {
          first.current = false;
          const requested = new URLSearchParams(window.location.search).get('lang');
          setLocale(startLanguage(page.language.available, page.language.default, requested));
        }
        document.title = [page.tour.title, page.agency.name].filter(Boolean).join(' - ');
        setState({ kind: 'ready', page });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState({ kind: 'error' });
      }
    },
    [token, setLocale],
  );

  React.useEffect(() => {
    if (!token) return;
    const ctl = new AbortController();
    void load(ctl.signal);
    return () => ctl.abort();
  }, [token, load]);

  const retry = () => {
    setState({ kind: 'loading' });
    void load();
  };

  const page = state.kind === 'ready' ? state.page : null;
  return (
    <div className="mx-auto max-w-2xl space-y-ds-5 px-4 py-6 sm:py-8" data-testid="public-booking-page">
      <AgencyBar agency={page?.agency ?? null} available={page?.language.available ?? ['en']} />
      {state.kind === 'loading' && <Loading />}
      {(state.kind === 'missing' || state.kind === 'gone') && <StateScreen kind={state.kind} />}
      {state.kind === 'error' && <StateScreen kind="error" onRetry={retry} />}
      {page && page.state === 'closed' && <StateScreen kind="closed" agency={page.agency} />}
      {page && page.state === 'open' && result && (
        <Confirmation
          page={page}
          result={result}
          onAnother={() => {
            setResult(null);
            setFormKey((k) => k + 1);
            retry();
          }}
        />
      )}
      {page && page.state === 'open' && !result && (
        <>
          <TourHeader page={page} />
          <BookingForm
            key={formKey}
            page={page}
            token={token}
            onBooked={setResult}
            onStale={() => void load()}
            onSeats={(seats) => setState({ kind: 'ready', page: { ...page, seats } })}
          />
        </>
      )}
      {page && (page.agency.email || page.agency.phone) && page.state === 'open' && <AgencyContact agency={page.agency} />}
    </div>
  );
}

function AgencyContact({ agency }: { agency: PublicPage['agency'] }) {
  const { t } = useI18n();
  return (
    <footer className="border-t border-ds-border pt-ds-3 text-xs text-ds-foreground-muted">
      <p>{t('booking.contactAgency', { agency: agency.name || t('booking.agency.fallback') })}</p>
      <p className="flex flex-wrap gap-x-ds-3">
        {agency.email && <span dir="ltr">{agency.email}</span>}
        {agency.phone && <span dir="ltr">{agency.phone}</span>}
      </p>
    </footer>
  );
}
