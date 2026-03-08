'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, MapPin, MoreHorizontal, FileText, Copy, Loader2, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useApiMutation } from '@/hooks/use-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { itinerariesApi } from '@/lib/api/itineraries';
import { useAuthStore } from '@/stores/auth-store';
import type { Itinerary } from '@travelcrm/shared';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
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
  const [statusFilter, setStatusFilter] = React.useState('all');

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      itinerariesApi.list({
        page,
        limit,
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
    [search, statusFilter],
  );

  const { items: itineraries, loading, loadingMore, hasMore, total, error, sentinelRef, refetch } = useInfiniteScroll({
    fetcher,
    limit: 30,
  });

  const { mutate: cloneItinerary, loading: cloneLoading } = useApiMutation(
    (id: string) => itinerariesApi.clone(id).then(res => {
      if (res && typeof res === 'object' && 'data' in res) {
        return (res as any).data;
      }
      return res;
    }),
  );

  const { mutate: deleteItinerary, loading: deleteLoading } = useApiMutation(
    (id: string) => itinerariesApi.delete(id),
  );

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
        <Link href="/itineraries/new">
          <Button><Plus className="h-4 w-4 mr-1.5" /> New Itinerary</Button>
        </Link>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search itineraries..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="All status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
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
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && (
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
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/itineraries/${it.id}`)}
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/itineraries/${it.id}`); }}>
                            <FileText className="h-3.5 w-3.5 mr-2" />View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/itineraries/${it.id}/edit`); }}>
                            <Pencil className="h-3.5 w-3.5 mr-2" />Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleClone(it.id); }} disabled={cloneLoading}>
                            <Copy className="h-3.5 w-3.5 mr-2" />Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDelete(it.id); }} disabled={deleteLoading} className="text-red-600">
                            <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {itineraries.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={canSeeCost ? 8 : 6} className="text-center py-12">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm text-muted-foreground">No itineraries found</p>
                    <Link href="/itineraries/new">
                      <Button variant="outline" size="sm" className="mt-3"><Plus className="h-4 w-4 mr-1" /> Create Itinerary</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              )}
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
    </div>
  );
}
