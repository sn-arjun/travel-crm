'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarRange, Eye, Plus, Ticket } from 'lucide-react';
import { toast } from 'sonner';

import { ListPage } from '@/components/domain';
import type { ListFilter } from '@/components/domain';
import { Button, DatePicker, Tag } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { useDepartureSeatsLive } from '@/hooks/use-departure-seats-live';
import { useGroupTours } from '@/hooks/use-group-tours';
import { usePermission } from '@/hooks/use-permission';
import {
  departuresApi, type Departure, type DepartureDetail, type DepartureStatus, type PassengerFieldDef, type RoomTypeDef, type SeatsSummary,
} from '@/lib/api/departures';
import { toursApi } from '@/lib/api/tours';
import { formatDisplayDate, parseLocalDate, toLocalDateString } from '@/lib/dates';
import {
  acceptsSeatRequests, DEPARTURE_STATUSES, departureErrorText, departureStatusLabel, departureStatusTone, effectiveSettings, seatsBreakdown,
} from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { DepartureStatusMenu } from './_components/status-menu';
import { HoldSeatsDialog } from './_components/hold-seats-dialog';
import { SeatsBar } from './_components/seats-bar';
import { SimpleSelect } from './_components/simple-select';
import { TourCombobox } from './_components/relation-pickers';

interface HoldTarget {
  departure: DepartureDetail;
  fields: PassengerFieldDef[];
  roomTypes: RoomTypeDef[];
}

