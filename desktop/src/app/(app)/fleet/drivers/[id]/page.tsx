'use client';


import { formatTightCurrency, formatLocaleDate } from '@/lib/format';
import { formatCurrency } from '@/lib/utils';
import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, AlertTriangle, Download, FileText, MapPin, Pencil, Power, Star, Upload,
} from 'lucide-react';
import { DetailPage } from '@/components/domain';
import {
  Button, Tag, SectionCard, Stat, Avatar, AvatarFallback,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  FileDropzone, EmptyState, Skeleton,
} from '@/components/ui';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { fleetApi, type Driver, type DriverDocument, type Trip } from '@/lib/api/fleet';
import { formatTripWhen, formatTripWhenShort } from '@/components/domain/fleet/trip-format';
import { toast } from 'sonner';
import { DRIVER_STATUS_LABELS, TRIP_STATUS_LABELS } from '@travelcrm/shared';
import { DriverScheduleCalendar } from '@/components/domain/fleet/driver-schedule-calendar';
import type { TimelineItem } from '@/components/ui/timeline';

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'on_trip') return 'info';
  if (status === 'on_leave') return 'warning';
  return 'neutral'; // off_duty
}

function licenseTone(licenseExpiry?: string): { tone: 'success' | 'danger' | 'warning' | 'neutral'; label: string } {
  if (!licenseExpiry) return { tone: 'neutral', label: 'No license date' };
  const days = Math.ceil((new Date(licenseExpiry).getTime() - Date.now()) / 86400000);
  if (days < 0) return { tone: 'danger', label: `Expired ${Math.abs(days)}d ago` };
  if (days < 30) return { tone: 'warning', label: `Expires in ${days}d` };
  return { tone: 'success', label: `Valid — ${formatLocaleDate(licenseExpiry)}` };
}

const DRIVER_DOC_TYPE_LABELS: Record<string, string> = {
  license: 'Driver License', id_proof: 'ID Proof', police_verification: 'Police Verification',
};

