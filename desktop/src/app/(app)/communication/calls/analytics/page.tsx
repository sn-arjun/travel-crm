'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing, PhoneOff,
  Clock, TrendingUp, Loader, AlertCircle, BarChart3, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { voipApi, type CallAnalytics, type Call } from '@/lib/api/voip';

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtext?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
          </div>
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', color)}>
            <Icon className="h-5 w-5" />
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

export default function CallAnalyticsPage() {
  const router = useRouter();
  const [period, setPeriod] = React.useState('this_month');

  const { data: analyticsResponse, loading, error } = useApiQuery<any>(
    () => voipApi.analytics.get({ period }),
    [period],
  );

  const { data: callsResponse } = useApiQuery<any>(
    () => voipApi.calls.list({ limit: 100 }),
    [],
  );

  const analytics: CallAnalytics | null = analyticsResponse?.data ?? null;

  const calls: Call[] = React.useMemo(() => {
    const data = callsResponse?.data;
    return Array.isArray(data) ? data : (data?.data ?? []);
  }, [callsResponse]);

  // Calculate calls by hour
  const callsByHour = React.useMemo(() => {
    const counts = new Array(24).fill(0);
    calls.forEach((c) => {
      const hour = new Date(c.startTime).getHours();
      counts[hour]++;
    });
    return counts;
  }, [calls]);

  const maxHourCount = Math.max(...callsByHour, 1);

  // Calculate calls by day
  const callsByDay = React.useMemo(() => {
    const counts = new Array(7).fill(0);
    calls.forEach((c) => {
      const day = (new Date(c.startTime).getDay() + 6) % 7; // Mon=0
      counts[day]++;
    });
    return counts;
  }, [calls]);

  const maxDayCount = Math.max(...callsByDay, 1);

  // Top callers
  const topCallers = React.useMemo(() => {
    const map = new Map<string, { number: string; count: number; totalDuration: number }>();
    calls.forEach((c) => {
      const num = c.direction === 'inbound' ? c.from : c.to;
      const existing = map.get(num) || { number: num, count: 0, totalDuration: 0 };
      existing.count++;
      existing.totalDuration += c.duration || 0;
      map.set(num, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [calls]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Call Analytics
            </h1>
            <p className="text-sm text-muted-foreground">Overview of your call activity</p>
          </div>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="last_90_days">Last 90 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {error && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 mb-4">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-600">Using estimated data - connect backend for real analytics</p>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Calls"
              value={analytics?.totalCalls ?? calls.length}
              icon={Phone}
              color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            />
            <StatCard
              label="Avg Duration"
              value={formatDuration(analytics?.avgDuration ?? 0)}
              icon={Clock}
              color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
            />
            <StatCard
              label="Missed Calls"
              value={analytics?.missedCalls ?? calls.filter((c) => c.status === 'no_answer').length}
              icon={PhoneOff}
              color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            />
            <StatCard
              label="Completed"
              value={analytics?.completedCalls ?? calls.filter((c) => c.status === 'completed').length}
              icon={TrendingUp}
              color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            />
          </div>

          {/* Inbound/Outbound Split */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <PhoneIncoming className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Inbound Calls</p>
                    <p className="text-xl font-bold">{analytics?.inboundCalls ?? calls.filter((c) => c.direction === 'inbound').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <PhoneOutgoing className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Outbound Calls</p>
                    <p className="text-xl font-bold">{analytics?.outboundCalls ?? calls.filter((c) => c.direction === 'outbound').length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Calls by Hour */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Calls by Hour
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-40">
                  {callsByHour.map((count, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full bg-primary/80 rounded-t min-h-[2px] transition-all"
                        style={{ height: `${(count / maxHourCount) * 100}%` }}
                        title={`${hourLabels[i]}: ${count} calls`}
                      />
                      {i % 3 === 0 && (
                        <span className="text-[9px] text-muted-foreground">{hourLabels[i]}</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Calls by Day */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Calls by Day
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dayLabels.map((day, i) => (
                    <div key={day} className="flex items-center gap-3">
                      <span className="text-xs font-medium w-8">{day}</span>
                      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                        <div
                          className="h-full bg-primary/80 rounded transition-all flex items-center justify-end px-2"
                          style={{ width: `${(callsByDay[i] / maxDayCount) * 100}%` }}
                        >
                          {callsByDay[i] > 0 && (
                            <span className="text-[10px] text-primary-foreground font-medium">{callsByDay[i]}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Callers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Top Callers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topCallers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No call data available</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Total Calls</TableHead>
                      <TableHead>Total Duration</TableHead>
                      <TableHead>Avg Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topCallers.map((caller, i) => (
                      <TableRow key={caller.number}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-mono text-sm font-medium">{caller.number}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{caller.count}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{formatDuration(caller.totalDuration)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDuration(Math.floor(caller.totalDuration / caller.count))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
