'use client';

import * as React from 'react';
import { AlertTriangle, Shield, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';

function AlertCard({ alert }: { alert: any }) {
  const urgency = alert.daysRemaining < 0 ? 'overdue' : alert.daysRemaining < 30 ? 'critical' : 'warning';

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
        <Shield className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium">{alert.entityName}</p>
          <Badge variant={urgency === 'overdue' ? 'destructive' : 'secondary'} className="text-[10px]">
            {urgency === 'overdue' ? 'OVERDUE' : urgency === 'critical' ? 'URGENT' : 'WARNING'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {alert.daysRemaining < 0 ? `${Math.abs(alert.daysRemaining)} days overdue` : `${alert.daysRemaining} days remaining`}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button variant="ghost" size="icon-sm"><ExternalLink className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export default function FleetAlertsPage() {
  const vehiclesQuery = useApiQuery(
    () => fleetApi.vehicles.list({ limit: 100 }).then(res => res.data),
    []
  );

  const driversQuery = useApiQuery(
    () => fleetApi.drivers.list({ limit: 100 }).then(res => res.data),
    []
  );

  React.useEffect(() => {
    if (vehiclesQuery.error) {
      toast.error('Failed to load vehicles');
    }
    if (driversQuery.error) {
      toast.error('Failed to load drivers');
    }
  }, [vehiclesQuery.error, driversQuery.error]);

  const vehicles: any[] = Array.isArray(vehiclesQuery.data) ? vehiclesQuery.data : (vehiclesQuery.data?.data ?? []);
  const drivers: any[] = Array.isArray(driversQuery.data) ? driversQuery.data : (driversQuery.data?.data ?? []);

  // Build alerts from vehicles and drivers with expiring licenses
  const alerts = [
    ...drivers.filter((d: any) => {
      const daysRemaining = Math.ceil((new Date(d.licenseExpiry).getTime() - Date.now()) / 86400000);
      return daysRemaining < 90;
    }).map((d: any) => ({
      id: `driver-license-${d.id}`,
      entityName: d.name || 'Unknown Driver',
      daysRemaining: Math.ceil((new Date(d.licenseExpiry).getTime() - Date.now()) / 86400000),
    })),
  ];

  const overdueAlerts = alerts.filter((a: any) => a.daysRemaining < 0);
  const criticalAlerts = alerts.filter((a: any) => a.daysRemaining >= 0 && a.daysRemaining < 30);

  const isLoading = vehiclesQuery.loading || driversQuery.loading;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
            Fleet Alerts
            {alerts.length > 0 && <Badge variant="destructive" className="text-xs">{alerts.length}</Badge>}
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
            <TabsTrigger value="all">All ({alerts.length})</TabsTrigger>
          </TabsList>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading alerts...</span>
            </div>
          ) : (
            <TabsContent value="all" className="mt-0 space-y-3">
              {alerts.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <p className="text-sm">No alerts at this time</p>
                  </CardContent>
                </Card>
              ) : (
                alerts.sort((a: any, b: any) => a.daysRemaining - b.daysRemaining).map((alert: any) => <AlertCard key={alert.id} alert={alert} />)
              )}
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}
