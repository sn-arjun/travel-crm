'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CalendarClock, Send, Play, Pause, Trash2, MoreHorizontal, Loader2, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { FilterBar } from '@/components/domain/filter-bar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useApiMutation } from '@/hooks/use-api';
import { marketingApi, type FestivalCampaign } from '@/lib/api/marketing';

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function FestivalsPage() {
  const [search, setSearch] = React.useState('');

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      marketingApi.festivals.list({ page, limit, search: search || undefined }),
    [search],
  );

  const { items: festivals, loading, loadingMore, total, error, sentinelRef, refetch } = useInfiniteScroll<FestivalCampaign>({
    fetcher,
    limit: 25,
  });

  const { mutate: activate } = useApiMutation((id: string) => marketingApi.festivals.activate(id));
  const { mutate: deactivate } = useApiMutation((id: string) => marketingApi.festivals.deactivate(id));
  const { mutate: deleteFestival } = useApiMutation((id: string) => marketingApi.festivals.delete(id));

  async function handleToggle(festival: FestivalCampaign) {
    if (festival.isActive) {
      const result = await deactivate(festival.id);
      if (result) { toast.success('Festival campaign deactivated'); refetch(); }
      else toast.error('Failed to deactivate');
    } else {
      const result = await activate(festival.id);
      if (result) { toast.success('Festival campaign activated'); refetch(); }
      else toast.error('Failed to activate');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this festival campaign?')) return;
    const result = await deleteFestival(id);
    if (result) { toast.success('Deleted'); refetch(); }
    else toast.error('Failed to delete');
  }

  const activeFestivals = festivals.filter((f) => f.isActive).length;
  const upcomingFestivals = festivals.filter((f) => daysUntil(f.festivalDate) >= 0 && daysUntil(f.festivalDate) <= 30).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Festival Offers
          </h1>
          <p className="text-sm text-muted-foreground">
            {loading ? '...' : `${total} festival campaigns`}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b">
        {loading ? (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Play className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{activeFestivals}</p>
                  <p className="text-xs text-muted-foreground">Active Campaigns</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <CalendarClock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{upcomingFestivals}</p>
                  <p className="text-xs text-muted-foreground">Upcoming (30 days)</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                  <Send className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{total}</p>
                  <p className="text-xs text-muted-foreground">Total Festivals</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* FilterBar */}
      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search festival campaigns..."
          activeFilters={[]}
          onRemoveFilter={() => {}}
          onClearFilters={() => {}}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm">Failed to load festival campaigns</p>
            <Button variant="outline" size="sm" onClick={refetch}>Retry</Button>
          </div>
        ) : festivals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <CalendarClock className="h-10 w-10 opacity-50" />
            <p className="text-sm">No festival campaigns yet</p>
            <p className="text-xs max-w-xs text-center">
              Festival campaigns are pre-scheduled for Indian and international holidays.
              Contact your admin to seed festival templates.
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Festival</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Days Before</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {festivals.map((festival) => {
                  const days = daysUntil(festival.festivalDate);
                  return (
                    <TableRow key={festival.id} className="hover:bg-muted/50 group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <CalendarClock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          </div>
                          <span className="text-sm font-medium">{festival.festivalName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{festival.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(festival.festivalDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {festival.daysBefore}d before
                        </Badge>
                        {days >= 0 && days <= 30 && (
                          <Badge variant="secondary" className="text-xs ml-1">
                            {days === 0 ? 'Today!' : `${days}d away`}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {festival.campaignType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs border-transparent',
                            festival.isActive
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
                          )}
                        >
                          {festival.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleToggle(festival)}
                            title={festival.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {festival.isActive
                              ? <Pause className="h-3.5 w-3.5" />
                              : <Play className="h-3.5 w-3.5" />
                            }
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleToggle(festival)}>
                                {festival.isActive
                                  ? <><Pause className="h-3.5 w-3.5 mr-2" /> Deactivate</>
                                  : <><Play className="h-3.5 w-3.5 mr-2" /> Activate</>
                                }
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDelete(festival.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              {loadingMore && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
