'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Search, MoreHorizontal, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { VEHICLE_TYPE_LABELS } from '@travelcrm/shared';

export default function RateCardsPage() {
  const [search, setSearch] = React.useState('');

  const rateCardsQuery = useApiQuery(
    () => fleetApi.rateCards.list({ limit: 100 }).then(res => res.data),
    []
  );

  React.useEffect(() => {
    if (rateCardsQuery.error) {
      toast.error('Failed to load rate cards');
    }
  }, [rateCardsQuery.error]);

  const rateCards = rateCardsQuery.data?.data ?? [];

  const filtered = React.useMemo(() => {
    if (!search) return rateCards;
    const q = search.toLowerCase();
    return rateCards.filter((rc: any) => rc.name.toLowerCase().includes(q));
  }, [search, rateCards]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div><h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Rate Cards</h1><p className="text-sm text-muted-foreground">{filtered.length} rate cards {rateCardsQuery.loading && '(loading...)'}</p></div>
        <Button asChild><Link href="/fleet/rate-cards/new"><Plus className="h-4 w-4 mr-1.5" />New Rate Card</Link></Button>
      </div>
      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search rate cards..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" /></div>
      </div>
      <div className="flex-1 overflow-auto">
        {rateCardsQuery.loading ? (
          <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading rate cards...</span>
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Vehicle Type</TableHead><TableHead>Base Fare</TableHead><TableHead>Per Km</TableHead><TableHead>Per Hour</TableHead><TableHead>Status</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
            <TableBody>
              {filtered.map((rc: any) => (
                <TableRow key={rc.id} className="cursor-pointer">
                  <TableCell className="text-sm font-medium">{rc.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{VEHICLE_TYPE_LABELS[rc.vehicleType as keyof typeof VEHICLE_TYPE_LABELS]}</Badge></TableCell>
                  <TableCell className="text-sm font-medium">₹{rc.baseFare.toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-sm">₹{rc.perKmRate}</TableCell>
                  <TableCell className="text-sm">{rc.perHourRate ? `₹${rc.perHourRate}` : '—'}</TableCell>
                  <TableCell><Badge variant="outline" className="bg-green-100 text-green-700 border-transparent text-[10px]">Active</Badge></TableCell>
                  <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem>Edit</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
