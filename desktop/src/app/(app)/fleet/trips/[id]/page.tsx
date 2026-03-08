'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, MapPin, ArrowRight, Truck, User, Phone, Calendar,
  DollarSign, FileText, CheckCircle2, Circle, AlertTriangle, Plus, Trash2, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { fleetApi, type Trip, type TripCost, type TripTimeline } from '@/lib/api/fleet';
import { toast } from 'sonner';
import {
  TRIP_STATUS_LABELS, TRIP_STATUS_COLORS,
  FLEET_TRIP_TYPE_LABELS, VEHICLE_TYPE_LABELS,
} from '@travelcrm/shared';

const TRIP_STATUS_ORDER = ['assigned', 'accepted', 'en_route', 'started', 'completed'] as const;

const COST_TYPE_LABELS: Record<string, string> = {
  fuel: 'Fuel', toll: 'Toll', parking: 'Parking',
  driver_allowance: 'Driver Allowance', maintenance: 'Maintenance', other: 'Other',
};

function StatusTimeline({ currentStatus, history }: { currentStatus: string; history: TripTimeline[] }) {
  const currentIdx = TRIP_STATUS_ORDER.indexOf(currentStatus as typeof TRIP_STATUS_ORDER[number]);
  return (
    <div className="space-y-0">
      {TRIP_STATUS_ORDER.map((status, idx) => {
        const historyEntry = history.find((h) => h.status === status);
        const isComplete = idx <= currentIdx && currentStatus !== 'cancelled';
        const isCurrent = status === currentStatus;
        const color = TRIP_STATUS_COLORS[status as keyof typeof TRIP_STATUS_COLORS] || '#64748B';
        const label = TRIP_STATUS_LABELS[status as keyof typeof TRIP_STATUS_LABELS] || status;
        return (
          <div key={status} className="flex gap-3">
            <div className="flex flex-col items-center">
              {isComplete ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color }} />
              ) : (
                <Circle className={cn('h-5 w-5 shrink-0', isCurrent ? 'text-blue-500' : 'text-muted-foreground/30')} />
              )}
              {idx < TRIP_STATUS_ORDER.length - 1 && (
                <div className={cn('w-px flex-1 min-h-8', isComplete ? 'bg-green-300' : 'bg-border')} />
              )}
            </div>
            <div className="pb-6">
              <p className={cn('text-sm font-medium', isComplete ? 'text-foreground' : 'text-muted-foreground')}>{label}</p>
              {historyEntry && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(historyEntry.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {' · '}{historyEntry.userName}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TripDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;
  const [showAddCostDialog, setShowAddCostDialog] = React.useState(false);
  const [costForm, setCostForm] = React.useState({ costType: 'fuel' as string, amount: '', notes: '' });

  const { data: response, loading, error, refetch } = useApiQuery<any>(
    () => fleetApi.trips.getById(tripId),
    [tripId],
  );

  const timelineQuery = useApiQuery(
    () => fleetApi.trips.getTimeline(tripId).then(res => res.data),
    [tripId]
  );

  const costsQuery = useApiQuery(
    () => fleetApi.trips.listCosts(tripId).then(res => res.data),
    [tripId]
  );

  const { mutate: updateTrip, loading: isUpdatingStatus } = useApiMutation<any, any>(
    (data) => fleetApi.trips.update(tripId, data),
  );

  const { mutate: addCost, loading: isAddingCost } = useApiMutation<any, any>(
    (data) => fleetApi.trips.addCost(tripId, data),
  );

  const { mutate: deleteCost } = useApiMutation<any, any>(
    (costId: string) => fleetApi.trips.deleteCost(tripId, costId),
  );

  const trip = response?.data as Trip | undefined;
  const timeline: TripTimeline[] = Array.isArray(timelineQuery.data) ? timelineQuery.data as TripTimeline[] : [];
  const costs: TripCost[] = Array.isArray(costsQuery.data) ? costsQuery.data as TripCost[] : [];
  const totalCosts = costs.reduce((sum, c) => sum + (c.amount ?? 0), 0);

  const handleStatusUpdate = async (newStatus: string) => {
    const result = await updateTrip({ status: newStatus });
    if (result) {
      toast.success(`Trip status updated to ${newStatus.replace('_', ' ')}`);
      refetch();
      timelineQuery.refetch();
    } else {
      toast.error('Failed to update trip status');
    }
  };

  const handleCancelTrip = async () => {
    if (!confirm('Are you sure you want to cancel this trip?')) return;
    const result = await updateTrip({ status: 'cancelled' });
    if (result) {
      toast.success('Trip cancelled successfully');
      refetch();
    } else {
      toast.error('Failed to cancel trip');
    }
  };

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
    if (!confirm('Delete this cost entry?')) return;
    const result = await deleteCost(costId);
    if (result !== null) {
      toast.success('Cost deleted');
      costsQuery.refetch();
    } else {
      toast.error('Failed to delete cost');
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="text-muted-foreground">Loading trip details...</div></div>;
  }

  if (error || !trip) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Truck className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">Trip not found</p>
        <Button variant="outline" onClick={() => router.push('/fleet/trips')}>Back to Trips</Button>
      </div>
    );
  }

  const statusColor = TRIP_STATUS_COLORS[trip.status as keyof typeof TRIP_STATUS_COLORS] || '#64748B';
  const statusLabel = TRIP_STATUS_LABELS[trip.status as keyof typeof TRIP_STATUS_LABELS] || trip.status;
  const tripTypeLabel = FLEET_TRIP_TYPE_LABELS[(trip as any).tripType as keyof typeof FLEET_TRIP_TYPE_LABELS] || (trip as any).tripType || 'Standard';
  const vehicle = (trip as any).vehicle;
  const driver = (trip as any).driver;
  const vehicleTypeLabel = vehicle?.type ? (VEHICLE_TYPE_LABELS[vehicle.type as keyof typeof VEHICLE_TYPE_LABELS] || vehicle.type) : '';

  const statusIdx = TRIP_STATUS_ORDER.indexOf(trip.status as typeof TRIP_STATUS_ORDER[number]);
  const nextStatus = statusIdx >= 0 && statusIdx < TRIP_STATUS_ORDER.length - 1 ? TRIP_STATUS_ORDER[statusIdx + 1] : null;
  const nextStatusLabel = nextStatus ? TRIP_STATUS_LABELS[nextStatus as keyof typeof TRIP_STATUS_LABELS] : null;

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                  {trip.startLocation} → {trip.endLocation}
                </h1>
                <Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
                  {statusLabel}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {trip.passengerName || 'No passenger'} · {tripTypeLabel} · {(trip.startTime || '').split('T')[0] || '—'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {nextStatus && nextStatusLabel && trip.status !== 'completed' && trip.status !== 'cancelled' && (
              <Button onClick={() => handleStatusUpdate(nextStatus)} disabled={isUpdatingStatus}>
                {isUpdatingStatus ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                Mark as {nextStatusLabel}
              </Button>
            )}
            {trip.status !== 'completed' && trip.status !== 'cancelled' && (
              <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleCancelTrip} disabled={isUpdatingStatus}>
                Cancel Trip
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue="info" className="flex-1 flex flex-col">
          <div className="px-6 pt-3 border-b">
            <TabsList>
              <TabsTrigger value="info">Trip Info</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="costs">Costs ({costs.length})</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <TabsContent value="info" className="mt-0">
              <div className="max-w-4xl space-y-6">
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />Route</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Pickup</p>
                        <p className="text-sm font-medium mt-0.5">{trip.startLocation}</p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Drop</p>
                        <p className="text-sm font-medium mt-0.5">{trip.endLocation}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground">Start Date</p>
                        <p className="text-sm font-medium flex items-center gap-1 mt-0.5"><Calendar className="h-3 w-3" />{(trip.startTime || '').split('T')[0] || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">End Date</p>
                        <p className="text-sm font-medium flex items-center gap-1 mt-0.5"><Calendar className="h-3 w-3" />{(trip.endTime || '').split('T')[0] || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Est. Distance</p>
                        <p className="text-sm font-medium mt-0.5">{trip.distance ?? 0} km</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" />Passenger</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between"><span className="text-sm text-muted-foreground">Name</span><span className="text-sm font-medium">{trip.passengerName || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-muted-foreground">Phone</span><span className="text-sm font-medium">{trip.passengerPhone || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-muted-foreground">Trip Type</span><Badge variant="outline" className="text-xs">{tripTypeLabel}</Badge></div>
                      {trip.specialInstructions && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Special Instructions</p>
                          <p className="text-sm">{trip.specialInstructions}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />Vehicle & Driver</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Vehicle</p>
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                            <Truck className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {vehicle ? `${vehicle.make || ''} ${vehicle.model || ''}`.trim() : trip.vehicleRegistration || trip.vehicleId?.slice(0, 8) || '—'}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {vehicle?.registrationNumber || trip.vehicleRegistration || '—'}
                              {vehicleTypeLabel ? ` · ${vehicleTypeLabel}` : ''}
                              {vehicle?.seatingCapacity ? ` · ${vehicle.seatingCapacity} seats` : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Driver</p>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="text-xs">
                              {(driver?.name || trip.driverName || 'D').split(' ').map((n: string) => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{driver?.name || trip.driverName || '—'}</p>
                            <p className="text-xs text-muted-foreground">
                              {driver?.phone ? <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{driver.phone}</span> : ''}
                              {driver?.rating ? ` · ★${driver.rating}` : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="mt-0">
              <div className="max-w-xl">
                <Card>
                  <CardHeader><CardTitle className="text-base">Status Timeline</CardTitle></CardHeader>
                  <CardContent>
                    {timelineQuery.loading ? (
                      <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading timeline...</span></div>
                    ) : trip.status === 'cancelled' ? (
                      <div className="flex items-center gap-3 p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
                        <AlertTriangle className="h-5 w-5 text-red-500" />
                        <div>
                          <p className="text-sm font-medium text-red-700 dark:text-red-400">Trip Cancelled</p>
                        </div>
                      </div>
                    ) : (
                      <StatusTimeline currentStatus={trip.status} history={timeline} />
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="costs" className="mt-0">
              <div className="max-w-2xl space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{costs.length} cost entr{costs.length !== 1 ? 'ies' : 'y'} · Total: <strong>₹{totalCosts.toLocaleString('en-IN')}</strong></p>
                  <Button size="sm" onClick={() => setShowAddCostDialog(true)}><Plus className="h-4 w-4 mr-1.5" />Add Cost</Button>
                </div>

                {costsQuery.loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading costs...</span></div>
                ) : costs.length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground"><DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No cost entries yet</p></CardContent></Card>
                ) : (
                  <div className="space-y-2">
                    {costs.map((cost) => (
                      <div key={cost.id} className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{COST_TYPE_LABELS[cost.costType] || cost.costType}</p>
                          {cost.notes && <p className="text-xs text-muted-foreground">{cost.notes}</p>}
                          <p className="text-xs text-muted-foreground">{new Date(cost.createdAt).toLocaleDateString('en-IN')}</p>
                        </div>
                        <p className="text-sm font-semibold shrink-0">₹{cost.amount.toLocaleString('en-IN')}</p>
                        <Button variant="ghost" size="icon-sm" className="text-red-500 hover:text-red-600" onClick={() => handleDeleteCost(cost.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" />Cost Summary</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Estimated Fare</span><span className="text-sm font-medium">₹{((trip as any).estimatedCost ?? trip.fare ?? 0).toLocaleString('en-IN')}</span></div>
                    {(trip as any).actualCost != null && (
                      <div className="flex justify-between"><span className="text-sm text-muted-foreground">Actual Cost</span><span className="text-sm font-semibold">₹{(trip as any).actualCost.toLocaleString('en-IN')}</span></div>
                    )}
                    {costs.length > 0 && (
                      <div className="flex justify-between"><span className="text-sm text-muted-foreground">Additional Costs</span><span className="text-sm font-medium">₹{totalCosts.toLocaleString('en-IN')}</span></div>
                    )}
                    <Separator />
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        const cost = (trip as any).actualCost ?? (trip as any).estimatedCost ?? trip.fare ?? 0;
                        const q = new URLSearchParams({
                          tripId,
                          amount: String(cost),
                          description: `Fleet Trip: ${trip.startLocation} → ${trip.endLocation}`,
                        });
                        router.push(`/invoices/new?${q.toString()}`);
                      }}
                    >
                      <FileText className="h-4 w-4 mr-1.5" />
                      Create Invoice from Trip
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <Dialog open={showAddCostDialog} onOpenChange={setShowAddCostDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Cost Entry</DialogTitle></DialogHeader>
          <form onSubmit={handleAddCost} className="space-y-4">
            <div className="space-y-2">
              <Label>Cost Type <span className="text-destructive">*</span></Label>
              <Select value={costForm.costType} onValueChange={(v) => setCostForm(p => ({ ...p, costType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(COST_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="costAmount">Amount (₹) <span className="text-destructive">*</span></Label>
              <Input id="costAmount" type="number" min={0} step="0.01" placeholder="0" value={costForm.amount} onChange={(e) => setCostForm(p => ({ ...p, amount: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="costNotes">Notes</Label>
              <Input id="costNotes" placeholder="Optional notes..." value={costForm.notes} onChange={(e) => setCostForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddCostDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isAddingCost}>
                {isAddingCost && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Add Cost
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
