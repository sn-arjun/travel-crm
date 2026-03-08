'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Plus, Search, Users, Trash2, MoreHorizontal,
  Loader, AlertCircle, Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { marketingApi, type MarketingSegment } from '@/lib/api/marketing';

function summarizeCriteria(criteria: Record<string, unknown>): string {
  const keys = Object.keys(criteria);
  if (keys.length === 0) return 'No criteria set';
  const parts: string[] = [];
  for (const key of keys.slice(0, 3)) {
    const val = criteria[key];
    if (typeof val === 'string') {
      parts.push(`${key}: ${val}`);
    } else if (Array.isArray(val)) {
      parts.push(`${key}: ${val.length} values`);
    } else {
      parts.push(key);
    }
  }
  if (keys.length > 3) parts.push(`+${keys.length - 3} more`);
  return parts.join(' | ');
}

export default function SegmentsPage() {
  const [search, setSearch] = React.useState('');
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  const { data: response, loading, error, refetch } = useApiQuery<any>(
    () => marketingApi.segments.list({ limit: 100, search: search || undefined }),
    [search],
  );

  const { mutate: deleteSegment, loading: deleting } = useApiMutation(
    (id: string) => marketingApi.segments.delete(id),
  );

  const segments: MarketingSegment[] = React.useMemo(() => {
    const data = response?.data;
    return Array.isArray(data) ? data : (data?.data ?? []);
  }, [response]);

  async function handleDelete() {
    if (!deleteId) return;
    const result = await deleteSegment(deleteId);
    if (result !== null) {
      toast.success('Segment deleted');
      refetch();
    } else {
      toast.error('Failed to delete segment');
    }
    setDeleteId(null);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Segments
          </h1>
          <p className="text-sm text-muted-foreground">{segments.length} segments</p>
        </div>
        <Button asChild>
          <Link href="/marketing/segments/new">
            <Plus className="h-4 w-4 mr-1.5" /> New Segment
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{segments.length}</p>
              <p className="text-xs text-muted-foreground">Total Segments</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-lg font-bold">
                {segments.reduce((sum, s) => sum + (s.contactCount || 0), 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Total Contacts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-lg font-bold">
                {segments.length > 0
                  ? Math.round(segments.reduce((sum, s) => sum + (s.contactCount || 0), 0) / segments.length)
                  : 0}
              </p>
              <p className="text-xs text-muted-foreground">Avg Contacts / Segment</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search segments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p>Failed to load segments</p>
          </div>
        ) : segments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Users className="h-10 w-10 opacity-50" />
            <p className="text-sm">No segments found</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/marketing/segments/new">Create your first segment</Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Criteria</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((segment) => (
                <TableRow key={segment.id} className="hover:bg-muted/50">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <span className="text-sm font-medium">{segment.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs text-muted-foreground max-w-xs truncate">
                      {summarizeCriteria(segment.criteria)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{segment.contactCount.toLocaleString()}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(segment.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem>Duplicate</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(segment.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Segment</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this segment? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
