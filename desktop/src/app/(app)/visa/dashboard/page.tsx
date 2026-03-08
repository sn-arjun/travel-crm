'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, Globe, Calendar, BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { visaApi, type VisaRecord } from '@/lib/api/visa';

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    applied: 'bg-blue-100 text-blue-900',
    processing: 'bg-amber-100 text-amber-900',
    approved: 'bg-green-100 text-green-900',
    rejected: 'bg-red-100 text-red-900',
  };
  return colors[status] ?? 'bg-gray-100 text-gray-900';
}

export default function VisaDashboardPage() {
  const router = useRouter();

  const { data: response, loading, error } = useApiQuery(
    () => visaApi.list({ page: 1, limit: 200 }),
    [],
  );

  const records: VisaRecord[] = React.useMemo(() => {
    if (!response || !('data' in response)) return [];
    const data = response.data;
    return Array.isArray(data) ? data : (data as any)?.data ?? [];
  }, [response]);

  const stats = React.useMemo(() => {
    const applied = records.filter((r) => r.status === 'applied').length;
    const processing = records.filter((r) => r.status === 'processing').length;
    const approved = records.filter((r) => r.status === 'approved').length;
    const rejected = records.filter((r) => r.status === 'rejected').length;
    return { applied, processing, approved, rejected, total: records.length };
  }, [records]);

  const upcomingDeadlines = React.useMemo(() => {
    const now = new Date();
    return records
      .filter((r) => r.expiryDate && new Date(r.expiryDate) > now && r.status !== 'rejected')
      .sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime())
      .slice(0, 10);
  }, [records]);

  const statusDistribution = React.useMemo(() => {
    const countryMap: Record<string, Record<string, number>> = {};
    records.forEach((r) => {
      if (!countryMap[r.countryName]) countryMap[r.countryName] = {};
      countryMap[r.countryName]![r.status] = (countryMap[r.countryName]![r.status] ?? 0) + 1;
    });
    return Object.entries(countryMap)
      .map(([country, statuses]) => ({ country, ...statuses, total: Object.values(statuses).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [records]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading visa dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Visa Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">{stats.total} total applications</p>
          </div>
        </div>
        <Button asChild>
          <Link href="/visa">View All Applications</Link>
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 mx-auto text-blue-500 mb-2" />
              <p className="text-3xl font-bold">{stats.applied}</p>
              <p className="text-xs text-muted-foreground mt-1">Applied</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <BarChart3 className="h-6 w-6 mx-auto text-amber-500 mb-2" />
              <p className="text-3xl font-bold">{stats.processing}</p>
              <p className="text-xs text-muted-foreground mt-1">Processing</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <CheckCircle2 className="h-6 w-6 mx-auto text-green-500 mb-2" />
              <p className="text-3xl font-bold">{stats.approved}</p>
              <p className="text-xs text-muted-foreground mt-1">Approved</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <XCircle className="h-6 w-6 mx-auto text-red-500 mb-2" />
              <p className="text-3xl font-bold">{stats.rejected}</p>
              <p className="text-xs text-muted-foreground mt-1">Rejected</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upcoming Deadlines */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-5 w-5" /> Upcoming Deadlines
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingDeadlines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No upcoming deadlines</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Traveller</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingDeadlines.map((r) => {
                      const daysUntil = Math.ceil((new Date(r.expiryDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      return (
                        <TableRow
                          key={r.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => router.push(`/visa/${r.id}`)}
                        >
                          <TableCell className="text-sm font-medium">{r.travellerName}</TableCell>
                          <TableCell className="text-sm">{r.countryName}</TableCell>
                          <TableCell className="text-sm">
                            <span className={cn(daysUntil <= 7 && 'text-red-600 font-semibold', daysUntil <= 30 && daysUntil > 7 && 'text-amber-600')}>
                              {new Date(r.expiryDate!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              <span className="text-xs ml-1">({daysUntil}d)</span>
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn('text-xs capitalize', getStatusColor(r.status))}>{r.status}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Status by Country */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-5 w-5" /> Applications by Country
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statusDistribution.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
              ) : (
                <div className="space-y-3">
                  {statusDistribution.map((item: any) => (
                    <div key={item.country} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-32 truncate">{item.country}</span>
                      <div className="flex-1 flex items-center gap-1 h-6">
                        {item.approved > 0 && (
                          <div
                            className="h-full bg-green-400 rounded-sm"
                            style={{ width: `${(item.approved / item.total) * 100}%` }}
                            title={`Approved: ${item.approved}`}
                          />
                        )}
                        {item.processing > 0 && (
                          <div
                            className="h-full bg-amber-400 rounded-sm"
                            style={{ width: `${(item.processing / item.total) * 100}%` }}
                            title={`Processing: ${item.processing}`}
                          />
                        )}
                        {item.applied > 0 && (
                          <div
                            className="h-full bg-blue-400 rounded-sm"
                            style={{ width: `${(item.applied / item.total) * 100}%` }}
                            title={`Applied: ${item.applied}`}
                          />
                        )}
                        {item.rejected > 0 && (
                          <div
                            className="h-full bg-red-400 rounded-sm"
                            style={{ width: `${(item.rejected / item.total) * 100}%` }}
                            title={`Rejected: ${item.rejected}`}
                          />
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground w-8 text-right">{item.total}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-4 pt-2 border-t mt-3">
                    <span className="flex items-center gap-1 text-xs"><span className="h-2 w-2 rounded-sm bg-green-400" />Approved</span>
                    <span className="flex items-center gap-1 text-xs"><span className="h-2 w-2 rounded-sm bg-amber-400" />Processing</span>
                    <span className="flex items-center gap-1 text-xs"><span className="h-2 w-2 rounded-sm bg-blue-400" />Applied</span>
                    <span className="flex items-center gap-1 text-xs"><span className="h-2 w-2 rounded-sm bg-red-400" />Rejected</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
