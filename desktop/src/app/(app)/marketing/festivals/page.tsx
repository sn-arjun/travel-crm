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
import { Tag } from '@/components/ui/tag';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/layout/page-container';
import { FilterBar } from '@/components/domain/filter-bar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { formatDisplayDate } from '@/lib/dates';
import { marketingApi, type FestivalCampaign } from '@/lib/api/marketing';

// ---------------------------------------------------------------------------
// Predefined festival templates (accent colour comes from the chart tokens)
// ---------------------------------------------------------------------------

interface FestivalPreset {
  name: string;
  month: string;
  accent: string;
  description: string;
}

const FESTIVAL_PRESETS: FestivalPreset[] = [
  { name: 'Diwali', month: 'Oct-Nov', accent: 'bg-ds-chart-1', description: 'Festival of lights - promote holiday packages & special deals' },
  { name: 'Christmas', month: 'December', accent: 'bg-ds-chart-2', description: 'Year-end holiday travel deals & winter destinations' },
  { name: 'New Year', month: 'January', accent: 'bg-ds-chart-3', description: 'New Year getaways & early-bird bookings for the year' },
  { name: 'Eid', month: 'Varies', accent: 'bg-ds-chart-4', description: 'Eid special packages for families & group travel' },
  { name: 'Holi', month: 'March', accent: 'bg-ds-chart-5', description: 'Festival of colors - spring travel & cultural tours' },
  { name: "Valentine's Day", month: 'February', accent: 'bg-ds-chart-6', description: 'Romantic getaways & couple holiday packages' },
  { name: 'Summer Sale', month: 'May-Jun', accent: 'bg-ds-chart-1', description: 'Summer vacation deals & hill station packages' },
  { name: 'Republic Day', month: 'January', accent: 'bg-ds-chart-2', description: 'Patriotic travel offers & heritage destination deals' },
  { name: 'Independence Day', month: 'August', accent: 'bg-ds-chart-3', description: 'Long weekend travel specials & freedom sale offers' },
  { name: 'Navratri', month: 'Sep-Oct', accent: 'bg-ds-chart-4', description: 'Nine-night festival specials & Gujarat/Rajasthan tours' },
];

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function campaignStatusBadge(isActive: boolean) {
  return isActive ? (
    <Tag tone="success">Active</Tag>
  ) : (
    <Tag tone="neutral">Inactive</Tag>
  );
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function FestivalsPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
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

  async function handleToggle(festival: FestivalCampaign) {
    try {
      if (festival.isActive) {
        await marketingApi.festivals.deactivate(festival.id);
        toast.success('Festival campaign deactivated');
      } else {
        await marketingApi.festivals.activate(festival.id);
        toast.success('Festival campaign activated');
      }
      refetch();
    } catch (err) {
      toast.error(
        errorMessage(
          err,
          festival.isActive ? 'Could not deactivate this campaign' : 'Could not activate this campaign',
        ),
      );
    }
  }

  async function handleDelete(festival: FestivalCampaign) {
    const ok = await confirm({
      title: 'Delete festival campaign?',
      description: `"${festival.festivalName}" will be removed permanently. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await marketingApi.festivals.delete(festival.id);
      toast.success('Festival campaign deleted');
      refetch();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete this campaign'));
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
    <PageContainer>
      <PageHeader
        title="Festival Offers"
        description="Create seasonal campaigns tied to holidays and festivals"
        back={
          <Button variant="ghost" size="icon" asChild aria-label="Back to marketing">
            <Link href="/marketing">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        }
        actions={
          <Button
            onClick={() =>
              router.push(
                '/campaigns/new?subject=Custom+Festival+Campaign&festivalName=Custom',
              )
            }
          >
            <Plus className="h-4 w-4 mr-1.5" /> Create Custom Festival
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-ds-4">
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
                <div className="h-10 w-10 rounded-lg bg-ds-success-subtle flex items-center justify-center">
                  <Play className="h-5 w-5 text-ds-success-on-subtle" />
                </div>
                <div>
                  <p className="text-lg font-bold">{activeFestivalsCount}</p>
                  <p className="text-xs text-ds-foreground-muted">Active Campaigns</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-ds-warning-subtle flex items-center justify-center">
                  <CalendarClock className="h-5 w-5 text-ds-warning-on-subtle" />
                </div>
                <div>
                  <p className="text-lg font-bold">{upcomingCount}</p>
                  <p className="text-xs text-ds-foreground-muted">Upcoming (30 days)</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-ds-primary-subtle flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-ds-primary-on-subtle" />
                </div>
                <div>
                  <p className="text-lg font-bold">{FESTIVAL_PRESETS.length}</p>
                  <p className="text-xs text-ds-foreground-muted">Festival Templates</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="space-y-8">
        {/* Predefined Festival Cards Grid */}
        <section aria-labelledby="festival-templates-heading">
          <h2
            id="festival-templates-heading"
            className="text-base font-semibold mb-4 flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4 text-ds-warning" aria-hidden="true" />
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
                  role="article"
                  aria-label={`${preset.name} festival template`}
                  data-testid="festival-template-card"
                  className="gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md"
                >
                  <div className={cn('h-1.5 w-full', preset.accent)} aria-hidden="true" />
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-bold text-ds-foreground">
                        {preset.name}
                      </h3>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {preset.month}
                      </Badge>
                    </div>
                    <p className="text-xs text-ds-foreground-muted line-clamp-2">
                      {preset.description}
                    </p>
                    <div className="flex items-center gap-2">
                      {hasActiveCampaign ? (
                        <Tag tone="success">Campaign Active</Tag>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full"
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
        </section>

        {/* Existing Festival Campaigns Section */}
        <section aria-labelledby="festival-campaigns-heading">
          <div className="flex items-center justify-between mb-4">
            <h2
              id="festival-campaigns-heading"
              className="text-base font-semibold flex items-center gap-2"
            >
              <CalendarClock className="h-4 w-4 text-ds-primary" aria-hidden="true" />
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
            <div
              role="alert"
              className="flex flex-col items-center justify-center h-40 gap-3 text-ds-foreground-muted"
            >
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm">Failed to load festival campaigns</p>
              <Button variant="outline" size="sm" onClick={refetch}>
                Retry
              </Button>
            </div>
          ) : festivals.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-40 gap-3 text-ds-foreground-muted rounded-lg border border-dashed border-ds-border p-8">
              <CalendarClock className="h-10 w-10 opacity-50" />
              <p className="text-sm font-medium">No festival campaigns yet</p>
              <p className="text-xs max-w-xs text-center">
                Click &quot;Create Campaign&quot; on any festival template above, or
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
                      role="article"
                      aria-label={`Festival campaign ${festival.festivalName}`}
                      data-testid="festival-card"
                      data-festival-id={festival.id}
                      className="gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md"
                    >
                      <div
                        className={cn('h-1.5 w-full', matchingPreset?.accent ?? 'bg-ds-border-strong')}
                        aria-hidden="true"
                      />
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-ds-foreground">
                            {festival.festivalName}
                          </h3>
                          {campaignStatusBadge(festival.isActive)}
                        </div>

                        <div>
                          <p className="text-sm font-medium">{festival.name}</p>
                          <p className="text-xs text-ds-foreground-muted mt-0.5">
                            {formatDisplayDate(festival.festivalDate)}
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
                            <Tag tone="warning">
                              {days === 0 ? 'Today!' : `${days}d away`}
                            </Tag>
                          )}
                        </div>

                        {festival.lastRunAt && (
                          <p className="text-xs text-ds-foreground-muted">
                            Last run: {formatDisplayDate(new Date(festival.lastRunAt))}
                          </p>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            data-testid="festival-toggle"
                            aria-label={`${festival.isActive ? 'Deactivate' : 'Activate'} ${festival.festivalName}`}
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
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                data-testid="festival-actions"
                                aria-label={`More actions for ${festival.festivalName}`}
                              >
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
                                onClick={() => handleDelete(festival)}
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
                  <Loader2 className="h-5 w-5 animate-spin text-ds-foreground-muted" />
                )}
              </div>
            </>
          )}
        </section>
      </div>
      {confirmDialog}
    </PageContainer>
  );
}
