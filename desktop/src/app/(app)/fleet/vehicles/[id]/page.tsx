'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Car, MapPin, Gauge, Calendar, Loader2, FileText, Wrench,
  Plus, Download, AlertTriangle, Shield, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { fleetApi, type VehicleDocument, type VehicleMaintenance } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { VEHICLE_STATUS_LABELS, VEHICLE_STATUS_COLORS, TRIP_STATUS_LABELS, TRIP_STATUS_COLORS } from '@travelcrm/shared';

function ExpiryBadge({ expiryDate }: { expiryDate: string }) {
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
  const color = days < 0
    ? 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20'
    : days < 7
      ? 'text-red-500 bg-red-50 border-red-200 dark:bg-red-900/20'
      : days < 30
        ? 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20'
        : 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/20';
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium', color)}>
      {days < 0 ? <AlertTriangle className="h-3 w-3" /> : days < 30 ? <Shield className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
      {new Date(expiryDate).toLocaleDateString('en-IN')} {days < 0 ? `(${Math.abs(days)}d overdue)` : days < 30 ? `(${days}d left)` : ''}
    </span>
  );
}

const DOC_TYPE_LABELS: Record<string, string> = {
  rc: 'RC Book', insurance: 'Insurance', permit: 'Permit', pollution: 'Pollution (PUC)',
};

