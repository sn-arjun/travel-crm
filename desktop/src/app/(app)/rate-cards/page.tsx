'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Loader2, CreditCard, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useApiQuery } from '@/hooks/use-api';
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

export default function RateCardsPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('all');
  const [page, setPage] = React.useState(1);

  const { data: response, loading, error } = useApiQuery(
    () => client.get<ApiResponse<PaginatedResponse<RateCard>>>(API_ENDPOINTS.rateCards.list, {
      params: { page, limit: 50, search: search || undefined },
    }),
    [page, search],
  );

  const rateCards: RateCard[] = React.useMemo(() => {
    if (!response || !('data' in response)) return [];
    const data = response.data;
    return Array.isArray(data) ? data : (data as any)?.data ?? [];
  }, [response]);

  const filtered = React.useMemo(() => {
    if (categoryFilter === 'all') return rateCards;
    return rateCards.filter((rc) => getRateCardCategory(rc) === categoryFilter);
  }, [rateCards, categoryFilter]);

  function isExpired(validTo?: string) {
    if (!validTo) return false;
    return new Date(validTo).getTime() < Date.now();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Rate Cards</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} rate cards</p>
        </div>
        <Button asChild>
          <Link href="/rate-cards/new"><Plus className="h-4 w-4 mr-1.5" /> Add Rate Card</Link>
        </Button>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search rate cards..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="hotel">Hotel</SelectItem>
            <SelectItem value="airline">Airline</SelectItem>
            <SelectItem value="transport">Transport</SelectItem>
            <SelectItem value="activity">Activity</SelectItem>
            <SelectItem value="tour_operator">Tour Operator</SelectItem>
            <SelectItem value="resort">Resort</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">Using sample data -- connect to backend for real data</p>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rc) => (
                <TableRow key={rc.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/rate-cards/${rc.id}/edit`)}>
                  <TableCell className="font-medium text-sm">{getRateCardName(rc)}</TableCell>
                  <TableCell className="text-sm">{rc.supplierName ?? 'N/A'}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs capitalize">{getRateCardCategory(rc).replace('_', ' ')}</Badge></TableCell>
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" onClick={(e) => e.stopPropagation()}><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/rate-cards/${rc.id}/edit`)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No rate cards found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
