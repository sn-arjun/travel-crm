'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Phone, Mail, Shield, Calendar, MapPin,
  Truck, Award, DollarSign, FileText, User, Loader2, AlertTriangle,
  Star, Download, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { fleetApi, type DriverDocument } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { DRIVER_STATUS_LABELS, DRIVER_STATUS_COLORS, TRIP_STATUS_LABELS, TRIP_STATUS_COLORS } from '@travelcrm/shared';
import { DriverScheduleCalendar } from '@/components/domain/fleet/driver-schedule-calendar';

function ExpiryBadge({ expiryDate }: { expiryDate: string }) {
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
  const color = days < 0
    ? 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20'
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

const DRIVER_DOC_TYPE_LABELS: Record<string, string> = {
  license: 'Driver License', id_proof: 'ID Proof', police_verification: 'Police Verification',
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={cn('h-4 w-4', star <= Math.round(rating) ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30')} />
      ))}
      <span className="text-sm ml-1 font-medium">{rating > 0 ? rating.toFixed(1) : '—'}</span>
    </div>
  );
}

export default function DriverDetailPage() {
  const router = useRouter();
  const params = useParams();
  const driverId = params.id as string;
  const [showDeactivateDialog, setShowDeactivateDialog] = React.useState(false);

  const driverQuery = useApiQuery(() => fleetApi.drivers.getById(driverId).then(res => res.data), [driverId]);
  const tripsQuery = useApiQuery(() => fleetApi.drivers.getTrips(driverId, { limit: 50 }).then(res => res.data), [driverId]);
  const docsQuery = useApiQuery(() => fleetApi.drivers.listDocuments(driverId).then(res => res.data), [driverId]);

  const { mutate: updateStatus, loading: isUpdatingStatus } = useApiMutation<any, any>(
    (data: any) => fleetApi.drivers.updateStatus(driverId, data.status),
  );

  React.useEffect(() => {
    if (driverQuery.error) toast.error('Failed to load driver details');
  }, [driverQuery.error]);

  const driver = driverQuery.data as any;
  const driverTrips: any[] = Array.isArray(tripsQuery.data) ? tripsQuery.data as any[] : ((tripsQuery.data as any)?.data ?? []);
  const docs: DriverDocument[] = Array.isArray(docsQuery.data) ? docsQuery.data as DriverDocument[] : [];
  const completedTrips = driverTrips.filter((t: any) => t.status === 'completed');
  const totalRevenue = driverTrips.reduce((sum: any, t: any) => sum + (t.fare ?? 0), 0);

  async function handleDeactivate() {
    const newStatus = driver?.status === 'inactive' ? 'active' : 'inactive';
    const result = await updateStatus({ status: newStatus });
    if (result) {
      toast.success(`Driver ${newStatus === 'inactive' ? 'deactivated' : 'activated'}`);
      driverQuery.refetch();
      setShowDeactivateDialog(false);
    } else {
      toast.error('Failed to update driver status');
    }
  }

  if (driverQuery.loading) {
    return <div className="flex flex-col items-center justify-center h-full gap-4"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /><p className="text-muted-foreground">Loading driver details...</p></div>;
  }
  if (!driver) {
    return <div className="flex flex-col items-center justify-center h-full gap-4"><User className="h-12 w-12 text-muted-foreground/50" /><p className="text-muted-foreground">Driver not found</p><Button variant="outline" onClick={() => router.push('/fleet/drivers')}>Back to Drivers</Button></div>;
  }

  const statusColor = DRIVER_STATUS_COLORS[driver.status as keyof typeof DRIVER_STATUS_COLORS] || '#64748B';
  const statusLabel = DRIVER_STATUS_LABELS[driver.status as keyof typeof DRIVER_STATUS_LABELS] || driver.status;
  const isInactive = driver.status === 'inactive';

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon-sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
            <Avatar className="h-12 w-12"><AvatarFallback className="text-base">{(driver.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{driver.name}</h1>
                <Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>{statusLabel}</Badge>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{driver.phone}</span>
                {driver.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{driver.email}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild><Link href={`/fleet/drivers/${driverId}/edit`}>Edit Driver</Link></Button>
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
              <TabsTrigger value="schedule">Schedule</TabsTrigger>
              <TabsTrigger value="trips">Trip History ({driverTrips.length})</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <TabsContent value="overview" className="mt-0">
              <div className="max-w-4xl space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Truck className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                      <p className="text-2xl font-bold">{driverTrips.length}</p>
                      <p className="text-xs text-muted-foreground">Total Trips</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <DollarSign className="h-5 w-5 mx-auto text-green-500 mb-1" />
                      <p className="text-2xl font-bold">₹{(totalRevenue / 1000).toFixed(0)}K</p>
                      <p className="text-xs text-muted-foreground">Revenue</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Award className="h-5 w-5 mx-auto text-purple-500 mb-1" />
                      <p className="text-2xl font-bold">{driver.experience ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Years Exp</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between"><span className="text-sm text-muted-foreground">Full Name</span><span className="text-sm font-medium">{driver.name}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-muted-foreground">Phone</span><span className="text-sm font-medium">{driver.phone}</span></div>
                      {driver.email && <div className="flex justify-between"><span className="text-sm text-muted-foreground">Email</span><span className="text-sm font-medium">{driver.email}</span></div>}
                      <div className="flex justify-between"><span className="text-sm text-muted-foreground">Rating</span><StarRating rating={driver.rating ?? 0} /></div>
                      <div className="flex justify-between"><span className="text-sm text-muted-foreground">Status</span><Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>{statusLabel}</Badge></div>
                      {(driver.emergencyContactName || driver.emergencyContact) && (
                        <div className="flex justify-between"><span className="text-sm text-muted-foreground">Emergency Contact</span><span className="text-sm font-medium">{driver.emergencyContactName || driver.emergencyContact}</span></div>
                      )}
                      {(driver.emergencyContactPhone) && (
                        <div className="flex justify-between"><span className="text-sm text-muted-foreground">Emergency Phone</span><span className="text-sm font-medium">{driver.emergencyContactPhone}</span></div>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-base">License Information</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between"><span className="text-sm text-muted-foreground">License Number</span><span className="text-sm font-mono font-medium">{driver.licenseNumber || '—'}</span></div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">Expiry Date</span>
                        {driver.licenseExpiry ? <ExpiryBadge expiryDate={driver.licenseExpiry} /> : <span className="text-sm text-muted-foreground">—</span>}
                      </div>
                      <div className="flex justify-between"><span className="text-sm text-muted-foreground">Experience</span><span className="text-sm font-medium">{driver.experience ?? 0} years</span></div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="documents" className="mt-0">
              <div className="max-w-3xl">
                {docsQuery.loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading documents...</span></div>
                ) : docs.length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No documents uploaded yet</p><p className="text-xs mt-1">Upload License, ID Proof, or Police Verification documents</p></CardContent></Card>
                ) : (
                  <div className="space-y-3">
                    {docs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50">
                        <FileText className="h-8 w-8 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{DRIVER_DOC_TYPE_LABELS[doc.type] || doc.type}</p>
                          {doc.expiryDate && (<div className="mt-1"><ExpiryBadge expiryDate={doc.expiryDate} /></div>)}
                        </div>
                        {doc.documentUrl && (
                          <Button variant="ghost" size="icon-sm" onClick={async () => {
                            try {
                              const res = await fleetApi.drivers.downloadDocument(driverId, doc.id);
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

            <TabsContent value="schedule" className="mt-0">
              <div className="max-w-3xl">
                <DriverScheduleCalendar driverId={driverId} />
              </div>
            </TabsContent>

            <TabsContent value="trips" className="mt-0">
              <div className="max-w-4xl">
                {tripsQuery.loading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading trips...</span></div>
                ) : driverTrips.length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground"><MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No trips assigned to this driver yet</p></CardContent></Card>
                ) : (
                  <div className="space-y-2">
                    {driverTrips.map((trip: any) => {
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
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{trip.startLocation} → {trip.endLocation}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium">{trip.distance}km</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end"><Calendar className="h-3 w-3" />{(trip.startTime || '').split('T')[0]}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold">₹{(trip.fare ?? 0).toLocaleString('en-IN')}</p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="performance" className="mt-0">
              <div className="max-w-3xl space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Completion Rate</p>
                      <p className="text-2xl font-bold mt-1">{driverTrips.length > 0 ? Math.round((completedTrips.length / driverTrips.length) * 100) : 0}%</p>
                      <div className="h-2 rounded-full bg-muted mt-2">
                        <div className="h-full rounded-full bg-green-500" style={{ width: `${driverTrips.length > 0 ? (completedTrips.length / driverTrips.length) * 100 : 0}%` }} />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Avg. Trip Revenue</p>
                      <p className="text-2xl font-bold mt-1">₹{driverTrips.length > 0 ? (totalRevenue / driverTrips.length).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : 0}</p>
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardHeader><CardTitle className="text-base">Trip Summary</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Total Trips</span><span className="text-sm font-medium">{driverTrips.length}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Completed</span><span className="text-sm font-medium text-green-600">{completedTrips.length}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">In Progress</span><span className="text-sm font-medium text-blue-600">{driverTrips.filter((t: any) => ['accepted', 'en_route', 'started'].includes(t.status)).length}</span></div>
                    <div className="flex justify-between border-t pt-3"><span className="text-sm font-medium">Total Revenue</span><span className="text-sm font-bold">₹{totalRevenue.toLocaleString('en-IN')}</span></div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <Dialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isInactive ? 'Activate Driver' : 'Deactivate Driver'}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{isInactive ? 'Mark driver as active.' : 'Mark driver as inactive. They will not be available for new trip assignments.'}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeactivateDialog(false)}>Cancel</Button>
            <Button variant={isInactive ? 'default' : 'destructive'} onClick={handleDeactivate} disabled={isUpdatingStatus}>
              {isUpdatingStatus && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {isInactive ? 'Activate' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
