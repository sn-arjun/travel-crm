'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Activity,
  Filter,
  Search,
  User,
  FileText,
  Settings,
  Trash2,
  Plus,
  Pencil,
  LogIn,
  LogOut,
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useApiQuery } from '@/hooks/use-api';
import { client, type ApiResponse, type PaginatedResponse } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { cn } from '@/lib/utils';

interface ActivityLogEntry {
  id: string;
  userId: string;
  userName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

const actionIcons: Record<string, React.ReactNode> = {
  create: <Plus className="h-3.5 w-3.5 text-green-600" />,
  update: <Pencil className="h-3.5 w-3.5 text-blue-600" />,
  delete: <Trash2 className="h-3.5 w-3.5 text-red-600" />,
  login: <LogIn className="h-3.5 w-3.5 text-purple-600" />,
  logout: <LogOut className="h-3.5 w-3.5 text-gray-600" />,
  view: <FileText className="h-3.5 w-3.5 text-gray-500" />,
  settings: <Settings className="h-3.5 w-3.5 text-amber-600" />,
};

const actionColors: Record<string, string> = {
  create: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  delete: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  login: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  logout: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function ActivityLogPage() {
  const router = useRouter();
  const [actionFilter, setActionFilter] = React.useState<string>('all');
  const [entityFilter, setEntityFilter] = React.useState<string>('all');
  const [search, setSearch] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [page, setPage] = React.useState(1);

  const { data: logsResponse, loading } = useApiQuery(
    () => client.get<ApiResponse<PaginatedResponse<ActivityLogEntry>>>(API_ENDPOINTS.activityLogs.list, {
      params: {
        page,
        limit: 25,
        ...(actionFilter !== 'all' ? { action: actionFilter } : {}),
        ...(entityFilter !== 'all' ? { entityType: entityFilter } : {}),
        ...(search ? { search } : {}),
        ...(dateFrom ? { fromDate: dateFrom } : {}),
        ...(dateTo ? { toDate: dateTo } : {}),
        sortBy: 'createdAt',
        sortOrder: 'desc',
      },
    }),
    [page, actionFilter, entityFilter, search, dateFrom, dateTo],
  );

  const entries: ActivityLogEntry[] = React.useMemo(() => {
    if (!logsResponse || !('data' in logsResponse)) return [];
    const d = logsResponse.data as any;
    return d?.data ?? d ?? [];
  }, [logsResponse]);

  const pagination = React.useMemo(() => {
    if (!logsResponse || !('data' in logsResponse)) return null;
    return (logsResponse.data as any)?.pagination ?? null;
  }, [logsResponse]);

  if (loading && page === 1) {
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
          <h1 className="text-3xl font-bold tracking-tight">Activity Log</h1>
          <p className="text-muted-foreground mt-1">Track all actions performed in the system</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search user or entity..."
                className="pl-9 w-56"
              />
            </div>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="logout">Logout</SelectItem>
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Entity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                <SelectItem value="contact">Contact</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="invoice">Invoice</SelectItem>
                <SelectItem value="task">Task</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="settings">Settings</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-36"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-36"
            />
            {(actionFilter !== 'all' || entityFilter !== 'all' || search || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActionFilter('all');
                  setEntityFilter('all');
                  setSearch('');
                  setDateFrom('');
                  setDateTo('');
                  setPage(1);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Activity Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No activity logs found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const initials = (entry.userName ?? 'U')
                      .split(' ')
                      .map((w) => w[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{entry.userName ?? entry.userId}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('gap-1 capitalize', actionColors[entry.action] ?? actionColors.update)}>
                            {actionIcons[entry.action] ?? actionIcons.view}
                            {entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="text-sm capitalize">{entry.entityType}</span>
                            {entry.entityName && (
                              <p className="text-xs text-muted-foreground">{entry.entityName}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {entry.details ?? '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{entry.ipAddress ?? '-'}</TableCell>
                        <TableCell className="text-sm">{formatDate(entry.createdAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
