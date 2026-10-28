'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { getApiBaseUrl } from '@/lib/api/config';
import { formatDisplayDate } from '@/lib/dates';
import { formatExactCurrency } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { AcceptedPanel, AcceptSheet, type AcceptAnswer, type AcceptBlock } from './_components/accept-sheet';

interface QuoteItem {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  quantity?: number | null;
  sellingPrice?: number | null;
}
interface QuoteDay {
  id: string;
  dayNumber: number;
  title?: string | null;
  description?: string | null;
  city?: string | null;
  items: QuoteItem[];
}
interface Quote {
  itinerary: {
    title: string;
    validityDate?: string | null;
    notes?: string | null;
    inclusions: string[];
    exclusions: string[];
    termsConditions?: string | null;
    currency?: string | null;
    grandTotal?: number | null;
    totalSelling?: number | null;
    totalTax?: number | null;
  };
  days: QuoteDay[];
  /** Only while the agency has quote acceptance on (R155). */
  accept?: AcceptBlock;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; quote: Quote }
  | { kind: 'gone'; message: string | null }
  | { kind: 'missing' }
  | { kind: 'error' };

function money(amount: number | null | undefined, currency: string | null | undefined): string {
  try {
    return formatExactCurrency(amount, currency || undefined);
  } catch {
    return `${currency ?? ''} ${(amount ?? 0).toFixed(2)}`.trim();
  }
}

