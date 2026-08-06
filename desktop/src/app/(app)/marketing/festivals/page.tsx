'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CalendarClock, Send, Play, Pause, Trash2, MoreHorizontal,
  Loader2, AlertCircle, Plus, Megaphone, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { FilterBar } from '@/components/domain/filter-bar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useApiMutation } from '@/hooks/use-api';
import { marketingApi, type FestivalCampaign } from '@/lib/api/marketing';

// ---------------------------------------------------------------------------
// Predefined festivals with themed gradients
// ---------------------------------------------------------------------------

interface FestivalPreset {
  name: string;
  icon: string;
  month: string;
  gradient: string;
  textColor: string;
  description: string;
}

const FESTIVAL_PRESETS: FestivalPreset[] = [
  {
    name: 'Diwali',
    icon: '\u{1F386}',
    month: 'Oct-Nov',
    gradient: 'from-amber-500 via-orange-500 to-red-500',
    textColor: 'text-white',
    description: 'Festival of lights - promote holiday packages & special deals',
  },
  {
    name: 'Christmas',
    icon: '\u{1F384}',
    month: 'December',
    gradient: 'from-red-600 via-red-500 to-green-600',
    textColor: 'text-white',
    description: 'Year-end holiday travel deals & winter destinations',
  },
  {
    name: 'New Year',
    icon: '\u{1F389}',
    month: 'January',
    gradient: 'from-indigo-600 via-purple-500 to-pink-500',
    textColor: 'text-white',
    description: 'New Year getaways & early-bird bookings for the year',
  },
  {
    name: 'Eid',
    icon: '\u{1F319}',
    month: 'Varies',
    gradient: 'from-emerald-600 via-teal-500 to-cyan-500',
    textColor: 'text-white',
    description: 'Eid special packages for families & group travel',
  },
  {
    name: 'Holi',
    icon: '\u{1F308}',
    month: 'March',
    gradient: 'from-pink-500 via-yellow-400 to-green-400',
    textColor: 'text-white',
    description: 'Festival of colors - spring travel & cultural tours',
  },
  {
    name: "Valentine's Day",
    icon: '\u{2764}\u{FE0F}',
    month: 'February',
    gradient: 'from-rose-500 via-pink-500 to-red-400',
    textColor: 'text-white',
    description: 'Romantic getaways & couple holiday packages',
  },
  {
    name: 'Summer Sale',
    icon: '\u{2600}\u{FE0F}',
    month: 'May-Jun',
    gradient: 'from-yellow-400 via-orange-400 to-red-400',
    textColor: 'text-white',
    description: 'Summer vacation deals & hill station packages',
  },
  {
    name: 'Republic Day',
    icon: '\u{1F1EE}\u{1F1F3}',
    month: 'January',
    gradient: 'from-orange-500 via-white to-green-500',
    textColor: 'text-gray-800',
    description: 'Patriotic travel offers & heritage destination deals',
  },
  {
    name: 'Independence Day',
    icon: '\u{1F1EE}\u{1F1F3}',
    month: 'August',
    gradient: 'from-orange-400 via-orange-200 to-green-500',
    textColor: 'text-gray-800',
    description: 'Long weekend travel specials & freedom sale offers',
  },
  {
    name: 'Navratri',
    icon: '\u{1F4AB}',
    month: 'Sep-Oct',
    gradient: 'from-red-500 via-orange-500 to-yellow-400',
    textColor: 'text-white',
    description: 'Nine-night festival specials & Gujarat/Rajasthan tours',
  },
];

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function campaignStatusBadge(isActive: boolean) {
  return isActive ? (
    <Badge
      variant="outline"
      className="text-xs border-transparent bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    >
      Active
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="text-xs border-transparent bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
    >
      Inactive
    </Badge>
  );
}

