'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, LayoutGrid, List, MoreHorizontal, Star, Phone, Calendar, Shield, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useFleetStore } from '@/stores/fleet-store';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';
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
      {[1, 2, 3, 4, 5].map((star: any) => (
        <Star key={star} className={cn(s, star <= Math.round(rating) ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30')} />
      ))}
      <span className={cn('ml-1 font-medium', size === 'sm' ? 'text-xs' : 'text-sm')}>{rating}</span>
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
        <div className="text-sm">Experience: {driver.experience ?? 0} years</div>
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-900/20">
          <Shield className="h-3 w-3" />
          License valid
        </div>
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

  const driversQuery = useApiQuery(
    () => fleetApi.drivers.list({ limit: 100 }).then(res => res.data),
    []
  );

  React.useEffect(() => {
    if (driversQuery.error) {
      toast.error('Failed to load drivers');
    }
  }, [driversQuery.error]);

  const drivers: any[] = Array.isArray(driversQuery.data) ? driversQuery.data : (driversQuery.data?.data ?? []);

  const filtered = React.useMemo(() => {
    let result = [...drivers];
    if (search) { const q = search.toLowerCase(); result = result.filter((d: any) => (d.name || '').toLowerCase().includes(q) || d.phone.includes(q)); }
    if (statusFilter && statusFilter !== 'all') result = result.filter((d: any) => d.status === statusFilter);
    return result;
  }, [search, statusFilter, drivers]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div><h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Drivers</h1><p className="text-sm text-muted-foreground">{filtered.length} drivers {driversQuery.loading && '(loading...)'}</p></div>
        <Button asChild><Link href="/fleet/drivers/new"><Plus className="h-4 w-4 mr-1.5" />Add Driver</Link></Button>
      </div>
      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search drivers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" /></div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-36 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{Object.entries(DRIVER_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
        <div className="ml-auto flex items-center gap-1 border rounded-md p-0.5">
          <Button variant={driverView === 'grid' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setDriverView('grid')}><LayoutGrid className="h-4 w-4" /></Button>
          <Button variant={driverView === 'table' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setDriverView('table')}><List className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {driversQuery.loading ? (
          <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading drivers...</span>
          </div>
        ) : driverView === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((d: any) => <DriverCard key={d.id} driver={d} />)}
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Driver</TableHead><TableHead>Phone</TableHead><TableHead>Experience</TableHead><TableHead>License Expiry</TableHead><TableHead>Status</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
            <TableBody>
              {filtered.map((d: any) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => router.push(`/fleet/drivers/${d.id}`)}>
                  <TableCell><div className="flex items-center gap-2"><Avatar className="h-7 w-7"><AvatarFallback className="text-[10px]">{(d.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar><span className="text-sm font-medium">{d.name}</span></div></TableCell>
                  <TableCell className="text-sm">{d.phone}</TableCell>
                  <TableCell className="text-sm">{d.experience ?? 0} years</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{d.licenseExpiry}</TableCell>
                  <TableCell><DriverStatusBadge status={d.status} /></TableCell>
                  <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href={`/fleet/drivers/${d.id}`}>View details</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href={`/fleet/drivers/${d.id}/edit`}>Edit</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
