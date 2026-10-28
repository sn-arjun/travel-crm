'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRightLeft, Check, Send, Users, X } from 'lucide-react';
import { toast } from 'sonner';

import { FilterBar } from '@/components/domain';
import { Alert, AlertDescription, AlertTitle, Button, DataTable, EmptyState, Spinner, Tag } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { departuresApi, seatBookingsApi, type DepartureDetail, type SeatBooking } from '@/lib/api/departures';
import { bookingStatusLabel, bookingStatusTone, departureErrorText } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { HoldCountdown } from './hold-countdown';
import { useBookingActions } from './booking-actions';
import { SimpleSelect } from './simple-select';

type StatusFilter = 'all' | 'held' | 'confirmed' | 'waitlisted' | 'cancelled';

interface BookingsPanelProps {
  departure: DepartureDetail;
  /** Bump to reload from the first page (after a hold, a confirm, ...). */
  refreshKey: number;
  canEdit: boolean;
  onOpenBooking: (id: string) => void;
  onChanged: () => void;
  onHold: () => void;
  /** Show only waitlisted bookings in waiting order, with the Offer action (the Waitlist tab). */
  waitlistOnly?: boolean;
}

/**
 * Seat bookings of one departure: status filter, infinite scroll, a row per booking (who, lead link, seats, status, hold
 * countdown), bulk Confirm and the row actions Confirm, Offer, Move, Cancel and Passengers. Also serves the Waitlist tab.
 */
