'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle, Calendar, CheckCircle2, Download, FileText, Gauge, MapPin,
  Pencil, Plus, Power, Shield, Wrench,
} from 'lucide-react';
import { DetailPage } from '@/components/domain';
import {
  Button, Tag, SectionCard, Stat, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Label, Input, Textarea, EmptyState, Skeleton, useConfirm,
} from '@/components/ui';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { fleetApi, type VehicleDocument, type VehicleMaintenance } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { VEHICLE_STATUS_LABELS, TRIP_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '@travelcrm/shared';
import type { TimelineItem } from '@/components/ui/timeline';

const DOC_TYPE_LABELS: Record<string, string> = {
  rc: 'RC Book', insurance: 'Insurance', permit: 'Permit', pollution: 'Pollution (PUC)',
};

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'inactive') return 'danger';
  if (status === 'on_trip') return 'info';
  if (status === 'maintenance') return 'warning';
  return 'neutral';
}

function ExpiryTag({ expiryDate }: { expiryDate: string }) {
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
  const tone = days < 0 ? 'danger' : days < 30 ? 'warning' : 'success';
  return (
    <Tag tone={tone}>
      {days < 0 ? <AlertTriangle className="size-3" aria-hidden="true" /> : <Shield className="size-3" aria-hidden="true" />}
      {new Date(expiryDate).toLocaleDateString('en-IN')} {days < 0 ? `(${Math.abs(days)}d overdue)` : days < 30 ? `(${days}d left)` : ''}
    </Tag>
  );
}