export default function DeparturesPage() {
  const t = useT();
  const router = useRouter();
  const { settings } = useGroupTours();
  const canCreate = usePermission('departures', 'create');
  const canEdit = usePermission('departures', 'edit');

  const [tour, setTour] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<DepartureStatus | null>(null);
  const [from, setFrom] = React.useState<string | null>(() => toLocalDateString(new Date()));
  const [to, setTo] = React.useState<string | null>(null);
  const [hasSeats, setHasSeats] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [hold, setHold] = React.useState<HoldTarget | null>(null);
  const [holdOpen, setHoldOpen] = React.useState(false);
  const pager = React.useMemo(() => departuresApi.pager(), []);
  const refresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);
  // Seats announced by the API since the list was read: the bars redraw without reading the list again.
  const [liveSeats, setLiveSeats] = React.useState<Record<string, SeatsSummary>>({});
  useDepartureSeatsLive((e) => {
    if (e.seats) setLiveSeats((prev) => ({ ...prev, [e.departureId]: e.seats! }));
  });
  React.useEffect(() => setLiveSeats({}), [refreshKey]);

  const activeFilters = React.useMemo<ListFilter[]>(() => {
    const f: ListFilter[] = [];
    if (tour) f.push({ id: 'tour', label: t('departures.filters.tour'), value: t('departures.filters.selected') });
    if (status) f.push({ id: 'status', label: t('departures.filters.status'), value: departureStatusLabel(status, t) });
    if (from) f.push({ id: 'from', label: t('departures.filters.from'), value: formatDisplayDate(from) });
    if (to) f.push({ id: 'to', label: t('departures.filters.to'), value: formatDisplayDate(to) });
    if (hasSeats) f.push({ id: 'hasSeats', label: t('departures.filters.seats'), value: t('departures.filters.hasSeats') });
    return f;
  }, [tour, status, from, to, hasSeats, t]);

  /** Loads what the hold dialog needs for one departure (its detail and the passenger fields that apply), then opens it. */
  async function openHold(d: Departure) {
    try {
      const [detail, tourDetail] = await Promise.all([departuresApi.get(d.id), toursApi.get(d.tourId)]);
      const eff = settings ? effectiveSettings(detail, tourDetail, settings) : null;
      setHold({ departure: detail, fields: eff?.passengerFields ?? [], roomTypes: eff?.roomTypes ?? [] });
      setHoldOpen(true);
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.hold.failed'));
    }
  }

  const columns: DataTableColumn<Departure>[] = [
    {
      key: 'code',
      header: t('departures.columns.code'),
      hideable: false,
      minWidth: 'min-w-40',
      cell: (d) => (
        <Link href={`/departures/${d.id}`} className="font-mono text-sm font-medium text-ds-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {d.code}
        </Link>
      ),
    },
    { key: 'tour', header: t('departures.columns.tour'), minWidth: 'min-w-48', cell: (d) => <span className="text-sm">{d.tourTitle ?? d.tourCode ?? ''}</span> },
    {
      key: 'dates',
      header: t('departures.columns.dates'),
      minWidth: 'min-w-44',
      cell: (d) => (
        <span className="text-sm">
          {formatDisplayDate(d.startDate)}
          {d.endDate !== d.startDate ? ` - ${formatDisplayDate(d.endDate)}` : ''}
        </span>
      ),
    },
    { key: 'status', header: t('departures.columns.status'), cell: (d) => <Tag tone={departureStatusTone(d.status)}>{departureStatusLabel(d.status, t)}</Tag> },
    { key: 'seats', header: t('departures.columns.seats'), minWidth: 'min-w-48', cell: (d) => {
        const seats = liveSeats[d.id] ?? d.seats;
        return seats ? <SeatsBar seats={seats} /> : null;
      },
    },
  ];

  return (
    <>
      <ListPage<Departure>
        title={t('departures.title')}
        description={t('departures.description')}
        getRowId={(d) => d.id}
        refreshKey={refreshKey}
        columns={columns}
        searchPlaceholder={t('departures.searchPlaceholder')}
        fetcher={({ page, limit, search }) =>
          pager.fetch(page, limit, departuresApi.listParams({ q: search, tour: tour ?? undefined, status: status ?? undefined, from: from ?? undefined, to: to ?? undefined, hasSeats }))
        }
        filters={activeFilters}
        onRemoveFilter={(id) => {
          if (id === 'tour') setTour(null);
          if (id === 'status') setStatus(null);
          if (id === 'from') setFrom(null);
          if (id === 'to') setTo(null);
          if (id === 'hasSeats') setHasSeats(false);
        }}
        onClearFilters={() => {
          setTour(null);
          setStatus(null);
          setFrom(null);
          setTo(null);
          setHasSeats(false);
        }}
        headerActions={
          <div className="flex flex-wrap items-center gap-ds-2">
            <div className="w-56">
              <TourCombobox value={tour} onChange={setTour} placeholder={t('departures.filters.allTours')} aria-label={t('departures.filters.tour')} />
            </div>
            <SimpleSelect
              value={status}
              onChange={(v) => setStatus(v as DepartureStatus | null)}
              noneLabel={t('departures.filters.allStatuses')}
              placeholder={t('departures.filters.allStatuses')}
              aria-label={t('departures.filters.status')}
              className="h-9 w-40"
              options={DEPARTURE_STATUSES.map((s) => ({ value: s, label: departureStatusLabel(s, t) }))}
            />
            <DatePicker
              value={from ? parseLocalDate(from) : undefined}
              onChange={(d) => setFrom(d ? toLocalDateString(d) : null)}
              placeholder={t('departures.filters.from')}
              aria-label={t('departures.filters.from')}
              fromYear={new Date().getFullYear() - 2}
              toYear={new Date().getFullYear() + 5}
              className="w-40"
            />
            <DatePicker
              value={to ? parseLocalDate(to) : undefined}
              onChange={(d) => setTo(d ? toLocalDateString(d) : null)}
              placeholder={t('departures.filters.to')}
              aria-label={t('departures.filters.to')}
              fromYear={new Date().getFullYear() - 2}
              toYear={new Date().getFullYear() + 5}
              className="w-40"
            />
            <Button variant={hasSeats ? 'default' : 'outline'} size="sm" className="h-9" aria-pressed={hasSeats} onClick={() => setHasSeats((v) => !v)}>
              <Ticket aria-hidden="true" /> {t('departures.filters.hasSeats')}
            </Button>
          </div>
        }
        primaryAction={
          canCreate ? (
            <Button size="sm" onClick={() => router.push('/departures/new')} data-testid="new-departure">
              <Plus aria-hidden="true" /> {t('departures.new')}
            </Button>
          ) : undefined
        }
        rowActions={(d) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label={t('departures.actions.open')} onClick={(e) => { e.stopPropagation(); router.push(`/departures/${d.id}`); }}>
              <Eye aria-hidden="true" />
            </Button>
            {canEdit && acceptsSeatRequests(d.status) && (
              <Button variant="ghost" size="icon-sm" aria-label={t('departures.actions.holdSeats')} data-testid="row-hold" onClick={(e) => { e.stopPropagation(); void openHold(d); }}>
                <Ticket aria-hidden="true" />
              </Button>
            )}
            {canEdit && <DepartureStatusMenu departureId={d.id} status={d.status} hideChip onChanged={refresh} />}
          </>
        )}
        detailTitle={(d) => d.code}
        renderDetail={(d) => (
          <div className="space-y-ds-4 pt-ds-2" data-testid="departure-drawer">
            <div className="flex flex-wrap items-center gap-ds-2">
              <Tag tone={departureStatusTone(d.status)} size="lg">{departureStatusLabel(d.status, t)}</Tag>
              <span className="text-sm text-ds-foreground-muted">{d.tourTitle}</span>
            </div>
            <p className="text-sm">
              {formatDisplayDate(d.startDate, 'long')}
              {d.endDate !== d.startDate ? ` - ${formatDisplayDate(d.endDate, 'long')}` : ''}
            </p>
            {d.seats && (
              <div className="rounded-ds-md border border-ds-border p-ds-3">
                <SeatsBar seats={d.seats} variant="full" />
                <p className="mt-ds-1 text-xs text-ds-foreground-muted">{seatsBreakdown(d.seats, t)}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-ds-2">
              <Link href={`/departures/${d.id}`}>
                <Button size="sm">{t('departures.actions.open')}</Button>
              </Link>
              {canEdit && acceptsSeatRequests(d.status) && (
                <Button size="sm" variant="outline" onClick={() => void openHold(d)}>
                  {t('departures.actions.holdSeats')}
                </Button>
              )}
            </div>
          </div>
        )}
        emptyTitle={t('departures.empty.title')}
        emptyDescription={t('departures.empty.description')}
        emptyIcon={<CalendarRange className="size-10" aria-hidden="true" />}
        emptyAction={
          canCreate ? (
            <Button size="sm" onClick={() => router.push('/departures/new')}>
              <Plus aria-hidden="true" /> {t('departures.empty.create')}
            </Button>
          ) : undefined
        }
      />

      {hold && (
        <HoldSeatsDialog
          departure={hold.departure}
          open={holdOpen}
          onOpenChange={setHoldOpen}
          onHeld={refresh}
          onRefresh={() => {
            void departuresApi.get(hold.departure.id).then((d) => setHold((h) => (h ? { ...h, departure: d } : h))).catch(() => undefined);
          }}
          fields={hold.fields}
          roomTypes={hold.roomTypes}
          waitlistEnabled={settings?.waitlist.enabled ?? true}
          preferredSeat={settings?.preferredSeat.enabled}
        />
      )}
    </>
  );
}
