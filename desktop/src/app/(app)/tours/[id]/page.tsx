'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, Archive, CalendarPlus, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { DetailPage } from '@/components/domain';
import { PageContainer } from '@/components/layout/page-container';
import { Alert, AlertDescription, Button, SectionCard, Skeleton, Tag, useConfirm } from '@/components/ui';
import { useGroupTours } from '@/hooks/use-group-tours';
import { usePermission } from '@/hooks/use-permission';
import { departuresApi, type Departure } from '@/lib/api/departures';
import { toursApi, type TourDetail } from '@/lib/api/tours';
import { formatDisplayDate, toLocalDateString } from '@/lib/dates';
import { departureErrorText, departureStatusLabel, departureStatusTone, effectiveSettings } from '@/lib/departures';
import { formatExactCurrency } from '@/lib/format';
import { useLocale } from '@/lib/locale';
import { useT } from '@/lib/i18n';
import { SeatsBar } from '../../departures/_components/seats-bar';
import { MessageRules } from '../../settings/group-tours/_components/message-rules';

export default function TourDetailPage() {
  const t = useT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const locale = useLocale();
  const { settings, enabled: groupToursOn } = useGroupTours();
  const canEdit = usePermission('departures', 'edit');
  const canCreate = usePermission('departures', 'create');
  const canDelete = usePermission('departures', 'delete');
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [tour, setTour] = React.useState<TourDetail | null>(null);
  const [upcoming, setUpcoming] = React.useState<Departure[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [detail, deps] = await Promise.all([
        toursApi.get(id),
        departuresApi.pager().fetch(1, 10, { tour: id, from: toLocalDateString(new Date()) }),
      ]);
      setTour(detail);
      setUpcoming(deps.data);
      setError(null);
    } catch (err) {
      setError(departureErrorText(err, t, 'tours.detail.loadFailed'));
    }
  }, [id, t]);

  React.useEffect(() => {
    void load();
    // Reload when the tour id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <PageContainer>
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }
  if (!tour) {
    return (
      <PageContainer>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </PageContainer>
    );
  }

  const currency = tour.currency ?? locale.currency;
  const eff = settings ? effectiveSettings(null, tour, settings) : null;
  const confirmModeLabel = (m: string) => (m === 'manual' ? t('groupTours.confirmMode.manual') : m === 'auto_when_available' ? t('groupTours.confirmMode.auto') : t('groupTours.confirmMode.deposit'));

  async function archiveOrDelete() {
    const ok = await confirm({
      title: t('tours.detail.removeTitle'),
      description: t('tours.detail.removeDescription', { title: tour?.title ?? '' }),
      tone: 'destructive',
      confirmLabel: t('tours.detail.removeConfirm'),
    });
    if (!ok) return;
    try {
      const r = await toursApi.remove(id);
      toast.success(r.archived ? t('tours.detail.archived') : t('tours.detail.deleted'));
      router.push('/tours');
    } catch (err) {
      toast.error(departureErrorText(err, t, 'tours.detail.removeFailed'));
    }
  }

  const priceLabel = (p: TourDetail['prices'][number]) => p.label || p.key;

  return (
    <>
      <DetailPage<TourDetail>
        entity={tour}
        title={tour.title}
        subtitle={[tour.code, tour.destination].filter(Boolean).join(' · ')}
        status={<Tag tone={tour.status === 'active' ? 'success' : 'neutral'}>{tour.status === 'active' ? t('tours.status.active') : t('tours.status.archived')}</Tag>}
        onBack={() => router.push('/tours')}
        primaryActions={
          <>
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => router.push(`/tours/${id}/edit`)}>
                <Pencil aria-hidden="true" /> {t('tours.actions.edit')}
              </Button>
            )}
            {canCreate && tour.status === 'active' && (
              <Button size="sm" onClick={() => router.push(`/departures/new?tourId=${id}`)} data-testid="add-departures">
                <CalendarPlus aria-hidden="true" /> {t('tours.actions.addDepartures')}
              </Button>
            )}
          </>
        }
        actions={
          canDelete
            ? [{ label: t('tours.detail.remove'), icon: <Archive aria-hidden="true" />, destructive: true, onSelect: () => void archiveOrDelete() }]
            : []
        }
        related={groupToursOn ? [{ title: t('departureMessages.section.tourTitle'), content: <MessageRules tourId={id} bare /> }] : undefined}
        overview={
          <div className="grid gap-ds-4 lg:grid-cols-2">
            <SectionCard title={t('tours.detail.summary')}>
              <dl className="grid grid-cols-2 gap-ds-3 text-sm">
                <div>
                  <dt className="text-ds-foreground-muted">{t('tours.columns.destination')}</dt>
                  <dd>{tour.destination || '-'}</dd>
                </div>
                <div>
                  <dt className="text-ds-foreground-muted">{t('tours.columns.duration')}</dt>
                  <dd>{tour.durationDays ? t('tours.days', { count: tour.durationDays }) : '-'}</dd>
                </div>
                <div>
                  <dt className="text-ds-foreground-muted">{t('tours.columns.capacity')}</dt>
                  <dd>{tour.defaultCapacity ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-ds-foreground-muted">{t('tours.form.currency')}</dt>
                  <dd>{currency}</dd>
                </div>
                <div>
                  <dt className="text-ds-foreground-muted">{t('tours.detail.departuresCount')}</dt>
                  <dd>{tour.departuresCount ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-ds-foreground-muted">{t('tours.columns.updated')}</dt>
                  <dd>{formatDisplayDate(tour.updatedAt)}</dd>
                </div>
                {tour.description && (
                  <div className="col-span-2">
                    <dt className="text-ds-foreground-muted">{t('tours.form.descriptionLabel')}</dt>
                    <dd className="whitespace-pre-line">{tour.description}</dd>
                  </div>
                )}
              </dl>
            </SectionCard>

            <SectionCard title={t('tours.detail.rules')} description={t('tours.detail.rulesDescription')}>
              {eff ? (
                <dl className="grid grid-cols-2 gap-ds-3 text-sm">
                  <div>
                    <dt className="text-ds-foreground-muted">{t('tours.form.holdHours')}</dt>
                    <dd>{t('tours.detail.hours', { count: eff.holdExpiryHours })}{tour.holdExpiryHours == null && <span className="text-ds-foreground-subtle"> ({t('tours.detail.agencyValue')})</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-ds-foreground-muted">{t('tours.form.confirmMode')}</dt>
                    <dd>{confirmModeLabel(eff.confirmMode)}{tour.confirmMode == null && <span className="text-ds-foreground-subtle"> ({t('tours.detail.agencyValue')})</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-ds-foreground-muted">{t('tours.form.bookingCutoff')}</dt>
                    <dd>{t('tours.detail.daysBefore', { count: eff.bookingCutoffDays })}</dd>
                  </div>
                  <div>
                    <dt className="text-ds-foreground-muted">{t('tours.form.extrasCutoff')}</dt>
                    <dd>{t('tours.detail.daysBefore', { count: eff.extrasCutoffDays })}</dd>
                  </div>
                </dl>
              ) : (
                <Skeleton className="h-16 w-full" />
              )}
            </SectionCard>

            <SectionCard title={t('tours.detail.upcoming')} className="lg:col-span-2" flush>
              {upcoming.length === 0 ? (
                <p className="p-ds-4 text-sm text-ds-foreground-muted" data-testid="tour-no-departures">
                  {t('tours.detail.noDepartures')}
                </p>
              ) : (
                <ul className="divide-y divide-ds-border" data-testid="tour-departures">
                  {upcoming.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-ds-3 px-ds-4 py-ds-3">
                      <div className="min-w-0">
                        <Link href={`/departures/${d.id}`} className="font-medium text-ds-primary hover:underline">
                          {d.code}
                        </Link>
                        <p className="text-xs text-ds-foreground-muted">
                          {formatDisplayDate(d.startDate)} - {formatDisplayDate(d.endDate)}
                        </p>
                      </div>
                      <Tag tone={departureStatusTone(d.status)}>{departureStatusLabel(d.status, t)}</Tag>
                      {d.seats && <SeatsBar seats={d.seats} />}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title={t('tours.detail.stops')}>
              {tour.stops.length === 0 ? (
                <p className="text-sm text-ds-foreground-muted">{t('tours.stops.none')}</p>
              ) : (
                <ol className="space-y-ds-2 text-sm">
                  {tour.stops.map((s, i) => (
                    <li key={s.id ?? i} className="flex gap-ds-3">
                      <span className="w-6 shrink-0 text-ds-foreground-muted tabular-nums">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="font-medium">
                          {s.name}
                          {s.localTime ? <span className="ms-ds-2 font-normal text-ds-foreground-muted">{s.localTime}</span> : null}
                        </p>
                        {s.address && <p className="text-xs text-ds-foreground-muted">{s.address}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>

            <SectionCard title={t('tours.detail.prices')}>
              {tour.prices.length === 0 ? (
                <p className="text-sm text-ds-foreground-muted">{t('tours.prices.none')}</p>
              ) : (
                <ul className="divide-y divide-ds-border text-sm" data-testid="tour-prices">
                  {tour.prices.map((p, i) => (
                    <li key={p.id ?? i} className="flex items-center justify-between py-ds-2">
                      <span>{priceLabel(p)}</span>
                      <span className="tabular-nums">{formatExactCurrency(p.amount, p.currency ?? currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {tour.extras.some((x) => !x.departureId) && (
              <SectionCard title={t('tours.detail.extras')} className="lg:col-span-2">
                <ul className="divide-y divide-ds-border text-sm" data-testid="tour-extras">
                  {tour.extras.filter((x) => !x.departureId).map((x, i) => (
                    <li key={x.id ?? i} className="flex items-center justify-between gap-ds-3 py-ds-2">
                      <span>
                        {x.title}
                        {x.dayNumber ? <span className="ms-ds-2 text-ds-foreground-muted">{t('extras.detail.day', { day: x.dayNumber })}</span> : null}
                        {x.capacity ? <span className="ms-ds-2 text-ds-foreground-muted">{t('extras.detail.places', { count: x.capacity })}</span> : null}
                        {x.isActive === false ? <span className="ms-ds-2 text-ds-foreground-muted">{t('extras.detail.off')}</span> : null}
                      </span>
                      <span className="tabular-nums">
                        {x.price <= 0 && x.rateCardId ? t('extras.detail.fromRateCard') : formatExactCurrency(x.price, x.currency ?? currency)}
                        {x.bandPrices && Object.keys(x.bandPrices).length > 0 ? <span className="ms-ds-2 text-ds-foreground-muted">{t('extras.detail.perBand')}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {tour.terms && (
              <SectionCard title={t('tours.form.termsTitle')} className="lg:col-span-2">
                <p className="whitespace-pre-line text-sm text-ds-foreground-muted">{tour.terms}</p>
              </SectionCard>
            )}
          </div>
        }
      />
      {confirmDialog}
    </>
  );
}