export default function VehicleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const vehicleId = params.id as string;
  const [showDeactivateDialog, setShowDeactivateDialog] = React.useState(false);
  const [showMaintenanceDialog, setShowMaintenanceDialog] = React.useState(false);
  const [maintenanceForm, setMaintenanceForm] = React.useState({
    serviceType: '', serviceDate: '', cost: '', vendor: '', notes: '', nextServiceDate: '',
  });

  const vehicleQuery = useApiQuery(() => fleetApi.vehicles.getById(vehicleId).then(res => res.data), [vehicleId]);
  const tripsQuery = useApiQuery(() => fleetApi.vehicles.getTrips(vehicleId, { limit: 50 }).then(res => res.data), [vehicleId]);
  const docsQuery = useApiQuery(() => fleetApi.vehicles.listDocuments(vehicleId).then(res => res.data), [vehicleId]);
  const maintenanceQuery = useApiQuery(() => fleetApi.vehicles.getMaintenanceHistory(vehicleId).then(res => res.data), [vehicleId]);

  const { mutate: updateStatus, loading: isUpdatingStatus } = useApiMutation<any, any>(
    (data: any) => fleetApi.vehicles.updateStatus(vehicleId, data.status),
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

  async function handleDeactivate() {
    const newStatus = vehicle?.status === 'inactive' ? 'active' : 'inactive';
    const result = await updateStatus({ status: newStatus });
    if (result) {
      toast.success(`Vehicle ${newStatus === 'inactive' ? 'deactivated' : 'activated'}`);
      vehicleQuery.refetch();
      setShowDeactivateDialog(false);
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
    return <div className="flex flex-col items-center justify-center h-full gap-4"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /><p className="text-muted-foreground">Loading vehicle details...</p></div>;
  }
  if (!vehicle) {
    return <div className="flex flex-col items-center justify-center h-full gap-4"><Car className="h-12 w-12 text-muted-foreground/50" /><p className="text-muted-foreground">Vehicle not found</p><Button variant="outline" onClick={() => router.push('/fleet/vehicles')}>Back to Vehicles</Button></div>;
  }

  const statusColor = VEHICLE_STATUS_COLORS[vehicle.status as keyof typeof VEHICLE_STATUS_COLORS] || '#64748B';
  const statusLabel = VEHICLE_STATUS_LABELS[vehicle.status as keyof typeof VEHICLE_STATUS_LABELS] || vehicle.status;
  const isInactive = vehicle.status === 'inactive';

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{vehicle.make} {vehicle.model}</h1>
                <Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>{statusLabel}</Badge>
              </div>
              <p className="text-sm text-muted-foreground font-mono">{vehicle.registrationNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild><Link href={`/fleet/vehicles/${vehicleId}/edit`}>Edit Vehicle</Link></Button>
            <Button
              variant="outline"
              className={isInactive ? 'text-green-600 hover:text-green-700 hover:bg-green-50' : 'text-red-600 hover:text-red-700 hover:bg-red-50'}
              onClick={() => setShowDeactivateDialog(true)}
              disabled={isUpdatingStatus}
            >
              {isInactive ? 'Activate' : 'Deactivate'}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col">
          <div className="px-6 pt-3 border-b">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="documents">Documents ({docs.length})</TabsTrigger>
              <TabsTrigger value="maintenance">Maintenance ({maintenanceHistory.length})</TabsTrigger>
              <TabsTrigger value="trips">Trip History ({vehicleTrips.length})</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <TabsContent value="overview" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
                <Card>
                  <CardHeader><CardTitle className="text-base">Vehicle Information</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Registration</span><span className="text-sm font-medium font-mono">{vehicle.registrationNumber}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Make &amp; Model</span><span className="text-sm font-medium">{vehicle.make} {vehicle.model}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Year</span><span className="text-sm font-medium">{vehicle.year}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Color</span><span className="text-sm font-medium">{vehicle.color || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Capacity</span><span className="text-sm font-medium">{vehicle.seatingCapacity ?? vehicle.capacity} seats</span></div>
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Odometer</span><span className="text-sm font-medium flex items-center gap-1"><Gauge className="h-3 w-3" />{(vehicle.odometerKm ?? vehicle.mileage)?.toLocaleString() ?? 0} km</span></div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Status &amp; Stats</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Status</span><Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>{statusLabel}</Badge></div>
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Total Trips</span><span className="text-sm font-medium">{vehicleTrips.length}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Total Revenue</span><span className="text-sm font-medium">₹{vehicleTrips.reduce((sum: number, t: any) => sum + (t.fare ?? 0), 0).toLocaleString('en-IN')}</span></div>
                    {vehicle.nextServiceDate && (<div className="flex justify-between"><span className="text-sm text-muted-foreground">Next Service</span><span className="text-sm font-medium">{vehicle.nextServiceDate}</span></div>)}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="documents" className="mt-0">
              <div className="max-w-3xl">
                {docsQuery.loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading documents...</span></div>
                ) : docs.length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No documents uploaded yet</p></CardContent></Card>
                ) : (
                  <div className="space-y-3">
                    {docs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50">
                        <FileText className="h-8 w-8 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{DOC_TYPE_LABELS[doc.type] || doc.type}</p>
                          {doc.expiryDate && (<div className="mt-1"><ExpiryBadge expiryDate={doc.expiryDate} /></div>)}
                        </div>
                        {doc.documentUrl && (
                          <Button variant="ghost" size="icon-sm" onClick={async () => {
                            try {
                              const res = await fleetApi.vehicles.downloadDocument(vehicleId, doc.id);
                              const url = (res as any).data?.url;
                              if (url) window.open(url, '_blank');
                            } catch { toast.error('Failed to download'); }
                          }}>
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="maintenance" className="mt-0">
              <div className="max-w-3xl">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">{maintenanceHistory.length} record{maintenanceHistory.length !== 1 ? 's' : ''}</p>
                  <Button size="sm" onClick={() => setShowMaintenanceDialog(true)}><Plus className="h-4 w-4 mr-1.5" />Add Record</Button>
                </div>
                {maintenanceQuery.loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading...</span></div>
                ) : maintenanceHistory.length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground"><Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No maintenance records yet</p></CardContent></Card>
                ) : (
                  <div className="space-y-3">
                    {maintenanceHistory.map((record) => (
                      <div key={record.id} className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50">
                        <Wrench className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium">{record.serviceType}</p>
                            <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />{record.serviceDate}</span>
                          </div>
                          {record.vendor && <p className="text-xs text-muted-foreground">Vendor: {record.vendor}</p>}
                          {record.odometer != null && <p className="text-xs text-muted-foreground flex items-center gap-1"><Gauge className="h-3 w-3" />{record.odometer.toLocaleString()} km</p>}
                          {record.notes && <p className="text-xs text-muted-foreground mt-1">{record.notes}</p>}
                          {record.nextServiceDate && <p className="text-xs text-blue-600 mt-1">Next service: {record.nextServiceDate}</p>}
                        </div>
                        {record.cost != null && <div className="text-right shrink-0"><p className="text-sm font-semibold">₹{record.cost.toLocaleString('en-IN')}</p></div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="trips" className="mt-0">
              <div className="max-w-4xl">
                {tripsQuery.loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading trips...</span></div>
                ) : vehicleTrips.length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground"><MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No trips assigned to this vehicle yet</p></CardContent></Card>
                ) : (
                  <div className="space-y-2">
                    {vehicleTrips.map((trip: any) => {
                      const tripStatusColor = TRIP_STATUS_COLORS[trip.status as keyof typeof TRIP_STATUS_COLORS] || '#64748B';
                      const tripStatusLabel = TRIP_STATUS_LABELS[trip.status as keyof typeof TRIP_STATUS_LABELS] || trip.status;
                      return (
                        <Link key={trip.id} href={`/fleet/trips/${trip.id}`}>
                          <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">Trip #{trip.id.slice(0, 8)}</p>
                                <Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${tripStatusColor}15`, color: tripStatusColor }}>{tripStatusLabel}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{trip.startLocation} → {trip.endLocation}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium">₹{(trip.fare ?? 0).toLocaleString('en-IN')}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end"><Calendar className="h-3 w-3" />{(trip.startTime || '').split('T')[0]}</p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isInactive ? 'Activate Vehicle' : 'Deactivate Vehicle'}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{isInactive ? 'Mark as active and available for trips.' : 'Mark as inactive. No longer available for new trip assignments.'}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeactivateDialog(false)}>Cancel</Button>
            <Button variant={isInactive ? 'default' : 'destructive'} onClick={handleDeactivate} disabled={isUpdatingStatus}>
              {isUpdatingStatus && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {isInactive ? 'Activate' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMaintenanceDialog} onOpenChange={setShowMaintenanceDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Service Record</DialogTitle></DialogHeader>
          <form onSubmit={handleRecordMaintenance} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="serviceType">Service Type <span className="text-destructive">*</span></Label>
              <Input id="serviceType" placeholder="e.g., Oil Change" value={maintenanceForm.serviceType} onChange={(e) => setMaintenanceForm(p => ({ ...p, serviceType: e.target.value }))} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="serviceDate">Service Date <span className="text-destructive">*</span></Label>
                <Input id="serviceDate" type="date" value={maintenanceForm.serviceDate} onChange={(e) => setMaintenanceForm(p => ({ ...p, serviceDate: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maintenanceCost">Cost (₹)</Label>
                <Input id="maintenanceCost" type="number" min={0} placeholder="0" value={maintenanceForm.cost} onChange={(e) => setMaintenanceForm(p => ({ ...p, cost: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor</Label>
              <Input id="vendor" placeholder="e.g., Toyota Service Center" value={maintenanceForm.vendor} onChange={(e) => setMaintenanceForm(p => ({ ...p, vendor: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nextServiceDate">Next Service Date</Label>
              <Input id="nextServiceDate" type="date" value={maintenanceForm.nextServiceDate} onChange={(e) => setMaintenanceForm(p => ({ ...p, nextServiceDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maintenanceNotes">Notes</Label>
              <Input id="maintenanceNotes" placeholder="Additional notes..." value={maintenanceForm.notes} onChange={(e) => setMaintenanceForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowMaintenanceDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={isRecordingMaintenance}>
                {isRecordingMaintenance && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save Record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
