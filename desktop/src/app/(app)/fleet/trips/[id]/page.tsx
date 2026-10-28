'use client';


import { getLocaleContext } from '@/lib/locale';
import { currencySymbol } from '@/lib/locale-options';
import { formatLocaleTime } from '@/lib/format';
import { formatCurrency } from '@/lib/utils';
import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2, DollarSign, ExternalLink, FileText, Pencil, Phone, Plus, Receipt, RefreshCw, Trash2, Truck, User, XCircle,
} from 'lucide-react';
import { DetailPage } from '@/components/domain';
import {
  Button, Tag, SectionCard, Stat, Avatar, AvatarFallback,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Label, Input, CurrencyInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  EmptyState, Skeleton, useConfirm,
} from '@/components/ui';
import { PageContainer } from '@/components/layout/page-container';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi, type Trip, type TripCost, type TripTimeline } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { TRIP_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '@travelcrm/shared';
import type { TimelineItem } from '@/components/ui/timeline';
import {
  formatCoordinates, formatTripDay, formatTripDuration, formatTripWhen,
  isTripActive, tripEventLabel, tripEventTone, tripStatusTone, tripTypeLabel,
} from '@/components/domain/fleet/trip-format';
import { TRIP_LOAD_MAX_RETRIES, tripLoadView } from '@/components/domain/fleet/trip-load-state';
import { formatDisplayDate } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import { useT } from '@/lib/i18n';
import { CoachTripPanel } from '../_components/passenger-checkin';

const TRIP_STATUS_ORDER = ['assigned', 'accepted', 'en_route', 'started', 'completed'] as const;

/** How often an active trip re-reads itself so driver-app updates show without a reload. */
const POLL_INTERVAL_MS = 10_000;

const COST_TYPE_LABELS: Record<string, string> = {
  fuel: 'Fuel', toll: 'Toll', parking: 'Parking',
  driver_allowance: 'Driver Allowance', other: 'Other',
};

const NOT_CANCELLABLE_MESSAGE =
  'This trip is already under way, so it can no longer be cancelled. Mark it as completed instead, or contact the driver.';
const NOT_DELETABLE_MESSAGE =
  'Only trips that are still Assigned can be deleted. Trips that have started stay on record.';

function errorMessage(e: unknown, fallback: string): string {
  const m = (e as { message?: string } | null)?.message;
  return m && m.trim() ? m : fallback;
}

function formatClock(d: Date) {
  return formatLocaleTime(d, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
}

export default function TripDetailPage() {
  const t = useT();
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const [showAddCostDialog, setShowAddCostDialog] = React.useState(false);
  const [costForm, setCostForm] = React.useState<{ costType: string; amount: number | undefined; notes: string }>({
    costType: 'fuel', amount: undefined, notes: '',
  });
  const { confirm, dialog } = useConfirm();

  const [refreshing, setRefreshing] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState(false);
  const [isAddingCost, setIsAddingCost] = React.useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = React.useState(false);
  const [isGeneratingVoucher, setIsGeneratingVoucher] = React.useState(false);

  // Timeline and costs are best-effort: when one fails the last good copy stays on screen.
  const lastGood = React.useRef<{ timeline: TripTimeline[]; costs: TripCost[] }>({ timeline: [], costs: [] });
  const { data: bundle, loading, error, refetch } = useApiQuery(async () => {
    const [tripRes, timelineRes, costsRes] = await Promise.all([
      fleetApi.trips.getById(tripId),
      fleetApi.trips.getTimeline(tripId).catch(() => null),
      fleetApi.trips.listCosts(tripId).catch(() => null),
    ]);
    if (timelineRes) lastGood.current.timeline = Array.isArray(timelineRes.data) ? timelineRes.data : [];
    if (costsRes) lastGood.current.costs = Array.isArray(costsRes.data) ? costsRes.data : [];
    setUpdatedAt(new Date());
    return { trip: tripRes.data ?? null, timeline: lastGood.current.timeline, costs: lastGood.current.costs };
  }, [tripId]);
  const trip: Trip | null = bundle?.trip ?? null;
  const timeline = bundle?.timeline ?? [];
  const costs = bundle?.costs ?? [];
  const timelineLoading = loading;
  const costsLoading = loading;

  // A failed first load (e.g. a request racing the navigation) is retried before the page
  // settles, so "Trip not found" never flashes for a trip that exists.
  const [loadRetries, setLoadRetries] = React.useState(0);
  const [prevTripId, setPrevTripId] = React.useState(tripId);
  if (prevTripId !== tripId) {
    setPrevTripId(tripId);
    setLoadRetries(0);
  }
  const view = tripLoadView({ hasTrip: !!trip, loading, error, retries: loadRetries });
  React.useEffect(() => {
    if (trip || loading || !error || loadRetries >= TRIP_LOAD_MAX_RETRIES) return;
    const timer = window.setTimeout(() => {
      setLoadRetries((n) => n + 1);
      void refetch();
    }, 600 * (loadRetries + 1));
    return () => window.clearTimeout(timer);
  }, [trip, loading, error, loadRetries, refetch]);

  /** Re-reads trip, timeline and costs. A silent load never swaps content for skeletons. */
  const load = React.useCallback(
    async (silent: boolean) => {
      if (!silent) setRefreshing(true);
      try {
        await refetch({ silent: true });
      } finally {
        setRefreshing(false);
      }
    },
    [refetch],
  );

  const active = isTripActive(trip?.status);
  React.useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [active, load]);

  const totalCosts = costs.reduce((sum, c) => sum + (c.amount ?? 0), 0);

  async function handleStatusUpdate(newStatus: string) {
    if (!trip) return;
    if (newStatus === 'cancelled') {
      if (trip.status !== 'assigned' && trip.status !== 'accepted') {
        toast.error(NOT_CANCELLABLE_MESSAGE, { duration: 8000 });
        return;
      }
      const ok = await confirm({
        title: 'Cancel trip',
        description: 'Are you sure you want to cancel this trip?',
        confirmLabel: 'Cancel trip',
        tone: 'destructive',
      });
      if (!ok) return;
    }
    setIsUpdatingStatus(true);
    try {
      await fleetApi.trips.updateStatus(tripId, newStatus);
      toast.success(`Trip status updated to ${TRIP_STATUS_LABELS[newStatus as keyof typeof TRIP_STATUS_LABELS] || newStatus}`);
      await load(true);
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to update trip status'));
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  async function handleDeleteTrip() {
    if (!trip) return;
    if (trip.status !== 'assigned') {
      toast.error(NOT_DELETABLE_MESSAGE, { duration: 8000 });
      return;
    }
    const ok = await confirm({
      title: 'Delete trip',
      description: 'Delete this trip? This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await fleetApi.trips.delete(tripId);
      toast.success('Trip deleted');
      router.push('/fleet/trips');
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to delete trip'));
    }
  }

  async function handleAddCost(e: React.FormEvent) {
    e.preventDefault();
    if (costForm.amount === undefined) return;
    setIsAddingCost(true);
    try {
      await fleetApi.trips.addCost(tripId, {
        costType: costForm.costType as TripCost['costType'],
        amount: costForm.amount,
        notes: costForm.notes || undefined,
      });
      toast.success('Cost added');
      await load(true);
      setShowAddCostDialog(false);
      setCostForm({ costType: 'fuel', amount: undefined, notes: '' });
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to add cost'));
    } finally {
      setIsAddingCost(false);
    }
  }

  async function handleDeleteCost(costId: string) {
    const ok = await confirm({
      title: 'Delete cost entry',
      description: 'Delete this cost entry? This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await fleetApi.trips.deleteCost(tripId, costId);
      toast.success('Cost deleted');
      await load(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete cost'));
    }
  }

  async function handleGenerateInvoice() {
    if (trip?.invoiceId) {
      router.push(`/invoices/${trip.invoiceId}`);
      return;
    }
    setIsGeneratingInvoice(true);
    try {
      const res = await fleetApi.trips.generateInvoice(tripId);
      toast.success('Invoice generated');
      const id = res.data?.id;
      if (id) router.push(`/invoices/${id}`);
      else await load(true);
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to generate invoice'));
    } finally {
      setIsGeneratingInvoice(false);
    }
  }

  async function handleGenerateVoucher() {
    if (trip?.voucherId) {
      router.push(`/vouchers/${trip.voucherId}`);
      return;
    }
    setIsGeneratingVoucher(true);
    try {
      const res = await fleetApi.trips.generateVoucher(tripId);
      toast.success('Voucher generated');
      const id = res.data?.id;
      if (id) router.push(`/vouchers/${id}`);
      else await load(true);
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to generate voucher'));
    } finally {
      setIsGeneratingVoucher(false);
    }
  }

  if (view === 'loading') {
    // Mirrors the loaded layout (header, stat row, route card, two cards) so nothing jumps
    return (
      <PageContainer>
        <div className="flex flex-col gap-ds-6" data-testid="trip-skeleton">
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-ds-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-48 w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-ds-4">
            <Skeleton className="h-52 w-full" />
            <Skeleton className="h-52 w-full" />
          </div>
        </div>
      </PageContainer>
    );
  }

  if (view === 'error') {
    return (
      <EmptyState
        title="Could not load this trip"
        description="Something went wrong while loading the trip. Check your connection and try again."
        action={
          <div className="flex gap-ds-2">
            <Button onClick={() => { setLoadRetries(0); void refetch(); }}>Try again</Button>
            <Button variant="outline" onClick={() => router.push('/fleet/trips')}>Back to trips</Button>
          </div>
        }
      />
    );
  }

  if (view === 'not-found' || !trip) {
    return (
      <EmptyState
        title="Trip not found"
        description="This trip may have been removed."
        action={<Button variant="outline" onClick={() => router.push('/fleet/trips')}>Back to trips</Button>}
      />
    );
  }

  const tripTypeText = tripTypeLabel(trip.tripType);
  const vehicle = trip.vehicle;
  const driver = trip.driver;
  const vehicleTypeLabel = vehicle?.type ? (VEHICLE_TYPE_LABELS[vehicle.type as keyof typeof VEHICLE_TYPE_LABELS] || vehicle.type) : '';

  const statusIdx = TRIP_STATUS_ORDER.indexOf(trip.status as typeof TRIP_STATUS_ORDER[number]);
  const nextStatus = statusIdx >= 0 && statusIdx < TRIP_STATUS_ORDER.length - 1 ? TRIP_STATUS_ORDER[statusIdx + 1] : null;
  const nextStatusLabel = nextStatus ? TRIP_STATUS_LABELS[nextStatus as keyof typeof TRIP_STATUS_LABELS] : null;
  const isFinal = !isTripActive(trip.status);

  // Newest first, so a fresh driver-app event lands at the top of the list.
  const activity: TimelineItem[] = timeline
    .map((h, i) => {
      const coords = formatCoordinates(h.latitude, h.longitude);
      const detail = [h.notes || h.userName, coords ? `Location ${coords}` : null].filter(Boolean).join(' · ');
      return {
        id: `${h.status}-${i}`,
        title: tripEventLabel(h.status),
        description: detail || undefined,
        timestamp: formatTripWhen(h.timestamp),
        tone: tripEventTone(h.status),
      } satisfies TimelineItem;
    })
    .reverse();

  return (
    <>
      {dialog}
      <DetailPage
        assistant={{ entityType: 'trip', entityId: tripId }}
        entity={trip}
        title={`${trip.startLocation} → ${trip.endLocation}`}
        subtitle={`${trip.passengerName || 'No passenger'} · ${tripTypeText} · ${formatTripDay(trip.startTime)}`}
        status={<Tag tone={tripStatusTone(trip.status)}>{TRIP_STATUS_LABELS[trip.status as keyof typeof TRIP_STATUS_LABELS] || trip.status}</Tag>}
        onBack={() => router.push('/fleet/trips')}
        messaging={driver ? {
          recipientId: trip.driverId,
          recipientName: driver.name || trip.driverName || 'Driver',
          phone: driver.phone,
        } : undefined}
        primaryActions={
          <>
            <span
              className="hidden text-xs text-ds-foreground-muted md:inline"
              data-testid="trip-refresh-status"
              aria-live="off"
            >
              {active ? 'Live' : 'Updated'}{updatedAt ? ` · ${formatClock(updatedAt)}` : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(false)}
              disabled={refreshing}
              aria-label="Refresh trip"
            >
              <RefreshCw className={refreshing ? 'animate-spin' : undefined} aria-hidden="true" />Refresh
            </Button>
            {trip.status === 'assigned' && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/fleet/trips/${tripId}/edit`}><Pencil aria-hidden="true" />Edit</Link>
              </Button>
            )}
            {nextStatus && nextStatusLabel && !isFinal && (
              <Button size="sm" onClick={() => void handleStatusUpdate(nextStatus)} disabled={isUpdatingStatus}>
                <CheckCircle2 aria-hidden="true" />Mark as {nextStatusLabel}
              </Button>
            )}
          </>
        }
        actions={[
          {
            label: trip.invoiceId ? 'View invoice' : 'Generate invoice',
            icon: <FileText aria-hidden="true" />,
            onSelect: () => void handleGenerateInvoice(),
            disabled: isGeneratingInvoice,
          },
          {
            label: trip.voucherId ? 'View voucher' : 'Generate voucher',
            icon: <Receipt aria-hidden="true" />,
            onSelect: () => void handleGenerateVoucher(),
            disabled: isGeneratingVoucher,
          },
          {
            label: 'Cancel trip',
            icon: <XCircle aria-hidden="true" />,
            onSelect: () => void handleStatusUpdate('cancelled'),
            destructive: true,
            disabled: trip.status === 'completed' || trip.status === 'cancelled' || isUpdatingStatus,
            separatorBefore: true,
          },
          {
            label: 'Delete trip',
            icon: <Trash2 aria-hidden="true" />,
            onSelect: () => void handleDeleteTrip(),
            destructive: true,
          },
        ]}
        activity={activity}
        activityLoading={timelineLoading}
        related={[
          {
            title: `Cost entries (${costs.length})`,
            action: (
              <Button size="sm" onClick={() => setShowAddCostDialog(true)}>
                <Plus aria-hidden="true" />Add cost
              </Button>
            ),
            content: costsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : costs.length === 0 ? (
              <EmptyState
                title="No cost entries yet"
                description="Track fuel, tolls, and other trip costs."
                icon={<DollarSign aria-hidden="true" />}
              />
            ) : (
              <div className="flex flex-col gap-ds-2">
                {costs.map((cost) => (
                  <div key={cost.id} className="flex items-center gap-ds-4 p-ds-3 rounded-ds-md border border-ds-border hover:bg-ds-surface-sunken">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{COST_TYPE_LABELS[cost.costType] || cost.costType}</p>
                      {cost.notes && <p className="text-xs text-ds-foreground-muted">{cost.notes}</p>}
                      <p className="text-xs text-ds-foreground-muted">{formatDisplayDate(cost.createdAt)}</p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">{formatCurrency(cost.amount)}</p>
                    <Button variant="ghost" size="icon-sm" aria-label="Delete cost" onClick={() => void handleDeleteCost(cost.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            ),
          },
        ]}
        overview={
          <div className="flex flex-col gap-ds-6">
            {trip.status === 'completed' && trip.invoiceId && (
              <div
                className="flex flex-wrap items-center gap-ds-3 rounded-ds-md border border-ds-success bg-ds-success-subtle p-ds-3 text-sm text-ds-success-on-subtle"
                data-testid="trip-invoice-banner"
              >
                <FileText className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex-1">Trip completed. An invoice was created for this trip.</span>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/invoices/${trip.invoiceId}`}>View invoice<ExternalLink aria-hidden="true" /></Link>
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-ds-4">
              <Stat label="Distance" value={`${trip.distance ?? 0} km`} />
              <Stat label="Fare" value={formatCurrency(trip.fare ?? 0)} />
              <Stat label="Total costs" value={formatCurrency(totalCosts)} icon={<DollarSign aria-hidden="true" />} />
            </div>

            {trip.tripKind === 'coach' && (
              <SectionCard title={t('coachTrips.detail.checkin')} description={t('coachTrips.detail.checkinHint')}>
                <CoachTripPanel tripId={tripId} readOnly={trip.status === 'completed' || trip.status === 'cancelled'} />
              </SectionCard>
            )}

            <SectionCard title="Route">
              <div className="flex items-center gap-ds-4">
                <div className="flex-1">
                  <p className="text-xs text-ds-foreground-muted uppercase tracking-wide">Pickup</p>
                  <p className="text-sm font-medium mt-0.5">{trip.startLocation}</p>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-ds-foreground-muted uppercase tracking-wide">Drop</p>
                  <p className="text-sm font-medium mt-0.5">{trip.endLocation}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-ds-4 mt-ds-4 pt-ds-4 border-t border-ds-border">
                <div>
                  <p className="text-xs text-ds-foreground-muted">Start</p>
                  <p className="text-sm font-medium mt-0.5">{formatTripWhen(trip.startTime)}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted">End</p>
                  <p className="text-sm font-medium mt-0.5">{formatTripWhen(trip.endTime)}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted">Duration</p>
                  <p className="text-sm font-medium mt-0.5">{formatTripDuration(trip.startTime, trip.endTime) || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted">Est. distance</p>
                  <p className="text-sm font-medium mt-0.5">{trip.distance ?? 0} km</p>
                </div>
              </div>
            </SectionCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-ds-4">
              <SectionCard title="Passenger">
                <div className="flex flex-col gap-ds-3">
                  <div className="flex justify-between"><span className="text-sm text-ds-foreground-muted">Name</span><span className="text-sm font-medium">{trip.passengerName || '—'}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-ds-foreground-muted">Phone</span><span className="text-sm font-medium">{formatPhone(trip.passengerPhone) || '—'}</span></div>
                  <div className="flex justify-between items-center"><span className="text-sm text-ds-foreground-muted">Trip type</span><Tag>{tripTypeText}</Tag></div>
                  {trip.leadId && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-ds-foreground-muted">Lead</span>
                      <Link href={`/leads/${trip.leadId}`} className="text-sm font-medium text-ds-primary hover:underline">View lead</Link>
                    </div>
                  )}
                  {trip.specialInstructions && (
                    <div>
                      <p className="text-xs text-ds-foreground-muted mb-1">Special instructions</p>
                      <p className="text-sm">{trip.specialInstructions}</p>
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Vehicle & driver">
                <div className="flex flex-col gap-ds-4">
                  <div className="flex items-center gap-ds-3">
                    <div className="h-9 w-9 rounded-ds-md bg-ds-surface-sunken flex items-center justify-center shrink-0">
                      <Truck className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {vehicle ? `${vehicle.make || ''} ${vehicle.model || ''}`.trim() || vehicle.registrationNumber : trip.vehicleRegistration || '—'}
                      </p>
                      <p className="text-xs text-ds-foreground-muted font-mono truncate">
                        {vehicle?.registrationNumber || trip.vehicleRegistration || '—'}
                        {vehicleTypeLabel ? ` · ${vehicleTypeLabel}` : ''}
                        {vehicle?.seatingCapacity ? ` · ${vehicle.seatingCapacity} seats` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-ds-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{(driver?.name || trip.driverName || 'D').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{driver?.name || trip.driverName || '—'}</p>
                      <p className="text-xs text-ds-foreground-muted flex items-center gap-ds-1">
                        {driver?.phone && <><Phone className="h-3 w-3" aria-hidden="true" />{formatPhone(driver.phone)}</>}
                        {driver?.rating ? ` · ★${driver.rating}` : ''}
                      </p>
                    </div>
                  </div>
                  {trip.tourLeaderId && (
                    <div className="flex items-center gap-ds-3" data-testid="trip-tour-leader">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{(trip.tourLeaderName || 'T').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{trip.tourLeaderName || '—'}</p>
                        <p className="text-xs text-ds-foreground-muted flex items-center gap-ds-1">
                          {t('coachTrips.detail.tourLeader')}
                          {trip.tourLeaderPhone && <> · <Phone className="h-3 w-3" aria-hidden="true" />{formatPhone(trip.tourLeaderPhone)}</>}
                        </p>
                      </div>
                    </div>
                  )}
                  {!vehicle && !driver && !trip.tourLeaderId && (
                    <p className="text-xs text-ds-foreground-muted flex items-center gap-ds-1">
                      <User className="h-3 w-3" aria-hidden="true" />No vehicle or driver assigned yet.
                    </p>
                  )}
                </div>
              </SectionCard>
            </div>
          </div>
        }
      />

      <Dialog open={showAddCostDialog} onOpenChange={setShowAddCostDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add cost entry</DialogTitle></DialogHeader>
          <form onSubmit={handleAddCost} className="flex flex-col gap-ds-4">
            <div className="flex flex-col gap-ds-2">
              <Label>Cost type <span className="text-ds-danger">*</span></Label>
              <Select value={costForm.costType} onValueChange={(v) => setCostForm((p) => ({ ...p, costType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(COST_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="costAmount">Amount ({currencySymbol(getLocaleContext().currency)}) <span className="text-ds-danger">*</span></Label>
              <CurrencyInput
                id="costAmount"
                placeholder="0"
                value={costForm.amount}
                onChange={(v) => setCostForm((p) => ({ ...p, amount: v }))}
                required
              />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="costNotes">Notes</Label>
              <Input id="costNotes" placeholder="Optional notes..." value={costForm.notes} onChange={(e) => setCostForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddCostDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isAddingCost}>Add cost</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
