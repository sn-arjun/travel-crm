'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Eye, Pencil, Trash2, AlertCircle, Loader2,
  CheckCircle2, Clock, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterBar } from '@/components/domain/filter-bar';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useApiMutation } from '@/hooks/use-api';
import { visaApi, type VisaRecord } from '@/lib/api/visa';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const STATUS_OPTIONS = [
  { label: 'All Status', value: 'all' },
  { label: 'Not Started', value: 'not_started' },
  { label: 'Documents Collecting', value: 'documents_collecting' },
  { label: 'Applied', value: 'applied' },
  { label: 'Processing', value: 'processing' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

const STATUS_COLOR: Record<string, string> = {
  not_started: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  documents_collecting: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  applied: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  processing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  collected: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
};

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not Started',
  documents_collecting: 'Docs Collecting',
  applied: 'Applied',
  processing: 'Processing',
  approved: 'Approved',
  rejected: 'Rejected',
  collected: 'Collected',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn('border-transparent text-xs font-medium', STATUS_COLOR[status] ?? STATUS_COLOR.applied)}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export default function VisaTrackingPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [selectedVisa, setSelectedVisa] = React.useState<VisaRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<VisaRecord | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetcher = React.useCallback(
    (page: number, limit: number) => visaApi.list({
      page, limit,
      search: debouncedSearch || undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
    }),
    [debouncedSearch, statusFilter],
  );

  const {
    items: visaApplications,
    loading,
    loadingMore,
    total,
    error,
    sentinelRef,
    refetch,
  } = useInfiniteScroll<VisaRecord>({ fetcher, limit: 20 });

  const { mutate: deleteVisa, loading: isDeleting } = useApiMutation<string, any>(
    (id) => visaApi.delete(id),
  );

  async function handleDelete(v: VisaRecord) {
    const result = await deleteVisa(v.id);
    if (result !== undefined) {
      toast.success('Visa record deleted');
      setDeleteTarget(null);
      refetch();
    } else {
      toast.error('Failed to delete visa record');
    }
  }

  // Quick stats from loaded items
  const inProgress = visaApplications.filter((v) => v.status === 'processing' || v.status === 'applied').length;
  const approved = visaApplications.filter((v) => v.status === 'approved').length;

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-600">Failed to load visa applications</p>
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Visa Tracking</h1>
          <p className="text-sm text-muted-foreground">{total} applications</p>
        </div>
        <Button asChild>
          <Link href="/visa/new"><Plus className="h-4 w-4 mr-1.5" />New Application</Link>
        </Button>
      </div>

      {/* Quick stats */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 px-6 py-3 border-b">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                  <p className="text-xl font-bold">{inProgress}</p>
                </div>
                <Clock className="h-5 w-5 text-amber-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Approved</p>
                  <p className="text-xl font-bold">{approved}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-green-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Loaded</p>
                  <p className="text-xl font-bold">{visaApplications.length}</p>
                </div>
                <FileText className="h-5 w-5 text-blue-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by destination..."
          actions={
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Traveller</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && (
        <div className="flex-1 overflow-auto">
          {visaApplications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground/40" />
              <div>
                <p className="text-base font-medium">No visa applications found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {debouncedSearch || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first visa application'}
                </p>
              </div>
              {!debouncedSearch && statusFilter === 'all' && (
                <Button asChild><Link href="/visa/new"><Plus className="h-4 w-4 mr-1.5" />New Application</Link></Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Traveller</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visaApplications.map((visa) => (
                  <TableRow
                    key={visa.id}
                    className="group cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/visa/${visa.id}`)}
                  >
                    <TableCell className="font-medium text-sm">{visa.travellerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{visa.countryName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{visa.visaType ?? 'N/A'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {visa.applicationDate
                        ? new Date(visa.applicationDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'N/A'}
                    </TableCell>
                    <TableCell><StatusBadge status={visa.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost" size="icon-sm"
                          onClick={(e) => { e.stopPropagation(); setSelectedVisa(visa); }}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon-sm"
                          onClick={(e) => { e.stopPropagation(); router.push(`/visa/${visa.id}`); }}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(visa); }}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div ref={sentinelRef} className="h-4" />
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      {/* Detail Drawer */}
      <Sheet open={!!selectedVisa} onOpenChange={(open) => !open && setSelectedVisa(null)}>
        <SheetContent className="w-[400px] sm:w-[480px]">
          {selectedVisa && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  {selectedVisa.travellerName}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Destination</p>
                    <p className="font-medium">{selectedVisa.countryName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Visa Type</p>
                    <p className="font-medium">{selectedVisa.visaType || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Status</p>
                    <StatusBadge status={selectedVisa.status} />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Applied</p>
                    <p className="font-medium">
                      {selectedVisa.applicationDate
                        ? new Date(selectedVisa.applicationDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Expiry</p>
                    <p className="font-medium">
                      {selectedVisa.expiryDate
                        ? new Date(selectedVisa.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Passport</p>
                    <p className="font-mono text-xs">{selectedVisa.passportNumber}</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button className="flex-1" onClick={() => { router.push(`/visa/${selectedVisa.id}`); setSelectedVisa(null); }}>
                    View Details
                  </Button>
                  <Button variant="outline" className="text-destructive" onClick={() => { setDeleteTarget(selectedVisa); setSelectedVisa(null); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Visa Record</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete the visa record for <strong>{deleteTarget?.travellerName}</strong> to <strong>{deleteTarget?.countryName}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget)} disabled={isDeleting}>
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
