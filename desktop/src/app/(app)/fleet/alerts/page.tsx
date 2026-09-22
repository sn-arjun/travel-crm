'use client';

import * as React from 'react';
import Link from 'next/link';
import { Shield, ExternalLink, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi, type FleetDocumentAlert, type Vehicle } from '@/lib/api/fleet';
import { toast } from 'sonner';

type Urgency = 'overdue' | 'critical' | 'warning';

interface FleetAlert {
  id: string;
  vehicleId?: string;
  driverId?: string;
  entityName: string;
  label: string;
  daysRemaining: number;
  alertType: 'document' | 'maintenance';
  ownerType?: 'vehicle' | 'driver';
}

function urgencyOf(daysRemaining: number): Urgency {
  if (daysRemaining < 0) return 'overdue';
  if (daysRemaining < 30) return 'critical';
  return 'warning';
}

function AlertCard({ alert }: { alert: FleetAlert }) {
  const urgency = urgencyOf(alert.daysRemaining);
  const detailHref = alert.vehicleId
    ? `/fleet/vehicles/${alert.vehicleId}`
    : alert.driverId
      ? `/fleet/drivers/${alert.driverId}`
      : undefined;

  return (
    <div className={cn(
      'flex items-center gap-4 p-4 rounded-ds-md border-l-4 transition-colors hover:bg-ds-surface-sunken',
      urgency === 'overdue' ? 'border-l-ds-danger bg-ds-danger-subtle' :
      urgency === 'critical' ? 'border-l-ds-warning bg-ds-warning-subtle' :
      'border-l-ds-info bg-ds-info-subtle',
    )}>
      <div className={cn(
        'h-10 w-10 rounded-ds-full flex items-center justify-center shrink-0',
        urgency === 'overdue' ? 'bg-ds-danger-subtle text-ds-danger-on-subtle' :
        urgency === 'critical' ? 'bg-ds-warning-subtle text-ds-warning-on-subtle' :
        'bg-ds-info-subtle text-ds-info-on-subtle',
      )}>
        {alert.alertType === 'maintenance' ? <Wrench className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium">{alert.entityName}</p>
          <Tag tone="neutral" size="sm">{alert.label}</Tag>
          <Tag tone={urgency === 'overdue' ? 'danger' : urgency === 'critical' ? 'warning' : 'info'} size="sm">
            {urgency === 'overdue' ? 'OVERDUE' : urgency === 'critical' ? 'URGENT' : 'WARNING'}
          </Tag>
        </div>
        <p className="text-xs text-ds-foreground-muted">
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

function toDocumentAlert(doc: FleetDocumentAlert): FleetAlert {
  return {
    id: `doc-${doc.id}`,
    vehicleId: doc.vehicleId,
    driverId: doc.driverId,
    entityName: doc.entityName,
    label: doc.type?.toUpperCase() ?? 'DOCUMENT',
    daysRemaining: doc.daysUntilExpiry ?? Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / 86400000),
    alertType: 'document',
    ownerType: doc.ownerType,
  };
}

function toMaintenanceAlert(v: Vehicle & { daysTillService?: number }): FleetAlert {
  return {
    id: `maint-${v.id}`,
    vehicleId: v.id,
    entityName: v.registrationNumber || `${v.make} ${v.model}`,
    label: 'SERVICE DUE',
    daysRemaining: v.daysTillService ?? 0,
    alertType: 'maintenance',
  };
}

export default function FleetAlertsPage() {
  // Single call covers both vehicle and driver document expiries (backend unions them).
  const docAlertsQuery = useApiQuery(
    () => fleetApi.getExpiringDocuments(90).then((res) => res.data),
    [],
  );

  const maintenanceDueQuery = useApiQuery(
    () => fleetApi.getMaintenanceDue(14).then((res) => res.data),
    [],
  );

  React.useEffect(() => {
    if (docAlertsQuery.error) toast.error('Failed to load document alerts');
    if (maintenanceDueQuery.error) toast.error('Failed to load maintenance alerts');
  }, [docAlertsQuery.error, maintenanceDueQuery.error]);

  const docAlerts = (docAlertsQuery.data ?? []).map(toDocumentAlert);
  const vehicleDocAlerts = docAlerts.filter((a) => a.ownerType === 'vehicle');
  const driverDocAlerts = docAlerts.filter((a) => a.ownerType === 'driver');
  const maintenanceAlerts = (maintenanceDueQuery.data ?? []).map(toMaintenanceAlert);

  const allDocAlerts = [...docAlerts].sort((a, b) => a.daysRemaining - b.daysRemaining);
  const allAlerts = [...allDocAlerts, ...maintenanceAlerts].sort((a, b) => a.daysRemaining - b.daysRemaining);

  const overdueAlerts = allAlerts.filter((a) => a.daysRemaining < 0);
  const criticalAlerts = allAlerts.filter((a) => a.daysRemaining >= 0 && a.daysRemaining < 30);
  const isLoading = docAlertsQuery.loading || maintenanceDueQuery.loading;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-4">
        <PageHeader
          title="Fleet Alerts"
          count={allAlerts.length}
          description={
            overdueAlerts.length > 0 || criticalAlerts.length > 0
              ? [
                  overdueAlerts.length > 0 ? `${overdueAlerts.length} overdue` : null,
                  criticalAlerts.length > 0 ? `${criticalAlerts.length} urgent` : null,
                ].filter(Boolean).join(' · ')
              : undefined
          }
        />
      </div>

      <Tabs defaultValue="all" className="flex-1 flex flex-col">
        <div className="px-6 pt-3 border-b border-ds-border">
          <TabsList>
            <TabsTrigger value="all">All ({allAlerts.length})</TabsTrigger>
            <TabsTrigger value="documents">Expiring Documents ({allDocAlerts.length})</TabsTrigger>
            <TabsTrigger value="maintenance">Maintenance Due ({maintenanceAlerts.length})</TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <>
              <TabsContent value="all" className="mt-0 space-y-3">
                {allAlerts.length === 0 ? (
                  <Card><CardContent><EmptyState title="No alerts at this time" /></CardContent></Card>
                ) : (
                  allAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
                )}
              </TabsContent>

              <TabsContent value="documents" className="mt-0 space-y-3">
                {allDocAlerts.length === 0 ? (
                  <Card><CardContent><EmptyState title="No expiring documents" /></CardContent></Card>
                ) : (
                  <>
                    {vehicleDocAlerts.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-ds-foreground-muted uppercase tracking-wide mb-2">Vehicle Documents</p>
                        <div className="space-y-2">
                          {vehicleDocAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
                        </div>
                      </div>
                    )}
                    {driverDocAlerts.length > 0 && (
                      <div className={vehicleDocAlerts.length > 0 ? 'mt-4' : ''}>
                        <p className="text-xs font-semibold text-ds-foreground-muted uppercase tracking-wide mb-2">Driver Documents</p>
                        <div className="space-y-2">
                          {driverDocAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="maintenance" className="mt-0 space-y-3">
                {maintenanceAlerts.length === 0 ? (
                  <Card><CardContent><EmptyState title="No vehicles due for maintenance" /></CardContent></Card>
                ) : (
                  maintenanceAlerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)
                )}
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
}
