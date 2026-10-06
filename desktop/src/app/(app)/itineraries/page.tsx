'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, MapPin, MoreHorizontal, FileText, Copy, Loader2, Trash2, Pencil, Eye, Download, LayoutTemplate } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { FilterBar } from '@/components/domain/filter-bar';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';
import { cn, formatCurrency } from '@/lib/utils';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { itinerariesApi, errorMessage } from '@/lib/api/itineraries';
import { unwrapList } from '@/lib/api/envelope';
import { useAuthStore } from '@/stores/auth-store';
import { formatDisplayDate, toLocalDateString } from '@/lib/dates';

/** One row of GET /itineraries. */
interface ItineraryRow {
  id: string;
  title: string;
  status?: string;
  currency?: string;
  leadTitle?: string | null;
  contactName?: string | null;
  daysCount?: number;
  totalCost?: number;
  totalSelling?: number;
  grandTotal?: number;
  versionNumber?: number;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-ds-surface-sunken text-ds-foreground-muted',
  sent: 'bg-ds-info-subtle text-ds-info-on-subtle',
  approved: 'bg-ds-success-subtle text-ds-success-on-subtle',
  rejected: 'bg-ds-danger-subtle text-ds-danger-on-subtle',
  expired: 'bg-ds-warning-subtle text-ds-warning-on-subtle',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('border-transparent text-xs', STATUS_STYLES[status] ?? STATUS_STYLES.draft)}>
      {status}
    </Badge>
  );
}

function durationLabel(daysCount: number | undefined): string {
  const days = daysCount ?? 0;
  return `${days}D/${Math.max(0, days - 1)}N`;
}

