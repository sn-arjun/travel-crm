'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Shield, ExternalLink, Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';

function AlertCard({ alert }: { alert: any }) {
  const urgency = alert.daysRemaining < 0 ? 'overdue' : alert.daysRemaining < 30 ? 'critical' : 'warning';
  const detailHref = alert.vehicleId
    ? `/fleet/vehicles/${alert.vehicleId}`
    : alert.driverId
      ? `/fleet/drivers/${alert.driverId}`
      : undefined;

  return (
    <div className={cn(
      'flex items-center gap-4 p-4 rounded-lg border-l-4 transition-colors hover:bg-muted/50',
      urgency === 'overdue' ? 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10' :
      urgency === 'critical' ? 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10' :
      'border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10'
    )}>
      <div className={cn(
        'h-10 w-10 rounded-full flex items-center justify-center shrink-0',
        urgency === 'overdue' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
        urgency === 'critical' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
        'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
      )}>
        {alert.alertType === 'maintenance' ? <Wrench className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium">{alert.entityName}</p>
          <Badge variant="secondary" className="text-[10px]">{alert.docType || alert.alertLabel}</Badge>
          <Badge variant={urgency === 'overdue' ? 'destructive' : 'secondary'} className="text-[10px]">
            {urgency === 'overdue' ? 'OVERDUE' : urgency === 'critical' ? 'URGENT' : 'WARNING'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {alert.daysRemaining < 0 ? `${Math.abs(alert.daysRemaining)} days overdue` : `${alert.daysRemaining} days remaining`}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        {detailHref && (
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={detailHref}><ExternalLink className="h-4 w-4" /></Link>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function FleetAlertsPage() {
  const vehicleDocsQuery = useApiQuery(
    () => fleetApi.vehicles.getExpiringDocuments(90).then(res => res.data),
    []
  );

  const driverDocsQuery = useApiQuery(
    () => fleetApi.drivers.getExpiringDocuments(90).then(res => res.data),
    []
  );

  const maintenanceDueQuery = useApiQuery(
    () => fleetApi.vehicles.getMaintenanceDue(14).then(res => res.data),
    []
  );

  React.useEffect(() => {
    if (vehicleDocsQuery.error) toast.error('Failed to load vehicle document alerts');
    if (driverDocsQuery.error) toast.error('Failed to load driver document alerts');
  }, [vehicleDocsQuery.error, driverDocsQuery.error]);

  const vehicleDocs: any[] = Array.isArray(vehicleDocsQuery.data) ? vehicleDocsQuery.data : [];
  const driverDocs: any[] = Array.isArray(driverDocsQuery.data) ? driverDocsQuery.data : [];
  const maintenanceDue: any[] = Array.isArray(maintenanceDueQuery.data) ? maintenanceDueQuery.data : [];

  const vehicleDocAlerts = vehicleDocs.map((doc: any) => ({
    id: `vdoc-${doc.id}`,
    vehicleId: doc.vehicleId,
    entityName: doc.registrationNumber || doc.vehicleName || 'Unknown Vehicle',
    docType: doc.type?.toUpperCase(),
    alertLabel: doc.type?.toUpperCase(),
    daysRemaining: doc.daysUntilExpiry ?? Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / 86400000),
    alertType: 'document',
  }));

  const driverDocAlerts = driverDocs.map((doc: any) => ({
    id: `ddoc-${doc.id}`,
    driverId: doc.driverId,
    entityName: doc.driverName || 'Unknown Driver',
    docType: doc.type?.toUpperCase(),
    alertLabel: doc.type?.toUpperCase(),
    daysRemaining: doc.daysUntilExpiry ?? Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / 86400000),
    alertType: 'document',
  }));

  const maintenanceAlerts = maintenanceDue.map((v: any) => ({
    id: `maint-${v.id}`,
    vehicleId: v.id,
    entityName: v.registrationNumber || `${v.make} ${v.model}`,
    docType: 'SERVICE DUE',
    alertLabel: 'SERVICE DUE',
    daysRemaining: v.daysTillService ?? 0,
    alertType: 'maintenance',
  }));

  const allDocAlerts = [...vehicleDocAlerts, ...driverDocAlerts].sort((a, b) => a.daysRemaining - b.daysRemaining);
  const allAlerts = [...allDocAlerts, ...maintenanceAlerts].sort((a, b) => a.daysRemaining - b.daysRemaining);

  const overdueAlerts = allAlerts.filter((a: any) => a.daysRemaining < 0);
  const criticalAlerts = allAlerts.filter((a: any) => a.daysRemaining >= 0 && a.daysRemaining < 30);
  const isLoading = vehicleDocsQuery.loading || driverDocsQuery.loading || maintenanceDueQuery.loading;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            Fleet Alerts
            {allAlerts.length > 0 && <Badge variant="destructive" className="text-xs">{allAlerts.length}</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {overdueAlerts.length > 0 && <span className="text-red-600 font-medium">{overdueAlerts.length} overdue</span>}
            {overdueAlerts.length > 0 && criticalAlerts.length > 0 && ' · '}
            {criticalAlerts.length > 0 && <span className="text-amber-600 font-medium">{criticalAlerts.length} urgent</span>}
          </p>
        </div>
      </div>

      <Tabs defaultValue="all" className="flex-1 flex flex-col">
        <div className="px-6 pt-3 border-b">
          <TabsList>
            <TabsTrigger value="all">All ({allAlerts.length})</TabsTrigger>
            <TabsTrigger value="documents">Expiring Documents ({allDocAlerts.length})</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance Due ({maintenanceAlerts.length})</TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /><span>Loading alerts...</span>
            </div>
          ) : (
            <>
              <TabsContent value="all" className="mt-0 space-y-3">
                {allAlerts.length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground"><p className="text-sm">No alerts at this time</p></CardContent></Card>
                ) : (
                  allAlerts.map((alert: any) => <AlertCard key={alert.id} alert={alert} />)
                )}
              </TabsContent>

              <TabsContent value="documents" className="mt-0 space-y-3">
                {allDocAlerts.length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground"><p className="text-sm">No expiring documents</p></CardContent></Card>
                ) : (
                  <>
                    {vehicleDocAlerts.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vehicle Documents</p>
                        <div className="space-y-2">
                          {vehicleDocAlerts.map((alert: any) => <AlertCard key={alert.id} alert={alert} />)}
                        </div>
                      </div>
                    )}
                    {driverDocAlerts.length > 0 && (
                      <div className={vehicleDocAlerts.length > 0 ? 'mt-4' : ''}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Driver Documents</p>
                        <div className="space-y-2">
                          {driverDocAlerts.map((alert: any) => <AlertCard key={alert.id} alert={alert} />)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="maintenance" className="mt-0 space-y-3">
                {maintenanceAlerts.length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground"><p className="text-sm">No vehicles due for maintenance</p></CardContent></Card>
                ) : (
                  maintenanceAlerts.map((alert: any) => <AlertCard key={alert.id} alert={alert} />)
                )}
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
}
