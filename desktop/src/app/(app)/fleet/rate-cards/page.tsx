'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, MoreHorizontal, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FilterBar } from '@/components/domain/filter-bar';
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

  const rateCards: any[] = rateCardsQuery.data?.data ?? [];

  const filtered = React.useMemo(() => {
    if (!search) return rateCards;
    const q = search.toLowerCase();
    return rateCards.filter((rc: any) => rc.name.toLowerCase().includes(q));
  }, [search, rateCards]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Rate Cards</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} rate card{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <Button asChild><Link href="/fleet/rate-cards/new"><Plus className="h-4 w-4 mr-1.5" />New Rate Card</Link></Button>
      </div>

      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search rate cards..."
        />
      </div>

      <div className="flex-1 overflow-auto">
        {rateCardsQuery.loading ? (
          <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /><span>Loading rate cards...</span>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Vehicle Type</TableHead>
                <TableHead>Base Fare</TableHead>
                <TableHead>Per Km</TableHead>
                <TableHead>Per Hour</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((rc: any) => (
                <TableRow key={rc.id} className="cursor-pointer" onClick={() => {}}>
                  <TableCell className="text-sm font-medium">{rc.name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{VEHICLE_TYPE_LABELS[rc.vehicleType as keyof typeof VEHICLE_TYPE_LABELS] || rc.vehicleType}</Badge></TableCell>
                  <TableCell className="text-sm font-medium">₹{(rc.baseFare ?? 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell className="text-sm">₹{rc.perKmRate}</TableCell>
                  <TableCell className="text-sm">{rc.perHourRate ? `₹${rc.perHourRate}` : '—'}</TableCell>
                  <TableCell>
                    {rc.isActive !== false
                      ? <Badge variant="outline" className="bg-green-100 text-green-700 border-transparent text-[10px]">Active</Badge>
                      : <Badge variant="outline" className="bg-gray-100 text-gray-600 border-transparent text-[10px]">Inactive</Badge>
                    }
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/fleet/rate-cards/${rc.id}/edit`}>Edit</Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
