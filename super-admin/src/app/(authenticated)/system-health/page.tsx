'use client';

import { useEffect, useState, useCallback } from 'react';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Database, CloudCog, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HealthData {
  status: 'healthy' | 'critical';
  responseTime: number;
  databaseConnection: boolean;
  cacheHealth: string;
  recentErrors: Array<{ id: string; timestamp: string; level: string; service: string; message: string }>;
}

const statusStyles: Record<string, { border: string; bg: string; text: string }> = {
  healthy: { border: 'border-l-green-500', bg: 'bg-green-50 dark:bg-green-950/20', text: 'text-green-700 dark:text-green-400' },
  down: { border: 'border-l-red-500', bg: 'bg-red-50 dark:bg-red-950/20', text: 'text-red-700 dark:text-red-400' },
};

export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/system/health');
      const json = (await res.json()) as HealthData | { error?: string };
      if (!res.ok) throw new Error((json as { error?: string }).error || 'Health check failed');
      setData(json as HealthData);
      setError('');
      setCheckedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  const components = data
    ? [
        {
          name: 'Master database',
          icon: Database,
          ok: data.databaseConnection,
          detail: data.databaseConnection ? 'Connected' : 'Not reachable',
          latency: data.responseTime,
        },
        {
          name: 'Cache',
          icon: CloudCog,
          ok: data.cacheHealth === 'ok',
          detail: data.cacheHealth === 'ok' ? 'Responding' : 'Degraded',
          latency: null as number | null,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'System Health' }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Health</h1>
          {checkedAt && (
            <p className="text-sm text-muted-foreground mt-1">
              Last checked: {checkedAt.toLocaleTimeString()} &middot; Auto-refreshes every 60s
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <Badge variant="outline" className={data.status === 'healthy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
              {data.status === 'healthy' ? 'All Systems Operational' : 'System Issues'}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => { setRefreshing(true); fetchHealth(); }} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {components.map((comp) => {
          const Icon = comp.icon;
          const style = comp.ok ? statusStyles.healthy : statusStyles.down;
          return (
            <Card key={comp.name} className={`border-l-4 ${style.border}`}>
              <CardContent className={`pt-6 ${style.bg}`}>
                <div className="flex items-center gap-3">
                  <Icon className="h-8 w-8 text-muted-foreground" />
                  <div className="flex-1">
                    <h3 className="font-semibold">{comp.name}</h3>
                    <p className={`text-sm font-medium ${style.text}`}>{comp.detail}</p>
                  </div>
                  {comp.latency !== null && (
                    <div className="text-right">
                      <p className="text-2xl font-bold">{comp.latency}</p>
                      <p className="text-xs text-muted-foreground">ms</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent errors</CardTitle>
        </CardHeader>
        <CardContent>
          {(data?.recentErrors ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent errors</p>
          ) : (
            <div className="space-y-2">
              {data?.recentErrors.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-4 rounded-lg border p-2 text-sm">
                  <div>
                    <span className="font-medium">{e.service}</span>
                    <p className="text-xs text-muted-foreground">{e.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{e.timestamp ? new Date(e.timestamp).toLocaleString() : ''}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
