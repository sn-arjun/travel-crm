'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Users, Trash2, Pencil, Eye, MoreHorizontal, Loader2, Calendar,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { FilterBar } from '@/components/domain/filter-bar';
import { toast } from 'sonner';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useApiMutation } from '@/hooks/use-api';
import { marketingApi, type MarketingSegment } from '@/lib/api/marketing';

function summarizeCriteria(criteria: Record<string, unknown> | null | undefined): string {
  if (!criteria) return 'No criteria set';
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
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [drawerSegment, setDrawerSegment] = React.useState<MarketingSegment | null>(null);

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      marketingApi.segments.list({ page, limit, search: search || undefined }),
    [search],
  );

  const { items: segments, loading, loadingMore, total, error, sentinelRef, refetch } = useInfiniteScroll<MarketingSegment>({
    fetcher,
    limit: 25,
  });

  const { mutate: deleteSegment, loading: deleting } = useApiMutation(
    (id: string) => marketingApi.segments.delete(id),
  );

  async function handleDelete() {
    if (!deleteId) return;
    const result = await deleteSegment(deleteId);
    if (result !== null) {
      toast.success('Segment deleted');
      refetch();
      if (drawerSegment?.id === deleteId) setDrawerSegment(null);
    } else {
      toast.error('Failed to delete segment');
    }
    setDeleteId(null);
  }

  const totalContacts = segments.reduce((sum, s) => sum + (s.contactCount || 0), 0);
  const avgContacts = segments.length > 0 ? Math.round(totalContacts / segments.length) : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Segments
          </h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '...' : `${total} segments`}
          </p>
        </div>
        <Button asChild>
          <Link href="/marketing/segments/new">
            <Plus className="h-4 w-4 mr-1.5" /> New Segment
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b">
        {loading ? (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{total}</p>
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
                  <p className="text-lg font-bold">{totalContacts.toLocaleString()}</p>
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
                  <p className="text-lg font-bold">{avgContacts.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Avg Contacts / Segment</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* FilterBar */}
      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search segments..."
          activeFilters={[]}
          onRemoveFilter={() => {}}
          onClearFilters={() => {}}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <p className="text-sm">Failed to load segments</p>
            <Button variant="outline" size="sm" onClick={refetch}>Retry</Button>
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
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Criteria</TableHead>
                  <TableHead>Contacts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {segments.map((segment) => (
                  <TableRow
                    key={segment.id}
                    className="hover:bg-muted/50 cursor-pointer group"
                    onClick={() => setDrawerSegment(segment)}
                  >
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
                      <Badge variant="secondary">{(segment.contactCount ?? 0).toLocaleString()}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(segment.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDrawerSegment(segment)}
                          title="View"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => router.push(`/marketing/segments/${segment.id}/edit`)}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/marketing/segments/${segment.id}/edit`}>
                                <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/campaigns/new?segmentId=${segment.id}&segmentName=${encodeURIComponent(segment.name)}`}>
                                <Send className="h-3.5 w-3.5 mr-2" /> Use in Campaign
                              </Link>
                            </DropdownMenuItem>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              {loadingMore && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
          </>
        )}
      </div>

      {/* Detail Drawer */}
      <Sheet open={!!drawerSegment} onOpenChange={(open) => { if (!open) setDrawerSegment(null); }}>
        <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
          {drawerSegment && (
            <>
              <SheetHeader>
                <SheetTitle>{drawerSegment.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border p-4">
                  <p className="text-3xl font-bold text-primary">{(drawerSegment.contactCount ?? 0).toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Contacts matched</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium mb-2">Filter Criteria</p>
                  <p className="text-sm">{summarizeCriteria(drawerSegment.criteria)}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(drawerSegment.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <Separator />
                <div className="flex flex-col gap-2">
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/marketing/segments/${drawerSegment.id}/edit`}>
                      <Pencil className="h-4 w-4 mr-2" /> Edit Segment
                    </Link>
                  </Button>
                  <Button asChild className="w-full">
                    <Link href={`/campaigns/new?segmentId=${drawerSegment.id}&segmentName=${encodeURIComponent(drawerSegment.name)}`}>
                      <Send className="h-4 w-4 mr-2" /> Use in Campaign
                    </Link>
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => { setDeleteId(drawerSegment.id); setDrawerSegment(null); }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete Segment
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

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