export default function ItinerariesPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();

  // RBAC: get user role from auth store
  const role = useAuthStore((s) => s.user?.role ?? '') as string;
  const canSeeCost = role === 'admin' || role === 'sales_manager' || role === 'manager';

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedItinerary, setSelectedItinerary] = React.useState<ItineraryRow | null>(null);
  const [cloneLoading, setCloneLoading] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

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

  const { items: itineraries, loading, loadingMore, hasMore, total, error, sentinelRef, refetch } = useInfiniteScroll<ItineraryRow>({
    fetcher,
    limit: 30,
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows: ItineraryRow[] = [];
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
        const { data: items, pagination } = unwrapList<ItineraryRow>(res);
        rows.push(...items);
        const rowTotal = pagination?.total ?? items.length;
        if (rows.length >= rowTotal || items.length === 0) break;
        page += 1;
      }

      const header = ['Title', 'Client', 'Start Date', 'End Date', 'Duration', 'Status', 'Currency', 'Grand Total'];
      const csvRows = rows.map((it) => [
        it.title ?? '',
        it.contactName ?? '',
        it.startDate ?? '',
        it.endDate ?? '',
        durationLabel(it.daysCount),
        it.status ?? 'draft',
        it.currency ?? 'INR',
        String(it.grandTotal ?? it.totalSelling ?? 0),
      ]);
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
      toast.error(errorMessage(err, 'Failed to export itineraries'));
    } finally {
      setExporting(false);
    }
  };

  const handleClone = async (id: string) => {
    setCloneLoading(true);
    try {
      await itinerariesApi.clone(id, {});
      toast.success('Itinerary cloned successfully');
      refetch();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to clone itinerary'));
    } finally {
      setCloneLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Delete itinerary',
      description: 'Delete this itinerary? This action cannot be undone.',
      tone: 'destructive',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDeleteLoading(true);
    try {
      await itinerariesApi.delete(id);
      toast.success('Itinerary deleted successfully');
      refetch();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete itinerary'));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Itineraries"
        description={`${total} itineraries`}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push('/itineraries/templates')}>
              <LayoutTemplate className="size-4 mr-1.5" aria-hidden="true" /> Templates
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={exporting || total === 0}>
              {exporting ? <Loader2 className="size-4 mr-1.5 animate-spin" aria-hidden="true" /> : <Download className="size-4 mr-1.5" aria-hidden="true" />}
              Export
            </Button>
            <Link href="/itineraries/new">
              <Button><Plus className="size-4 mr-1.5" aria-hidden="true" /> New Itinerary</Button>
            </Link>
          </>
        }
      />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search itineraries..."
        activeFilters={statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter }] : []}
        onRemoveFilter={() => setStatusFilter('')}
        onClearFilters={() => setStatusFilter('')}
        actions={
          <select
            aria-label="Filter by status"
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

      {error && (
        <div role="alert" data-testid="list-error" className="rounded-md bg-ds-danger-subtle px-ds-4 py-ds-3">
          <p className="text-sm text-ds-danger-on-subtle">
            {error.message ? `Error: ${error.message}` : 'Failed to load itineraries'}
          </p>
        </div>
      )}

      <div>
        {loading && (
          <div className="space-y-ds-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!loading && itineraries.length === 0 && (
          <EmptyState
            icon={<FileText className="size-8" aria-hidden="true" />}
            title="No itineraries found"
            description={search || statusFilter ? 'Try adjusting your search or filters.' : 'Start building your first multi-day itinerary.'}
            action={
              <Link href="/itineraries/new">
                <Button variant="outline" size="sm"><Plus className="size-4 mr-1" aria-hidden="true" /> Create Itinerary</Button>
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
                <TableHead>Created</TableHead>
                <TableHead>Duration</TableHead>
                {canSeeCost && <TableHead className="text-right">Cost</TableHead>}
                {canSeeCost && <TableHead className="text-right">Selling</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itineraries.map((it) => {
                const currency = it.currency ?? 'INR';
                const totalCost = it.totalCost ?? 0;
                const totalSelling = it.totalSelling ?? it.grandTotal ?? 0;

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
                          <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="size-3" aria-hidden="true" />{it.leadTitle}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{it.contactName || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {it.createdAt ? formatDisplayDate(it.createdAt, 'short') : '—'}
                    </TableCell>
                    <TableCell className="text-sm">{durationLabel(it.daysCount)}</TableCell>
                    {canSeeCost && (
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatCurrency(totalCost, currency)}
                      </TableCell>
                    )}
                    {canSeeCost && (
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(totalSelling, currency)}
                      </TableCell>
                    )}
                    <TableCell><StatusBadge status={it.status ?? 'draft'} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon-sm" aria-label="Preview" onClick={(e) => { e.stopPropagation(); setSelectedItinerary(it); setDrawerOpen(true); }}>
                          <Eye className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={(e) => { e.stopPropagation(); router.push(`/itineraries/${it.id}/edit`); }}>
                          <Pencil className="size-3.5" aria-hidden="true" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="More actions" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="size-4" aria-hidden="true" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/itineraries/${it.id}`); }}>
                              <FileText className="size-3.5 mr-2" aria-hidden="true" />View Full Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void handleClone(it.id); }} disabled={cloneLoading}>
                              <Copy className="size-3.5 mr-2" aria-hidden="true" />Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); void handleDelete(it.id); }} disabled={deleteLoading}>
                              <Trash2 className="size-3.5 mr-2" aria-hidden="true" />Delete
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
          <div className="flex items-center justify-center py-ds-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="ml-2 text-sm text-muted-foreground">Loading more...</span>
          </div>
        )}
        {!hasMore && itineraries.length > 0 && (
          <p className="text-center text-xs text-muted-foreground py-ds-4">All itineraries loaded</p>
        )}
      </div>

      {confirmDialog}

      {/* Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          {selectedItinerary && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6">{selectedItinerary.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-ds-4 px-ds-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={selectedItinerary.status ?? 'draft'} />
                  {selectedItinerary.currency && (
                    <Badge variant="outline" className="text-xs">{selectedItinerary.currency}</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-ds-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Lead</p>
                    <p className="font-medium">{selectedItinerary.leadTitle || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Client</p>
                    <p className="font-medium">{selectedItinerary.contactName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Duration</p>
                    <p className="font-medium">{durationLabel(selectedItinerary.daysCount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Version</p>
                    <p className="font-medium">v{selectedItinerary.versionNumber ?? 1}</p>
                  </div>
                  {canSeeCost && (
                    <div>
                      <p className="text-muted-foreground">Cost</p>
                      <p className="font-mono font-medium">{formatCurrency(selectedItinerary.totalCost ?? 0, selectedItinerary.currency ?? 'INR')}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Grand Total</p>
                    <p className="font-mono font-semibold text-ds-success">
                      {formatCurrency(selectedItinerary.grandTotal ?? selectedItinerary.totalSelling ?? 0, selectedItinerary.currency ?? 'INR')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 pt-4 border-t border-ds-border">
                  <Button className="flex-1" onClick={() => { setDrawerOpen(false); router.push(`/itineraries/${selectedItinerary.id}`); }}>
                    <FileText className="size-4 mr-1.5" aria-hidden="true" />Full View
                  </Button>
                  <Button variant="outline" onClick={() => { setDrawerOpen(false); router.push(`/itineraries/${selectedItinerary.id}/edit`); }}>
                    <Pencil className="size-4 mr-1.5" aria-hidden="true" />Edit
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
