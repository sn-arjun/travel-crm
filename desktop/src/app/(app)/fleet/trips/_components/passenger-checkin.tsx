'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Check, DoorOpen, FileCheck2, LogIn, Plus, Trash2, UserX } from 'lucide-react';

import {
  Button, Checkbox, EmptyState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Tag,
} from '@/components/ui';
import { E164PhoneInput } from '@/components/ui/phone-input';
import { fleetApi } from '@/lib/api/fleet';
import type { BoardingStatus, TripPassenger, TripPassengersByStop, TripStop } from '@/lib/api/fleet';
import { formatDisplayDateTime } from '@/lib/dates';
import { computeHeadcount, isCountComplete, newOpId, nextBoarding, withTick } from '@/lib/headcount';
import { useT } from '@/lib/i18n';
import { formatPhone, toE164 } from '@/lib/phone';
import { useRealtimeEvent } from '@/hooks/use-realtime-event';
import { cn } from '@/lib/utils';
import { HeadcountBar } from './headcount-bar';

/** Every realtime event of a coach trip: any of them means "read the passengers and stops again". A module constant, so the hook subscribes once. */
const COACH_EVENTS = [
  'trip:stop_arrived',
  'trip:stop_departed',
  'trip:passenger_boarded',
  'trip:passenger_no_show',
  'trip:passenger_reset',
  'trip:documents_checked',
  'trip:headcount_complete',
  'trip:passenger_added',
  'trip:passenger_removed',
];

const NO_STOP = '__none__';

const STOP_TONE = { pending: 'neutral', arrived: 'info', departed: 'success', skipped: 'warning' } as const;

interface CoachTripPanelProps {
  tripId: string;
  /** A completed or cancelled trip can be read but not ticked. */
  readOnly?: boolean;
  /** Called after the stops or passengers changed, so a list behind the panel can refresh its figures. */
  onChanged?: () => void;
  className?: string;
}

/**
 * The check-in panel of a coach trip: the stops in order with their status, the passengers boarding at each stop with a
 * Boarded / No-show tick and a documents-checked tick, the head count, and passengers added by hand. Ticks show at once and are
 * confirmed by the server; another person's tick (the tour leader's phone) arrives through the realtime channel.
 */
