'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing, PhoneOff,
  Clock, TrendingUp, BarChart3, Users,
} from 'lucide-react';
import {
  Button, Card, CardContent, CardHeader, CardTitle, Tag, Skeleton,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  DataTable, type DataTableColumn,
} from '@/components/ui';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { useApiQuery } from '@/hooks/use-api';
import { voipApi, type CallAnalytics, type Call } from '@/lib/api/voip';
import { cn } from '@/lib/utils';

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

const TONE_CLASSES = {
  primary: { bg: 'bg-ds-primary-subtle', fg: 'text-ds-primary-on-subtle' },
  warning: { bg: 'bg-ds-warning-subtle', fg: 'text-ds-warning-on-subtle' },
  danger: { bg: 'bg-ds-danger-subtle', fg: 'text-ds-danger-on-subtle' },
  success: { bg: 'bg-ds-success-subtle', fg: 'text-ds-success-on-subtle' },
} as const;

function StatCard({ label, value, icon: Icon, tone, subtext }: {
  label: string; value: string | number; icon: React.ElementType;
  tone: keyof typeof TONE_CLASSES; subtext?: string;
}) {
  const toneClasses = TONE_CLASSES[tone];
  return (
    <Card>
      <CardContent className="p-ds-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="mb-ds-1 text-xs text-ds-foreground-muted">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtext && <p className="mt-ds-1 text-xs text-ds-foreground-muted">{subtext}</p>}
          </div>
          <div className={cn('flex size-10 items-center justify-center rounded-ds-lg', toneClasses.bg)}>
            <Icon className={cn('size-5', toneClasses.fg)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const hourLabels = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  const ampm = i < 12 ? 'AM' : 'PM';
  return `${h}${ampm}`;
});

const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface TopCaller { number: string; count: number; totalDuration: number }

function periodToDateRange(period: string): { fromDate: string; toDate: string } {
  const now = new Date();
  const toDate = now.toISOString().slice(0, 10);
  const from = new Date(now);
  if (period === 'today') { /* from = now */ }
  else if (period === 'this_week') from.setDate(now.getDate() - 7);
  else if (period === 'this_month') from.setDate(now.getDate() - 30);
  else if (period === 'last_month') from.setDate(now.getDate() - 60);
  else if (period === 'last_90_days') from.setDate(now.getDate() - 90);
  return { fromDate: from.toISOString().slice(0, 10), toDate };
}

export default function CallAnalyticsPage() {
  const router = useRouter();
  const { enabled, reason, upgradeHref, loading: gateLoading } = useFeatureGate('voip_calling');
  const [period, setPeriod] = React.useState('this_month');

  const { data: analyticsResponse, loading } = useApiQuery(
    () => voipApi.analytics.get(periodToDateRange(period)),
    [period],
  );
  const { data: callsResponse } = useApiQuery(
    () => voipApi.calls.list({ limit: 100 }),
    [],
  );

  const analytics: CallAnalytics | null = analyticsResponse?.data ?? null;
  const calls: Call[] = callsResponse?.data ?? [];

  const callsByHour = React.useMemo(() => {
    const counts = new Array(24).fill(0);
    calls.forEach((c) => { counts[new Date(c.createdAt).getHours()]++; });
    return counts;
  }, [calls]);
  const maxHourCount = Math.max(...callsByHour, 1);

  const callsByDay = React.useMemo(() => {
    const counts = new Array(7).fill(0);
    calls.forEach((c) => { counts[(new Date(c.createdAt).getDay() + 6) % 7]++; });
    return counts;
  }, [calls]);
  const maxDayCount = Math.max(...callsByDay, 1);

  const topCallers: TopCaller[] = React.useMemo(() => {
    const map = new Map<string, TopCaller>();
    calls.forEach((c) => {
      const num = c.direction === 'inbound' ? c.fromNumber : c.toNumber;
      const existing = map.get(num) || { number: num, count: 0, totalDuration: 0 };
      existing.count++;
      existing.totalDuration += c.durationSeconds || 0;
      map.set(num, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [calls]);

  if (gateLoading) return <Skeleton className="h-9 w-32" />;

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 p-ds-9 text-center">
        <BarChart3 className="size-10 text-ds-foreground-subtle" aria-hidden="true" />
        <p className="text-sm text-ds-foreground-muted">
          {reason === 'cap_exceeded' ? 'Call limit reached for your plan.' : 'VoIP calling is not enabled on your plan.'}
        </p>
        <Button asChild size="sm">
          <a href={upgradeHref}>Upgrade to enable</a>
        </Button>
      </div>
    );
  }

  const columns: DataTableColumn<TopCaller>[] = [
    { key: 'rank', header: '#', width: '48px', cell: (_r, i) => <span className="text-ds-foreground-muted">{i + 1}</span> },
    { key: 'number', header: 'Number', cell: (c) => <span className="font-mono text-sm font-medium">{c.number}</span> },
    { key: 'count', header: 'Total calls', cell: (c) => <Tag tone="neutral">{c.count}</Tag> },
    { key: 'totalDuration', header: 'Total duration', cell: (c) => <span className="text-sm">{formatDuration(c.totalDuration)}</span> },
    { key: 'avgDuration', header: 'Avg duration', cell: (c) => <span className="text-sm text-ds-foreground-muted">{formatDuration(Math.floor(c.totalDuration / c.count))}</span> },
  ];

  return (
    <div className="flex flex-col gap-ds-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-ds-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()} aria-label="Go back">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Call analytics</h1>
            <p className="text-sm text-ds-foreground-muted">Overview of your call activity</p>
          </div>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">This week</SelectItem>
            <SelectItem value="this_month">This month</SelectItem>
            <SelectItem value="last_month">Last month</SelectItem>
            <SelectItem value="last_90_days">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-ds-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-ds-4 lg:grid-cols-4">
            <StatCard label="Total calls" value={analytics?.summary.totalCalls ?? calls.length} icon={Phone} tone="primary" />
            <StatCard label="Avg duration" value={formatDuration(analytics?.summary.avgDurationSeconds ?? 0)} icon={Clock} tone="warning" />
            <StatCard label="Missed calls" value={analytics?.summary.missedCalls ?? calls.filter((c) => c.status === 'no-answer').length} icon={PhoneOff} tone="danger" />
            <StatCard label="Completed" value={analytics?.summary.completedCalls ?? calls.filter((c) => c.status === 'completed').length} icon={TrendingUp} tone="success" />
          </div>

          <div className="grid grid-cols-2 gap-ds-4">
            <Card>
              <CardContent className="flex items-center gap-ds-3 p-ds-4">
                <div className="flex size-10 items-center justify-center rounded-ds-lg bg-ds-info-subtle">
                  <PhoneIncoming className="size-5 text-ds-info-on-subtle" />
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted">Inbound calls</p>
                  <p className="text-xl font-bold">{analytics?.summary.inboundCalls ?? calls.filter((c) => c.direction === 'inbound').length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-ds-3 p-ds-4">
                <div className="flex size-10 items-center justify-center rounded-ds-lg bg-ds-success-subtle">
                  <PhoneOutgoing className="size-5 text-ds-success-on-subtle" />
                </div>
                <div>
                  <p className="text-xs text-ds-foreground-muted">Outbound calls</p>
                  <p className="text-xl font-bold">{analytics?.summary.outboundCalls ?? calls.filter((c) => c.direction === 'outbound').length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-ds-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-ds-2 text-base">
                  <BarChart3 className="size-4" /> Calls by hour
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-40 items-end gap-ds-1">
                  {callsByHour.map((count, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-ds-1">
                      <div
                        className="min-h-[2px] w-full rounded-t bg-ds-primary transition-all"
                        style={{ height: `${(count / maxHourCount) * 100}%` }}
                        title={`${hourLabels[i]}: ${count} calls`}
                      />
                      {i % 3 === 0 && <span className="text-[9px] text-ds-foreground-muted">{hourLabels[i]}</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-ds-2 text-base">
                  <BarChart3 className="size-4" /> Calls by day
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-ds-3">
                  {dayLabels.map((day, i) => (
                    <div key={day} className="flex items-center gap-ds-3">
                      <span className="w-8 text-xs font-medium">{day}</span>
                      <div className="h-6 flex-1 overflow-hidden rounded bg-ds-surface-sunken">
                        <div
                          className="flex h-full items-center justify-end rounded bg-ds-primary px-ds-2 transition-all"
                          style={{ width: `${(callsByDay[i] / maxDayCount) * 100}%` }}
                        >
                          {callsByDay[i] > 0 && <span className="text-[10px] font-medium text-ds-primary-foreground">{callsByDay[i]}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-ds-2 text-base">
                <Users className="size-4" /> Top callers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable<TopCaller>
                columns={columns}
                data={topCallers}
                getRowId={(c) => c.number}
                emptyState={<p className="py-ds-6 text-center text-sm text-ds-foreground-muted">No call data available</p>}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