export default function DriverDetailPage() {
  const router = useRouter();
  const params = useParams();
  const driverId = params.id as string;

  const [showDeactivateDialog, setShowDeactivateDialog] = React.useState(false);
  const [showRateDialog, setShowRateDialog] = React.useState(false);
  const [showUploadDialog, setShowUploadDialog] = React.useState(false);
  const [ratingValue, setRatingValue] = React.useState('5');
  const [ratingTripId, setRatingTripId] = React.useState('');
  const [uploadType, setUploadType] = React.useState<'license' | 'id_proof' | 'police_verification'>('license');
  const [uploadFiles, setUploadFiles] = React.useState<File[]>([]);

  const driverQuery = useApiQuery(() => fleetApi.drivers.getById(driverId), [driverId]);
  const tripsQuery = useApiQuery(() => fleetApi.drivers.getTrips(driverId, { limit: 50 }), [driverId]);
  const docsQuery = useApiQuery(() => fleetApi.drivers.listDocuments(driverId), [driverId]);

  const { mutate: updateStatus, loading: isUpdatingStatus } = useApiMutation<{ status: string }, unknown>(
    (data) => fleetApi.drivers.updateStatus(driverId, data.status),
  );
  const { mutate: rateDriver, loading: isRating } = useApiMutation<{ rating: number; tripId: string }, unknown>(
    (data) => fleetApi.drivers.rate(driverId, data),
  );
  const { mutate: uploadDoc, loading: isUploading } = useApiMutation<FormData, unknown>(
    (fd) => fleetApi.drivers.uploadDocument(driverId, fd),
  );

  React.useEffect(() => {
    if (driverQuery.error) toast.error('Failed to load driver details');
  }, [driverQuery.error]);

  const driver = driverQuery.data?.data as Driver | undefined;
  const tripsData = tripsQuery.data?.data as Trip[] | { data?: Trip[] } | undefined;
  const driverTrips: Trip[] = Array.isArray(tripsData) ? tripsData : (tripsData?.data ?? []);
  const docsData: unknown = docsQuery.data?.data;
  const docs: DriverDocument[] = Array.isArray(docsData) ? (docsData as DriverDocument[]) : [];
  const completedTrips = driverTrips.filter((t: Trip) => t.status === 'completed');
  const totalRevenue = driverTrips.reduce((sum: number, t: Trip) => sum + (t.fare ?? 0), 0);

  async function handleDeactivate() {
    const newStatus = driver?.status === 'off_duty' ? 'active' : 'off_duty';
    const result = await updateStatus({ status: newStatus });
    if (result) {
      toast.success(`Driver ${newStatus === 'off_duty' ? 'deactivated' : 'activated'}`);
      driverQuery.refetch();
      setShowDeactivateDialog(false);
    } else {
      toast.error('Failed to update driver status');
    }
  }

  async function handleRate() {
    if (!ratingTripId) {
      toast.error('Select a completed trip to rate');
      return;
    }
    const result = await rateDriver({ rating: Number(ratingValue), tripId: ratingTripId });
    if (result) {
      toast.success('Driver rated successfully');
      driverQuery.refetch();
      tripsQuery.refetch();
      setShowRateDialog(false);
      setRatingTripId('');
    } else {
      toast.error('Failed to rate driver');
    }
  }

  async function handleUpload() {
    if (uploadFiles.length === 0) return;
    const fd = new FormData();
    fd.append('file', uploadFiles[0] as File);
    fd.append('type', uploadType);
    const result = await uploadDoc(fd);
    if (result) {
      toast.success('Document uploaded');
      docsQuery.refetch();
      setUploadFiles([]);
      setShowUploadDialog(false);
    } else {
      toast.error('Failed to upload document');
    }
  }

  if (driverQuery.loading) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!driver) {
    return (
      <EmptyState
        title="Driver not found"
        description="This driver may have been removed."
        action={<Button variant="outline" onClick={() => router.push('/fleet/drivers')}>Back to drivers</Button>}
      />
    );
  }

  const isInactive = driver.status === 'off_duty';
  const license = licenseTone(driver.licenseExpiry);
  const activity: TimelineItem[] = driverTrips.slice(0, 20).map((t: Trip) => ({
    id: t.id,
    title: `Trip ${TRIP_STATUS_LABELS[t.status as keyof typeof TRIP_STATUS_LABELS] || t.status}`,
    description: `${t.startLocation || ''} → ${t.endLocation || ''}`,
    timestamp: formatTripWhen(t.startTime),
  }));

  return (
    <>
      <DetailPage
        entity={driver}
        title={driver.name}
        subtitle={driver.phone}
        status={<Tag tone={statusTone(driver.status)}>{DRIVER_STATUS_LABELS[driver.status as keyof typeof DRIVER_STATUS_LABELS] || driver.status}</Tag>}
        onBack={() => router.push('/fleet/drivers')}
        messaging={{
          recipientId: driver.id,
          recipientName: driver.name,
          email: driver.email,
          phone: driver.phone,
        }}
        primaryActions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/fleet/drivers/${driverId}/edit`}><Pencil aria-hidden="true" />Edit</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowRateDialog(true)} disabled={completedTrips.length === 0}>
              <Star aria-hidden="true" />Rate
            </Button>
          </>
        }
        actions={[
          {
            label: isInactive ? 'Activate driver' : 'Deactivate driver',
            icon: <Power aria-hidden="true" />,
            onSelect: () => setShowDeactivateDialog(true),
            destructive: !isInactive,
          },
        ]}
        activity={activity}
        activityLoading={tripsQuery.loading}
        related={[
          {
            title: 'Trip history',
            content: driverTrips.length === 0 ? (
              <EmptyState title="No trips yet" description="Trips assigned to this driver will appear here." />
            ) : (
              <div className="flex flex-col gap-ds-2">
                {driverTrips.map((trip: Trip) => (
                  <Link key={trip.id} href={`/fleet/trips/${trip.id}`} className="flex items-center gap-ds-4 p-ds-3 rounded-ds-md border border-ds-border hover:bg-ds-surface-sunken transition-colors">
                    <MapPin className="h-4 w-4 text-ds-foreground-muted shrink-0" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-ds-2">
                        <p className="text-sm font-medium">Trip #{String(trip.id).slice(0, 8)}</p>
                        <Tag tone={trip.status === 'completed' ? 'success' : 'info'}>{TRIP_STATUS_LABELS[trip.status as keyof typeof TRIP_STATUS_LABELS] || trip.status}</Tag>
                      </div>
                      <p className="text-xs text-ds-foreground-muted truncate">{trip.startLocation} → {trip.endLocation}</p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">{formatCurrency(trip.fare ?? 0)}</p>
                  </Link>
                ))}
              </div>
            ),
          },
          {
            title: 'Schedule',
            content: <DriverScheduleCalendar driverId={driverId} />,
          },
        ]}
        documents={
          <div className="flex flex-col gap-ds-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setShowUploadDialog(true)}>
                <Upload aria-hidden="true" />Upload document
              </Button>
            </div>
            {docsQuery.loading ? (
              <Skeleton className="h-24 w-full" />
            ) : docs.length === 0 ? (
              <EmptyState
                title="No documents uploaded yet"
                description="Upload License, ID Proof, or Police Verification documents."
                action={<Button size="sm" onClick={() => setShowUploadDialog(true)}><Upload aria-hidden="true" />Upload document</Button>}
              />
            ) : (
              <div className="flex flex-col gap-ds-2">
                {docs.map((doc) => {
                  const dl = doc.expiryDate ? licenseTone(doc.expiryDate) : null;
                  return (
                    <div key={doc.id} className="flex items-center gap-ds-4 p-ds-3 rounded-ds-md border border-ds-border hover:bg-ds-surface-sunken">
                      <FileText className="h-6 w-6 text-ds-primary shrink-0" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{DRIVER_DOC_TYPE_LABELS[doc.type] || doc.type}</p>
                        {dl && <Tag tone={dl.tone}>{dl.label}</Tag>}
                      </div>
                      {doc.documentUrl && (
                        <Button variant="ghost" size="icon-sm" aria-label="Download" onClick={async () => {
                          try {
                            const res = await fleetApi.drivers.downloadDocument(driverId, doc.id);
                            const url = (res as { data?: { url?: string } }).data?.url;
                            if (url) window.open(url, '_blank');
                          } catch { toast.error('Failed to download'); }
                        }}>
                          <Download />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        }
        overview={
          <div className="flex flex-col gap-ds-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-ds-4">
              <Stat label="Total trips" value={driverTrips.length} icon={<MapPin aria-hidden="true" />} />
              <Stat label="Revenue" value={formatTightCurrency(totalRevenue)} />
              <Stat label="Years experience" value={driver.experience ?? 0} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-ds-4">
              <SectionCard title="Personal information">
                <div className="flex flex-col gap-ds-3">
                  <div className="flex items-center gap-ds-3">
                    <Avatar className="h-10 w-10"><AvatarFallback>{(driver.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar>
                    <div>
                      <p className="text-sm font-medium">{driver.name}</p>
                      <p className="text-xs text-ds-foreground-muted">{driver.phone}</p>
                    </div>
                  </div>
                  {driver.email && <Row label="Email" value={driver.email} />}
                  {driver.address && <Row label="Address" value={driver.address} />}
                  {driver.dateOfBirth && <Row label="Date of birth" value={formatLocaleDate(driver.dateOfBirth)} />}
                  <Row label="Rating" value={<span className="flex items-center gap-ds-1"><Star className="h-3.5 w-3.5 text-ds-warning fill-ds-warning" aria-hidden="true" />{driver.rating ? driver.rating.toFixed(1) : '—'}</span>} />
                  {(driver.emergencyContactName) && <Row label="Emergency contact" value={driver.emergencyContactName} />}
                  {(driver.emergencyContactPhone) && <Row label="Emergency phone" value={driver.emergencyContactPhone} />}
                </div>
              </SectionCard>
              <SectionCard title="License information">
                <div className="flex flex-col gap-ds-3">
                  <Row label="License number" value={driver.licenseNumber || '—'} />
                  <Row label="Expiry" value={<Tag tone={license.tone}>{license.label}</Tag>} />
                  {driver.licenseType && <Row label="License type" value={driver.licenseType} />}
                  {driver.badgeNumber && <Row label="Badge number" value={driver.badgeNumber} />}
                  <Row label="Experience" value={`${driver.experience ?? 0} years`} />
                </div>
              </SectionCard>
            </div>
            {license.tone === 'danger' && (
              <div className="flex items-center gap-ds-2 p-ds-3 rounded-ds-md border border-ds-danger bg-ds-danger-subtle text-ds-on-subtle text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                This driver's license has expired. Renew before assigning new trips.
              </div>
            )}
          </div>
        }
      />

      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isInactive ? 'Activate Driver' : 'Deactivate Driver'}</DialogTitle></DialogHeader>
          <p className="text-sm text-ds-foreground-muted">{isInactive ? 'Mark driver as active.' : 'Mark driver as inactive. They will not be available for new trip assignments.'}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeactivateDialog(false)}>Cancel</Button>
            <Button variant={isInactive ? 'default' : 'destructive'} onClick={handleDeactivate} disabled={isUpdatingStatus}>
              {isUpdatingStatus && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {isInactive ? 'Activate' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRateDialog} onOpenChange={(v) => { setShowRateDialog(v); if (!v) setRatingTripId(''); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rate Driver</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-ds-3">
            <Select value={ratingTripId} onValueChange={setRatingTripId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a completed trip" /></SelectTrigger>
              <SelectContent>
                {completedTrips.map((t: Trip) => (
                  <SelectItem key={t.id} value={t.id}>
                    {(t.startLocation || 'Trip')} → {t.endLocation || ''} ({formatTripWhenShort(t.startTime)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ratingValue} onValueChange={setRatingValue}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[5, 4, 3, 2, 1].map((n) => <SelectItem key={n} value={String(n)}>{n} star{n === 1 ? '' : 's'}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRateDialog(false)}>Cancel</Button>
            <Button onClick={handleRate} disabled={isRating || !ratingTripId}>
              {isRating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Submit rating
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUploadDialog} onOpenChange={(v) => { setShowUploadDialog(v); if (!v) setUploadFiles([]); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-ds-3">
            <Select value={uploadType} onValueChange={(v) => setUploadType(v as typeof uploadType)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(DRIVER_DOC_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <FileDropzone
              files={uploadFiles}
              onFiles={(files) => setUploadFiles(files.slice(0, 1))}
              onRemove={() => setUploadFiles([])}
              accept=".pdf,.jpg,.jpeg,.png"
              label="Drop a file here, or browse"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={isUploading || uploadFiles.length === 0}>
              {isUploading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-ds-foreground-muted">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
