'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, FileText, Loader2, MoreHorizontal, FileMinus, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useApiMutation } from '@/hooks/use-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { FilterBar } from '@/components/domain/filter-bar';
import { creditNotesApi, type CreditNote } from '@/lib/api/credit-notes';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    issued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    applied: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  };
  return (
    <Badge variant="outline" className={cn('border-transparent text-[11px]', styles[status] ?? 'bg-slate-100 text-slate-700')}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

export default function CreditNotesPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [selectedNote, setSelectedNote] = React.useState<CreditNote | null>(null);

  const { mutate: applyNote } = useApiMutation(
    ({ id, amount }: { id: string; amount: number }) => creditNotesApi.apply(id, { amount }),
  );

  const fetcher = React.useCallback(
    (page: number, limit: number) => creditNotesApi.list({ page, limit }),
    [],
  );

  const {
    items: notes,
    loading,
    loadingMore,
    total,
    error,
    sentinelRef,
    refetch,
  } = useInfiniteScroll<CreditNote>({ fetcher, limit: 20 });

  const filtered = React.useMemo(() => {
    if (!search) return notes;
    const q = search.toLowerCase();
    return notes.filter((n) =>
      (n.invoiceNumber ?? '').toLowerCase().includes(q) ||
      (n.contactName ?? '').toLowerCase().includes(q)
    );
  }, [notes, search]);

  const handleApply = async (note: CreditNote) => {
    if (!confirm(`Apply credit note ${note.invoiceNumber} of ${formatCurrency(note.total)} to linked invoice?`)) return;
    try {
      await applyNote({ id: note.id, amount: note.total });
      toast.success('Credit note applied successfully');
      refetch();
    } catch {
      toast.error('Failed to apply credit note');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-600">Failed to load credit notes</p>
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Credit Notes</h1>
          <p className="text-sm text-muted-foreground">{total} credit notes</p>
        </div>
      </div>

      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search credit notes..."
        />
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Note #</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && (
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <FileMinus className="h-12 w-12 text-muted-foreground/40" />
              <div>
                <p className="text-base font-medium">No credit notes found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {search ? 'Try adjusting your search' : 'Credit notes are created from the invoice detail page'}
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Note #</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((note) => (
                  <TableRow key={note.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedNote(note)}>
                    <TableCell className="font-mono text-sm font-medium">{note.invoiceNumber ?? '—'}</TableCell>
                    <TableCell className="text-sm">{note.contactName ?? 'N/A'}</TableCell>
                    <TableCell className="text-sm font-medium">{formatCurrency(note.total)}</TableCell>
                    <TableCell><StatusBadge status={note.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {note.createdAt ? new Date(note.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedNote(note); }}>
                            <Eye className="h-4 w-4 mr-2" /> View Details
                          </DropdownMenuItem>
                          {note.status === 'issued' && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleApply(note); }}>
                              Apply to Invoice
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
      <Sheet open={!!selectedNote} onOpenChange={(open) => !open && setSelectedNote(null)}>
        <SheetContent className="w-[400px] sm:w-[480px]">
          {selectedNote && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{selectedNote.invoiceNumber ?? 'Credit Note'}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Contact</p>
                    <p className="font-medium">{selectedNote.contactName ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Status</p>
                    <StatusBadge status={selectedNote.status} />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Subtotal</p>
                    <p className="font-medium">{formatCurrency(selectedNote.subtotal)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Tax</p>
                    <p className="font-medium">{formatCurrency(selectedNote.totalTax)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs mb-1">Total</p>
                    <p className="text-lg font-bold">{formatCurrency(selectedNote.total)}</p>
                  </div>
                  {selectedNote.notes && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground text-xs mb-1">Notes</p>
                      <p className="text-sm">{selectedNote.notes}</p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs mb-1">Created</p>
                    <p className="font-medium">
                      {selectedNote.createdAt
                        ? new Date(selectedNote.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>
                </div>
                {selectedNote.status === 'issued' && (
                  <Button className="w-full" onClick={() => { handleApply(selectedNote); setSelectedNote(null); }}>
                    Apply to Invoice
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
