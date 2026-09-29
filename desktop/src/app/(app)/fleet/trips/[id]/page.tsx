'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2, DollarSign, FileText, Pencil, Phone, Plus, Receipt, Trash2, Truck, User, XCircle,
} from 'lucide-react';
import { DetailPage } from '@/components/domain';
import {
  Button, Tag, SectionCard, Stat, Avatar, AvatarFallback,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Label, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  EmptyState, Skeleton, useConfirm,
} from '@/components/ui';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { fleetApi, type Trip, type TripCost, type TripTimeline } from '@/lib/api/fleet';
import { toast } from 'sonner';
import {
  TRIP_STATUS_LABELS, FLEET_TRIP_TYPE_LABELS, VEHICLE_TYPE_LABELS,
} from '@travelcrm/shared';
import type { TimelineItem } from '@/components/ui/timeline';
import { formatTripDate, formatTripDateTime } from '@/components/domain/fleet/trip-format';

const TRIP_STATUS_ORDER = ['assigned', 'accepted', 'en_route', 'started', 'completed'] as const;

const COST_TYPE_LABELS: Record<string, string> = {
  fuel: 'Fuel', toll: 'Toll', parking: 'Parking',
  driver_allowance: 'Driver Allowance', other: 'Other',
};

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'started' || status === 'en_route') return 'info';
  if (status === 'accepted') return 'warning';
  return 'neutral';
}

