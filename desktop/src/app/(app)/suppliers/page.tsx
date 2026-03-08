'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Star, Eye, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FilterBar } from '@/components/domain/filter-bar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { suppliersApi } from '@/lib/api/suppliers';
import { toast } from 'sonner';

function getInitials(name: string) {
  return name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function SuppliersPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [preferredFilter, setPreferredFilter] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const fetcher = React.useCallback(
    (p: number, limit: number) =>
      suppliersApi.list({
        page: p,
        limit,
        search: search || undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        isPreferred: preferredFilter || undefined,
      }),
    [search, categoryFilter, statusFilter, preferredFilter],
  );

  const { items: suppliers, loading, loadingMore, total, error, sentinelRef, refetch } = useInfiniteScroll({
    fetcher,
    limit: 30,
  });

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await suppliersApi.delete(id);
      toast.success('Supplier deleted');
      setDeleteId(null);
      refetch();
    } catch {
      toast.error('Failed to delete supplier');
    } finally {
      setDeleting(false);
    }
  }

  const activeFilterBadges = React.useMemo(() => {
    const badges: { id: string; label: string; value: string }[] = [];
    if (categoryFilter !== 'all') badges.push({ id: 'category', label: 'Category', value: categoryFilter.replace(/_/g, ' ') });
    if (statusFilter !== 'all') badges.push({ id: 'status', label: 'Status', value: statusFilter });
    if (preferredFilter) badges.push({ id: 'preferred', label: 'Preferred', value: 'Yes' });
    return badges;
  }, [categoryFilter, statusFilter, preferredFilter]);

  function removeFilter(id: string) {
    if (id === 'category') setCategoryFilter('all');
    if (id === 'status') setStatusFilter('all');
    if (id === 'preferred') setPreferredFilter(false);
  }

  function clearFilters() {
    setCategoryFilter('all');
    setStatusFilter('all');
    setPreferredFilter(false);
    setSearch('');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Suppliers {total > 0 && <span className="text-sm font-normal text-muted-foreground ml-1">({total})</span>}
          </h1>
          <p className="text-sm text-muted-foreground">Manage your supplier network</p>
        </div>
        <Button asChild>
          <Link href="/suppliers/new"><Plus className="h-4 w-4 mr-1.5" /> Add Supplier</Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search suppliers..."
          activeFilters={activeFilterBadges}
          onRemoveFilter={removeFilter}
          onClearFilters={clearFilters}
          actions={
            <div className="flex items-center gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="hotel">Hotel</SelectItem>
                  <SelectItem value="airline">Airline</SelectItem>
                  <SelectItem value="transport">Transport</SelectItem>
                  <SelectItem value="activity_provider">Activity Provider</SelectItem>
                  <SelectItem value="guide">Guide</SelectItem>
                  <SelectItem value="visa_agent">Visa Agent</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32 h-9"><SelectValue placeholder="All status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant={preferredFilter ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreferredFilter((v) => !v)}
                className="h-9"
              >
                <Star className={`h-3.5 w-3.5 mr-1.5 ${preferredFilter ? 'fill-current' : ''}`} />
                Preferred
              </Button>
            </div>
          }
        />
      </div>

      {error && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">Connect to backend for live data</p>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : suppliers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Star className="h-12 w-12 opacity-20" />
            <p className="text-lg font-medium">No suppliers found</p>
            <p className="text-sm">Add your first supplier to get started</p>
            <Button asChild className="mt-2">
              <Link href="/suppliers/new"><Plus className="h-4 w-4 mr-1.5" /> Add Supplier</Link>
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((sup: any) => (
                  <TableRow
                    key={sup.id}
                    className="cursor-pointer hover:bg-muted/50 group"
                    onClick={() => router.push(`/suppliers/${sup.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{getInitials(sup.company_name || sup.name || '')}</AvatarFallback>
                        </Avatar>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{sup.company_name || sup.name}</span>
                          {(sup.is_preferred || sup.isPreferred) && (
                            <Star className="h-3.5 w-3.5 text-amber-500 fill-current" aria-label="Preferred" />
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {(sup.category ?? 'other').replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{sup.contact_person || sup.contactPerson || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{sup.email ?? '—'}</TableCell>
                    <TableCell className="text-sm">{sup.phone ?? '—'}</TableCell>
                    <TableCell className="text-sm">
                      {sup.rating ? (
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-500 fill-current" />
                          {sup.rating}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={sup.status === 'inactive' ? 'secondary' : 'outline'}
                        className={sup.status !== 'inactive' ? 'text-green-700 border-green-300 bg-green-50 dark:bg-green-900/20' : ''}
                      >
                        {sup.status ?? 'active'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="View"
                          onClick={(e) => { e.stopPropagation(); router.push(`/suppliers/${sup.id}`); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Edit"
                          onClick={(e) => { e.stopPropagation(); router.push(`/suppliers/${sup.id}/edit`); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Delete"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(sup.id); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div ref={sentinelRef} className="h-4" />
            {loadingMore && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading more...</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Supplier</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this supplier? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && handleDelete(deleteId)}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
