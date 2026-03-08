'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, CreditCard, Eye, Pencil, Trash2, Loader2, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterBar } from '@/components/domain/filter-bar';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useApiMutation } from '@/hooks/use-api';
import { client, type ApiResponse, type PaginatedResponse } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';

interface RateCard {
  id: string;
  name?: string;
  serviceName?: string;
  supplierId?: string;
  supplierName?: string;
  serviceType?: string;
  category?: string;
  costPrice?: number;
  sellingPrice?: number;
  rate?: number;
  currency?: string;
  validFrom?: string;
  validTo?: string;
  notes?: string;
  description?: string;
  season?: string;
  isActive?: number;
  createdAt: string;
  updatedAt?: string;
}

function getRateCardName(rc: RateCard): string {
  return rc.name || rc.serviceName || 'Unnamed';
}

function getRateCardCategory(rc: RateCard): string {
  return rc.serviceType || rc.category || 'other';
}

function getRateCardPrice(rc: RateCard): number {
  return rc.sellingPrice ?? rc.rate ?? rc.costPrice ?? 0;
}

function isExpired(validTo?: string) {
  if (!validTo) return false;
  return new Date(validTo).getTime() < Date.now();
}

function RateCardDrawer({ rateCard, open, onClose, onEdit }: { rateCard: RateCard | null; open: boolean; onClose: () => void; onEdit: () => void }) {
  if (!rateCard) return null;
  const price = getRateCardPrice(rateCard);
  const currency = rateCard.currency === 'USD' ? '$' : '₹';
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[480px]">
        <SheetHeader>
          <SheetTitle>{getRateCardName(rateCard)}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">{getRateCardCategory(rateCard).replace('_', ' ')}</Badge>
            {rateCard.isActive === 0 || isExpired(rateCard.validTo) ? (
              <Badge className="bg-red-100 text-red-900">Expired</Badge>
            ) : (
              <Badge className="bg-green-100 text-green-900">Active</Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Supplier</p>
              <p className="font-medium">{rateCard.supplierName ?? 'N/A'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Rate</p>
              <p className="font-mono font-semibold">{currency}{price.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Valid From</p>
              <p className="font-medium">{rateCard.validFrom ? new Date(rateCard.validFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Valid To</p>
              <p className="font-medium">{rateCard.validTo ? new Date(rateCard.validTo).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
            </div>
          </div>
          {rateCard.notes && (
            <div className="text-sm">
              <p className="text-muted-foreground mb-1">Notes</p>
              <p>{rateCard.notes}</p>
            </div>
          )}
          <div className="flex gap-2 pt-4 border-t">
            <Button className="flex-1" onClick={onEdit}><Pencil className="h-4 w-4 mr-1.5" />Edit</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const CATEGORY_OPTIONS = [
  { label: 'Hotel', value: 'hotel' },
  { label: 'Transport', value: 'transport' },
  { label: 'Activity', value: 'activity' },
  { label: 'Meal', value: 'meal' },
  { label: 'Flight', value: 'flight' },
];

export default function RateCardsPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [selectedCard, setSelectedCard] = React.useState<RateCard | null>(null);

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      client.get<ApiResponse<PaginatedResponse<RateCard>>>(API_ENDPOINTS.rateCards.list, {
        params: {
          page,
          limit,
          search: search || undefined,
          serviceType: categoryFilter || undefined,
          isActive: 'true',
        },
      }),
    [search, categoryFilter],
  );

  const { items: rateCards, loading, loadingMore, hasMore, total, error, sentinelRef, refetch } = useInfiniteScroll<RateCard>({
    fetcher,
    limit: 30,
  });

  const { mutate: deleteRateCard } = useApiMutation(
    (id: string) => client.delete<ApiResponse<void>>(API_ENDPOINTS.rateCards.byId(id)),
  );

  const handleDelete = async (rc: RateCard, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${getRateCardName(rc)}"? This cannot be undone.`)) return;
    try {
      await deleteRateCard(rc.id);
      toast.success('Rate card deleted');
      if (selectedCard?.id === rc.id) setDrawerOpen(false);
      refetch();
    } catch {
      toast.error('Failed to delete rate card');
    }
  };

  const activeFilters = categoryFilter
    ? [{ id: 'category', label: 'Category', value: CATEGORY_OPTIONS.find(o => o.value === categoryFilter)?.label ?? categoryFilter }]
    : [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Rate Cards {total > 0 && <span className="text-base font-normal text-muted-foreground">({total})</span>}
          </h1>
          <p className="text-sm text-muted-foreground">Manage supplier pricing and seasonal rates</p>
        </div>
        <Button asChild>
          <Link href="/rate-cards/new"><Plus className="h-4 w-4 mr-1.5" /> Add Rate Card</Link>
        </Button>
      </div>

      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search rate cards..."
          activeFilters={activeFilters}
          onRemoveFilter={() => setCategoryFilter('')}
          onClearFilters={() => setCategoryFilter('')}
          actions={
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All Categories</option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          }
        />
      </div>

      {error && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">Failed to load rate cards — check backend connection</p>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service Name</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>Valid From</TableHead>
                <TableHead>Valid To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rateCards.map((rc) => (
                <TableRow
                  key={rc.id}
                  className="cursor-pointer hover:bg-muted/50 group"
                  onClick={() => { setSelectedCard(rc); setDrawerOpen(true); }}
                >
                  <TableCell className="font-medium text-sm">{getRateCardName(rc)}</TableCell>
                  <TableCell className="text-sm">{rc.supplierName ?? 'N/A'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">{getRateCardCategory(rc).replace('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">
                    {rc.currency === 'USD' ? '$' : '₹'}{getRateCardPrice(rc).toLocaleString('en-IN')}
                  </TableCell>
                  <TableCell className="text-sm">
                    {rc.validFrom ? new Date(rc.validFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {rc.validTo ? new Date(rc.validTo).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}
                  </TableCell>
                  <TableCell>
                    {rc.isActive === 0 || isExpired(rc.validTo) ? (
                      <Badge className="text-xs bg-red-100 text-red-900">Expired</Badge>
                    ) : (
                      <Badge className="text-xs bg-green-100 text-green-900">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); setSelectedCard(rc); setDrawerOpen(true); }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); router.push(`/rate-cards/${rc.id}/edit`); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={(e) => handleDelete(rc, e)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rateCards.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm text-muted-foreground">No rate cards found</p>
                    <Button asChild variant="outline" size="sm" className="mt-3">
                      <Link href="/rate-cards/new"><Plus className="h-4 w-4 mr-1" /> Add Rate Card</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        <div ref={sentinelRef} className="h-4" />
        {loadingMore && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading more...</span>
          </div>
        )}
        {!hasMore && rateCards.length > 0 && (
          <p className="text-center text-xs text-muted-foreground py-4">All rate cards loaded</p>
        )}
      </div>

      <RateCardDrawer
        rateCard={selectedCard}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEdit={() => { setDrawerOpen(false); router.push(`/rate-cards/${selectedCard?.id}/edit`); }}
      />
    </div>
  );
}