/** Plain text only: descriptions can hold HTML from the rich-text editor, which is never injected here. */
function plain(html: string | null | undefined): string {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The page behind the link in a shared-quotation email: <APP_URL>/q/<token>. No sign-in. It reads the public
 * quotation endpoint (GET /public/quotation/:token), which hides cost prices, internal notes and the lines of an age
 * band nobody falls in. With quote acceptance on it also shows "Accept and book" (POST .../accept).
 */
export default function SharedQuotePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const { t, setLocale } = useI18n();
  const [state, setState] = React.useState<State>({ kind: 'loading' });
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [answer, setAnswer] = React.useState<AcceptAnswer | null>(null);
  const localeSet = React.useRef(false);

  React.useEffect(() => {
    if (!token) return;
    const ctl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/public/quotation/${encodeURIComponent(token)}`, {
          headers: { Accept: 'application/json' },
          signal: ctl.signal,
        });
        const body = (await res.json().catch(() => ({}))) as Quote & { error?: string };
        if (res.ok) {
          // The agency's language, once; the page is the agency's own.
          if (body.accept?.language && !localeSet.current) {
            localeSet.current = true;
            setLocale(body.accept.language);
          }
          setState({ kind: 'ready', quote: body });
        } else if (res.status === 404) setState({ kind: 'missing' });
        else if (res.status === 410) setState({ kind: 'gone', message: body.error ?? null });
        else setState({ kind: 'error' });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState({ kind: 'error' });
      }
    })();
    return () => ctl.abort();
  }, [token, setLocale]);

  if (state.kind === 'loading') {
    return (
      <div className="flex h-48 items-center justify-center" role="status" aria-label={t('quotes.public.loading')}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state.kind !== 'ready') {
    const text =
      state.kind === 'missing'
        ? { title: t('quotes.public.missing.title'), body: t('quotes.public.missing.body') }
        : state.kind === 'gone'
          ? { title: t('quotes.public.gone.title'), body: state.message ?? t('quotes.public.gone.body') }
          : { title: t('quotes.public.error.title'), body: t('quotes.public.error.body') };
    return (
      <div className="rounded-xl border bg-card p-8 text-center" data-testid="quote-unavailable">
        <h1 className="text-xl font-semibold">{text.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{text.body}</p>
      </div>
    );
  }

  const { itinerary: it, days, accept } = state.quote;
  const accepted = answer ?? accept?.result ?? null;
  const totalText = money(it.grandTotal ?? it.totalSelling, it.currency);
  // Zero-quantity lines are filtered by the API; this keeps the page right if an older API still sends them.
  const shown = (items: QuoteItem[]) => items.filter((i) => i.quantity !== 0);

  return (
    <article className="space-y-6" data-testid="shared-quote">
      <header>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          {it.title}
        </h1>
        {it.validityDate && !accepted && <p className="mt-1 text-sm text-muted-foreground">{t('quotes.public.validUntil', { date: formatDisplayDate(it.validityDate) })}</p>}
        {it.notes && <p className="mt-3 text-sm">{plain(it.notes)}</p>}
      </header>

      {accepted && <AcceptedPanel answer={accepted} />}

      {days.map((day) => (
        <section key={day.id} className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">
            {t('quotes.public.day', { n: day.dayNumber })}
            {day.title ? `: ${day.title}` : ''}
            {day.city ? <span className="ms-2 text-sm font-normal text-muted-foreground">{day.city}</span> : null}
          </h2>
          {day.description && <p className="mt-2 text-sm text-muted-foreground">{plain(day.description)}</p>}
          <ul className="mt-3 divide-y">
            {shown(day.items).map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-4 py-2 text-sm">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {item.type}
                    {item.description ? ` - ${plain(item.description)}` : ''}
                  </p>
                </div>
                <p className="shrink-0 tabular-nums">{money(item.sellingPrice, it.currency)}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {(it.inclusions.length > 0 || it.exclusions.length > 0) && (
        <section className="grid gap-4 sm:grid-cols-2">
          {it.inclusions.length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">{t('quotes.public.included')}</h2>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
                {it.inclusions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {it.exclusions.length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">{t('quotes.public.notIncluded')}</h2>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-sm">
                {it.exclusions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border bg-card p-5">
        <dl className="space-y-1 text-sm">
          {typeof it.totalTax === 'number' && it.totalTax > 0 && (
            <div className="flex justify-between">
              <dt>{t('quotes.public.taxes')}</dt>
              <dd className="tabular-nums">{money(it.totalTax, it.currency)}</dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold">
            <dt>{t('quotes.public.total')}</dt>
            <dd className="tabular-nums" data-testid="quote-total">
              {totalText}
            </dd>
          </div>
        </dl>
      </section>

      {accept && !accepted && accept.state !== 'expired' && (
        <section className="rounded-xl border bg-card p-5 text-center" data-testid="accept-section" data-state={accept.state}>
          {accept.departure && (
            <p className="mb-3 text-sm text-muted-foreground" data-testid="accept-departure">
              {t('quotes.accept.departure', { start: formatDisplayDate(accept.departure.startDate), end: formatDisplayDate(accept.departure.endDate) })}
              {' · '}
              {t('quotes.accept.seatsRequested', { count: accept.departure.seatsRequested })}
              {accept.departure.seatsLeft !== null ? ` · ${t('quotes.accept.seatsLeft', { count: accept.departure.seatsLeft })}` : ''}
            </p>
          )}
          {accept.state === 'full' ? (
            <p className="text-sm" data-testid="accept-full">{t('quotes.accept.full')}</p>
          ) : (
            <Button size="lg" onClick={() => setSheetOpen(true)} data-testid="accept-button">
              {accept.state === 'full_waitlist' ? t('quotes.accept.buttonWaitlist') : accept.label || t('quotes.accept.button')}
            </Button>
          )}
          <AcceptSheet
            token={token}
            title={it.title}
            total={totalText}
            accept={accept}
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            onAccepted={(a) => {
              setAnswer(a);
              setSheetOpen(false);
            }}
          />
        </section>
      )}

      {it.termsConditions && (
        <section className="text-xs text-muted-foreground">
          <h2 className="mb-1 font-semibold text-foreground">{t('quotes.public.terms')}</h2>
          <p>{plain(it.termsConditions)}</p>
        </section>
      )}
    </article>
  );
}