export default function TripDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const [showAddCostDialog, setShowAddCostDialog] = React.useState(false);
  const [costForm, setCostForm] = React.useState({ costType: 'fuel' as string, amount: '', notes: '' });
  const { confirm, dialog } = useConfirm();

  const tripQuery = useApiQuery<any>(() => fleetApi.trips.getById(tripId), [tripId]);
  const timelineQuery = useApiQuery(() => fleetApi.trips.getTimeline(tripId).then((res) => res.data), [tripId]);
  const costsQuery = useApiQuery(() => fleetApi.trips.listCosts(tripId).then((res) => res.data), [tripId]);

  const { mutate: updateStatus, loading: isUpdatingStatus } = useApiMutation<{ status: string }, any>(
    (data) => fleetApi.trips.updateStatus(tripId, data.status),
  );
  const { mutate: addCost, loading: isAddingCost } = useApiMutation<any, any>(
    (data) => fleetApi.trips.addCost(tripId, data),
  );
  const { mutate: deleteCost } = useApiMutation<any, any>(
    (costId: string) => fleetApi.trips.deleteCost(tripId, costId),
  );
  const [isGeneratingInvoice, setIsGeneratingInvoice] = React.useState(false);
  const [isGeneratingVoucher, setIsGeneratingVoucher] = React.useState(false);

  React.useEffect(() => {
    if (tripQuery.error) toast.error('Failed to load trip details');
  }, [tripQuery.error]);

  const trip = tripQuery.data?.data as Trip | undefined;
  const timeline: TripTimeline[] = Array.isArray(timelineQuery.data) ? timelineQuery.data as TripTimeline[] : [];
  const costs: TripCost[] = Array.isArray(costsQuery.data) ? costsQuery.data as TripCost[] : [];
  const totalCosts = costs.reduce((sum, c) => sum + (c.amount ?? 0), 0);

  async function handleStatusUpdate(newStatus: string) {
    if (newStatus === 'cancelled') {
      const ok = await confirm({
        title: 'Cancel trip',
        description: 'Are you sure you want to cancel this trip?',
        confirmLabel: 'Cancel trip',
        tone: 'destructive',
      });
      if (!ok) return;
    }
    const result = await updateStatus({ status: newStatus });
    if (result) {
      toast.success(`Trip status updated to ${TRIP_STATUS_LABELS[newStatus as keyof typeof TRIP_STATUS_LABELS] || newStatus}`);
      tripQuery.refetch();
      timelineQuery.refetch();
    } else {
      toast.error('Failed to update trip status');
    }
  }

  async function handleAddCost(e: React.FormEvent) {
    e.preventDefault();
    const result = await addCost({
      costType: costForm.costType,
      amount: parseFloat(costForm.amount),
      notes: costForm.notes || undefined,
    });
    if (result) {
      toast.success('Cost added');
      costsQuery.refetch();
      setShowAddCostDialog(false);
      setCostForm({ costType: 'fuel', amount: '', notes: '' });
    } else {
      toast.error('Failed to add cost');
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
    const result = await deleteCost(costId);
    if (result !== null) {
      toast.success('Cost deleted');
      costsQuery.refetch();
    } else {
      toast.error('Failed to delete cost');
    }
  }

  async function handleGenerateInvoice() {
    const existing = (trip as any)?.invoiceId as string | null | undefined;
    if (existing) {
      router.push(`/invoices/${existing}`);
      return;
    }
    setIsGeneratingInvoice(true);
    try {
      const res = await fleetApi.trips.generateInvoice(tripId);
      toast.success('Invoice generated');
      const id = res.data?.id;
      if (id) router.push(`/invoices/${id}`);
      else tripQuery.refetch();
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Failed to generate invoice');
    } finally {
      setIsGeneratingInvoice(false);
    }
  }

  async function handleGenerateVoucher() {
    const existing = (trip as any)?.voucherId as string | null | undefined;
    if (existing) {
      router.push(`/vouchers/${existing}`);
      return;
    }
    setIsGeneratingVoucher(true);
    try {
      const res = await fleetApi.trips.generateVoucher(tripId);
      toast.success('Voucher generated');
      const id = res.data?.id;
      if (id) router.push(`/vouchers/${id}`);
      else tripQuery.refetch();
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Failed to generate voucher');
    } finally {
      setIsGeneratingVoucher(false);
    }
  }

  if (tripQuery.loading) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!trip) {
    return (
      <EmptyState
        title="Trip not found"
        description="This trip may have been removed."
        action={<Button variant="outline" onClick={() => router.push('/fleet/trips')}>Back to trips</Button>}
      />
    );
  }

  const tripTypeLabel = FLEET_TRIP_TYPE_LABELS[(trip as any).tripType as keyof typeof FLEET_TRIP_TYPE_LABELS] || (trip as any).tripType || 'Standard';
  const vehicle = trip.vehicle;
  const driver = trip.driver;
  const vehicleTypeLabel = vehicle?.type ? (VEHICLE_TYPE_LABELS[vehicle.type as keyof typeof VEHICLE_TYPE_LABELS] || vehicle.type) : '';

  const statusIdx = TRIP_STATUS_ORDER.indexOf(trip.status as typeof TRIP_STATUS_ORDER[number]);
  const nextStatus = statusIdx >= 0 && statusIdx < TRIP_STATUS_ORDER.length - 1 ? TRIP_STATUS_ORDER[statusIdx + 1] : null;
  const nextStatusLabel = nextStatus ? TRIP_STATUS_LABELS[nextStatus as keyof typeof TRIP_STATUS_LABELS] : null;
  const isFinal = trip.status === 'completed' || trip.status === 'cancelled';

  const activity: TimelineItem[] = timeline.map((h, i) => ({
    id: `${h.status}-${i}`,
    title: TRIP_STATUS_LABELS[h.status as keyof typeof TRIP_STATUS_LABELS] || h.status,
    description: h.notes || h.userName,
    timestamp: formatTripDateTime(h.timestamp),
  }));

  return (
    <>
      {dialog}
      <DetailPage
        entity={trip}
        title={`${trip.startLocation} → ${trip.endLocation}`}
        subtitle={`${trip.passengerName || 'No passenger'} · ${tripTypeLabel} · ${formatTripDate(trip.startTime)}`}
        status={<Tag tone={statusTone(trip.status)}>{TRIP_STATUS_LABELS[trip.status as keyof typeof TRIP_STATUS_LABELS] || trip.status}</Tag>}
        onBack={() => router.push('/fleet/trips')}
        messaging={driver ? {
          recipientId: trip.driverId,
          recipientName: driver.name || trip.driverName || 'Driver',
          phone: driver.phone,
        } : undefined}
        primaryActions={
          <>
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
            label: (trip as any).invoiceId ? 'View invoice' : 'Generate invoice',
            icon: <FileText aria-hidden="true" />,
            onSelect: () => void handleGenerateInvoice(),
            disabled: isGeneratingInvoice,
          },
          {
            label: (trip as any).voucherId ? 'View voucher' : 'Generate voucher',
            icon: <Receipt aria-hidden="true" />,
            onSelect: () => void handleGenerateVoucher(),
            disabled: isGeneratingVoucher,
          },
          {
            label: 'Cancel trip',
            icon: <XCircle aria-hidden="true" />,
            onSelect: () => void handleStatusUpdate('cancelled'),
            destructive: true,
            disabled: (trip.status !== 'assigned' && trip.status !== 'accepted') || isUpdatingStatus,
            separatorBefore: true,
          },
        ]}
        activity={activity}
        activityLoading={timelineQuery.loading}
        related={[
          {
            title: `Cost entries (${costs.length})`,
            action: (
              <Button size="sm" onClick={() => setShowAddCostDialog(true)}>
                <Plus aria-hidden="true" />Add cost
              </Button>
            ),
            content: costsQuery.loading ? (
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
                      <p className="text-xs text-ds-foreground-muted">{new Date(cost.createdAt).toLocaleDateString('en-IN')}</p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">₹{cost.amount.toLocaleString('en-IN')}</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-ds-4">
              <Stat label="Distance" value={`${trip.distance ?? 0} km`} />
              <Stat label="Fare" value={`₹${(trip.fare ?? 0).toLocaleString('en-IN')}`} />
              <Stat label="Total costs" value={`₹${totalCosts.toLocaleString('en-IN')}`} icon={<DollarSign aria-hidden="true" />} />
            </div>

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
              <div className="grid grid-cols-3 gap-ds-4 mt-ds-4 pt-ds-4 border-t border-ds-border">
                <div>
                  <p className="text-xs text-ds-foreground-muted">Start</p>
                  <p className="text-sm font-medium mt-0.5">{formatTripDateTime(trip.startTime)}</p>
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted">End</p>
                  <p className="text-sm font-medium mt-0.5">{formatTripDateTime(trip.endTime)}</p>
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
                  <div className="flex justify-between"><span className="text-sm text-ds-foreground-muted">Phone</span><span className="text-sm font-medium">{trip.passengerPhone || '—'}</span></div>
                  <div className="flex justify-between items-center"><span className="text-sm text-ds-foreground-muted">Trip type</span><Tag>{tripTypeLabel}</Tag></div>
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
                        {driver?.phone && <><Phone className="h-3 w-3" aria-hidden="true" />{driver.phone}</>}
                        {driver?.rating ? ` · ★${driver.rating}` : ''}
                      </p>
                    </div>
                  </div>
                  {!vehicle && !driver && (
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
              <Label htmlFor="costAmount">Amount (₹) <span className="text-ds-danger">*</span></Label>
              <Input id="costAmount" type="number" min={0} step="0.01" placeholder="0" value={costForm.amount} onChange={(e) => setCostForm((p) => ({ ...p, amount: e.target.value }))} required />
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
