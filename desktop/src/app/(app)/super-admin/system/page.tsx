'use client';

import { CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { ListPage, StatCard } from '@/components/domain';
import type { DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart } from '@/components/ui/chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { PageContainer } from '@/components/layout/page-container';

interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  uptime: number;
  responseTime: number;
  cpuUsage: number;
  memoryUsage: number;
  databaseConnection: boolean;
  cacheHealth: string;
  metrics: { timestamp: string; cpu: number; memory: number; responseTime: number }[];
}

interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  service: string;
  message: string;
  details?: string;
}

function logTone(level: SystemLog['level']) {
  if (level === 'info') return 'info' as const;
  if (level === 'warning') return 'warning' as const;
  return 'danger' as const;
}

function SystemPageContent() {
  const { data: health, loading: healthLoading, refetch } = useApiQuery<SystemHealth>(async () => {
    const response = await client.get<{ data: SystemHealth }>(API_ENDPOINTS.admin.systemHealth);
    return response.data;
  }, []);

  const logColumns: DataTableColumn<SystemLog>[] = [
    { key: 'level', header: 'Level', cell: (l) => <Tag tone={logTone(l.level)}>{l.level}</Tag> },
    { key: 'service', header: 'Service', cell: (l) => <span className="font-mono text-xs">{l.service}</span> },
    { key: 'message', header: 'Message', hideable: false },
    { key: 'timestamp', header: 'Time', cell: (l) => new Date(l.timestamp).toLocaleString('en-IN') },
  ];

  return (
    <div className="flex flex-col gap-ds-6">
      <PageHeader
        title="System health"
        description="Platform monitoring and event logs."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={healthLoading} className="gap-ds-2">
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <Tabs defaultValue="health">
        <TabsList>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-ds-4 flex flex-col gap-ds-4">
          {healthLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-ds-2">
                    {health?.status === 'healthy' ? (
                      <CheckCircle className="size-5 text-ds-success" aria-hidden="true" />
                    ) : (
                      <AlertCircle className="size-5 text-ds-danger" aria-hidden="true" />
                    )}
                    Overall status
                  </CardTitle>
                  <Tag tone={health?.status === 'healthy' ? 'success' : health?.status === 'warning' ? 'warning' : 'danger'}>
                    {health?.status ?? 'unknown'}
                  </Tag>
                </div>
              </CardHeader>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Uptime" value={`${health?.uptime ?? 0}s`} loading={healthLoading} />
            <StatCard title="Response time" value={`${health?.responseTime ?? 0}ms`} loading={healthLoading} />
            <StatCard title="CPU usage" value={`${health?.cpuUsage ?? 0}%`} loading={healthLoading} />
            <StatCard title="Memory usage" value={`${health?.memoryUsage ?? 0}%`} loading={healthLoading} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Service status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-ds-3">
              <div className="flex items-center justify-between rounded-ds-md border border-ds-border p-ds-3">
                <div>
                  <p className="font-medium">Database connection</p>
                  <p className="text-sm text-ds-foreground-muted">MASTER_DB</p>
                </div>
                <span className={`flex items-center gap-ds-2 ${health?.databaseConnection ? 'text-ds-success' : 'text-ds-danger'}`}>
                  {health?.databaseConnection ? <CheckCircle className="size-5" aria-hidden="true" /> : <AlertCircle className="size-5" aria-hidden="true" />}
                  {health?.databaseConnection ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-ds-md border border-ds-border p-ds-3">
                <div>
                  <p className="font-medium">Cache service</p>
                </div>
                <span className="flex items-center gap-ds-2 text-ds-success">
                  <CheckCircle className="size-5" aria-hidden="true" />
                  {health?.cacheHealth ?? 'ok'}
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-ds-4">
            <h3 className="mb-ds-3 text-sm font-semibold text-ds-foreground">Performance metrics</h3>
            <AreaChart
              data={health?.metrics ?? []}
              categoryKey="timestamp"
              series={[{ dataKey: 'cpu', label: 'CPU %' }, { dataKey: 'memory', label: 'Memory %' }]}
              loading={healthLoading}
            />
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-ds-4">
          <ListPage<SystemLog>
            className="p-0"
            title="System logs"
            getRowId={(l) => l.id}
            fetcher={({ page, limit, search }) =>
              client.get(API_ENDPOINTS.admin.systemLogs, { params: { page, limit, search: search || undefined } })
            }
            extractItems={(r) => (r as { data?: SystemLog[] })?.data ?? []}
            extractTotal={(r) => (r as { pagination?: { total?: number } })?.pagination?.total ?? 0}
            columns={logColumns}
            searchPlaceholder="Search logs..."
            emptyTitle="No logs found"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function SystemPage() {
  return (
    <PageContainer>
      <SystemPageContent />
    </PageContainer>
  );
}
