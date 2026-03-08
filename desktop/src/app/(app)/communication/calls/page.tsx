'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Phone, PhoneOff, Search, Play, Download, MoreHorizontal,
  Plus, Clock, TrendingUp, AlertCircle, Loader,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

import { useApiQuery } from '@/hooks/use-api';
import { voipApi, type Call } from '@/lib/api/voip';

interface CallRecord extends Call {
  contactName: string;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function getInitials(name: string) {
  return name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function CallLogPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');

  const { data: response = {}, loading, error } = useApiQuery<any>(
    () => voipApi.calls.list({ direction: typeFilter !== 'all' ? (typeFilter === 'incoming' ? 'inbound' : 'outbound') : undefined }),
    [typeFilter],
  );

  const calls = ((response?.data ?? []) as Call[]);

  const filtered = React.useMemo(() => {
    if (!calls || !Array.isArray(calls)) return [];
    let result = [...calls];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c: any) => {
        const contactName = c.contactName || c.from || '';
        return contactName.toLowerCase().includes(q);
      });
    }
    return result;
  }, [calls, search]);

  // Calculate stats
  const stats = React.useMemo(() => {
    const totalDuration = filtered.reduce((sum: any, c: any) => sum + (c.duration ?? 0), 0);
    const missedCount = filtered.filter((c: any) => c.status === 'no_answer').length;
    const completedCount = filtered.filter((c: any) => c.status === 'completed').length;
    const avgDuration = completedCount > 0 ? Math.floor(totalDuration / completedCount) : 0;

    return {
      todayCount: filtered.length,
      avgDuration,
      missedCount,
    };
  }, [filtered]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Call Log
          </h1>
          <p className="text-sm text-muted-foreground">{filtered.length} calls</p>
        </div>
        <Button onClick={() => router.push('/communication/calls/dial')}>
          <Phone className="h-4 w-4 mr-1.5" /> Click to Call
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="px-6 py-4 border-b">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Calls Today</p>
                  <p className="text-2xl font-bold">{stats.todayCount}</p>
                </div>
                <Phone className="h-5 w-5 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Avg Duration</p>
                  <p className="text-2xl font-bold">{formatDuration(stats.avgDuration)}</p>
                </div>
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Missed Calls</p>
                  <p className="text-2xl font-bold">{stats.missedCount}</p>
                </div>
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by contact or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          <option value="all">All Types</option>
          <option value="incoming">Incoming</option>
          <option value="outgoing">Outgoing</option>
          <option value="missed">Missed</option>
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error || filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>{error ? 'Failed to load calls' : 'No calls found'}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Recording</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((call: any) => {
                const direction = call.direction ?? 'outbound';
                const callType = direction === 'inbound' ? 'incoming' : 'outgoing';
                const contactName = call.contactName || call.from || 'Unknown';
                const dateTime = new Date(call.startTime).toLocaleString('en-IN');
                return (
                  <TableRow key={call.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => {
                    const phoneNumber = call.direction === 'inbound' ? call.from : call.to;
                    if (phoneNumber) router.push(`/communication/calls/dial?phone=${encodeURIComponent(phoneNumber)}`);
                  }}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{getInitials(contactName)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{contactName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{dateTime}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          callType === 'incoming' && 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400',
                          callType === 'outgoing' && 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400',
                          call.status === 'no_answer' && 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400',
                        )}
                      >
                        {callType === 'incoming' && <Phone className="h-3 w-3 mr-1" />}
                        {callType === 'outgoing' && <Phone className="h-3 w-3 mr-1 rotate-180" />}
                        {call.status === 'no_answer' && <PhoneOff className="h-3 w-3 mr-1" />}
                        {callType.charAt(0).toUpperCase() + callType.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{formatDuration(call.duration ?? 0)}</TableCell>
                    <TableCell>
                      {call.recordingUrl ? (
                        <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                          <Play className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {call.recordingUrl && (
                            <DropdownMenuItem>
                              <Download className="h-3.5 w-3.5 mr-2" />
                              Download recording
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem>Edit notes</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
