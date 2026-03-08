'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useApiQuery } from '@/hooks/use-api';
import { client, type ApiResponse } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface LoginHistoryEntry {
  id: string;
  createdAt: string;
  ipAddress: string;
  browser: string;
  os: string;
  device: string;
  status: 'success' | 'failed' | 'locked';
  country?: string;
  city?: string;
  failureReason?: string;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const statusConfig = {
  success: { label: 'Success', icon: CheckCircle2, className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { label: 'Failed', icon: XCircle, className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  locked: { label: 'Locked', icon: AlertTriangle, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
};

export default function LoginHistoryPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const { data: historyResponse, loading } = useApiQuery(
    () => client.get<ApiResponse<LoginHistoryEntry[]>>('/users/me/login-history', {
      params: {
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(dateFrom ? { fromDate: dateFrom } : {}),
        ...(dateTo ? { toDate: dateTo } : {}),
      },
    }),
    [statusFilter, dateFrom, dateTo],
  );

  const entries: LoginHistoryEntry[] = React.useMemo(() => {
    if (!historyResponse || !('data' in historyResponse)) return [];
    return (historyResponse.data as LoginHistoryEntry[]) ?? [];
  }, [historyResponse]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Login History</h1>
          <p className="text-muted-foreground mt-1">Review your recent login activity</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="locked">Locked</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
              placeholder="From date"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
              placeholder="To date"
            />
            {(statusFilter !== 'all' || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('all');
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Login Activity
          </CardTitle>
          <CardDescription>Your recent login attempts and their status</CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No login history found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Browser</TableHead>
                  <TableHead>OS / Device</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const config = statusConfig[entry.status] ?? statusConfig.success;
                  const StatusIcon = config.icon;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm">{formatDate(entry.createdAt)}</TableCell>
                      <TableCell className="font-mono text-sm">{entry.ipAddress ?? '-'}</TableCell>
                      <TableCell className="text-sm">{[entry.city, entry.country].filter(Boolean).join(', ') || '-'}</TableCell>
                      <TableCell className="text-sm">{entry.browser ?? '-'}</TableCell>
                      <TableCell className="text-sm">{[entry.os, entry.device].filter(Boolean).join(' / ') || '-'}</TableCell>
                      <TableCell>
                        <Badge className={cn('gap-1', config.className)}>
                          <StatusIcon className="h-3 w-3" />
                          {config.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
