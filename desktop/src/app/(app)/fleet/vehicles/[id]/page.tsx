'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle, Calendar, Download, FileText, Gauge, MapPin,
  Pencil, Plus, Power, Shield, Trash2, Upload, Wrench,
} from 'lucide-react';
import { DetailPage } from '@/components/domain';
import {
  Button, Tag, SectionCard, Stat, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Label, Input, DatePicker, Textarea, EmptyState, Skeleton, useConfirm,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import {
  fleetApi,
  type RecordMaintenanceRequest, type Trip, type Vehicle, type VehicleDocument, type VehicleMaintenance,
} from '@/lib/api/fleet';
import { toast } from 'sonner';
import { VEHICLE_STATUS_LABELS, TRIP_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '@travelcrm/shared';
import type { TimelineItem } from '@/components/ui/timeline';
import { parseLocalDate, toLocalDateString } from '@/lib/dates';

const DOC_TYPE_LABELS: Record<string, string> = {
  rc: 'RC Book', insurance: 'Insurance', permit: 'Permit', pollution: 'Pollution (PUC)',
};

const MAINTENANCE_TYPE_LABELS: Record<RecordMaintenanceRequest['serviceType'], string> = {
  regular_service: 'Regular service',
  oil_change: 'Oil change',
  tyre_replacement: 'Tyre replacement',
  brake_service: 'Brake service',
  ac_service: 'AC service',
  other: 'Other',
};

const EMPTY_MAINTENANCE_FORM = {
  serviceType: 'regular_service' as RecordMaintenanceRequest['serviceType'],
  serviceDate: '', cost: '', vendorName: '', odometerAtService: '', nextServiceDueDate: '', notes: '',
};

const EMPTY_DOC_FORM = { type: 'rc', documentNumber: '', issuedDate: '', expiryDate: '', file: null as File | null };

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'available') return 'success';
  if (status === 'out_of_service') return 'danger';
  if (status === 'on_trip') return 'info';
  if (status === 'under_maintenance') return 'warning';
  return 'neutral';
}

function ExpiryTag({ expiryDate }: { expiryDate: string }) {
  const [now] = React.useState(() => Date.now());
  const days = Math.ceil((new Date(expiryDate).getTime() - now) / 86400000);
  const tone = days < 0 ? 'danger' : days < 30 ? 'warning' : 'success';
  return (
    <Tag tone={tone}>
      {days < 0 ? <AlertTriangle className="size-3" aria-hidden="true" /> : <Shield className="size-3" aria-hidden="true" />}
      {expiryDate} {days < 0 ? `(${Math.abs(days)}d overdue)` : days < 30 ? `(${days}d left)` : ''}
    </Tag>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-ds-4">
      <span className="text-sm text-ds-foreground-muted">{label}</span>
      <span className="text-sm font-medium text-right">{children}</span>
    </div>
  );
}