export default function VehicleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const vehicleId = params.id as string;
  const { confirm, dialog } = useConfirm();
  const [showMaintenanceDialog, setShowMaintenanceDialog] = React.useState(false);
  const [maintenanceForm, setMaintenanceForm] = React.useState({
    serviceType: '', serviceDate: '', cost: '', vendor: '', notes: '', nextServiceDate: '',
  });

  const vehicleQuery = useApiQuery(() => fleetApi.vehicles.getById(vehicleId).then((res) => res.data), [vehicleId]);
  const tripsQuery = useApiQuery(() => fleetApi.vehicles.getTrips(vehicleId, { limit: 50 }).then((res) => res.data), [vehicleId]);
  const docsQuery = useApiQuery(() => fleetApi.vehicles.listDocuments(vehicleId).then((res) => res.data), [vehicleId]);
  const maintenanceQuery = useApiQuery(() => fleetApi.vehicles.getMaintenanceHistory(vehicleId).then((res) => res.data), [vehicleId]);

  const { mutate: updateStatus, loading: isUpdatingStatus } = useApiMutation<{ status: string }, any>(
    (data) => fleetApi.vehicles.updateStatus(vehicleId, data.status),
  );
  const { mutate: recordMaintenance, loading: isRecordingMaintenance } = useApiMutation<any, any>(
    (data: any) => fleetApi.vehicles.recordMaintenance(vehicleId, data),
  );

  React.useEffect(() => {
    if (vehicleQuery.error) toast.error('Failed to load vehicle details');
  }, [vehicleQuery.error]);

  const vehicle = vehicleQuery.data as any;
  const vehicleTrips: any[] = Array.isArray(tripsQuery.data) ? tripsQuery.data as any[] : ((tripsQuery.data as any)?.data ?? []);
  const docs: VehicleDocument[] = Array.isArray(docsQuery.data) ? docsQuery.data as VehicleDocument[] : [];
  const maintenanceHistory: VehicleMaintenance[] = Array.isArray(maintenanceQuery.data) ? maintenanceQuery.data as VehicleMaintenance[] : [];

  async function handleToggleActive() {
    const newStatus = vehicle?.status === 'inactive' ? 'active' : 'inactive';
    const ok = await confirm({
      title: newStatus === 'inactive' ? 'Deactivate vehicle' : 'Activate vehicle',
      description: newStatus === 'inactive'
        ? 'Mark as inactive. No longer available for new trip assignments.'
        : 'Mark as active and available for trips.',
      confirmLabel: newStatus === 'inactive' ? 'Deactivate' : 'Activate',
      tone: newStatus === 'inactive' ? 'destructive' : 'default',
    });
    if (!ok) return;
    const result = await updateStatus({ status: newStatus });
    if (result) {
      toast.success(`Vehicle ${newStatus === 'inactive' ? 'deactivated' : 'activated'}`);
      vehicleQuery.refetch();
    } else {
      toast.error('Failed to update vehicle status');
    }
  }

  async function handleRecordMaintenance(e: React.FormEvent) {
    e.preventDefault();
    const result = await recordMaintenance({
      serviceType: maintenanceForm.serviceType,
      serviceDate: maintenanceForm.serviceDate,
      cost: maintenanceForm.cost ? parseFloat(maintenanceForm.cost) : undefined,
      vendor: maintenanceForm.vendor || undefined,
      notes: maintenanceForm.notes || undefined,
      nextServiceDate: maintenanceForm.nextServiceDate || undefined,
    });
    if (result) {
      toast.success('Maintenance record added');
      maintenanceQuery.refetch();
      setShowMaintenanceDialog(false);
      setMaintenanceForm({ serviceType: '', serviceDate: '', cost: '', vendor: '', notes: '', nextServiceDate: '' });
    } else {
      toast.error('Failed to record maintenance');
    }
  }

  if (vehicleQuery.loading) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <EmptyState
        title="Vehicle not found"
        description="This vehicle may have been removed."
        action={<Button variant="outline" onClick={() => router.push('/fleet/vehicles')}>Back to vehicles</Button>}
      />
    );
  }

  const isInactive = vehicle.status === 'inactive';
  const totalRevenue = vehicleTrips.reduce((sum: number, t: any) => sum + (t.fare ?? 0), 0);

  const activity: TimelineItem[] = maintenanceHistory.map((record) => ({
    id: record.id,
    title: record.serviceType,
    description: [record.vendor, record.notes].filter(Boolean).join(' · ') || undefined,
    timestamp: record.serviceDate,
  }));

  return (
    <>
      {dialog}
      <DetailPage
        entity={vehicle}
        title={`${vehicle.make} ${vehicle.model}`}
        subtitle={`${vehicle.registrationNumber} · ${VEHICLE_TYPE_LABELS[vehicle.type as keyof typeof VEHICLE_TYPE_LABELS] || vehicle.type || '—'}`}
        status={<Tag tone={statusTone(vehicle.status)}>{VEHICLE_STATUS_LABELS[vehicle.status as keyof typeof VEHICLE_STATUS_LABELS] || vehicle.status}</Tag>}
        onBack={() => router.push('/fleet/vehicles')}
        primaryActions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/fleet/vehicles/${vehicleId}/edit`}><Pencil aria-hidden="true" />Edit</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={isInactive ? 'text-ds-success' : 'text-ds-danger'}
              onClick={() => void handleToggleActive()}
              disabled={isUpdatingStatus}
            >
              <Power aria-hidden="true" />
              {isInactive ? 'Activate' : 'Deactivate'}
            </Button>
          </>
        }
        activity={activity}
        activityLoading={maintenanceQuery.loading}
        related={[
          {
            title: `Trip history (${vehicleTrips.length})`,
            content: tripsQuery.loading ? (
              <Skeleton className="h-24 w-full" />
            ) : vehicleTrips.length === 0 ? (
              <EmptyState title="No trips yet" description="No trips assigned to this vehicle yet." icon={<MapPin aria-hidden="true" />} />
            ) : (
              <div className="flex flex-col gap-ds-2">
                {vehicleTrips.map((trip: any) => {
                  return (
                    <Link key={trip.id} href={`/fleet/trips/${trip.id}`}>
                      <div className="flex items-center gap-ds-4 p-ds-3 rounded-ds-md border border-ds-border hover:bg-ds-surface-sunken transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-ds-2">
                            <p className="text-sm font-medium">Trip #{trip.id.slice(0, 8)}</p>
                            <Tag>{TRIP_STATUS_LABELS[trip.status as keyof typeof TRIP_STATUS_LABELS] || trip.status}</Tag>
                          </div>
                          <p className="text-xs text-ds-foreground-muted truncate">{trip.startLocation} → {trip.endLocation}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium">₹{(trip.fare ?? 0).toLocaleString('en-IN')}</p>
                          <p className="text-xs text-ds-foreground-muted flex items-center gap-ds-1 justify-end">
                            <Calendar className="size-3" aria-hidden="true" />{(trip.startTime || '').split('T')[0] || '—'}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ),
          },
          {
            title: `Maintenance history (${maintenanceHistory.length})`,
            action: (
              <Button size="sm" onClick={() => setShowMaintenanceDialog(true)}>
                <Plus aria-hidden="true" />Add record
              </Button>
            ),
            content: maintenanceQuery.loading ? (
              <Skeleton className="h-24 w-full" />
            ) : maintenanceHistory.length === 0 ? (
              <EmptyState title="No maintenance records yet" icon={<Wrench aria-hidden="true" />} />
            ) : (
              <div className="flex flex-col gap-ds-2">
                {maintenanceHistory.map((record) => (
                  <div key={record.id} className="flex items-start gap-ds-4 p-ds-3 rounded-ds-md border border-ds-border hover:bg-ds-surface-sunken">
                    <Wrench className="size-4 text-ds-foreground-muted shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-ds-2 mb-1">
                        <p className="text-sm font-medium">{record.serviceType}</p>
                        <span className="text-xs text-ds-foreground-muted flex items-center gap-ds-1">
                          <Calendar className="size-3" aria-hidden="true" />{record.serviceDate}
                        </span>
                      </div>
                      {record.vendor && <p className="text-xs text-ds-foreground-muted">Vendor: {record.vendor}</p>}
                      {record.odometer != null && (
                        <p className="text-xs text-ds-foreground-muted flex items-center gap-ds-1">
                          <Gauge className="size-3" aria-hidden="true" />{record.odometer.toLocaleString()} km
                        </p>
                      )}
                      {record.notes && <p className="text-xs text-ds-foreground-muted mt-1">{record.notes}</p>}
                      {record.nextServiceDate && <p className="text-xs text-ds-info mt-1">Next service: {record.nextServiceDate}</p>}
                    </div>
                    {record.cost != null && <p className="text-sm font-semibold shrink-0">₹{record.cost.toLocaleString('en-IN')}</p>}
                  </div>
                ))}
              </div>
            ),
          },
        ]}
        documents={
          docsQuery.loading ? (
            <Skeleton className="h-24 w-full" />
          ) : docs.length === 0 ? (
            <EmptyState title="No documents uploaded yet" icon={<FileText aria-hidden="true" />} />
          ) : (
            <div className="flex flex-col gap-ds-3">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-ds-4 p-ds-4 rounded-ds-md border border-ds-border hover:bg-ds-surface-sunken">
                  <FileText className="size-8 text-ds-info shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{DOC_TYPE_LABELS[doc.type] || doc.type}</p>
                    {doc.expiryDate && <div className="mt-1"><ExpiryTag expiryDate={doc.expiryDate} /></div>}
                  </div>
                  {doc.documentUrl && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Download"
                      onClick={async () => {
                        try {
                          const res = await fleetApi.vehicles.downloadDocument(vehicleId, doc.id);
                          const url = (res as any).data?.url;
                          if (url) window.open(url, '_blank');
                        } catch {
                          toast.error('Failed to download');
                        }
                      }}
                    >
                      <Download />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )
        }
        overview={
          <div className="flex flex-col gap-ds-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-ds-4">
              <Stat label="Total trips" value={vehicleTrips.length} />
              <Stat label="Total revenue" value={`₹${totalRevenue.toLocaleString('en-IN')}`} />
              <Stat label="Odometer" value={`${(vehicle.odometerKm ?? vehicle.mileage)?.toLocaleString() ?? 0} km`} icon={<Gauge aria-hidden="true" />} />
            </div>

            <SectionCard title="Vehicle information">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-ds-4">
                <div className="flex justify-between"><span className="text-sm text-ds-foreground-muted">Registration</span><span className="text-sm font-medium font-mono">{vehicle.registrationNumber}</span></div>
                <div className="flex justify-between"><span className="text-sm text-ds-foreground-muted">Make &amp; model</span><span className="text-sm font-medium">{vehicle.make} {vehicle.model}</span></div>
                <div className="flex justify-between"><span className="text-sm text-ds-foreground-muted">Year</span><span className="text-sm font-medium">{vehicle.year}</span></div>
                <div className="flex justify-between"><span className="text-sm text-ds-foreground-muted">Color</span><span className="text-sm font-medium">{vehicle.color || '—'}</span></div>
                <div className="flex justify-between"><span className="text-sm text-ds-foreground-muted">Capacity</span><span className="text-sm font-medium">{vehicle.seatingCapacity ?? vehicle.capacity} seats</span></div>
                {vehicle.nextServiceDate && (
                  <div className="flex justify-between"><span className="text-sm text-ds-foreground-muted">Next service</span><span className="text-sm font-medium">{vehicle.nextServiceDate}</span></div>
                )}
              </div>
            </SectionCard>

            {(vehicle.insuranceExpiry || vehicle.permitExpiry || vehicle.pollutionExpiry || vehicle.rcExpiry) && (
              <SectionCard title="Document expiry">
                <div className="flex flex-wrap gap-ds-2">
                  {vehicle.rcExpiry && <ExpiryTag expiryDate={vehicle.rcExpiry} />}
                  {vehicle.insuranceExpiry && <ExpiryTag expiryDate={vehicle.insuranceExpiry} />}
                  {vehicle.permitExpiry && <ExpiryTag expiryDate={vehicle.permitExpiry} />}
                  {vehicle.pollutionExpiry && <ExpiryTag expiryDate={vehicle.pollutionExpiry} />}
                </div>
              </SectionCard>
            )}
          </div>
        }
      />

      <Dialog open={showMaintenanceDialog} onOpenChange={setShowMaintenanceDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add service record</DialogTitle></DialogHeader>
          <form onSubmit={handleRecordMaintenance} className="flex flex-col gap-ds-4">
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="serviceType">Service type <span className="text-ds-danger">*</span></Label>
              <Input id="serviceType" placeholder="e.g., Oil Change" value={maintenanceForm.serviceType} onChange={(e) => setMaintenanceForm((p) => ({ ...p, serviceType: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-ds-4">
              <div className="flex flex-col gap-ds-2">
                <Label htmlFor="serviceDate">Service date <span className="text-ds-danger">*</span></Label>
                <Input id="serviceDate" type="date" value={maintenanceForm.serviceDate} onChange={(e) => setMaintenanceForm((p) => ({ ...p, serviceDate: e.target.value }))} required />
              </div>
              <div className="flex flex-col gap-ds-2">
                <Label htmlFor="maintenanceCost">Cost (₹)</Label>
                <Input id="maintenanceCost" type="number" min={0} placeholder="0" value={maintenanceForm.cost} onChange={(e) => setMaintenanceForm((p) => ({ ...p, cost: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="vendor">Vendor</Label>
              <Input id="vendor" placeholder="e.g., Toyota Service Center" value={maintenanceForm.vendor} onChange={(e) => setMaintenanceForm((p) => ({ ...p, vendor: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="nextServiceDate">Next service date</Label>
              <Input id="nextServiceDate" type="date" value={maintenanceForm.nextServiceDate} onChange={(e) => setMaintenanceForm((p) => ({ ...p, nextServiceDate: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="maintenanceNotes">Notes</Label>
              <Textarea id="maintenanceNotes" placeholder="Additional notes..." value={maintenanceForm.notes} onChange={(e) => setMaintenanceForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowMaintenanceDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isRecordingMaintenance}>Save record</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
