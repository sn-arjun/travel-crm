'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Mail, MessageSquare, TrendingUp, Eye, MoreHorizontal, Pause, Trash2, Loader2,
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FilterBar } from '@/components/domain/filter-bar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useApiMutation } from '@/hooks/use-api';
import { campaignsApi } from '@/lib/api/campaigns';
import type { Campaign } from '@travelcrm/shared';

function getTypeIcon(type: string) {
  switch (type) {
    case 'email':
      return <Mail className="h-4 w-4" />;
    case 'sms':
    case 'whatsapp':
      return <MessageSquare className="h-4 w-4" />;
    default:
      return null;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'draft':
      return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400';
    case 'active':
    case 'running':
      return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400';
    case 'completed':
      return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400';
    case 'paused':
    case 'scheduled':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

export default function CampaignsPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      campaignsApi.list({
        page,
        limit,
        search: search || undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
    [search, typeFilter, statusFilter],
  );

  const { items: campaigns, loading, loadingMore, total, error, sentinelRef, refetch } = useInfiniteScroll<Campaign>({
    fetcher,
    limit: 25,
  });

  const { mutate: deleteCampaign } = useApiMutation(campaignsApi.delete);
  const { mutate: pauseCampaign } = useApiMutation((id: string) => campaignsApi.cancel(id));

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this campaign?')) {
      const result = await deleteCampaign(id);
      if (result) {
        toast.success('Campaign deleted');
        refetch();
      } else {
        toast.error('Failed to delete campaign');
      }
    }
  };

  const handlePause = async (id: string) => {
    const result = await pauseCampaign(id);
    if (result) {
      toast.success('Campaign paused');
      refetch();
    } else {
      toast.error('Failed to pause campaign');
    }
  };

  // Calculate stats from loaded campaigns
  const stats = React.useMemo(() => {
    const activeCampaigns = campaigns.filter((c) => c.status === 'running').length;
    const totalSent = campaigns.reduce((sum, c) => sum + ((c as any).sent ?? 0), 0);
    const totalOpened = campaigns.reduce((sum, c) => sum + ((c as any).opened ?? 0), 0);
    const avgOpenRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0';
    return { activeCampaigns, totalSent, avgOpenRate };
  }, [campaigns]);

  const activeFilters = [
    ...(typeFilter !== 'all' ? [{ id: 'type', label: 'Type', value: typeFilter }] : []),
    ...(statusFilter !== 'all' ? [{ id: 'status', label: 'Status', value: statusFilter }] : []),
  ];

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4">
        <p className="text-destructive">Failed to load campaigns</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Campaigns
          </h1>
          <p className="text-sm text-muted-foreground">{loading ? '...' : `${total} campaigns`}</p>
        </div>
        <Button asChild>
          <Link href="/campaigns/new">
            <Plus className="h-4 w-4 mr-1.5" /> New Campaign
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="px-6 py-4 border-b">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Active Campaigns</p>
                  <p className="text-2xl font-bold">{stats.activeCampaigns}</p>
                </div>
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Sent</p>
                  <p className="text-2xl font-bold">{stats.totalSent.toLocaleString('en-IN')}</p>
                </div>
                <Mail className="h-5 w-5 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Avg Open Rate</p>
                  <p className="text-2xl font-bold">{stats.avgOpenRate}%</p>
                </div>
                <Eye className="h-5 w-5 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* FilterBar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b flex-wrap">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search campaigns..."
          activeFilters={activeFilters}
          onRemoveFilter={(id) => {
            if (id === 'type') setTypeFilter('all');
            if (id === 'status') setStatusFilter('all');
          }}
          onClearFilters={() => { setTypeFilter('all'); setStatusFilter('all'); }}
          actions={
            <div className="flex items-center gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No campaigns found</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Opened</TableHead>
                  <TableHead>Clicked</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => {
                  const sent = (campaign as any).sent ?? 0;
                  const opened = (campaign as any).opened ?? 0;
                  const clicked = (campaign as any).clicked ?? 0;
                  const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0';
                  const clickRate = sent > 0 ? ((clicked / sent) * 100).toFixed(1) : '0';

                  return (
                    <TableRow
                      key={campaign.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/campaigns/${campaign.id}`)}
                    >
                      <TableCell>
                        <span className="text-sm font-medium">{campaign.name}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs flex w-fit gap-1">
                          {getTypeIcon(campaign.type)}
                          {campaign.type?.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs capitalize', getStatusColor(campaign.status ?? ''))}>
                          {campaign.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {sent.toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="text-sm">
                        {opened.toLocaleString('en-IN')}
                        {' '}
                        <span className="text-xs text-muted-foreground">({openRate}%)</span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {clicked.toLocaleString('en-IN')}
                        {' '}
                        <span className="text-xs text-muted-foreground">({clickRate}%)</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        }) : '-'}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/campaigns/${campaign.id}`}>View details</Link>
                            </DropdownMenuItem>
                            {campaign.status === 'running' && (
                              <DropdownMenuItem onClick={() => handlePause(campaign.id)}>
                                <Pause className="h-3.5 w-3.5 mr-2" />
                                Pause campaign
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(campaign.id)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="flex items-center justify-center py-4">
              {loadingMore && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
