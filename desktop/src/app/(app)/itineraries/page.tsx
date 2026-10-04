'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, MapPin, MoreHorizontal, FileText, Copy, Loader2, Trash2, Pencil, Eye, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterBar } from '@/components/domain/filter-bar';
import { cn } from '@/lib/utils';
import { useApiMutation } from '@/hooks/use-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { itinerariesApi } from '@/lib/api/itineraries';
import { useAuthStore } from '@/stores/auth-store';
import type { Itinerary } from '@travelcrm/shared';
import { toLocalDateString } from '@/lib/dates';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    expired: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };
  return <Badge variant="outline" className={cn('border-transparent text-[11px]', styles[status] ?? 'bg-slate-100 text-slate-700')}>{status}</Badge>;
}

export default function ItinerariesPage() {
  const router = useRouter();

  // RBAC: get user role from auth store
  const user = useAuthStore((s) => s.user);
  const role = (user as any)?.role ?? '';
  const canSeeCost = role === 'admin' || role === 'sales_manager' || role === 'manager';

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedItinerary, setSelectedItinerary] = React.useState<any>(null);

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      itinerariesApi.list({
        page,
        limit,
        search: search || undefined,
        status: statusFilter || undefined,
      }),
    [search, statusFilter],
  );

  const { items: itineraries, loading, loadingMore, hasMore, total, error, sentinelRef, refetch } = useInfiniteScroll({
    fetcher,
    limit: 30,
  });

  const { mutate: cloneItinerary, loading: cloneLoading } = useApiMutation(
    (id: string) => itinerariesApi.clone(id, {}).then(res => {
      if (res && typeof res === 'object' && 'data' in res) {
        return (res as any).data;
      }
      return res;
    }),
  );

  const { mutate: deleteItinerary, loading: deleteLoading } = useApiMutation(
    (id: string) => itinerariesApi.delete(id),
  );

  const [exporting, setExporting] = React.useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows: any[] = [];
      let page = 1;
      const limit = 100;
      // Walk every page of the current filtered query, not just what's loaded on screen
      while (true) {
        const res = await itinerariesApi.list({
          page,
          limit,
          search: search || undefined,
          status: statusFilter || undefined,
        });
        const data = (res as any)?.data;
        const items = Array.isArray(data) ? data : (data?.data ?? []);
        rows.push(...items);
        const total = data?.pagination?.total ?? items.length;
        if (rows.length >= total || items.length === 0) break;
        page += 1;
      }

      const header = ['Title', 'Client', 'Start Date', 'End Date', 'Duration', 'Status', 'Currency', 'Grand Total'];
      const csvRows = rows.map((it: any) => {
        const daysCount = it.daysCount ?? 0;
        return [
          it.title ?? '',
          it.contactName ?? '',
          it.startDate ?? '',
          it.endDate ?? '',
          `${daysCount}D/${Math.max(0, daysCount - 1)}N`,
          it.status ?? 'draft',
          it.currency ?? 'INR',
          String(it.grandTotal ?? it.totalSelling ?? 0),
        ];
      });
      const csv = [header, ...csvRows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `itineraries_export_${toLocalDateString(new Date())}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Itineraries exported successfully');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to export itineraries';
      toast.error(errorMsg);
    } finally {
      setExporting(false);
    }
  };

  const handleClone = async (id: string) => {
    try {
      await cloneItinerary(id);
      toast.success('Itinerary cloned successfully');
      refetch();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to clone itinerary';
      toast.error(errorMsg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this itinerary? This action cannot be undone.')) {
      return;
    }
    try {
      await deleteItinerary(id);
      toast.success('Itinerary deleted successfully');
      refetch();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete itinerary';
      toast.error(errorMsg);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Itineraries</h1>
          <p className="text-sm text-muted-foreground">{total} itineraries</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={exporting || total === 0}>
            {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
            Export
          </Button>
          <Link href="/itineraries/new">
            <Button><Plus className="h-4 w-4 mr-1.5" /> New Itinerary</Button>
          </Link>
        </div>
      </div>

      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search itineraries..."
          activeFilters={statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter }] : []}
          onRemoveFilter={() => setStatusFilter('')}
          onClearFilters={() => setStatusFilter('')}
          actions={
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          }
        />
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <p className="text-sm text-red-800 dark:text-red-200">
            {error.message ? `Error: ${error.message}` : 'Failed to load itineraries'}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!loading && itineraries.length === 0 && (
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title="No itineraries found"
            description={search || statusFilter ? 'Try adjusting your search or filters.' : 'Start building your first multi-day itinerary.'}
            action={
              <Link href="/itineraries/new">
                <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> Create Itinerary</Button>
              </Link>
            }
          />
        )}

        {!loading && itineraries.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Itinerary</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Duration</TableHead>
                {canSeeCost && <TableHead className="text-right">Cost</TableHead>}
                {canSeeCost && <TableHead className="text-right">Selling</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {itineraries.map((it: any) => {
                const daysCount = it.daysCount ?? 0;
                const totalCost = it.totalCost ?? 0;
                const totalSelling = it.totalSelling ?? it.grandTotal ?? 0;
                const currency = it.currency ?? 'INR';
                const currencySymbol = currency === 'INR' ? '\u20B9' : currency === 'USD' ? '$' : currency + ' ';

                return (
                  <TableRow
                    key={it.id}
                    className="cursor-pointer hover:bg-muted/50 group"
                    onClick={() => { setSelectedItinerary(it); setDrawerOpen(true); }}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{it.title}</p>
                        {it.leadTitle && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{it.leadTitle}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{it.contactName || 'N/A'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {it.startDate && it.endDate
                        ? `${new Date(it.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(it.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                        : it.createdAt
                        ? new Date(it.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                        : 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm">{daysCount}D/{Math.max(0, daysCount - 1)}N</TableCell>
                    {canSeeCost && (
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {currencySymbol}{totalCost.toLocaleString('en-IN')}
                      </TableCell>
                    )}
                    {canSeeCost && (
                      <TableCell className="text-right text-sm font-medium">
                        {currencySymbol}{totalSelling.toLocaleString('en-IN')}
                      </TableCell>
                    )}
                    <TableCell><StatusBadge status={it.status ?? 'draft'} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setSelectedItinerary(it); setDrawerOpen(true); }}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); router.push(`/itineraries/${it.id}/edit`); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/itineraries/${it.id}`); }}>
                              <FileText className="h-3.5 w-3.5 mr-2" />View Full Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleClone(it.id); }} disabled={cloneLoading}>
                              <Copy className="h-3.5 w-3.5 mr-2" />Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(it.id); }} disabled={deleteLoading} className="text-red-600">
                              <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />
        {loadingMore && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading more...</span>
          </div>
        )}
        {!hasMore && itineraries.length > 0 && (
          <p className="text-center text-xs text-muted-foreground py-4">All itineraries loaded</p>
        )}
      </div>

      {/* Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-[420px] sm:w-[500px]">
          {selectedItinerary && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6">{selectedItinerary.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={selectedItinerary.status ?? 'draft'} />
                  {selectedItinerary.currency && (
                    <Badge variant="outline" className="text-xs">{selectedItinerary.currency}</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Lead</p>
                    <p className="font-medium">{selectedItinerary.leadTitle || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Client</p>
                    <p className="font-medium">{selectedItinerary.contactName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Duration</p>
                    <p className="font-medium">{(selectedItinerary.daysCount ?? 0)}D/{Math.max(0, (selectedItinerary.daysCount ?? 0) - 1)}N</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Version</p>
                    <p className="font-medium">v{selectedItinerary.versionNumber ?? 1}</p>
                  </div>
                  {canSeeCost && (
                    <div>
                      <p className="text-muted-foreground">Cost</p>
                      <p className="font-mono font-medium">₹{(selectedItinerary.totalCost ?? 0).toLocaleString('en-IN')}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Grand Total</p>
                    <p className="font-mono font-semibold text-green-600">₹{(selectedItinerary.grandTotal ?? selectedItinerary.totalSelling ?? 0).toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-4 border-t">
                  <Button className="flex-1" onClick={() => { setDrawerOpen(false); router.push(`/itineraries/${selectedItinerary.id}`); }}>
                    <FileText className="h-4 w-4 mr-1.5" />Full View
                  </Button>
                  <Button variant="outline" onClick={() => { setDrawerOpen(false); router.push(`/itineraries/${selectedItinerary.id}/edit`); }}>
                    <Pencil className="h-4 w-4 mr-1.5" />Edit
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