export function CoachTripPanel({ tripId, readOnly, onChanged, className }: CoachTripPanelProps) {
  const t = useT();
  const [data, setData] = React.useState<TripPassengersByStop | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<{ name: string; phone: string; seats: string; stopId: string }>({ name: '', phone: '', seats: '1', stopId: NO_STOP });
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fleetApi.trips.getPassengers(tripId);
      setData(res.data ?? null);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  React.useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useRealtimeEvent(COACH_EVENTS, (d: { tripId?: string } | undefined) => {
    if (d?.tripId === tripId) void load();
  });

  const stops = React.useMemo<TripStop[]>(() => (data?.stops ?? []).map(({ passengers: _p, ...stop }) => stop), [data]);
  const everyone = React.useMemo<TripPassenger[]>(() => [...(data?.stops ?? []).flatMap((s) => s.passengers), ...(data?.unassigned ?? [])], [data]);
  const headcount = React.useMemo(() => computeHeadcount(everyone, stops), [everyone, stops]);

  const changed = React.useCallback(() => onChanged?.(), [onChanged]);

  /** Applies a change to one passenger in the local copy, wherever it sits. */
  const patchLocal = React.useCallback((id: string, change: { boarding?: BoardingStatus; documentsChecked?: boolean }) => {
    setData((d) => d && {
      stops: d.stops.map((s) => ({ ...s, passengers: withTick(s.passengers, id, change) })),
      unassigned: withTick(d.unassigned, id, change),
    });
  }, []);

  async function tick(p: TripPassenger, change: { boarding?: BoardingStatus; documentsChecked?: boolean }) {
    const before = { boarding: p.boarding, documentsChecked: p.documentsChecked };
    patchLocal(p.id, change);
    try {
      const res = await fleetApi.trips.tickPassenger(tripId, p.id, { ...change, opId: newOpId(), at: new Date().toISOString() });
      // An older tick than one already applied (the tour leader was faster): show what the server holds.
      if (res.data && !res.data.applied) await load();
      changed();
    } catch (e) {
      patchLocal(p.id, before);
      toast.error((e as { message?: string })?.message || t('coachTrips.checkin.tickFailed'));
    }
  }

  async function stopAction(stop: TripStop, action: 'arrive' | 'depart') {
    setBusy(true);
    try {
      if (action === 'arrive') await fleetApi.trips.arriveAtStop(tripId, stop.id);
      else await fleetApi.trips.departStop(tripId, stop.id);
      await load();
      changed();
    } catch (e) {
      toast.error((e as { message?: string })?.message || t('coachTrips.checkin.stopFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function addPassenger(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      await fleetApi.trips.addPassenger(tripId, {
        name,
        phone: toE164(draft.phone) || null,
        seats: Math.max(1, Math.floor(Number(draft.seats) || 1)),
        tripStopId: draft.stopId === NO_STOP ? null : draft.stopId,
      });
      setDraft({ name: '', phone: '', seats: '1', stopId: draft.stopId });
      setAdding(false);
      await load();
      changed();
      toast.success(t('coachTrips.checkin.added'));
    } catch (err) {
      toast.error((err as { message?: string })?.message || t('coachTrips.checkin.addFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: TripPassenger) {
    try {
      await fleetApi.trips.removePassenger(tripId, p.id);
      await load();
      changed();
    } catch (err) {
      toast.error((err as { message?: string })?.message || t('coachTrips.checkin.removeFailed'));
    }
  }

  if (loading) {
    return (
      <div className={cn('space-y-ds-3', className)} data-testid="coach-panel-loading">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (failed || !data) {
    return (
      <EmptyState
        title={t('coachTrips.checkin.loadFailed')}
        description={t('coachTrips.checkin.loadFailedHint')}
        action={<Button variant="outline" onClick={() => { setLoading(true); void load(); }}>{t('coachTrips.checkin.retry')}</Button>}
      />
    );
  }

  const renderPassenger = (p: TripPassenger) => (
    <li key={p.id} className="flex flex-wrap items-center gap-ds-3 py-ds-2" data-testid="passenger-row" data-passenger-name={p.name} data-boarding={p.boarding}>
      <div className="min-w-40 flex-1">
        <p className="text-sm font-medium">
          {p.name}
          {p.seats > 1 && <span className="ms-ds-2 text-xs font-normal text-ds-foreground-muted">{t('coachTrips.checkin.seats', { count: p.seats })}</span>}
        </p>
        {p.phone && <p className="text-xs text-ds-foreground-muted">{formatPhone(p.phone)}</p>}
      </div>
      <div className="flex items-center gap-ds-1" role="group" aria-label={t('coachTrips.checkin.boardingFor', { name: p.name })}>
        <Button
          type="button"
          size="sm"
          variant={p.boarding === 'boarded' ? 'default' : 'outline'}
          aria-pressed={p.boarding === 'boarded'}
          disabled={readOnly}
          onClick={() => void tick(p, { boarding: nextBoarding(p.boarding, 'boarded') })}
          data-testid="btn-boarded"
        >
          <Check aria-hidden="true" />
          {t('coachTrips.checkin.boarded')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={p.boarding === 'no_show' ? 'destructive' : 'outline'}
          aria-pressed={p.boarding === 'no_show'}
          disabled={readOnly}
          onClick={() => void tick(p, { boarding: nextBoarding(p.boarding, 'no_show') })}
          data-testid="btn-noshow"
        >
          <UserX aria-hidden="true" />
          {t('coachTrips.checkin.noShow')}
        </Button>
      </div>
      <label className="flex items-center gap-ds-2 text-sm">
        <Checkbox
          checked={p.documentsChecked}
          disabled={readOnly}
          onCheckedChange={(c) => void tick(p, { documentsChecked: c === true })}
          aria-label={t('coachTrips.checkin.documentsFor', { name: p.name })}
          data-testid="chk-docs"
        />
        <FileCheck2 className="size-4 text-ds-foreground-muted" aria-hidden="true" />
        {t('coachTrips.checkin.documentsChecked')}
      </label>
      {!readOnly && !p.seatPassengerId && (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('coachTrips.checkin.remove', { name: p.name })} onClick={() => void remove(p)}>
          <Trash2 aria-hidden="true" />
        </Button>
      )}
    </li>
  );

  const countFor = (stopId: string | null) => headcount.byStop.find((s) => s.stopId === stopId) ?? { expected: 0, boarded: 0, noShow: 0, pending: 0 };

  return (
    <div className={cn('space-y-ds-4', className)} data-testid="coach-panel">
      <HeadcountBar headcount={headcount} />

      {data.stops.length === 0 && data.unassigned.length === 0 && (
        <EmptyState title={t('coachTrips.checkin.emptyTitle')} description={t('coachTrips.checkin.emptyDescription')} />
      )}

      {data.stops.map((stop, i) => {
        const count = countFor(stop.id);
        return (
          <section key={stop.id} className="rounded-ds-md border border-ds-border" data-testid="stop-card" data-stop-name={stop.name} data-stop-status={stop.status}>
            <header className="flex flex-wrap items-center gap-ds-3 border-b border-ds-border p-ds-3">
              <span className="flex size-6 items-center justify-center rounded-ds-full bg-ds-surface-sunken text-xs font-semibold tabular-nums">{i + 1}</span>
              <div className="min-w-40 flex-1">
                <p className="text-sm font-semibold">{stop.name}</p>
                <p className="text-xs text-ds-foreground-muted">
                  {stop.scheduledAt ? formatDisplayDateTime(stop.scheduledAt) : t('coachTrips.checkin.noTime')}
                  {stop.arrivedAt && ` · ${t('coachTrips.checkin.arrivedAt', { time: formatDisplayDateTime(stop.arrivedAt) })}`}
                </p>
              </div>
              {stop.documentsCheck && <Tag tone="info">{t('coachTrips.checkin.checkDocuments')}</Tag>}
              <Tag tone={STOP_TONE[stop.status]}>{t(`coachTrips.stopStatus.${stop.status}`)}</Tag>
              <span className={cn('text-sm tabular-nums', isCountComplete(count) && 'font-medium text-ds-success-on-subtle')} data-testid="stop-count">
                {t('coachTrips.checkin.stopCount', { boarded: count.boarded, expected: count.expected })}
              </span>
              {!readOnly && (
                <div className="flex items-center gap-ds-1">
                  <Button type="button" size="sm" variant="outline" disabled={busy || stop.status !== 'pending'} onClick={() => void stopAction(stop, 'arrive')} data-testid="btn-arrive">
                    <LogIn aria-hidden="true" />
                    {t('coachTrips.checkin.arrive')}
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy || stop.status === 'departed'} onClick={() => void stopAction(stop, 'depart')} data-testid="btn-depart">
                    <DoorOpen aria-hidden="true" />
                    {t('coachTrips.checkin.depart')}
                  </Button>
                </div>
              )}
            </header>
            {stop.passengers.length === 0 ? (
              <p className="p-ds-3 text-sm text-ds-foreground-muted">{t('coachTrips.checkin.nobodyHere')}</p>
            ) : (
              <ul className="divide-y divide-ds-border px-ds-3">{stop.passengers.map(renderPassenger)}</ul>
            )}
          </section>
        );
      })}

      {data.unassigned.length > 0 && (
        <section className="rounded-ds-md border border-ds-border" data-testid="stop-card" data-stop-name="">
          <header className="border-b border-ds-border p-ds-3">
            <p className="text-sm font-semibold">{t('coachTrips.checkin.noStop')}</p>
            <p className="text-xs text-ds-foreground-muted">{t('coachTrips.checkin.noStopHint')}</p>
          </header>
          <ul className="divide-y divide-ds-border px-ds-3">{data.unassigned.map(renderPassenger)}</ul>
        </section>
      )}

      {!readOnly && (
        adding ? (
          <form onSubmit={addPassenger} className="grid gap-ds-3 rounded-ds-md border border-ds-border p-ds-3 sm:grid-cols-2" data-testid="add-passenger-form">
            <div className="space-y-ds-1">
              <Label htmlFor="coach-pax-name">{t('coachTrips.checkin.name')}</Label>
              <Input id="coach-pax-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} required />
            </div>
            <div className="space-y-ds-1">
              <Label>{t('coachTrips.checkin.phone')}</Label>
              <E164PhoneInput value={draft.phone} onChange={(v) => setDraft((d) => ({ ...d, phone: v }))} />
            </div>
            <div className="space-y-ds-1">
              <Label htmlFor="coach-pax-seats">{t('coachTrips.checkin.seatsLabel')}</Label>
              <Input id="coach-pax-seats" type="number" min={1} max={60} value={draft.seats} onChange={(e) => setDraft((d) => ({ ...d, seats: e.target.value }))} />
            </div>
            <div className="space-y-ds-1">
              <Label htmlFor="coach-pax-stop">{t('coachTrips.checkin.stop')}</Label>
              <Select value={draft.stopId} onValueChange={(v) => setDraft((d) => ({ ...d, stopId: v }))}>
                <SelectTrigger id="coach-pax-stop" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STOP}>{t('coachTrips.checkin.noStop')}</SelectItem>
                  {stops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-ds-2 sm:col-span-2">
              <Button type="submit" size="sm" disabled={busy || !draft.name.trim()}>{t('coachTrips.checkin.addSubmit')}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>{t('coachTrips.checkin.cancel')}</Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)} data-testid="add-passenger">
            <Plus aria-hidden="true" />
            {t('coachTrips.checkin.addPassenger')}
          </Button>
        )
      )}
    </div>
  );
}