export default function VehicleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const vehicleId = params.id as string;
  const { confirm, dialog } = useConfirm();
  const [showMaintenanceDialog, setShowMaintenanceDialog] = React.useState(false);
  const [maintenanceForm, setMaintenanceForm] = React.useState(EMPTY_MAINTENANCE_FORM);
  const [showOdometerDialog, setShowOdometerDialog] = React.useState(false);
  const [odometerInput, setOdometerInput] = React.useState('');
  const [showDocDialog, setShowDocDialog] = React.useState(false);
  const [docForm, setDocForm] = React.useState(EMPTY_DOC_FORM);
  const [uploadingDoc, setUploadingDoc] = React.useState(false);
  const [savingOdometer, setSavingOdometer] = React.useState(false);

  const vehicleQuery = useApiQuery(() => fleetApi.vehicles.getById(vehicleId).then((res) => res.data), [vehicleId]);
  const tripsQuery = useApiQuery(() => fleetApi.vehicles.getTrips(vehicleId, { limit: 50 }).then((res) => res.data), [vehicleId]);
  const docsQuery = useApiQuery(() => fleetApi.vehicles.listDocuments(vehicleId).then((res) => res.data), [vehicleId]);
  const maintenanceQuery = useApiQuery(() => fleetApi.vehicles.getMaintenanceHistory(vehicleId).then((res) => res.data), [vehicleId]);

  const { mutate: updateStatus, loading: isUpdatingStatus } = useApiMutation<{ status: string }, unknown>(
    (data) => fleetApi.vehicles.updateStatus(vehicleId, data.status),
  );
  const { mutate: recordMaintenance, loading: isRecordingMaintenance } = useApiMutation<RecordMaintenanceRequest, unknown>(
    (data) => fleetApi.vehicles.recordMaintenance(vehicleId, data),
  );

  React.useEffect(() => {
    if (vehicleQuery.error) toast.error('Failed to load vehicle details');
  }, [vehicleQuery.error]);

  // useApiQuery nulls `data` while refetching; keep the last vehicle so tabs and dialogs stay mounted.
  const lastVehicle = React.useRef<Vehicle | null>(null);
  if (vehicleQuery.data) lastVehicle.current = vehicleQuery.data;
  const vehicle = (vehicleQuery.data ?? (vehicleQuery.error ? null : lastVehicle.current));
  const tripsPayload = tripsQuery.data as Trip[] | { data?: Trip[] } | null;
  const vehicleTrips: Trip[] = Array.isArray(tripsPayload) ? tripsPayload : (tripsPayload?.data ?? []);
  const docs: VehicleDocument[] = Array.isArray(docsQuery.data) ? docsQuery.data as VehicleDocument[] : [];
  const maintenanceHistory: VehicleMaintenance[] = Array.isArray(maintenanceQuery.data) ? maintenanceQuery.data as VehicleMaintenance[] : [];

  async function handleToggleActive() {
    const newStatus = vehicle?.status === 'out_of_service' ? 'available' : 'out_of_service';
    const ok = await confirm({
      title: newStatus === 'out_of_service' ? 'Deactivate vehicle' : 'Activate vehicle',
      description: newStatus === 'out_of_service'
        ? 'Mark as out of service. No longer available for new trip assignments.'
        : 'Mark as available for trips.',
      confirmLabel: newStatus === 'out_of_service' ? 'Deactivate' : 'Activate',
      tone: newStatus === 'out_of_service' ? 'destructive' : 'default',
    });
    if (!ok) return;
    const result = await updateStatus({ status: newStatus });
    if (result) {
      toast.success(`Vehicle ${newStatus === 'out_of_service' ? 'deactivated' : 'activated'}`);
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
      vendorName: maintenanceForm.vendorName || undefined,
      odometerAtService: maintenanceForm.odometerAtService ? Math.round(Number(maintenanceForm.odometerAtService)) : undefined,
      notes: maintenanceForm.notes || undefined,
      nextServiceDueDate: maintenanceForm.nextServiceDueDate || undefined,
    });
    if (result) {
      toast.success('Maintenance record added');
      maintenanceQuery.refetch();
      vehicleQuery.refetch();
      setShowMaintenanceDialog(false);
      setMaintenanceForm(EMPTY_MAINTENANCE_FORM);
    } else {
      toast.error('Failed to record maintenance');
    }
  }

  async function handleSaveOdometer(e: React.FormEvent) {
    e.preventDefault();
    const km = Math.round(Number(odometerInput));
    if (!km || km < 0) {
      toast.error('Enter a valid odometer reading');
      return;
    }
    setSavingOdometer(true);
    try {
      await fleetApi.vehicles.updateOdometer(vehicleId, km);
      toast.success('Odometer updated');
      vehicleQuery.refetch();
      setShowOdometerDialog(false);
    } catch {
      toast.error('Failed to update odometer');
    } finally {
      setSavingOdometer(false);
    }
  }

  async function handleUploadDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!docForm.file) {
      toast.error('Choose a file to upload');
      return;
    }
    const fd = new FormData();
    fd.append('file', docForm.file);
    fd.append('type', docForm.type);
    if (docForm.documentNumber) fd.append('documentNumber', docForm.documentNumber);
    if (docForm.issuedDate) fd.append('issuedDate', docForm.issuedDate);
    if (docForm.expiryDate) fd.append('expiryDate', docForm.expiryDate);
    setUploadingDoc(true);
    try {
      await fleetApi.vehicles.uploadDocument(vehicleId, fd);
      toast.success('Document uploaded');
      docsQuery.refetch();
      setShowDocDialog(false);
      setDocForm(EMPTY_DOC_FORM);
    } catch {
      toast.error('Failed to upload document');
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleDownloadDocument(doc: VehicleDocument) {
    try {
      const res = await fleetApi.vehicles.downloadDocument(vehicleId, doc.id);
      const key = res.data?.downloadUrl;
      if (!key) throw new Error('missing key');
      const blob = await client.get<Blob>(API_ENDPOINTS.files.get(key), { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.data?.fileName || doc.fileName || `${doc.type}-document`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download');
    }
  }

  async function handleDeleteDocument(doc: VehicleDocument) {
    const ok = await confirm({
      title: 'Delete document',
      description: `Remove the ${DOC_TYPE_LABELS[doc.type] || doc.type} document? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await fleetApi.vehicles.deleteDocument(vehicleId, doc.id);
      toast.success('Document deleted');
      docsQuery.refetch();
    } catch {
      toast.error('Failed to delete document');
    }
  }

  if (vehicleQuery.loading && !vehicle) {
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

  const isInactive = vehicle.status === 'out_of_service';
  const totalRevenue = vehicleTrips.reduce((sum: number, t: Trip) => sum + (t.fare ?? 0), 0);
  const odometer = vehicle.odometerKm ?? vehicle.mileage ?? 0;
  const typeLabel = VEHICLE_TYPE_LABELS[vehicle.type as keyof typeof VEHICLE_TYPE_LABELS] || vehicle.type || '—';
  const dueDocs = docs.filter((d) => d.expiryDate);

  const activity: TimelineItem[] = maintenanceHistory.map((record) => ({
    id: record.id,
    title: MAINTENANCE_TYPE_LABELS[record.serviceType as keyof typeof MAINTENANCE_TYPE_LABELS] || record.serviceType,
    description: [record.vendor, record.notes].filter(Boolean).join(' · ') || undefined,
    timestamp: record.serviceDate,
  }));

  return (
    <>
      {dialog}
      <DetailPage
        entity={vehicle}
        title={[vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.registrationNumber}
        subtitle={`${vehicle.registrationNumber} · ${typeLabel}`}
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
              onClick={() => { setOdometerInput(String(odometer || '')); setShowOdometerDialog(true); }}
            >
              <Gauge aria-hidden="true" />Update odometer
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
                {vehicleTrips.map((trip: Trip) => {
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
                        <p className="text-sm font-medium">{MAINTENANCE_TYPE_LABELS[record.serviceType as keyof typeof MAINTENANCE_TYPE_LABELS] || record.serviceType}</p>
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
          <div className="flex flex-col gap-ds-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowDocDialog(true)}>
                <Upload aria-hidden="true" />Upload document
              </Button>
            </div>
            {docsQuery.loading ? (
              <Skeleton className="h-24 w-full" />
            ) : docs.length === 0 ? (
              <EmptyState title="No documents uploaded yet" icon={<FileText aria-hidden="true" />} />
            ) : (
              docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-ds-4 p-ds-4 rounded-ds-md border border-ds-border hover:bg-ds-surface-sunken">
                  <FileText className="size-8 text-ds-info shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{DOC_TYPE_LABELS[doc.type] || doc.type}</p>
                    {doc.documentNumber && <p className="text-xs text-ds-foreground-muted">No. {doc.documentNumber}</p>}
                    {doc.fileName && <p className="text-xs text-ds-foreground-muted truncate">{doc.fileName}</p>}
                    {doc.issuedDate && <p className="text-xs text-ds-foreground-muted">Issued {doc.issuedDate}</p>}
                    {doc.expiryDate && <div className="mt-1"><ExpiryTag expiryDate={doc.expiryDate} /></div>}
                  </div>
                  {doc.fileUrl && (
                    <Button variant="ghost" size="icon-sm" aria-label="Download" onClick={() => void handleDownloadDocument(doc)}>
                      <Download />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" aria-label="Delete document" onClick={() => void handleDeleteDocument(doc)}>
                    <Trash2 />
                  </Button>
                </div>
              ))
            )}
          </div>
        }
        overview={
          <div className="flex flex-col gap-ds-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-ds-4">
              <Stat label="Total trips" value={vehicleTrips.length} />
              <Stat label="Total revenue" value={`₹${totalRevenue.toLocaleString('en-IN')}`} />
              <Stat label="Odometer" value={`${odometer.toLocaleString()} km`} icon={<Gauge aria-hidden="true" />} />
            </div>

            <SectionCard title="Vehicle information">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-ds-4">
                <InfoRow label="Registration"><span className="font-mono">{vehicle.registrationNumber}</span></InfoRow>
                <InfoRow label="Type">{typeLabel}</InfoRow>
                <InfoRow label="Make">{vehicle.make || '—'}</InfoRow>
                <InfoRow label="Model">{vehicle.model || '—'}</InfoRow>
                <InfoRow label="Year">{vehicle.year ?? '—'}</InfoRow>
                <InfoRow label="Color">{vehicle.color || '—'}</InfoRow>
                <InfoRow label="Capacity">{vehicle.seatingCapacity ?? vehicle.capacity ?? 0} seats</InfoRow>
                <InfoRow label="Last service">{vehicle.lastServiceDate || '—'}</InfoRow>
                <InfoRow label="Next service">{vehicle.nextServiceDue || '—'}</InfoRow>
                <InfoRow label="Notes">{vehicle.notes || '—'}</InfoRow>
              </div>
            </SectionCard>

            {dueDocs.length > 0 && (
              <SectionCard title="Document expiry">
                <div className="flex flex-col gap-ds-2">
                  {dueDocs.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-ds-4">
                      <span className="text-sm text-ds-foreground-muted">{DOC_TYPE_LABELS[d.type] || d.type}</span>
                      <ExpiryTag expiryDate={d.expiryDate as string} />
                    </div>
                  ))}
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
              <Select
                value={maintenanceForm.serviceType}
                onValueChange={(v) => setMaintenanceForm((p) => ({ ...p, serviceType: v as RecordMaintenanceRequest['serviceType'] }))}
              >
                <SelectTrigger id="serviceType"><SelectValue placeholder="Select service type" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MAINTENANCE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-ds-4">
              <div className="flex flex-col gap-ds-2">
                <Label htmlFor="serviceDate">Service date <span className="text-ds-danger">*</span></Label>
                <DatePicker id="serviceDate" value={maintenanceForm.serviceDate ? parseLocalDate(maintenanceForm.serviceDate) : undefined} onChange={(d) => setMaintenanceForm((p) => ({ ...p, serviceDate: d ? toLocalDateString(d) : '' }))} />
              </div>
              <div className="flex flex-col gap-ds-2">
                <Label htmlFor="maintenanceCost">Cost (₹)</Label>
                <Input id="maintenanceCost" type="number" min={0} placeholder="0" value={maintenanceForm.cost} onChange={(e) => setMaintenanceForm((p) => ({ ...p, cost: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-ds-4">
              <div className="flex flex-col gap-ds-2">
                <Label htmlFor="vendor">Vendor</Label>
                <Input id="vendor" placeholder="e.g., Toyota Service Center" value={maintenanceForm.vendorName} onChange={(e) => setMaintenanceForm((p) => ({ ...p, vendorName: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-ds-2">
                <Label htmlFor="odometerAtService">Odometer at service (km)</Label>
                <Input id="odometerAtService" type="number" min={0} value={maintenanceForm.odometerAtService} onChange={(e) => setMaintenanceForm((p) => ({ ...p, odometerAtService: e.target.value }))} />
              </div>
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="nextServiceDate">Next service date</Label>
              <DatePicker id="nextServiceDate" value={maintenanceForm.nextServiceDueDate ? parseLocalDate(maintenanceForm.nextServiceDueDate) : undefined} onChange={(d) => setMaintenanceForm((p) => ({ ...p, nextServiceDueDate: d ? toLocalDateString(d) : '' }))} />
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

      <Dialog open={showOdometerDialog} onOpenChange={setShowOdometerDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update odometer</DialogTitle></DialogHeader>
          <form onSubmit={handleSaveOdometer} className="flex flex-col gap-ds-4">
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="odometerReading">Odometer reading (km)</Label>
              <Input id="odometerReading" type="number" min={1} value={odometerInput} onChange={(e) => setOdometerInput(e.target.value)} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowOdometerDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={savingOdometer}>Save odometer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDocDialog} onOpenChange={setShowDocDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload document</DialogTitle></DialogHeader>
          <form onSubmit={handleUploadDocument} className="flex flex-col gap-ds-4">
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="docType">Document type <span className="text-ds-danger">*</span></Label>
              <Select value={docForm.type} onValueChange={(v) => setDocForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger id="docType"><SelectValue placeholder="Select document type" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="docFile">File <span className="text-ds-danger">*</span></Label>
              <Input
                id="docFile"
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setDocForm((p) => ({ ...p, file: e.target.files?.[0] ?? null }))}
              />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="docNumber">Document number</Label>
              <Input id="docNumber" value={docForm.documentNumber} onChange={(e) => setDocForm((p) => ({ ...p, documentNumber: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-ds-4">
              <div className="flex flex-col gap-ds-2">
                <Label htmlFor="docIssued">Issued date</Label>
                <DatePicker id="docIssued" value={docForm.issuedDate ? parseLocalDate(docForm.issuedDate) : undefined} onChange={(d) => setDocForm((p) => ({ ...p, issuedDate: d ? toLocalDateString(d) : '' }))} />
              </div>
              <div className="flex flex-col gap-ds-2">
                <Label htmlFor="docExpiry">Expiry date</Label>
                <DatePicker id="docExpiry" value={docForm.expiryDate ? parseLocalDate(docForm.expiryDate) : undefined} onChange={(d) => setDocForm((p) => ({ ...p, expiryDate: d ? toLocalDateString(d) : '' }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDocDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={uploadingDoc}>Upload</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
