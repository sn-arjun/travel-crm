'use client';

import * as React from 'react';
import { CalendarDays, Clock, MapPin } from 'lucide-react';

import { Button, Spinner } from '@/components/ui';
import { formatDisplayDate } from '@/lib/dates';
import { seatsNotice, type PublicPage } from '@/lib/booking-form';
import { useT } from '@/lib/i18n';
import { LanguageSwitch } from './public-i18n';

/** The agency's name, logo and language switch above everything else. */
export function AgencyBar({ agency, available }: { agency: Pick<PublicPage['agency'], 'name' | 'logoUrl' | 'tagline'> | null; available: readonly string[] }) {
  const t = useT();
  return (
    <header className="flex flex-wrap items-center justify-between gap-ds-3 border-b border-ds-border pb-ds-3">
      <div className="flex min-w-0 items-center gap-ds-3">
        {agency?.logoUrl && (
          // The agency's own logo from its own address; a plain image tag keeps this page free of the app's image proxy.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={agency.logoUrl} alt={agency.name || t('booking.agency.fallback')} className="h-10 w-auto max-w-[8rem] object-contain" referrerPolicy="no-referrer" />
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ds-foreground" style={{ fontFamily: 'var(--font-display)' }}>{agency?.name || t('booking.agency.fallback')}</p>
          {agency?.tagline && <p className="truncate text-xs text-ds-foreground-muted">{agency.tagline}</p>}
        </div>
      </div>
      <LanguageSwitch available={available} />
    </header>
  );
}

/** What is being booked: the tour, the dates, the plan by day and how many seats are left (as the agency allows). */
export function TourHeader({ page }: { page: PublicPage }) {
  const t = useT();
  const notice = seatsNotice(page.seats);
  return (
    <section className="space-y-ds-3" data-testid="tour-header">
      <h1 className="text-2xl font-bold tracking-tight text-ds-foreground" style={{ fontFamily: 'var(--font-display)' }}>{page.tour.title}</h1>
      <ul className="flex flex-wrap gap-x-ds-4 gap-y-ds-1 text-sm text-ds-foreground-muted">
        <li className="flex items-center gap-1.5">
          <CalendarDays className="size-4" aria-hidden="true" />
          {t('booking.tour.dates', { start: formatDisplayDate(page.startDate), end: formatDisplayDate(page.endDate) })}
          {page.tour.durationDays ? ` (${t('booking.tour.days', { count: page.tour.durationDays })})` : ''}
        </li>
        {page.startTime && (
          <li className="flex items-center gap-1.5">
            <Clock className="size-4" aria-hidden="true" />
            {t('booking.tour.departsAt', { time: page.startTime })}
          </li>
        )}
        {page.tour.destination && (
          <li className="flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden="true" />
            {page.tour.destination}
          </li>
        )}
      </ul>
      {page.tour.description && <p className="whitespace-pre-line text-sm text-ds-foreground">{stripTags(page.tour.description)}</p>}
      {notice && (
        <p
          className={`inline-block rounded-md px-ds-3 py-1 text-sm font-medium ${notice.kind === 'full' ? 'bg-ds-warning-subtle text-ds-warning-on-subtle' : 'bg-ds-primary-subtle text-ds-primary-on-subtle'}`}
          data-testid="seats-notice"
        >
          {notice.kind === 'full' ? t(notice.waitlist ? 'booking.seats.fullWaitlist' : 'booking.seats.full') : t('booking.seats.count', { count: notice.count })}
        </p>
      )}
      {page.days.length > 0 && (
        <details className="rounded-lg border border-ds-border bg-ds-surface p-ds-3">
          <summary className="cursor-pointer text-sm font-semibold">{t('booking.tour.programme')}</summary>
          <ol className="mt-ds-2 space-y-1 text-sm">
            {page.days.map((d) => (
              <li key={d.day} className="flex gap-ds-2">
                <span className="w-16 shrink-0 text-ds-foreground-muted">{t('booking.tour.day', { day: d.day })}</span>
                <span>{d.title}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

/** Descriptions can come from a rich-text editor: only the words are shown, never the markup. */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

export function Loading() {
  const t = useT();
  return (
    <div className="flex h-48 items-center justify-center" role="status" aria-label={t('booking.loading')}>
      <Spinner className="size-8" />
    </div>
  );
}

interface StateScreenProps {
  kind: 'missing' | 'gone' | 'closed' | 'error';
  agency?: PublicPage['agency'] | null;
  onRetry?: () => void;
}

/** The pages for a link that is not valid, one that ran out, a departure that closed, and a page that could not be reached. */
export function StateScreen({ kind, agency, onRetry }: StateScreenProps) {
  const t = useT();
  const name = agency?.name || t('booking.agency.fallback');
  return (
    <div className="rounded-xl border border-ds-border bg-ds-surface p-ds-6 text-center" role={kind === 'error' ? 'alert' : undefined} data-testid={`booking-state-${kind}`}>
      <h1 className="text-xl font-semibold">{t(`booking.state.${kind}.title`)}</h1>
      <p className="mt-ds-2 text-sm text-ds-foreground-muted">{t(`booking.state.${kind}.body`, { agency: name })}</p>
      {kind === 'error' && onRetry && (
        <Button className="mt-ds-4" variant="outline" onClick={onRetry} data-testid="booking-retry">
          {t('booking.retry')}
        </Button>
      )}
      {kind === 'closed' && agency && (agency.email || agency.phone) && (
        <ul className="mt-ds-3 space-y-1 text-sm">
          {agency.email && <li>{t('booking.contactAgency.email', { email: agency.email })}</li>}
          {agency.phone && <li>{t('booking.contactAgency.phone', { phone: agency.phone })}</li>}
        </ul>
      )}
    </div>
  );
}
