'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Search, MoreHorizontal, Star, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRouter } from 'next/navigation';
import { useApiQuery } from '@/hooks/use-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { suppliersApi } from '@/lib/api/suppliers';
import type { Supplier } from '@travelcrm/shared';

function getInitials(name: string) {
  return name.split(' ').map((n: any) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function SuppliersPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const fetcher = React.useCallback((p: number, limit: number) =>
    suppliersApi.list({
      page: p,
      limit,
      search: search || undefined,
      category: typeFilter !== 'all' ? typeFilter : undefined,
    }),
    [search, typeFilter],
  );

  const { items: suppliers, loading, loadingMore, hasMore, total, error, sentinelRef, refetch } = useInfiniteScroll({
    fetcher,
    limit: 30,
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Suppliers</h1>
          <p className="text-sm text-muted-foreground">{total > 0 ? `${suppliers.length} of ${total}` : `${suppliers.length}`} suppliers</p>
        </div>
        <Button asChild>
          <Link href="/suppliers/new"><Plus className="h-4 w-4 mr-1.5" /> Add Supplier</Link>
        </Button>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="hotel">Hotel</SelectItem>
            <SelectItem value="airline">Airline</SelectItem>
            <SelectItem value="transport">Transport</SelectItem>
            <SelectItem value="activity">Activity</SelectItem>
            <SelectItem value="tour_operator">Tour Operator</SelectItem>
            <SelectItem value="resort">Resort</SelectItem>
            <SelectItem value="ota">OTA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200">Using sample data — connect to backend for real data</p>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && (<>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>City</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((sup: any) => (
                <TableRow key={sup.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/suppliers/${sup.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{getInitials(sup.company_name || sup.name || '')}</AvatarFallback></Avatar>
                      <span className="font-medium text-sm">{sup.company_name || sup.name}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-xs capitalize">{(sup.category ?? 'other').replace('_', ' ')}</Badge></TableCell>
                  <TableCell className="text-sm">{sup.contact_person || sup.contactPerson || 'N/A'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{sup.email ?? 'N/A'}</TableCell>
                  <TableCell className="text-sm">{sup.phone ?? 'N/A'}</TableCell>
                  <TableCell className="text-sm">{sup.city || sup.address || 'N/A'}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/suppliers/${sup.id}`); }}>View details</DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/suppliers/${sup.id}/edit`); }}>Edit</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={(e) => e.stopPropagation()}>Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
        </>)}
      </div>
    </div>
  );
}
