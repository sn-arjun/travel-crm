'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Eye, Pencil, Trash2, User, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FilterBar } from '@/components/domain/filter-bar';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useApiMutation } from '@/hooks/use-api';
import { travellersApi, type Traveller } from '@/lib/api/visa';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

function getInitials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

function normalizeTraveller(t: any): Traveller {
  return {
    ...t,
    firstName: t.firstName ?? t.first_name ?? '',
    lastName: t.lastName ?? t.last_name ?? '',
    passportNumber: t.passportNumber ?? t.passport_number ?? '',
    nationality: t.nationality,
    dateOfBirth: t.dateOfBirth ?? t.date_of_birth,
    passportExpiryDate: t.passportExpiryDate ?? t.passport_expiry_date,
    email: t.email,
    phone: t.phone,
  };
}

function passportExpiryColor(expiry?: string) {
  if (!expiry) return '';
  const diff = new Date(expiry).getTime() - Date.now();
  if (diff < 0) return 'text-red-600 font-semibold';
  if (diff < 180 * 24 * 60 * 60 * 1000) return 'text-amber-600 font-semibold';
  return 'text-green-600';
}

function ExpiryBadge({ expiry }: { expiry?: string }) {
  if (!expiry) return <span className="text-muted-foreground text-sm">N/A</span>;
  const diff = new Date(expiry).getTime() - Date.now();
  const label = new Date(expiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (diff < 0) return <span className="text-sm text-red-600 font-semibold">{label} <Badge className="text-[10px] ml-1 bg-red-100 text-red-700 border-transparent">Expired</Badge></span>;
  if (diff < 180 * 86400000) return <span className="text-sm text-amber-600 font-semibold">{label} <Badge className="text-[10px] ml-1 bg-amber-100 text-amber-700 border-transparent">Expiring</Badge></span>;
  return <span className="text-sm text-green-600">{label}</span>;
}

const STATUS_OPTIONS = [
  { label: 'All', value: 'all' },
];

export default function TravellersPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [selectedTraveller, setSelectedTraveller] = React.useState<Traveller | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Traveller | null>(null);

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetcher = React.useCallback(
    (page: number, limit: number) => travellersApi.list({ page, limit, search: debouncedSearch || undefined }),
    [debouncedSearch],
  );

  const {
    items: travellers,
    loading,
    loadingMore,
    total,
    error,
    sentinelRef,
    refetch,
  } = useInfiniteScroll<Traveller>({ fetcher, limit: 20 });

  const { mutate: deleteTraveller, loading: isDeleting } = useApiMutation<string, any>(
    (id) => travellersApi.delete(id),
  );

  async function handleDelete(t: Traveller) {
    const result = await deleteTraveller(t.id);
    if (result !== undefined) {
      toast.success(`${t.firstName} ${t.lastName} deleted`);
      setDeleteTarget(null);
      refetch();
    } else {
      toast.error('Failed to delete traveller');
    }
  }

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-600">Failed to load travellers</p>
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Travellers
          </h1>
          <p className="text-sm text-muted-foreground">{total} travellers</p>
        </div>
        <Button asChild>
          <Link href="/travellers/new"><Plus className="h-4 w-4 mr-1.5" /> Add Traveller</Link>
        </Button>
      </div>

      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by name or passport..."
        />
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Passport Number</TableHead>
                <TableHead>Nationality</TableHead>
                <TableHead>Date of Birth</TableHead>
                <TableHead>Passport Expiry</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-4 w-32" /></div></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && (
        <div className="flex-1 overflow-auto">
          {travellers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <User className="h-12 w-12 text-muted-foreground/40" />
              <div>
                <p className="text-base font-medium">No travellers found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {debouncedSearch ? 'Try adjusting your search' : 'Add your first traveller to get started'}
                </p>
              </div>
              {!debouncedSearch && (
                <Button asChild><Link href="/travellers/new"><Plus className="h-4 w-4 mr-1.5" />Add Traveller</Link></Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Passport Number</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead>Date of Birth</TableHead>
                  <TableHead>Passport Expiry</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {travellers.map((raw) => { const t = normalizeTraveller(raw); return (
                  <TableRow
                    key={t.id}
                    className="group cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/travellers/${t.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{getInitials(t.firstName, t.lastName)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{t.firstName} {t.lastName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{t.passportNumber || 'N/A'}</TableCell>
                    <TableCell className="text-sm">{t.nationality ?? 'N/A'}</TableCell>
                    <TableCell className="text-sm">
                      {t.dateOfBirth
                        ? new Date(t.dateOfBirth).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <ExpiryBadge expiry={(t as any).passportExpiryDate ?? (t as any).passport_expiry_date} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost" size="icon-sm"
                          onClick={(e) => { e.stopPropagation(); setSelectedTraveller(t); }}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon-sm"
                          onClick={(e) => { e.stopPropagation(); router.push(`/travellers/${t.id}`); }}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(t); }}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ); })}
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
      <Sheet open={!!selectedTraveller} onOpenChange={(open) => !open && setSelectedTraveller(null)}>
        <SheetContent className="w-[400px] sm:w-[480px]">
          {selectedTraveller && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{getInitials(selectedTraveller.firstName, selectedTraveller.lastName)}</AvatarFallback>
                  </Avatar>
                  {selectedTraveller.firstName} {selectedTraveller.lastName}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Passport Number</p>
                    <p className="font-mono font-medium">{selectedTraveller.passportNumber || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Nationality</p>
                    <p className="font-medium">{selectedTraveller.nationality || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Date of Birth</p>
                    <p className="font-medium">
                      {selectedTraveller.dateOfBirth
                        ? new Date(selectedTraveller.dateOfBirth).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Passport Expiry</p>
                    <ExpiryBadge expiry={(selectedTraveller as any).passportExpiryDate ?? (selectedTraveller as any).passport_expiry_date} />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Email</p>
                    <p className="font-medium">{selectedTraveller.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Phone</p>
                    <p className="font-medium">{selectedTraveller.phone || '—'}</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button className="flex-1" onClick={() => { router.push(`/travellers/${selectedTraveller.id}`); setSelectedTraveller(null); }}>
                    View Full Profile
                  </Button>
                  <Button variant="outline" className="text-destructive" onClick={() => { setDeleteTarget(selectedTraveller); setSelectedTraveller(null); }}>
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
            <DialogTitle>Delete Traveller</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{deleteTarget?.firstName} {deleteTarget?.lastName}</strong>? This cannot be undone.
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