export function BookingsPanel({ departure, refreshKey, canEdit, onOpenBooking, onChanged, onHold, waitlistOnly }: BookingsPanelProps) {
  const t = useT();
  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const pager = React.useMemo(() => departuresApi.bookingsPager(departure.id), [departure.id]);

  const statusParam = waitlistOnly ? 'waitlisted' : status === 'all' ? undefined : status === 'cancelled' ? 'cancelled,expired' : status;
  const { items, loading, loadingMore, hasMore, total, error, sentinelRef, refetch } = useInfiniteScroll<SeatBooking>({
    fetcher: (page, limit) => pager.fetch(page, limit, { status: statusParam }),
    limit: 25,
    queryKey: `${departure.id}|${statusParam ?? 'all'}|${refreshKey}`,
  });

  const actions = useBookingActions({
    tourId: departure.tourId,
    departureId: departure.id,
    onChanged: () => {
      onChanged();
      refetch();
    },
  });

  const term = search.trim().toLowerCase();
  const rows = React.useMemo(
    () =>
      waitlistOnly
        ? [...items].sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0))
        : term
          ? items.filter((b) => `${b.contactName ?? ''} ${b.leadTitle ?? ''}`.toLowerCase().includes(term))
          : items,
    [items, term, waitlistOnly],
  );

  const selectedHeld = rows.filter((b) => selected.has(b.id) && b.status === 'held');

  async function bulkConfirm() {
    if (selectedHeld.length === 0) return;
    setBulkBusy(true);
    try {
      const r = await seatBookingsApi.bulkConfirm(selectedHeld.map((b) => b.id));
      if (r.failed > 0) toast.warning(t('departures.bookings.bulkPartial', { confirmed: r.confirmed, failed: r.failed }));
      else toast.success(t('departures.bookings.bulkDone', { count: r.confirmed }));
      setSelected(new Set());
      onChanged();
      refetch();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.bookings.bulkFailed'));
    } finally {
      setBulkBusy(false);
    }
  }

  const columns: DataTableColumn<SeatBooking>[] = [
    ...(waitlistOnly
      ? [{ key: 'position', header: t('departures.waitlist.position'), cell: (b: SeatBooking) => <span className="tabular-nums">#{b.waitlistPosition ?? '-'}</span> }]
      : []),
    {
      key: 'contact',
      header: t('departures.bookings.contact'),
      minWidth: 'min-w-48',
      hideable: false,
      cell: (b) => <span className="font-medium">{b.contactName ?? b.contactId}</span>,
    },
    {
      key: 'lead',
      header: t('departures.bookings.lead'),
      minWidth: 'min-w-48',
      cell: (b) => (
        <Link href={`/leads/${b.leadId}`} className="text-ds-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {b.leadTitle ?? b.leadId}
        </Link>
      ),
    },
    {
      key: 'seats',
      header: t('departures.bookings.seats'),
      align: 'right',
      cell: (b) => (
        <span className="tabular-nums" data-testid="booking-seats">
          {b.seats}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('departures.bookings.status'),
      cell: (b) => (
        <div className="flex flex-wrap items-center gap-ds-1">
          <Tag tone={bookingStatusTone(b.status)} data-testid="booking-status">
            {bookingStatusLabel(b.status, t)}
          </Tag>
          {b.status === 'held' && <HoldCountdown expiresAt={b.holdExpiresAt} />}
        </div>
      ),
    },
    {
      key: 'passengers',
      header: t('departures.bookings.passengers'),
      align: 'right',
      cell: (b) => <span className="tabular-nums">{b.passengersCount ?? 0}</span>,
    },
  ];

  const emptyState = error ? (
    <Alert variant="destructive" data-testid="bookings-error">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{t('departures.bookings.loadFailed')}</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        <Button variant="outline" size="sm" onClick={refetch}>
          {t('departures.retry')}
        </Button>
      </AlertDescription>
    </Alert>
  ) : (
    <EmptyState
      icon={<Users className="size-8" aria-hidden="true" />}
      title={waitlistOnly ? t('departures.waitlist.emptyTitle') : t('departures.bookings.emptyTitle')}
      description={waitlistOnly ? t('departures.waitlist.emptyDescription') : t('departures.bookings.emptyDescription')}
      action={
        !waitlistOnly && canEdit ? (
          <Button onClick={onHold} size="sm">
            {t('departures.bookings.holdSeats')}
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div className="space-y-ds-3" data-testid={waitlistOnly ? 'waitlist-panel' : 'bookings-panel'}>
      {!waitlistOnly && (
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('departures.bookings.search')}
          actions={
            <>
              <SimpleSelect
                value={status}
                onChange={(v) => {
                  setSelected(new Set());
                  setStatus((v as StatusFilter) ?? 'all');
                }}
                aria-label={t('departures.bookings.status')}
                className="h-9 w-44"
                options={[
                  { value: 'all', label: t('departures.bookings.allStatuses') },
                  { value: 'held', label: t('departures.bookingStatus.held') },
                  { value: 'confirmed', label: t('departures.bookingStatus.confirmed') },
                  { value: 'waitlisted', label: t('departures.bookingStatus.waitlisted') },
                  { value: 'cancelled', label: t('departures.bookings.cancelledGroup') },
                ]}
              />
              {canEdit && (
                <Button size="sm" onClick={onHold} data-testid="hold-seats-button">
                  {t('departures.bookings.holdSeats')}
                </Button>
              )}
            </>
          }
        />
      )}

      {selected.size > 0 && canEdit && (
        <div className="flex items-center gap-ds-3 rounded-ds-md border border-ds-primary bg-ds-primary-subtle px-ds-3 py-ds-2">
          <span className="text-sm font-medium tabular-nums text-ds-primary-on-subtle">{t('departures.bookings.selected', { count: selected.size })}</span>
          <Button size="sm" disabled={bulkBusy || selectedHeld.length === 0} onClick={() => void bulkConfirm()} data-testid="bulk-confirm">
            {bulkBusy ? <Spinner className="size-4" /> : <Check aria-hidden="true" />}
            {t('departures.bookings.bulkConfirm', { count: selectedHeld.length })}
          </Button>
          <Button size="sm" variant="ghost" className="ms-auto" onClick={() => setSelected(new Set())}>
            {t('common.clear')}
          </Button>
        </div>
      )}

      <DataTable<SeatBooking>
        columns={columns}
        data={rows}
        getRowId={(b) => b.id}
        loading={loading}
        selectable={canEdit && !waitlistOnly}
        selectedIds={selected}
        onSelectionChange={setSelected}
        onRowClick={(b) => onOpenBooking(b.id)}
        fillViewport={false}
        emptyState={emptyState}
        rowActions={
          canEdit
            ? (b) => (
                <>
                  {b.status === 'held' && (
                    <Button variant="ghost" size="icon-sm" aria-label={t('departures.booking.confirm')} data-testid="row-confirm" disabled={actions.busy} onClick={(e) => { e.stopPropagation(); void actions.confirmBooking(b); }}>
                      <Check aria-hidden="true" />
                    </Button>
                  )}
                  {b.status === 'waitlisted' && (
                    <Button variant="ghost" size="icon-sm" aria-label={t('departures.booking.offer')} data-testid="row-offer" disabled={actions.busy} onClick={(e) => { e.stopPropagation(); void actions.offer(b); }}>
                      <Send aria-hidden="true" />
                    </Button>
                  )}
                  {(b.status === 'held' || b.status === 'confirmed') && (
                    <Button variant="ghost" size="icon-sm" aria-label={t('departures.booking.move')} data-testid="row-move" disabled={actions.busy} onClick={(e) => { e.stopPropagation(); actions.askMove(b); }}>
                      <ArrowRightLeft aria-hidden="true" />
                    </Button>
                  )}
                  {(b.status === 'held' || b.status === 'confirmed' || b.status === 'waitlisted') && (
                    <Button variant="ghost" size="icon-sm" aria-label={t('departures.booking.cancel')} data-testid="row-cancel" disabled={actions.busy} onClick={(e) => { e.stopPropagation(); actions.askCancel(b); }}>
                      <X aria-hidden="true" />
                    </Button>
                  )}
                </>
              )
            : undefined
        }
        footer={
          hasMore ? (
            <div ref={sentinelRef} className="flex items-center justify-center py-ds-3">
              {loadingMore && <Spinner className="size-5" />}
            </div>
          ) : null
        }
        caption={t('departures.bookings.caption', { count: total })}
      />
      {actions.dialogs}
    </div>
  );
}
