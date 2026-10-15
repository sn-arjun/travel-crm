'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api/config';

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
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; quote: Quote }
  | { kind: 'gone'; message: string }
  | { kind: 'missing' }
  | { kind: 'error' };

function money(amount: number | null | undefined, currency: string | null | undefined): string {
  const value = typeof amount === 'number' ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR' }).format(value);
  } catch {
    return `${currency ?? ''} ${value.toFixed(2)}`.trim();
  }
}

/** Plain text only: descriptions can hold HTML from the rich-text editor, which is never injected here. */
function plain(html: string | null | undefined): string {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The page behind the link in a shared-quotation email: <APP_URL>/q/<token>. No sign-in. It reads the public
 * quotation endpoint (GET /public/quotation/:token), which hides cost prices and internal notes.
 */
export default function SharedQuotePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [state, setState] = React.useState<State>({ kind: 'loading' });

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
        if (res.ok) setState({ kind: 'ready', quote: body });
        else if (res.status === 404) setState({ kind: 'missing' });
        else if (res.status === 410) setState({ kind: 'gone', message: body.error ?? 'This quotation is no longer available.' });
        else setState({ kind: 'error' });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState({ kind: 'error' });
      }
    })();
    return () => ctl.abort();
  }, [token]);

  if (state.kind === 'loading') {
    return (
      <div className="flex h-48 items-center justify-center" role="status" aria-label="Loading quotation">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (state.kind !== 'ready') {
    const text =
      state.kind === 'missing'
        ? { title: 'Quotation not found', body: 'This link is not valid. Please ask your travel agent to send it again.' }
        : state.kind === 'gone'
          ? { title: 'Quotation unavailable', body: state.message }
          : { title: 'Could not load the quotation', body: 'Please check your connection and try again in a moment.' };
    return (
      <div className="rounded-xl border bg-card p-8 text-center" data-testid="quote-unavailable">
        <h1 className="text-xl font-semibold">{text.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{text.body}</p>
      </div>
    );
  }

  const { itinerary: it, days } = state.quote;
  return (
    <article className="space-y-6" data-testid="shared-quote">
      <header>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          {it.title}
        </h1>
        {it.validityDate && <p className="mt-1 text-sm text-muted-foreground">Valid until {it.validityDate}</p>}
        {it.notes && <p className="mt-3 text-sm">{plain(it.notes)}</p>}
      </header>

      {days.map((day) => (
        <section key={day.id} className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">
            Day {day.dayNumber}
            {day.title ? `: ${day.title}` : ''}
            {day.city ? <span className="ml-2 text-sm font-normal text-muted-foreground">{day.city}</span> : null}
          </h2>
          {day.description && <p className="mt-2 text-sm text-muted-foreground">{plain(day.description)}</p>}
          <ul className="mt-3 divide-y">
            {day.items.map((item) => (
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
              <h2 className="font-semibold">Included</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {it.inclusions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {it.exclusions.length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Not included</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
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
              <dt>Taxes</dt>
              <dd className="tabular-nums">{money(it.totalTax, it.currency)}</dd>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums" data-testid="quote-total">
              {money(it.grandTotal ?? it.totalSelling, it.currency)}
            </dd>
          </div>
        </dl>
      </section>

      {it.termsConditions && (
        <section className="text-xs text-muted-foreground">
          <h2 className="mb-1 font-semibold text-foreground">Terms and conditions</h2>
          <p>{plain(it.termsConditions)}</p>
        </section>
      )}
    </article>
  );
}
