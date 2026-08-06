'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, LayoutGrid, List, MoreHorizontal, Star, Phone, Shield, AlertTriangle, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterBar } from '@/components/domain/filter-bar';
import { cn } from '@/lib/utils';
import { useFleetStore } from '@/stores/fleet-store';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { fleetApi } from '@/lib/api/fleet';
import { DRIVER_STATUS_LABELS, DRIVER_STATUS_COLORS } from '@travelcrm/shared';

function DriverStatusBadge({ status }: { status: string }) {
  const color = DRIVER_STATUS_COLORS[status as keyof typeof DRIVER_STATUS_COLORS] || '#64748B';
  const label = DRIVER_STATUS_LABELS[status as keyof typeof DRIVER_STATUS_LABELS] || status;
  return <Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${color}15`, color }}>{label}</Badge>;
}

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={cn(s, star <= Math.round(rating) ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30')} />
      ))}
      <span className={cn('ml-1 font-medium', size === 'sm' ? 'text-xs' : 'text-sm')}>{rating > 0 ? rating.toFixed(1) : '—'}</span>
    </div>
  );
}

function LicenseExpiryBadge({ licenseExpiry }: { licenseExpiry?: string }) {
  if (!licenseExpiry) return <Badge variant="outline" className="text-[10px] text-muted-foreground">No license date</Badge>;
  const days = Math.ceil((new Date(licenseExpiry).getTime() - Date.now()) / 86400000);
  if (days < 0) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-red-600 bg-red-50 dark:bg-red-900/20">
        <AlertTriangle className="h-3 w-3" />License expired
      </div>
    );
  }
  if (days < 30) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/20">
        <Shield className="h-3 w-3" />Expires in {days}d
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-900/20">
      <Shield className="h-3 w-3" />License valid
    </div>
  );
}

function DriverCard({ driver }: { driver: any }) {
  return (
    <Link href={`/fleet/drivers/${driver.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="text-xs">{(driver.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium truncate">{driver.name}</p>
                <DriverStatusBadge status={driver.status} />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" />{driver.phone}</p>
            </div>
          </div>
          <div className="text-sm">
            <StarRating rating={driver.rating ?? 0} />
          </div>
          <LicenseExpiryBadge licenseExpiry={driver.licenseExpiry} />
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DriversPage() {
  const router = useRouter();
  const { driverView, setDriverView } = useFleetStore();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      fleetApi.drivers.list({
        page, limit,
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
    [debouncedSearch, statusFilter]
  );

  const { items: drivers, loading, loadingMore, total, sentinelRef, refetch } = useInfiniteScroll<any>({ fetcher });

  React.useEffect(() => { refetch(); }, [debouncedSearch, statusFilter, refetch]);

  const activeFilters = [];
  if (statusFilter !== 'all') activeFilters.push({ id: 'status', label: 'Status', value: DRIVER_STATUS_LABELS[statusFilter as keyof typeof DRIVER_STATUS_LABELS] || statusFilter });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Drivers</h1>
          <p className="text-sm text-muted-foreground">{total} driver{total !== 1 ? 's' : ''}</p>
        </div>
        <Button asChild><Link href="/fleet/drivers/new"><Plus className="h-4 w-4 mr-1.5" />Add Driver</Link></Button>
      </div>

      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search drivers..."
          activeFilters={activeFilters}
          onRemoveFilter={(id) => { if (id === 'status') setStatusFilter('all'); }}
          onClearFilters={() => { setSearch(''); setStatusFilter('all'); }}
          actions={
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(DRIVER_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <Button variant={driverView === 'grid' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setDriverView('grid')}><LayoutGrid className="h-4 w-4" /></Button>
                <Button variant={driverView === 'table' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setDriverView('table')}><List className="h-4 w-4" /></Button>
              </div>
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : drivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Users className="h-10 w-10 opacity-30" />
            <p className="text-sm">No drivers found</p>
            {(search || statusFilter !== 'all') && (
              <Button variant="outline" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</Button>
            )}
          </div>
        ) : driverView === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {drivers.map((d: any) => <DriverCard key={d.id} driver={d} />)}
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Driver</TableHead><TableHead>Phone</TableHead><TableHead>Rating</TableHead><TableHead>License Expiry</TableHead><TableHead>Status</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
            <TableBody>
              {drivers.map((d: any) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => router.push(`/fleet/drivers/${d.id}`)}>
                  <TableCell><div className="flex items-center gap-2"><Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">{(d.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar><span className="text-sm font-medium">{d.name}</span></div></TableCell>
                  <TableCell className="text-sm">{d.phone}</TableCell>
                  <TableCell><StarRating rating={d.rating ?? 0} /></TableCell>
                  <TableCell><LicenseExpiryBadge licenseExpiry={d.licenseExpiry} /></TableCell>
                  <TableCell><DriverStatusBadge status={d.status} /></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link href={`/fleet/drivers/${d.id}`}>View details</Link></DropdownMenuItem>
                        <DropdownMenuItem asChild><Link href={`/fleet/drivers/${d.id}/edit`}>Edit</Link></DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div ref={sentinelRef} className="h-4" />
        {loadingMore && (<div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>)}
      </div>
    </div>
  );
}
