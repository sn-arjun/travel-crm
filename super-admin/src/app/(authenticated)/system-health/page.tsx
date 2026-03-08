'use client';

import { useEffect, useState, useCallback } from 'react';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Database, HardDrive, CloudCog, Globe, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  details?: string;
}

interface WpSite {
  id: string;
  subdomain: string;
  status: string;
  tenant_id: string;
}

interface HealthData {
  components: HealthCheck[];
  overallStatus: string;
  checkedAt: string;
  tenantStats: { total: number; active: number };
  wpSites: WpSite[];
}

const iconMap: Record<string, typeof Database> = {
  'API Workers': CloudCog,
  'Master D1': Database,
  'R2 Storage': HardDrive,
};

const statusStyles: Record<string, { border: string; bg: string; text: string }> = {
  healthy: { border: 'border-l-green-500', bg: 'bg-green-50 dark:bg-green-950/20', text: 'text-green-700 dark:text-green-400' },
  degraded: { border: 'border-l-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950/20', text: 'text-yellow-700 dark:text-yellow-400' },
  down: { border: 'border-l-red-500', bg: 'bg-red-50 dark:bg-red-950/20', text: 'text-red-700 dark:text-red-400' },
};

const wpStatusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  provisioning: 'bg-yellow-100 text-yellow-800',
  suspended: 'bg-gray-100 text-gray-800',
  deleted: 'bg-red-100 text-red-800',
};

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = useCallback(async () => {
    const res = await fetch('/api/system-health');
    const json = await res.json() as HealthData;
    setData(json);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchHealth();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'System Health' }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Health</h1>
          {data && (
            <p className="text-sm text-muted-foreground mt-1">
              Last checked: {new Date(data.checkedAt).toLocaleTimeString()} &middot; Auto-refreshes every 60s
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <Badge
              variant="outline"
              className={
                data.overallStatus === 'healthy'
                  ? 'bg-green-100 text-green-800'
                  : data.overallStatus === 'degraded'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
              }
            >
              {data.overallStatus === 'healthy' ? 'All Systems Operational' : data.overallStatus === 'degraded' ? 'Degraded Performance' : 'System Issues'}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Component Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data?.components.map((comp) => {
          const Icon = iconMap[comp.name] || Database;
          const style = statusStyles[comp.status] || statusStyles.down;
          return (
            <Card key={comp.name} className={`border-l-4 ${style.border}`}>
              <CardContent className={`pt-6 ${style.bg}`}>
                <div className="flex items-center gap-3">
                  <Icon className="h-8 w-8 text-muted-foreground" />
                  <div className="flex-1">
                    <h3 className="font-semibold">{comp.name}</h3>
                    <p className={`text-sm font-medium capitalize ${style.text}`}>{comp.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{comp.latencyMs}</p>
                    <p className="text-xs text-muted-foreground">ms</p>
                  </div>
                </div>
                {comp.details && (
                  <p className="text-xs text-muted-foreground mt-2 truncate">{comp.details}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Platform Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tenant Databases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-3xl font-bold">{data?.tenantStats.total || 0}</p>
                <p className="text-sm text-muted-foreground">Total Tenants</p>
              </div>
              <div>
                <p className="text-3xl font-bold">{data?.tenantStats.active || 0}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">WordPress Sites</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.wpSites || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No WordPress sites provisioned</p>
            ) : (
              <div className="space-y-2">
                {data?.wpSites.map((wp) => (
                  <div key={wp.id} className="flex items-center justify-between rounded-lg border p-2">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{wp.subdomain}.travelcrmpro.com</span>
                    </div>
                    <Badge variant="outline" className={wpStatusColors[wp.status] || ''}>{wp.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