export default function FestivalsPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      marketingApi.festivals.list({ page, limit, search: search || undefined }),
    [search],
  );

  const {
    items: festivals,
    loading,
    loadingMore,
    total,
    error,
    sentinelRef,
    refetch,
  } = useInfiniteScroll<FestivalCampaign>({ fetcher, limit: 25 });

  const { mutate: activate } = useApiMutation((id: string) =>
    marketingApi.festivals.activate(id),
  );
  const { mutate: deactivate } = useApiMutation((id: string) =>
    marketingApi.festivals.deactivate(id),
  );
  const { mutate: deleteFestival } = useApiMutation((id: string) =>
    marketingApi.festivals.delete(id),
  );

  async function handleToggle(festival: FestivalCampaign) {
    if (festival.isActive) {
      const result = await deactivate(festival.id);
      if (result) {
        toast.success('Festival campaign deactivated');
        refetch();
      } else {
        toast.error('Failed to deactivate');
      }
    } else {
      const result = await activate(festival.id);
      if (result) {
        toast.success('Festival campaign activated');
        refetch();
      } else {
        toast.error('Failed to activate');
      }
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this festival campaign?')) return;
    const result = await deleteFestival(id);
    if (result) {
      toast.success('Festival campaign deleted');
      refetch();
    } else {
      toast.error('Failed to delete');
    }
  }

  function handleCreateCampaign(festivalName: string) {
    const params = new URLSearchParams({
      festivalName,
      subject: `${festivalName} Special Travel Offers`,
    });
    router.push(`/campaigns/new?${params.toString()}`);
  }

  // Map existing API campaigns to their festival names for status lookup
  const activeFestivalNames = React.useMemo(() => {
    const set = new Set<string>();
    festivals.forEach((f) => {
      if (f.isActive) set.add(f.festivalName.toLowerCase());
    });
    return set;
  }, [festivals]);

  const activeFestivalsCount = festivals.filter((f) => f.isActive).length;
  const upcomingCount = festivals.filter(
    (f) => daysUntil(f.festivalDate) >= 0 && daysUntil(f.festivalDate) <= 30,
  ).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/marketing">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Festival Offers
            </h1>
            <p className="text-sm text-muted-foreground">
              Create seasonal campaigns tied to holidays and festivals
            </p>
          </div>
        </div>
        <Button
          onClick={() =>
            router.push(
              '/campaigns/new?subject=Custom+Festival+Campaign&festivalName=Custom',
            )
          }
        >
          <Plus className="h-4 w-4 mr-1.5" /> Create Custom Festival
        </Button>
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
                  <p className="text-lg font-bold">{activeFestivalsCount}</p>
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
                  <p className="text-lg font-bold">{upcomingCount}</p>
                  <p className="text-xs text-muted-foreground">Upcoming (30 days)</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-lg font-bold">{FESTIVAL_PRESETS.length}</p>
                  <p className="text-xs text-muted-foreground">Festival Templates</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-8">
        {/* Predefined Festival Cards Grid */}
        <div>
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Festival Templates
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {FESTIVAL_PRESETS.map((preset) => {
              const hasActiveCampaign = activeFestivalNames.has(
                preset.name.toLowerCase(),
              );
              return (
                <Card
                  key={preset.name}
                  className="overflow-hidden hover:shadow-md transition-shadow group"
                >
                  {/* Gradient header */}
                  <div
                    className={cn(
                      'bg-gradient-to-r p-4 relative',
                      preset.gradient,
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-2xl">{preset.icon}</span>
                        <h3
                          className={cn(
                            'text-base font-bold mt-1',
                            preset.textColor,
                          )}
                        >
                          {preset.name}
                        </h3>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] border-white/30 backdrop-blur-sm',
                          preset.textColor,
                        )}
                      >
                        {preset.month}
                      </Badge>
                    </div>
                    {hasActiveCampaign && (
                      <div className="absolute top-2 right-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-white/50 animate-pulse" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                      {preset.description}
                    </p>
                    <div className="flex items-center gap-2">
                      {hasActiveCampaign ? (
                        <Badge
                          variant="outline"
                          className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
                        >
                          Campaign Active
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 text-xs w-full"
                          onClick={() => handleCreateCampaign(preset.name)}
                        >
                          <Megaphone className="h-3 w-3 mr-1" />
                          Create Campaign
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Existing Festival Campaigns Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-indigo-500" />
              Your Festival Campaigns
              {!loading && (
                <Badge variant="secondary" className="text-xs">
                  {total}
                </Badge>
              )}
            </h2>
          </div>

          {/* FilterBar */}
          <div className="mb-4">
            <FilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search festival campaigns..."
              activeFilters={[]}
              onRemoveFilter={() => {}}
              onClearFilters={() => {}}
            />
          </div>

          {/* Campaign Cards */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm">Failed to load festival campaigns</p>
              <Button variant="outline" size="sm" onClick={refetch}>
                Retry
              </Button>
            </div>
          ) : festivals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground rounded-lg border border-dashed p-8">
              <CalendarClock className="h-10 w-10 opacity-50" />
              <p className="text-sm font-medium">No festival campaigns yet</p>
              <p className="text-xs max-w-xs text-center">
                Click "Create Campaign" on any festival template above, or
                create a custom festival campaign.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {festivals.map((festival) => {
                  const days = daysUntil(festival.festivalDate);
                  const matchingPreset = FESTIVAL_PRESETS.find(
                    (p) =>
                      p.name.toLowerCase() ===
                      festival.festivalName.toLowerCase(),
                  );
                  return (
                    <Card
                      key={festival.id}
                      className="overflow-hidden hover:shadow-md transition-shadow"
                    >
                      {/* Card header with gradient if matching preset */}
                      <div
                        className={cn(
                          'px-4 py-3',
                          matchingPreset
                            ? `bg-gradient-to-r ${matchingPreset.gradient}`
                            : 'bg-gradient-to-r from-slate-600 to-slate-700',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {matchingPreset && (
                              <span className="text-lg">
                                {matchingPreset.icon}
                              </span>
                            )}
                            <h3
                              className={cn(
                                'text-sm font-bold',
                                matchingPreset?.textColor ?? 'text-white',
                              )}
                            >
                              {festival.festivalName}
                            </h3>
                          </div>
                          {campaignStatusBadge(festival.isActive)}
                        </div>
                      </div>

                      <CardContent className="p-4 space-y-3">
                        <div>
                          <p className="text-sm font-medium">{festival.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(festival.festivalDate).toLocaleDateString(
                              'en-IN',
                              {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              },
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {festival.daysBefore}d before
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">
                            {festival.campaignType}
                          </Badge>
                          {days >= 0 && days <= 30 && (
                            <Badge
                              variant="secondary"
                              className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            >
                              {days === 0 ? 'Today!' : `${days}d away`}
                            </Badge>
                          )}
                        </div>

                        {festival.lastRunAt && (
                          <p className="text-[11px] text-muted-foreground">
                            Last run:{' '}
                            {new Date(festival.lastRunAt).toLocaleDateString(
                              'en-IN',
                              {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              },
                            )}
                          </p>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs flex-1"
                            onClick={() => handleToggle(festival)}
                          >
                            {festival.isActive ? (
                              <>
                                <Pause className="h-3 w-3 mr-1" /> Deactivate
                              </>
                            ) : (
                              <>
                                <Play className="h-3 w-3 mr-1" /> Activate
                              </>
                            )}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  handleCreateCampaign(festival.festivalName)
                                }
                              >
                                <Send className="h-3.5 w-3.5 mr-2" />
                                New Campaign for this Festival
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleToggle(festival)}
                              >
                                {festival.isActive ? (
                                  <>
                                    <Pause className="h-3.5 w-3.5 mr-2" />{' '}
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-3.5 w-3.5 mr-2" />{' '}
                                    Activate
                                  </>
                                )}
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
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <div
                ref={sentinelRef}
                className="flex items-center justify-center py-4"
              >
                {loadingMore && (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
