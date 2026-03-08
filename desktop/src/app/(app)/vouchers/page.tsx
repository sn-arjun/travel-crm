'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Eye, Pencil, Trash2, Send, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { FilterBar } from '@/components/domain/filter-bar';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { cn } from '@/lib/utils';
import { useApiMutation } from '@/hooks/use-api';
import { vouchersApi, type Voucher } from '@/lib/api/vouchers';

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    confirmed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Badge className={cn('border-transparent text-[11px]', styles[status] ?? 'bg-slate-100 text-slate-700')}>
      {label}
    </Badge>
  );
}

// ── Type badge ────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type?: string }) {
  const colors: Record<string, string> = {
    hotel: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    transport: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    flight: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    activity: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };
  const t = type ?? 'other';
  return (
    <Badge variant="outline" className={cn('border-transparent text-[11px]', colors[t] ?? 'bg-slate-100 text-slate-700')}>
      {t.charAt(0).toUpperCase() + t.slice(1)}
    </Badge>
  );
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell />
        </TableRow>
      ))}
    </>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function VoucherDrawer({
  voucher,
  open,
  onClose,
  onEdit,
  onDelete,
}: {
  voucher: Voucher | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!voucher) return null;

  const details = voucher.details ?? {};

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <TypeBadge type={voucher.type} />
            <span className="truncate">{voucher.title}</span>
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={voucher.status} />
              {voucher.leadName && (
                <span className="text-sm text-muted-foreground">Lead: {voucher.leadName}</span>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {/* Common info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {voucher.supplierName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Supplier</p>
                <p className="font-medium">{voucher.supplierName}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Language</p>
              <p className="font-medium">{voucher.language?.toUpperCase() ?? 'EN'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Created</p>
              <p className="font-medium">
                {new Date(voucher.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            {voucher.sentAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Sent</p>
                <p className="font-medium">
                  {new Date(voucher.sentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            )}
          </div>

          {/* Type-specific summary */}
          {voucher.type === 'hotel' && (
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3 text-sm space-y-1">
              <p className="font-semibold text-blue-800 dark:text-blue-300">{details.hotelName}</p>
              {details.checkIn && <p className="text-muted-foreground">Check-in: {details.checkIn}</p>}
              {details.checkOut && <p className="text-muted-foreground">Check-out: {details.checkOut}</p>}
              {details.roomType && <p className="text-muted-foreground">Room: {details.roomType}</p>}
              {details.guestNames?.length > 0 && (
                <p className="text-muted-foreground">Guests: {details.guestNames.join(', ')}</p>
              )}
            </div>
          )}

          {voucher.type === 'transport' && (
            <div className="bg-amber-50 dark:bg-amber-900/10 rounded-lg p-3 text-sm space-y-1">
              <p className="font-semibold text-amber-800 dark:text-amber-300">{details.vehicleType}</p>
              {details.pickupLocation && <p className="text-muted-foreground">From: {details.pickupLocation}</p>}
              {details.dropLocation && <p className="text-muted-foreground">To: {details.dropLocation}</p>}
              {details.pickupTime && <p className="text-muted-foreground">Pickup: {details.pickupTime}</p>}
              {details.driverName && <p className="text-muted-foreground">Driver: {details.driverName}</p>}
            </div>
          )}

          {voucher.type === 'flight' && (
            <div className="bg-violet-50 dark:bg-violet-900/10 rounded-lg p-3 text-sm space-y-1">
              <p className="font-semibold text-violet-800 dark:text-violet-300">{details.airline} {details.flightNumber}</p>
              {details.departureAirport && <p className="text-muted-foreground">{details.departureAirport} → {details.arrivalAirport}</p>}
              {details.departureTime && <p className="text-muted-foreground">Dep: {details.departureTime}</p>}
              {details.arrivalTime && <p className="text-muted-foreground">Arr: {details.arrivalTime}</p>}
              {details.pnr && <p className="text-muted-foreground">PNR: {details.pnr}</p>}
            </div>
          )}

          {voucher.type === 'activity' && (
            <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-3 text-sm space-y-1">
              <p className="font-semibold text-green-800 dark:text-green-300">{details.activityName}</p>
              {details.meetingPoint && <p className="text-muted-foreground">Meeting: {details.meetingPoint}</p>}
              {details.dateTime && <p className="text-muted-foreground">Date/Time: {details.dateTime}</p>}
              {details.duration && <p className="text-muted-foreground">Duration: {details.duration}</p>}
            </div>
          )}

          {voucher.notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{voucher.notes}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <Button asChild className="flex-1">
            <Link href={`/vouchers/${voucher.id}`}><Eye className="h-4 w-4 mr-1.5" /> View Full</Link>
          </Button>
          {voucher.status === 'draft' && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-1.5" /> Edit
            </Button>
          )}
          <Button variant="outline" onClick={onDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function VouchersPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [selectedVoucher, setSelectedVoucher] = React.useState<Voucher | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Voucher | null>(null);

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchVouchers = React.useCallback(
    (page: number, limit: number) =>
      vouchersApi.list({
        page,
        limit,
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
      }),
    [debouncedSearch, statusFilter, typeFilter],
  );

  const { items: vouchers, loading, loadingMore, hasMore, total, error, sentinelRef, refetch } =
    useInfiniteScroll<Voucher>({ fetcher: fetchVouchers, limit: 25 });

  // Stat counts
  const stats = React.useMemo(() => {
    const counts = { total, draft: 0, sent: 0, confirmed: 0 };
    vouchers.forEach((v) => {
      if (v.status === 'draft') counts.draft++;
      else if (v.status === 'sent') counts.sent++;
      else if (v.status === 'confirmed') counts.confirmed++;
    });
    return counts;
  }, [vouchers, total]);

  const deleteMutation = useApiMutation<string, any>((id) => vouchersApi.delete(id));

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteMutation.mutate(deleteTarget.id);
    if (result !== undefined) {
      toast.success('Voucher deleted');
      setDeleteTarget(null);
      setDrawerOpen(false);
      refetch();
    } else {
      toast.error(deleteMutation.error?.message ?? 'Failed to delete');
    }
  };

  const openDrawer = (v: Voucher) => {
    setSelectedVoucher(v);
    setDrawerOpen(true);
  };

  // Active filter tags
  const activeFilters = [
    ...(typeFilter !== 'all' ? [{ id: 'type', label: `Type: ${typeFilter}`, value: typeFilter }] : []),
    ...(statusFilter !== 'all' ? [{ id: 'status', label: `Status: ${statusFilter}`, value: statusFilter }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Vouchers
            {total > 0 && (
              <span className="ml-2 text-base font-normal text-muted-foreground">({total})</span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">Manage hotel, transport, flight & activity vouchers</p>
        </div>
        <Link href="/vouchers/new">
          <Button><Plus className="h-4 w-4 mr-1.5" /> New Voucher</Button>
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="flex items-center gap-4 px-6 py-3 border-b bg-muted/30">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground' },
          { label: 'Draft', value: stats.draft, color: 'text-slate-600 dark:text-slate-400' },
          { label: 'Sent', value: stats.sent, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Confirmed', value: stats.confirmed, color: 'text-green-600 dark:text-green-400' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{s.label}:</span>
            <span className={cn('font-semibold', s.color)}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="px-6 py-3 border-b flex items-center gap-3">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search vouchers..."
          activeFilters={activeFilters}
          onRemoveFilter={(id) => {
            if (id === 'type') setTypeFilter('all');
            if (id === 'status') setStatusFilter('all');
          }}
          onClearFilters={() => { setTypeFilter('all'); setStatusFilter('all'); }}
          className="flex-1"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="hotel">Hotel</SelectItem>
            <SelectItem value="transport">Transport</SelectItem>
            <SelectItem value="flight">Flight</SelectItem>
            <SelectItem value="activity">Activity</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">Could not load vouchers — check your connection</p>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-28 text-right pr-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <SkeletonRows />}

            {!loading && vouchers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-10 w-10 text-muted-foreground/40" />
                    <p className="text-muted-foreground font-medium">No vouchers found</p>
                    <p className="text-sm text-muted-foreground">Create your first voucher to get started</p>
                    <Link href="/vouchers/new" className="mt-2">
                      <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> New Voucher</Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {vouchers.map((voucher) => (
              <TableRow
                key={voucher.id}
                className="cursor-pointer group"
                onClick={() => openDrawer(voucher)}
              >
                <TableCell className="font-medium text-sm max-w-[200px] truncate">{voucher.title}</TableCell>
                <TableCell><TypeBadge type={voucher.type} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{voucher.leadName ?? '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{voucher.supplierName ?? '—'}</TableCell>
                <TableCell><StatusBadge status={voucher.status} /></TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(voucher.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </TableCell>
                <TableCell className="text-right pr-4">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost" size="icon-sm"
                      onClick={(e) => { e.stopPropagation(); router.push(`/vouchers/${voucher.id}`); }}
                      title="View"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {voucher.status === 'draft' && (
                      <Button
                        variant="ghost" size="icon-sm"
                        onClick={(e) => { e.stopPropagation(); router.push(`/vouchers/${voucher.id}/edit`); }}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="icon-sm"
                      onClick={(e) => { e.stopPropagation(); router.push(`/vouchers/${voucher.id}`); }}
                      title="Send"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon-sm"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(voucher); }}
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {loadingMore && (
              <TableRow>
                <TableCell colSpan={7} className="py-4 text-center text-sm text-muted-foreground">
                  Loading more vouchers…
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />
      </div>

      {/* Detail Drawer */}
      <VoucherDrawer
        voucher={selectedVoucher}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEdit={() => {
          setDrawerOpen(false);
          if (selectedVoucher) router.push(`/vouchers/${selectedVoucher.id}/edit`);
        }}
        onDelete={() => {
          setDrawerOpen(false);
          if (selectedVoucher) setDeleteTarget(selectedVoucher);
        }}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Voucher?</DialogTitle>
            <DialogDescription>
              This will permanently delete &quot;{deleteTarget?.title}&quot;. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
